/**
 * Media Manager Modal Component
 *
 * A persistent modal containing an iframe for media file selection.
 * The iframe is created once and reused, providing:
 * - Reliable cross-origin communication via Penpal
 * - Fast UX (media files are already loaded)
 * - Persistent connection
 */

import { html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { WindowMessenger, connect } from "penpal";
import { ScmsElement } from "./base.js";
import type { MediaFile } from "../popup-manager.js";
import { IMAGE_PLACEHOLDER_DATA_URI } from "../types.js";

// Re-export MediaFile for consumers
export type { MediaFile } from "../popup-manager.js";

/** A file candidate for upload */
export interface Candidate {
    data: ArrayBuffer;
    filename: string;
    contentType: string;
}

/** Options for single file selection */
export interface SelectFileOptions {
    accept?: string[];
    preselect?: string;
    candidates?: Candidate[];
}

/** Result from selectFile call */
interface SelectFileResult {
    file?: MediaFile;
    cancelled?: boolean;
    error?: string;
}

/** Result from ready call */
type ReadyResult = { ready: true } | { ready: false; error: string };

/** Result from cancelCurrentRequest call */
interface CancelRequestResult {
    success: boolean;
    error?: string;
}

/** Result from uploadFile call */
interface UploadFileResult {
    file?: MediaFile;
    error?: string;
}

/** Methods exposed by the media manager iframe */
interface MediaManagerMethods {
    ready(): Promise<ReadyResult>;
    selectFile(options?: SelectFileOptions): Promise<SelectFileResult>;
    cancelCurrentRequest(): Promise<CancelRequestResult>;
    uploadFile(candidate: Candidate): Promise<UploadFileResult>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: (...args: any[]) => Promise<any>;
}

@customElement("scms-media-manager-modal")
export class MediaManagerModal extends ScmsElement {
    @property({ type: Boolean, reflect: true })
    open = false;

    @property({ type: String, attribute: "app-url" })
    appUrl = "";

    @property({ type: String, attribute: "app-id" })
    appId = "";

    @state()
    private iframe: HTMLIFrameElement | null = null;

    @state()
    private connection: { destroy: () => void } | null = null;

    @state()
    private mediaManager: MediaManagerMethods | null = null;

    @state()
    private connectionReady = false;

    @state()
    private isReady = false;

    @state()
    private error: string | null = null;

    @state()
    private closing = false;

    @state()
    private selectingMedia = false;

    static styles = [
        ...ScmsElement.styles,
        css`
            :host {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 10001;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                pointer-events: none;
            }

            :host([open]) {
                opacity: 1;
                pointer-events: auto;
            }

            .backdrop {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
            }

            .modal {
                position: relative;
                width: 90%;
                max-width: 900px;
                height: 80vh;
                max-height: 700px;
                display: flex;
                flex-direction: column;
                background: white;
                border-radius: 8px;
                overflow: hidden;
                box-shadow:
                    0 25px 50px -12px rgba(0, 0, 0, 0.25),
                    0 0 0 1px rgba(0, 0, 0, 0.05);
            }

            .header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 16px;
                border-bottom: 1px solid #e5e7eb;
                background: #f9fafb;
            }

            .title {
                font-size: 14px;
                font-weight: 500;
                color: #111827;
            }

            .close-button {
                padding: 4px;
                color: #6b7280;
                cursor: pointer;
                border: none;
                background: none;
                border-radius: 4px;
            }

            .close-button:hover {
                color: #374151;
                background: #e5e7eb;
            }

            .iframe-container {
                flex: 1;
                position: relative;
                background: #f3f4f6;
            }

            iframe {
                width: 100%;
                height: 100%;
                border: none;
            }

            .iframe-container:not(.ready) iframe {
                visibility: hidden;
            }

            .status {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
            }

            .status-text {
                color: #6b7280;
                font-size: 14px;
                margin-top: 50px;
            }

            .status-error {
                color: #dc2626;
                font-size: 14px;
            }

            .spinner {
                width: 24px;
                height: 24px;
                border: 2px solid #e5e7eb;
                border-top-color: #6366f1;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
            }

            @keyframes spin {
                to {
                    transform: rotate(360deg);
                }
            }
        `,
    ];

    connectedCallback() {
        super.connectedCallback();
        this.initializeIframe();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.cleanup();
    }

    updated(changedProperties: Map<string, unknown>) {
        if (changedProperties.has("open")) {
            if (this.open) {
                document.body.style.overflow = "hidden";
                document.addEventListener("keydown", this.handleKeydown);
            } else {
                document.body.style.overflow = "";
                document.removeEventListener("keydown", this.handleKeydown);
            }
        }

        // Reinitialize iframe if URL params change
        if (changedProperties.has("appUrl") || changedProperties.has("appId")) {
            if (this.appUrl && this.appId) {
                this.initializeIframe();
            }
        }
    }

    private initializeIframe() {
        if (!this.appUrl || !this.appId) return;
        if (this.iframe) return; // Already initialized

        const url = `${this.appUrl}/embed/media?appId=${encodeURIComponent(this.appId)}`;
        const origin = new URL(this.appUrl).origin;

        // Create iframe
        this.iframe = document.createElement("iframe");
        this.iframe.src = url;
        this.iframe.setAttribute("allow", "clipboard-write");

        // Wait for iframe to load before establishing connection
        this.iframe.addEventListener("load", () => {
            this.establishConnection(origin);
        });
    }

    private async establishConnection(origin: string) {
        if (!this.iframe?.contentWindow) return;

        const messenger = new WindowMessenger({
            remoteWindow: this.iframe.contentWindow,
            allowedOrigins: [origin],
        });

        // Connect and get remote methods from the iframe
        const connection = connect<MediaManagerMethods>({
            messenger,
            methods: {}, // No methods exposed from parent
        });

        this.connection = connection;

        try {
            // Wait for connection to be established
            this.mediaManager = await connection.promise;
            this.connectionReady = true;

            // Check if media manager is ready (auth bridge has authenticated)
            await this.checkReady();
        } catch (err) {
            this.error = `Connection failed: ${err instanceof Error ? err.message : String(err)}`;
        }
    }

    private async checkReady() {
        if (!this.mediaManager) return;

        try {
            const result = await this.mediaManager.ready();
            if (result.ready) {
                this.isReady = true;
                this.error = null;
            } else {
                this.isReady = false;
                this.error = result.error || "Media manager not ready";
            }
        } catch (err) {
            this.isReady = false;
            this.error = `Ready check error: ${err instanceof Error ? err.message : String(err)}`;
        }
    }

    private cleanup() {
        if (this.connection) {
            this.connection.destroy();
            this.connection = null;
        }
        this.mediaManager = null;
        this.connectionReady = false;
        this.isReady = false;
        document.removeEventListener("keydown", this.handleKeydown);
    }

    /**
     * Wait for the connection to be ready.
     * Returns true if ready, false if an error occurred.
     */
    private waitForReady(): Promise<boolean> {
        return new Promise((resolve) => {
            const check = () => {
                if (this.error) {
                    resolve(false);
                    return;
                }
                if (this.mediaManager && this.isReady) {
                    resolve(true);
                    return;
                }
                // Check again on next frame
                requestAnimationFrame(check);
            };
            check();
        });
    }

    /**
     * Open the modal and wait for user selection.
     * Returns the selected MediaFile or null if cancelled or error.
     */
    async selectMedia(options?: SelectFileOptions): Promise<MediaFile | null> {
        // Prevent double-calls (e.g., from double-tap on mobile)
        if (this.selectingMedia) {
            return null;
        }
        this.selectingMedia = true;
        this.open = true;
        this.closing = false;

        // Re-check ready state (auth status may have changed since init)
        if (this.connectionReady && !this.isReady) {
            this.error = null; // Clear stale error before re-checking
            await this.checkReady();
        }

        // Wait for connection and authentication
        const ready = await this.waitForReady();
        if (!ready) {
            // Error occurred, wait for user to close modal
            return new Promise((resolve) => {
                this.pendingResolve = () => {
                    this.selectingMedia = false;
                    resolve(null);
                };
            });
        }

        try {
            const result = await this.mediaManager!.selectFile(options);

            this.open = false;
            this.selectingMedia = false;

            if (result.error) {
                console.error("[MediaManagerModal] selectFile error:", result.error);
                return null;
            }

            if (result.cancelled) {
                this.dispatchEvent(
                    new CustomEvent("cancel", {
                        bubbles: true,
                        composed: true,
                    }),
                );
                return null;
            }

            if (result.file) {
                this.dispatchEvent(
                    new CustomEvent("select", {
                        detail: { file: result.file },
                        bubbles: true,
                        composed: true,
                    }),
                );
                return result.file;
            }

            return null;
        } catch (err) {
            this.open = false;
            this.selectingMedia = false;
            console.error("[MediaManagerModal] selectMedia error:", err);
            return null;
        }
    }

    /**
     * Derive a filename for an image candidate.
     * Priority: URL filename (if it has extension) > title > alt > empty (let server name it)
     */
    private deriveFilename(img: HTMLImageElement, contentType: string): string {
        // Extract extension from content-type, stripping parameters (e.g., "image/svg+xml; charset=utf-8" -> "svg")
        const mimeSubtype = contentType.split("/")[1]?.split(";")[0] || "jpg";
        const ext = mimeSubtype.split("+")[0]; // "svg+xml" -> "svg"

        // Try URL path first - only use if it looks like a real filename (has extension)
        const urlPath = img.src.split("/").pop()?.split("?")[0] || "";
        if (urlPath.includes(".")) {
            return urlPath;
        }

        // Try title attribute
        if (img.title) {
            return `${img.title}.${ext}`;
        }

        // Try alt attribute
        if (img.alt) {
            return `${img.alt}.${ext}`;
        }

        // Let the server generate a name
        return "";
    }

    /**
     * Fetch an image and create a candidate for upload.
     * Returns null if the image cannot be fetched or is a placeholder.
     */
    async fetchImageAsCandidate(img: HTMLImageElement): Promise<Candidate | null> {
        const src = img.src;

        // Skip our placeholder image
        if (!src || src === IMAGE_PLACEHOLDER_DATA_URI) {
            return null;
        }

        try {
            const response = await fetch(src);
            if (!response.ok) {
                console.debug("[MediaManagerModal] Failed to fetch image for candidate", {
                    src,
                    status: response.status,
                });
                return null;
            }

            const data = await response.arrayBuffer();
            const contentType = response.headers.get("content-type") || "image/jpeg";
            const filename = this.deriveFilename(img, contentType);

            return { data, filename, contentType };
        } catch (err) {
            console.debug("[MediaManagerModal] Error fetching image for candidate", {
                src,
                error: err,
            });
            return null;
        }
    }

    /**
     * Upload all data-scms-image elements to the media library.
     * This is a utility method for bulk uploading page images.
     * Returns results for each image attempted.
     */
    async uploadAllImages(): Promise<{
        uploaded: MediaFile[];
        errors: Array<{ src: string; error: string }>;
    }> {
        const uploaded: MediaFile[] = [];
        const errors: Array<{ src: string; error: string }> = [];

        // Re-check ready state (auth status may have changed since init)
        if (this.connectionReady && !this.isReady) {
            this.error = null; // Clear stale error before re-checking
            await this.checkReady();
        }

        // Wait for connection and authentication
        const ready = await this.waitForReady();
        if (!ready) {
            return { uploaded, errors: [{ src: "", error: this.error || "Not ready" }] };
        }

        // Find all data-scms-image elements
        const images = Array.from(
            document.querySelectorAll<HTMLImageElement>("img[data-scms-image]"),
        );

        for (const img of images) {
            const candidate = await this.fetchImageAsCandidate(img);
            if (!candidate) {
                // Skip placeholder images or fetch failures (already logged)
                continue;
            }

            try {
                const result = await this.mediaManager!.uploadFile(candidate);
                if (result.error) {
                    errors.push({ src: img.src, error: result.error });
                } else if (result.file) {
                    uploaded.push(result.file);
                }
            } catch (err) {
                errors.push({
                    src: img.src,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        return { uploaded, errors };
    }

    // Pending promise resolver for error state close
    private pendingResolve: (() => void) | null = null;

    private handleKeydown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
            this.requestClose();
        }
    };

    private handleCloseClick = () => {
        this.requestClose();
    };

    /**
     * Request the modal to close, cancelling any pending request.
     */
    private async requestClose() {
        if (this.mediaManager && this.connectionReady && this.isReady) {
            // Show closing spinner while we wait for the cancel to complete
            this.closing = true;

            try {
                // Cancel the current request with a timeout in case connection is broken
                const timeout = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error("Timeout")), 2000),
                );
                await Promise.race([this.mediaManager.cancelCurrentRequest(), timeout]);
            } catch {
                // Penpal timed out or connection broken - force close and reset
                this.cleanup();
                this.closing = false;
                this.open = false;
                if (this.pendingResolve) {
                    this.pendingResolve();
                    this.pendingResolve = null;
                }
            }
        } else {
            // Not connected or has error - close immediately
            this.open = false;
            if (this.pendingResolve) {
                this.pendingResolve();
                this.pendingResolve = null;
            }
        }
    }

    private getStatusMessage(): string | null {
        if (this.error) return null; // Error shown separately
        if (this.closing) return "Closing...";
        if (!this.connectionReady) return "Connecting...";
        if (!this.isReady) return "Connecting...";
        return null;
    }

    render() {
        const statusMessage = this.getStatusMessage();

        return html`
            <div class="backdrop"></div>
            <div class="modal">
                <div class="header">
                    <span class="title">Select Media</span>
                    <button class="close-button" @click=${this.handleCloseClick} aria-label="Close">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>
                <div
                    class="iframe-container${this.connectionReady && this.isReady && !this.error
                        ? " ready"
                        : ""}"
                >
                    ${statusMessage
                        ? html`<div class="status">
                              <div class="spinner"></div>
                              <span class="status-text">${statusMessage}</span>
                          </div>`
                        : null}
                    ${this.error
                        ? html`<div class="status">
                              <span class="status-error">${this.error}</span>
                          </div>`
                        : null}
                </div>
            </div>
        `;
    }

    protected firstUpdated() {
        // Append iframe to the container after first render
        if (this.iframe) {
            const container = this.shadowRoot?.querySelector(".iframe-container");
            if (container) {
                container.appendChild(this.iframe);
            }
        }
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "scms-media-manager-modal": MediaManagerModal;
    }
}
