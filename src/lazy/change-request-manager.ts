/**
 * ChangeRequestManager - Captures the current page and creates a change-request draft
 *
 * Lazy-loads snapdom only on first click so visitors who never trigger the
 * action don't download it. The flow is split across two clicks, mediated by
 * {@link ChangeRequestOverlay}:
 *
 *   Click 1 (toolbar button) → capture the screenshot and show it in the
 *   overlay's preview. This is entirely client-side: nothing touches the API,
 *   so cancelling here leaves no orphaned draft. The user can send the
 *   automatic capture as-is or replace it with one they took themselves (the
 *   browser environment snapshot rides along either way).
 *
 *   Click 2 (overlay "Send") → walk the four-step upload flow (create draft →
 *   upload-url → PUT to R2 → confirm) and open the app-gui editor.
 *
 * Popup handling: `window.open` only escapes the popup blocker when called
 * synchronously inside a user gesture. Click 2's send handler opens a blank
 * tab immediately (within the gesture) and navigates it once the draft exists,
 * so the editor tab isn't blocked even though the four API calls run in
 * between. The inline fallback link is now a genuine edge case (hard-disabled
 * popups) rather than the norm it was when `window.open` fired after capture.
 *
 * snapdom (vs html2canvas) renders via SVG <foreignObject>, letting the
 * browser do the rasterization — far higher visual fidelity for modern CSS
 * (oklch colors, filter/backdrop-filter, clip-path, gradients, etc.).
 *
 * @see RFC-0016
 */

import type { Logger } from "loganite";
import type { EditorState } from "./state.js";
import type { ChangeRequestOverlay } from "../components/change-request-overlay.js";
import "../components/change-request-overlay.js";

export interface ChangeRequestManagerConfig {
    apiUrl: string;
    appUrl: string;
    appId: string;
}

export interface ChangeRequestManagerHelpers {
    apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
    /**
     * Clear the current selection/editing state (outlines, badges, instance
     * controls) so those edit-mode decorations aren't in the screenshot. Called
     * right before capture; behaves like clicking away from the element.
     */
    deselect: () => void;
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
 * How long to wait after deselecting before capturing, so the edit-mode
 * outline's `transition: outline 0.2s` (styles.ts) has fully faded out.
 * Comfortably longer than that 0.2s so the shot never catches it mid-fade.
 */
const OUTLINE_FADE_SETTLE_MS = 250;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A screenshot ready to upload — either the automatic snapdom capture or a
 * file the user supplied instead. Carries everything the upload-url/confirm
 * calls need, so a manual JPEG works the same as an automatic PNG.
 * `objectUrl` backs the overlay's preview and is revoked when discarded.
 */
interface PreparedImage {
    blob: Blob;
    hash: string;
    width: number;
    height: number;
    contentType: string;
    extension: string;
    filename: string;
    objectUrl: string;
}

/**
 * State held between the two clicks. `captured` is the automatic screenshot
 * (kept so the user can revert after replacing); `current` is what will
 * actually be sent. `pageUrl` and `environment` are snapshotted at capture
 * time so they describe the moment the user hit the button, regardless of
 * which image is ultimately sent.
 */
interface PendingRequest {
    pageUrl: string;
    environment?: ExtraEnvironment;
    captured: PreparedImage;
    current: PreparedImage;
}

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
 * Fetch an image for inlining, working around the "cached without CORS" trap.
 *
 * When the page first loads an image through a plain `<img>` (a non-CORS
 * request), the browser's HTTP cache — and any CDN in front of it — can store a
 * variant with no `Access-Control-Allow-Origin` header. A later cors-mode fetch
 * of the same URL then reuses that cached variant and throws, even when the
 * origin serves ACAO on a genuinely fresh request. This bit same-project media
 * (media.streamlinedcms.com) whose images the host page had already displayed:
 * they came back blank in the shot. So on the first failure we retry once with
 * `cache: "reload"`, which forces a new network request whose CORS response
 * inlines correctly. The fast (cached) path is tried first so an unaffected,
 * image-heavy page pays no extra round-trips.
 *
 * Returns null when the image genuinely can't be fetched (a real HTTP error, or
 * a third-party host with no CORS at all) — it'll be blank in the shot but the
 * capture still succeeds.
 */
async function fetchImageBlob(src: string): Promise<Blob | null> {
    try {
        const response = await fetch(src, { mode: "cors", credentials: "omit" });
        if (response.ok) return await response.blob();
        return null; // a definitive HTTP error won't change on retry
    } catch {
        // Fall through to the cache-busting retry below.
    }
    try {
        const response = await fetch(src, { mode: "cors", credentials: "omit", cache: "reload" });
        return response.ok ? await response.blob() : null;
    } catch {
        return null;
    }
}

function blobToDataUri(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

/**
 * snapdom plugin: inline every <img> in the cloned tree as a data URI so the
 * SVG rasterization step has no cross-origin sources to taint on. Mutates only
 * the clone — live DOM is untouched. See {@link fetchImageBlob} for how the
 * fetch survives the cached-without-CORS trap; images it still can't fetch are
 * left alone (blank in the shot, but the capture doesn't break).
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
                if (!src || src.startsWith("data:")) return;
                const blob = await fetchImageBlob(src);
                if (!blob) return;
                img.src = await blobToDataUri(blob);
            }),
        );
    },
};

export class ChangeRequestManager {
    private pending: PendingRequest | null = null;
    /** Remembered so a capture failure can be retried with the same caller fields. */
    private lastExtraEnvironment: ExtraEnvironment | undefined;

    constructor(
        private state: EditorState,
        private log: Logger,
        private config: ChangeRequestManagerConfig,
        private helpers: ChangeRequestManagerHelpers,
    ) {}

    /**
     * Click 1: capture the page and show it in the overlay for review. Runs no
     * API calls — the request is only created when the user confirms in the
     * overlay ({@link beginSubmit}).
     *
     * @param extraEnvironment - Caller-supplied fields (from the environment
     *   provider and/or a programmatic `requestChange` argument) merged on top
     *   of the passive snapshot. See {@link fitEnvironment} for how overflow is
     *   handled.
     */
    async createDraftFromPage(extraEnvironment?: ExtraEnvironment): Promise<void> {
        if (!this.state.toolbar) return;
        if (!this.state.apiKey) {
            this.log.warn("Cannot create change request: not authenticated");
            return;
        }
        // Ignore repeat triggers while a flow is already on screen.
        if (this.state.changeRequestOverlay) return;

        this.lastExtraEnvironment = extraEnvironment;
        const overlay = this.ensureOverlay();
        await this.runCapture(overlay);
    }

    /** Create (or return) the overlay element and wire its events to this manager. */
    private ensureOverlay(): ChangeRequestOverlay {
        if (this.state.changeRequestOverlay) return this.state.changeRequestOverlay;

        const overlay = document.createElement(
            "scms-change-request-overlay",
        ) as ChangeRequestOverlay;
        overlay.phase = "capturing";
        overlay.addEventListener("cr-send", this.beginSubmit);
        overlay.addEventListener("cr-retry", this.handleRetry);
        overlay.addEventListener("cr-cancel", this.handleCancel);
        overlay.addEventListener("cr-replace", ((e: Event) =>
            this.handleReplace(e as CustomEvent<{ file: File }>)) as EventListener);
        overlay.addEventListener("cr-revert", this.handleRevert);
        document.body.appendChild(overlay);
        this.state.changeRequestOverlay = overlay;
        return overlay;
    }

    /**
     * Capture the screenshot into `pending` and move the overlay to preview.
     * The overlay is already on screen (showing a spinner) and is excluded from
     * the snapdom shot, so the user gets capture feedback without contaminating
     * the image. On failure the overlay shows an error the user can retry.
     */
    private async runCapture(overlay: ChangeRequestOverlay): Promise<void> {
        const toolbar = this.state.toolbar;
        overlay.phase = "capturing";
        overlay.statusMessage = "Capturing the page…";
        overlay.errorMessage = null;
        if (toolbar) toolbar.requestingChange = true;

        try {
            // Drop any selection/editing state so its outlines and badges
            // aren't in the shot. The overlay is already covering the page, so
            // the user doesn't see the element deselect.
            this.helpers.deselect();
            // The edit-mode outline fades out via `transition: outline 0.2s`
            // (styles.ts), so it lingers for a moment after deselect. Wait for
            // that fade to finish, or snapdom captures the outline mid-fade and
            // bakes a red rectangle into the screenshot.
            await delay(OUTLINE_FADE_SETTLE_MS);

            // Capture page URL before any awaits so a late nav doesn't drift it.
            const pageUrl = window.location.href;
            const blob = await this.captureScreenshot();
            const captured = await this.prepareImage(
                blob,
                SCREENSHOT_CONTENT_TYPE,
                SCREENSHOT_EXTENSION,
                SCREENSHOT_FILENAME,
            );
            const environment = this.fitEnvironment(
                this.gatherEnvironment(),
                this.lastExtraEnvironment,
            );

            this.disposePending();
            this.pending = { pageUrl, environment, captured, current: captured };

            overlay.screenshotUrl = captured.objectUrl;
            overlay.manual = false;
            overlay.phase = "preview";
        } catch (err) {
            this.log.error("Failed to capture change-request screenshot", err);
            overlay.errorMessage =
                err instanceof Error ? err.message : "Could not capture the page";
            overlay.phase = "error";
        } finally {
            if (toolbar) toolbar.requestingChange = false;
        }
    }

    /**
     * Click 2's synchronous entry point. Opens the editor tab *now*, inside the
     * user gesture, so it survives the popup blocker, then runs the async
     * submit and navigates the tab once the draft exists.
     */
    private beginSubmit = (): void => {
        const win = this.openPlaceholderTab();
        void this.submit(win);
    };

    private handleRetry = (): void => {
        if (this.pending) {
            // A submit failed — retry it, opening the tab within this gesture.
            this.beginSubmit();
        } else {
            // The capture failed before we had anything — capture again.
            const overlay = this.state.changeRequestOverlay;
            if (overlay) void this.runCapture(overlay);
        }
    };

    private handleCancel = (): void => {
        this.destroyOverlay();
    };

    /** Swap in a screenshot the user supplied; keep the automatic one for revert. */
    private handleReplace = async (e: CustomEvent<{ file: File }>): Promise<void> => {
        const overlay = this.state.changeRequestOverlay;
        const pending = this.pending;
        if (!overlay || !pending) return;

        const file = e.detail.file;
        const { contentType, extension } = imageTypeFor(file);
        try {
            const prepared = await this.prepareImage(
                file,
                contentType,
                extension,
                `page.${extension}`,
            );
            if (pending.current !== pending.captured) {
                URL.revokeObjectURL(pending.current.objectUrl);
            }
            pending.current = prepared;
            overlay.screenshotUrl = prepared.objectUrl;
            overlay.manual = true;
        } catch (err) {
            this.log.warn("Could not read replacement screenshot", err);
        }
    };

    private handleRevert = (): void => {
        const overlay = this.state.changeRequestOverlay;
        const pending = this.pending;
        if (!overlay || !pending) return;
        if (pending.current !== pending.captured) {
            URL.revokeObjectURL(pending.current.objectUrl);
            pending.current = pending.captured;
        }
        overlay.screenshotUrl = pending.captured.objectUrl;
        overlay.manual = false;
    };

    /**
     * The four-step upload flow, driving the overlay's progress line. On
     * success the pre-opened `win` is navigated to the editor; on failure it's
     * closed and the overlay shows a retryable error (or nothing extra, for a
     * 402/403 the shared apiFetch already banner-surfaced).
     */
    private async submit(win: Window | null): Promise<void> {
        const overlay = this.state.changeRequestOverlay;
        const pending = this.pending;
        if (!overlay || !pending) {
            win?.close();
            return;
        }

        overlay.phase = "submitting";
        overlay.errorMessage = null;
        const img = pending.current;

        try {
            overlay.statusMessage = "Creating your draft…";
            const draftId = await this.createDraft(pending.pageUrl, pending.environment);

            overlay.statusMessage = "Uploading screenshot…";
            const upload = await this.requestUploadUrl(draftId, img);
            if (!upload.exists) {
                if (!upload.uploadUrl) {
                    throw new Error("upload-url response missing uploadUrl");
                }
                await this.uploadBlob(upload.uploadUrl, upload.uploadHeaders, img);
            }
            await this.confirmScreenshot(draftId, img);

            overlay.statusMessage = "Opening the editor…";
            this.finishOpen(win, draftId);
        } catch (err) {
            win?.close();
            if (err instanceof ChangeRequestAccessError) {
                // apiFetch already surfaced the reason in the warning banner;
                // showing an overlay error too would duplicate/conflict.
                this.log.warn("Change request denied by API", { status: err.status });
                this.destroyOverlay();
            } else {
                this.log.error("Failed to create change-request draft", err);
                overlay.errorMessage =
                    err instanceof Error ? err.message : "Could not create draft";
                overlay.phase = "error";
            }
        }
    }

    private async captureScreenshot(): Promise<Blob> {
        // Lazy chunk — only fetched on first click.
        const { snapdom } = await import("@zumer/snapdom");

        const capture = await snapdom(document.body, {
            embedFonts: true,
            // Capture only what the user currently sees. `clip: "viewport"`
            // renders position:fixed/sticky elements at their *pinned* positions
            // — a scrolled sticky header, a fixed nav — exactly as they appear.
            // The previous approach rendered the whole document and cropped to
            // the scroll offset, which dropped those: they render at their
            // document-flow position (e.g. the sticky header at document top),
            // outside the crop window once scrolled.
            clip: "viewport",
            // Read fresh every capture. snapdom's default "soft" cache keeps a
            // per-element computed-style cache across calls, which replays stale
            // styles on a page that changes between requests — e.g. a selection
            // outline lingering after the element was deselected. Screenshots
            // are infrequent, so the recompute cost is irrelevant.
            cache: "disabled",
            // Strip SCMS chrome from the clone before rasterizing. The overlay
            // is on screen (showing the capture spinner) when this runs, so it
            // must be excluded too — otherwise the spinner and its dimming
            // backdrop would appear in the screenshot. The selection outlines
            // and badges are handled up front by deselecting (see runCapture),
            // not here.
            exclude: [
                "#scms-toolbar",
                "[data-scms-spacer]",
                "scms-formatting-toolbar",
                "scms-change-request-overlay",
            ],
            excludeMode: "remove",
            plugins: [inlineImagesPlugin],
        });

        const canvas = await capture.toCanvas();
        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, "image/png");
        });
        if (!blob) {
            throw new Error("Failed to encode viewport screenshot");
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

    /** Compute hash/dimensions and mint a preview object URL for an image blob. */
    private async prepareImage(
        blob: Blob,
        contentType: string,
        extension: string,
        filename: string,
    ): Promise<PreparedImage> {
        const { hash, width, height } = await this.describeBlob(blob);
        return {
            blob,
            hash,
            width,
            height,
            contentType,
            extension,
            filename,
            objectUrl: URL.createObjectURL(blob),
        };
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

        this.log.warn("Change-request environment exceeds 8 KB; dropping caller-supplied fields");
        if (JSON.stringify(base).length <= MAX_ENVIRONMENT_LENGTH) return base;

        this.log.warn("Change-request environment still exceeds 8 KB; omitting environment");
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

    private async createDraft(pageUrl: string, environment?: ExtraEnvironment): Promise<string> {
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
        img: PreparedImage,
    ): Promise<UploadUrlResponse> {
        const url = `${this.config.apiUrl}/apps/${encodeURIComponent(this.config.appId)}/change-requests/${encodeURIComponent(draftId)}/screenshot/upload-url`;
        const response = await this.helpers.apiFetch(url, {
            method: "POST",
            headers: this.jsonHeaders(),
            body: JSON.stringify({
                hash: img.hash,
                filename: img.filename,
                extension: img.extension,
                contentType: img.contentType,
                size: img.blob.size,
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
        img: PreparedImage,
    ): Promise<void> {
        // Pre-signed URL — no Authorization header (and using bare fetch
        // because apiFetch's 402/403 warning UI is irrelevant for R2). The
        // server's uploadHeaders are signed into the URL and must be echoed.
        const response = await fetch(uploadUrl, {
            method: "PUT",
            headers: uploadHeaders ?? { "Content-Type": img.contentType },
            body: img.blob,
        });
        if (!response.ok) {
            throw new Error(`Screenshot upload failed: ${response.status} ${response.statusText}`);
        }
    }

    private async confirmScreenshot(draftId: string, img: PreparedImage): Promise<void> {
        const url = `${this.config.apiUrl}/apps/${encodeURIComponent(this.config.appId)}/change-requests/${encodeURIComponent(draftId)}/screenshot/confirm`;
        const response = await this.helpers.apiFetch(url, {
            method: "POST",
            headers: this.jsonHeaders(),
            body: JSON.stringify({
                hash: img.hash,
                extension: img.extension,
                contentType: img.contentType,
                size: img.blob.size,
                width: img.width,
                height: img.height,
                source: "sdk",
            }),
        });
        if (!response.ok) {
            throw await this.errorFor(response, "Failed to confirm screenshot");
        }
    }

    /**
     * Open the editor tab synchronously inside the Send-click gesture so the
     * popup blocker lets it through. It shows a placeholder until the draft is
     * ready and {@link finishOpen} navigates it. Returns null if the browser
     * blocked even this gesture-time open (hard-disabled popups).
     */
    private openPlaceholderTab(): Window | null {
        const win = window.open("", "_blank");
        if (win) {
            win.document.write(
                '<!doctype html><meta charset="utf-8"><title>Preparing…</title>' +
                    '<body style="margin:0;height:100vh;display:flex;align-items:center;' +
                    "justify-content:center;font:14px -apple-system,BlinkMacSystemFont," +
                    "'Segoe UI',Roboto,sans-serif;color:#374151\">" +
                    "Preparing your change request…</body>",
            );
            win.document.close();
        }
        return win;
    }

    private finishOpen(win: Window | null, draftId: string): void {
        const editorUrl = `${this.config.appUrl}/apps/${encodeURIComponent(this.config.appId)}/requests/${encodeURIComponent(draftId)}`;
        if (win) {
            win.location.replace(editorUrl);
            this.log.info("Change-request draft created", { id: draftId });
            this.destroyOverlay();
        } else {
            // The tab couldn't be opened even within the gesture — surface a
            // link in the overlay for the user to click through themselves.
            const overlay = this.state.changeRequestOverlay;
            if (overlay) {
                overlay.fallbackUrl = editorUrl;
                overlay.phase = "blocked";
            }
            this.log.info("Popup blocked; surfaced fallback link", { id: draftId });
        }
    }

    /** Tear down the overlay from outside the flow (e.g. toolbar removal). */
    dismiss(): void {
        this.destroyOverlay();
    }

    /** Remove the overlay and release any held blobs/object URLs. */
    private destroyOverlay(): void {
        const overlay = this.state.changeRequestOverlay;
        if (overlay) {
            overlay.remove();
            this.state.changeRequestOverlay = null;
        }
        this.disposePending();
    }

    private disposePending(): void {
        const pending = this.pending;
        if (!pending) return;
        URL.revokeObjectURL(pending.captured.objectUrl);
        if (pending.current !== pending.captured) {
            URL.revokeObjectURL(pending.current.objectUrl);
        }
        this.pending = null;
    }

    private jsonHeaders(): Record<string, string> {
        return {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.state.apiKey}`,
        };
    }
}

/**
 * Derive the contentType/extension for a user-supplied file. The API's media
 * manager accepts png/jpeg/webp/gif and only requires the extension be
 * alphanumeric, so we normalize the MIME subtype (jpeg → jpg) and fall back to
 * PNG for the rare file with no usable type.
 */
function imageTypeFor(file: File): { contentType: string; extension: string } {
    const contentType = file.type || SCREENSHOT_CONTENT_TYPE;
    const subtype = contentType.split("/")[1]?.toLowerCase() ?? "";
    const extension = (subtype === "jpeg" ? "jpg" : subtype).replace(/[^a-z0-9]/g, "");
    return {
        contentType,
        extension: extension || SCREENSHOT_EXTENSION,
    };
}
