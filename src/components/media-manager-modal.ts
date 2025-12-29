/**
 * Media Manager Modal Component
 *
 * A persistent modal containing an iframe for media file selection.
 * The iframe is created once and reused, providing:
 * - Reliable cross-origin communication via Penpal
 * - Fast UX (media files are already loaded)
 * - Persistent connection
 */

import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { WindowMessenger, connect } from "penpal";
import { tailwindSheet } from "./styles.js";
import type { MediaFile } from "../popup-manager.js";

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

/** Result from authenticate call */
interface AuthResult {
    success: boolean;
    error?: string;
}

/** Result from cancelCurrentRequest call */
interface CancelRequestResult {
    success: boolean;
    error?: string;
}

/** Methods exposed by the media manager iframe */
interface MediaManagerMethods {
    authenticate(apiKey: string): Promise<AuthResult>;
    selectFile(options?: SelectFileOptions): Promise<SelectFileResult>;
    cancelCurrentRequest(): Promise<CancelRequestResult>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: (...args: any[]) => Promise<any>;
}

@customElement("scms-media-manager-modal")
export class MediaManagerModal extends LitElement {
    @property({ type: Boolean, reflect: true })
    open = false;

    @property({ type: String, attribute: "app-url" })
    appUrl = "";

    @property({ type: String, attribute: "app-id" })
    appId = "";

    @property({ type: String, attribute: "api-key" })
    apiKey = "";

    @state()
    private iframe: HTMLIFrameElement | null = null;

    @state()
    private connection: { destroy: () => void } | null = null;

    @state()
    private mediaManager: MediaManagerMethods | null = null;

    @state()
    private connectionReady = false;

    @state()
    private authenticated = false;

    @state()
    private error: string | null = null;

    @state()
    private closing = false;

    @state()
    private selectingMedia = false;

    static styles = [
        tailwindSheet,
        css`
            :host {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 2147483647;
                display: flex;
                align-items: center;
                justify-content: center;
                visibility: hidden;
                pointer-events: none;
            }

            :host([open]) {
                visibility: visible;
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

        // Re-authenticate if apiKey changes after connection
        if (changedProperties.has("apiKey") && this.connectionReady && this.apiKey) {
            this.authenticate();
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

            // Authenticate if we have an API key
            if (this.apiKey) {
                await this.authenticate();
            }
        } catch (err) {
            this.error = `Connection failed: ${err instanceof Error ? err.message : String(err)}`;
        }
    }

    private async authenticate() {
        if (!this.mediaManager || !this.apiKey) return;

        try {
            const result = await this.mediaManager.authenticate(this.apiKey);
            if (result.success) {
                this.authenticated = true;
                this.error = null;
            } else {
                this.authenticated = false;
                this.error = result.error || "Authentication failed";
            }
        } catch (err) {
            this.authenticated = false;
            this.error = `Authentication error: ${err instanceof Error ? err.message : String(err)}`;
        }
    }

    private cleanup() {
        if (this.connection) {
            this.connection.destroy();
            this.connection = null;
        }
        this.mediaManager = null;
        this.connectionReady = false;
        this.authenticated = false;
        document.removeEventListener("keydown", this.handleKeydown);
    }

    /**
     * Wait for the connection to be ready and authenticated.
     * Returns true if ready, false if an error occurred.
     */
    private waitForReady(): Promise<boolean> {
        return new Promise((resolve) => {
            const check = () => {
                if (this.error) {
                    resolve(false);
                    return;
                }
                if (this.mediaManager && this.authenticated) {
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
        if (this.mediaManager && this.connectionReady && this.authenticated) {
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
        if (!this.authenticated) return "Authenticating...";
        return null;
    }

    render() {
        const statusMessage = this.getStatusMessage();

        return html`
            <div class="backdrop"></div>
            <div class="modal">
                <div class="header">
                    <span class="title">Select Media</span>
                    <button
                        class="close-button"
                        @click=${this.handleCloseClick}
                        aria-label="Close"
                    >
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
                <div class="iframe-container${this.connectionReady && this.authenticated && !this.error ? ' ready' : ''}">
                    ${statusMessage
                        ? html`<div class="status"><div class="spinner"></div><span class="status-text">${statusMessage}</span></div>`
                        : null}
                    ${this.error
                        ? html`<div class="status"><span class="status-error">${this.error}</span></div>`
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
