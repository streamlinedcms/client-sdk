/**
 * ChangeRequestManager - Captures the current page and creates a change-request draft
 *
 * Lazy-loads snapdom only on first click so visitors who never trigger
 * the action don't download it. Then walks the four-step screenshot upload
 * flow (create draft → upload-url → PUT to R2 → confirm) and opens the
 * app-gui draft editor in a new tab. Falls back to an inline link if the
 * popup is blocked.
 *
 * snapdom (vs html2canvas) renders via SVG <foreignObject>, letting the
 * browser do the rasterization — far higher visual fidelity for modern CSS
 * (oklch colors, filter/backdrop-filter, clip-path, gradients, etc.).
 *
 * @see RFC-0016
 */

import type { Logger } from "loganite";
import type { EditorState } from "./state.js";

export interface ChangeRequestManagerConfig {
    apiUrl: string;
    appUrl: string;
    appId: string;
}

export interface ChangeRequestManagerHelpers {
    apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

interface CreateDraftResponse {
    id: string;
}

interface UploadUrlResponse {
    fileId: string;
    publicUrl: string;
    uploadUrl?: string;
    /** Signed into uploadUrl — must be echoed verbatim on the PUT. */
    uploadHeaders?: Record<string, string>;
    exists: boolean;
}

const SCREENSHOT_CONTENT_TYPE = "image/png";
const SCREENSHOT_EXTENSION = "png";
const SCREENSHOT_FILENAME = "page.png";

/**
 * Serialized-size cap on the environment blob. Mirrors the API's check
 * (api#91: `JSON.stringify(environment).length > 8192` → 400), measured the
 * same way — string length, not UTF-8 bytes — so the client-side guard never
 * disagrees with the server.
 */
const MAX_ENVIRONMENT_LENGTH = 8192;

/** Extra environment fields a caller (provider or programmatic trigger) supplies. */
export type ExtraEnvironment = Record<string, unknown>;

/**
 * Thrown when an API call is denied with 402 (plan limit) or 403 (domain not
 * whitelisted). The shared apiFetch wrapper has already surfaced the API's
 * reason in the toolbar warning banner, so the flow aborts without setting a
 * second, conflicting change-request error.
 */
export class ChangeRequestAccessError extends Error {
    constructor(readonly status: number) {
        super(`Change request denied (${status})`);
        this.name = "ChangeRequestAccessError";
    }
}

/** Read `fn()` and swallow any throw — used to make each environment probe optional. */
function safe<T>(fn: () => T): T | undefined {
    try {
        return fn();
    } catch {
        return undefined;
    }
}

/**
 * snapdom plugin: inline every <img> in the cloned tree as a data URI so the
 * SVG rasterization step has no cross-origin sources to taint on. Mutates only
 * the clone — live DOM is untouched. Silently leaves images alone if the fetch
 * fails (e.g. third-party host without CORS headers); they'll be blank in the
 * screenshot but won't break the capture.
 */
const inlineImagesPlugin = {
    name: "scms-inline-images",
    async afterClone(context: { clone?: Element | null }): Promise<void> {
        const root = context.clone;
        if (!root) return;
        const imgs = Array.from(root.querySelectorAll("img")) as HTMLImageElement[];
        await Promise.all(
            imgs.map(async (img) => {
                const src = img.src;
                if (!src) return;
                if (src.startsWith("data:")) return;
                try {
                    const response = await fetch(src, { mode: "cors", credentials: "omit" });
                    if (!response.ok) return;
                    const blob = await response.blob();
                    const dataUri = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result as string);
                        reader.onerror = () => reject(reader.error);
                        reader.readAsDataURL(blob);
                    });
                    img.src = dataUri;
                } catch {
                    // Leave the image's src alone; it'll be blank in the capture.
                }
            }),
        );
    },
};

export class ChangeRequestManager {
    constructor(
        private state: EditorState,
        private log: Logger,
        private config: ChangeRequestManagerConfig,
        private helpers: ChangeRequestManagerHelpers,
    ) {}

    /**
     * @param extraEnvironment - Caller-supplied fields (from the environment
     *   provider and/or a programmatic `requestChange` argument) merged on top
     *   of the passive snapshot. See {@link fitEnvironment} for how overflow is
     *   handled.
     */
    async createDraftFromPage(extraEnvironment?: ExtraEnvironment): Promise<void> {
        const toolbar = this.state.toolbar;
        if (!toolbar) return;
        if (!this.state.apiKey) {
            this.log.warn("Cannot create change request: not authenticated");
            return;
        }

        toolbar.requestingChange = true;
        toolbar.popupBlocked = false;
        toolbar.lastRequestId = null;
        toolbar.changeRequestError = null;

        try {
            // Capture page URL before any awaits so a late nav doesn't drift it.
            const pageUrl = window.location.href;

            const blob = await this.captureScreenshot();
            const { hash, width, height } = await this.describeBlob(blob);

            const environment = this.fitEnvironment(
                this.gatherEnvironment(),
                extraEnvironment,
            );

            const draftId = await this.createDraft(pageUrl, environment);
            const upload = await this.requestUploadUrl(draftId, hash, blob.size);
            if (!upload.exists) {
                if (!upload.uploadUrl) {
                    throw new Error("upload-url response missing uploadUrl");
                }
                await this.uploadBlob(upload.uploadUrl, upload.uploadHeaders, blob);
            }
            await this.confirmScreenshot(draftId, hash, blob.size, width, height);

            this.openDraftEditor(draftId);
        } catch (err) {
            if (err instanceof ChangeRequestAccessError) {
                // apiFetch already surfaced the reason in the warning banner;
                // setting changeRequestError too would show a conflicting message.
                this.log.warn("Change request denied by API", { status: err.status });
            } else {
                this.log.error("Failed to create change-request draft", err);
                toolbar.changeRequestError =
                    err instanceof Error ? err.message : "Could not create request";
            }
        } finally {
            toolbar.requestingChange = false;
        }
    }

    private async captureScreenshot(): Promise<Blob> {
        // Lazy chunk — only fetched on first click.
        const { snapdom } = await import("@zumer/snapdom");

        const capture = await snapdom(document.body, {
            embedFonts: true,
            exclude: ["#scms-toolbar", "[data-scms-spacer]", "scms-formatting-toolbar"],
            excludeMode: "remove",
            plugins: [inlineImagesPlugin],
        });

        // snapdom renders the full body. Crop to the viewport at the current
        // scroll position so the screenshot matches what the user is looking at.
        const fullCanvas = await capture.toCanvas();
        const dpr = window.devicePixelRatio || 1;
        const viewportWidth = Math.round(window.innerWidth * dpr);
        const viewportHeight = Math.round(window.innerHeight * dpr);
        const sourceX = Math.round(window.scrollX * dpr);
        const sourceY = Math.round(window.scrollY * dpr);

        const viewCanvas = document.createElement("canvas");
        viewCanvas.width = viewportWidth;
        viewCanvas.height = viewportHeight;
        const ctx = viewCanvas.getContext("2d");
        if (!ctx) {
            throw new Error("Failed to acquire 2D canvas context");
        }
        ctx.drawImage(
            fullCanvas,
            sourceX,
            sourceY,
            viewportWidth,
            viewportHeight,
            0,
            0,
            viewportWidth,
            viewportHeight,
        );

        const blob = await new Promise<Blob | null>((resolve) => {
            viewCanvas.toBlob(resolve, "image/png");
        });
        if (!blob) {
            throw new Error("Failed to encode cropped viewport canvas");
        }
        return blob;
    }

    private async describeBlob(
        blob: Blob,
    ): Promise<{ hash: string; width: number; height: number }> {
        const buffer = await blob.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
        const hash = Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

        const bitmap = await createImageBitmap(blob);
        const width = bitmap.width;
        const height = bitmap.height;
        bitmap.close();

        return { hash, width, height };
    }

    /**
     * Passive, synchronous browser snapshot sent with the draft so a change
     * request carries the troubleshooting context (browser, viewport, timezone,
     * …) a developer would otherwise ask for by hand. Every probe is optional:
     * a field absent in an old or embedded browser is simply omitted, never
     * fatal. Empty values are dropped to keep the blob lean (api#91 caps it at
     * 8 KB). The API stores it verbatim, so the SDK owns the shape.
     */
    private gatherEnvironment(): ExtraEnvironment {
        const env: ExtraEnvironment = {
            userAgent: safe(() => navigator.userAgent),
            uaClientHints: safe(() =>
                (
                    navigator as Navigator & {
                        userAgentData?: { toJSON?: () => unknown };
                    }
                ).userAgentData?.toJSON?.(),
            ),
            viewport: safe(() => ({
                width: window.innerWidth,
                height: window.innerHeight,
            })),
            screen: safe(() => ({ width: screen.width, height: screen.height })),
            devicePixelRatio: safe(() => window.devicePixelRatio),
            language: safe(() => navigator.language),
            timezone: safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
            referrer: safe(() => document.referrer),
            sdkVersion: __SDK_VERSION__,
            prefersColorScheme: safe(() =>
                window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
            ),
        };
        // Drop probes that returned nothing (undefined or empty string).
        for (const key of Object.keys(env)) {
            const value = env[key];
            if (value === undefined || value === "") delete env[key];
        }
        return env;
    }

    /**
     * Merge the caller-supplied `extra` over the passive `base`, then fit the
     * result under the API's 8 KB cap by dropping the least-important layer
     * first: prefer the full blob, else the passive base alone (extra dropped),
     * else no environment at all. The draft itself must always be creatable, so
     * the environment is what gives way — never the request.
     */
    private fitEnvironment(
        base: ExtraEnvironment,
        extra: ExtraEnvironment | undefined,
    ): ExtraEnvironment | undefined {
        const full = extra ? { ...base, ...extra } : base;
        if (JSON.stringify(full).length <= MAX_ENVIRONMENT_LENGTH) return full;

        this.log.warn(
            "Change-request environment exceeds 8 KB; dropping caller-supplied fields",
        );
        if (JSON.stringify(base).length <= MAX_ENVIRONMENT_LENGTH) return base;

        this.log.warn(
            "Change-request environment still exceeds 8 KB; omitting environment",
        );
        return undefined;
    }

    /**
     * Build the Error to throw for a failed API Response.
     *
     * 402/403 are access denials the shared apiFetch wrapper already reports in
     * the toolbar warning banner, so they become a {@link ChangeRequestAccessError}
     * the flow swallows — no second message. Anything else keeps the API's
     * human-readable `error` sentence (`{ error, code, … }`, @whi/http-errors
     * `toResponse`) so a 400/500 shows something useful, falling back to the
     * status line when the body isn't our JSON shape (an R2 or proxy error).
     */
    private async errorFor(response: Response, fallback: string): Promise<Error> {
        if (response.status === 402 || response.status === 403) {
            return new ChangeRequestAccessError(response.status);
        }
        try {
            const body = (await response.json()) as { error?: unknown };
            if (typeof body.error === "string" && body.error) {
                return new Error(body.error);
            }
        } catch {
            // Non-JSON body — fall through to the status line.
        }
        return new Error(`${fallback}: ${response.status} ${response.statusText}`);
    }

    private async createDraft(
        pageUrl: string,
        environment?: ExtraEnvironment,
    ): Promise<string> {
        const url = `${this.config.apiUrl}/apps/${encodeURIComponent(this.config.appId)}/change-requests`;
        const response = await this.helpers.apiFetch(url, {
            method: "POST",
            headers: this.jsonHeaders(),
            body: JSON.stringify(environment ? { pageUrl, environment } : { pageUrl }),
        });
        if (!response.ok) {
            throw await this.errorFor(response, "Failed to create draft");
        }
        const draft = (await response.json()) as CreateDraftResponse;
        if (!draft.id) {
            throw new Error("API response missing draft id");
        }
        return draft.id;
    }

    private async requestUploadUrl(
        draftId: string,
        hash: string,
        size: number,
    ): Promise<UploadUrlResponse> {
        const url = `${this.config.apiUrl}/apps/${encodeURIComponent(this.config.appId)}/change-requests/${encodeURIComponent(draftId)}/screenshot/upload-url`;
        const response = await this.helpers.apiFetch(url, {
            method: "POST",
            headers: this.jsonHeaders(),
            body: JSON.stringify({
                hash,
                filename: SCREENSHOT_FILENAME,
                extension: SCREENSHOT_EXTENSION,
                contentType: SCREENSHOT_CONTENT_TYPE,
                size,
            }),
        });
        if (!response.ok) {
            throw await this.errorFor(response, "Failed to get upload URL");
        }
        return (await response.json()) as UploadUrlResponse;
    }

    private async uploadBlob(
        uploadUrl: string,
        uploadHeaders: Record<string, string> | undefined,
        blob: Blob,
    ): Promise<void> {
        // Pre-signed URL — no Authorization header (and using bare fetch
        // because apiFetch's 402/403 warning UI is irrelevant for R2). The
        // server's uploadHeaders are signed into the URL and must be echoed.
        const response = await fetch(uploadUrl, {
            method: "PUT",
            headers: uploadHeaders ?? { "Content-Type": SCREENSHOT_CONTENT_TYPE },
            body: blob,
        });
        if (!response.ok) {
            throw new Error(
                `Screenshot upload failed: ${response.status} ${response.statusText}`,
            );
        }
    }

    private async confirmScreenshot(
        draftId: string,
        hash: string,
        size: number,
        width: number,
        height: number,
    ): Promise<void> {
        const url = `${this.config.apiUrl}/apps/${encodeURIComponent(this.config.appId)}/change-requests/${encodeURIComponent(draftId)}/screenshot/confirm`;
        const response = await this.helpers.apiFetch(url, {
            method: "POST",
            headers: this.jsonHeaders(),
            body: JSON.stringify({
                hash,
                extension: SCREENSHOT_EXTENSION,
                contentType: SCREENSHOT_CONTENT_TYPE,
                size,
                width,
                height,
                source: "sdk",
            }),
        });
        if (!response.ok) {
            throw await this.errorFor(response, "Failed to confirm screenshot");
        }
    }

    private openDraftEditor(draftId: string): void {
        const toolbar = this.state.toolbar;
        if (!toolbar) return;

        const editorUrl = `${this.config.appUrl}/apps/${encodeURIComponent(this.config.appId)}/requests/${encodeURIComponent(draftId)}`;
        const win = window.open(editorUrl, "_blank");
        if (!win) {
            toolbar.lastRequestId = draftId;
            toolbar.popupBlocked = true;
            this.log.info("Popup blocked; surfaced fallback link", { id: draftId });
        } else {
            this.log.info("Change-request draft created", { id: draftId });
        }
    }

    private jsonHeaders(): Record<string, string> {
        return {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.state.apiKey}`,
        };
    }
}
