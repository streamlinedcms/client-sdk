/**
 * Change Request Overlay Component
 *
 * Full-viewport overlay that owns every step of the change-request UI after
 * the toolbar button is clicked, so the flow is no longer limited to a line of
 * text on the toolbar. It walks these phases:
 *
 *   capturing   - snapdom is rendering the page; shows a spinner. The overlay
 *                 is on screen here but excluded from the shot, and does NOT
 *                 freeze page scroll, so the capture matches what the user saw.
 *   preview     - show the captured screenshot and ask the user whether it's
 *                 good, or let them swap in a manual one, before anything is
 *                 sent to the server. Nothing has hit the API yet at this point.
 *   submitting  - the request is being created/uploaded; shows phased progress.
 *   error       - the submit failed; offers Retry / Cancel.
 *   blocked     - the request was created but the browser blocked the editor
 *                 tab (rare with the open-on-click approach); shows a link.
 *
 * The host element is added to snapdom's `exclude` list in
 * ChangeRequestManager.captureScreenshot: the overlay is already on screen
 * (showing the spinner) while the page is captured, so excluding it keeps the
 * spinner and dimming backdrop out of the shot. See RFC-0016 and
 * ChangeRequestManager.
 */

import { html, css, nothing } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { LoaderCircle, ImageUp, RefreshCw, TriangleAlert, ExternalLink, X } from "lucide-static";
import { ScmsElement } from "./base.js";

export type ChangeRequestPhase = "capturing" | "preview" | "submitting" | "error" | "blocked";

/** Image types the API's media manager accepts for a screenshot. */
const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/webp,image/gif";

@customElement("scms-change-request-overlay")
export class ChangeRequestOverlay extends ScmsElement {
    @property({ type: String })
    phase: ChangeRequestPhase = "capturing";

    /** Object URL of the screenshot currently being previewed. */
    @property({ type: String, attribute: "screenshot-url" })
    screenshotUrl: string | null = null;

    /** True when the previewed screenshot is one the user supplied. */
    @property({ type: Boolean })
    manual = false;

    /** Progress line shown during the submitting phase. */
    @property({ type: String, attribute: "status-message" })
    statusMessage = "";

    /** Message shown in the error phase. */
    @property({ type: String, attribute: "error-message" })
    errorMessage: string | null = null;

    /** Editor URL shown as a fallback link when the tab was blocked. */
    @property({ type: String, attribute: "fallback-url" })
    fallbackUrl: string | null = null;

    @query("input[type=file]")
    private fileInput!: HTMLInputElement;

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
            }

            .backdrop {
                position: absolute;
                inset: 0;
                background: rgba(0, 0, 0, 0.6);
            }

            .panel {
                position: relative;
                width: 90%;
                max-width: 720px;
                max-height: 88vh;
                display: flex;
                flex-direction: column;
            }

            /* Checkerboard so transparent PNGs read clearly in the preview. */
            .preview-frame {
                background-color: #f3f4f6;
                background-image:
                    linear-gradient(45deg, #e5e7eb 25%, transparent 25%),
                    linear-gradient(-45deg, #e5e7eb 25%, transparent 25%),
                    linear-gradient(45deg, transparent 75%, #e5e7eb 75%),
                    linear-gradient(-45deg, transparent 75%, #e5e7eb 75%);
                background-size: 16px 16px;
                background-position:
                    0 0,
                    0 8px,
                    8px -8px,
                    -8px 0;
            }

            button {
                cursor: pointer;
            }

            .spin {
                animation: scms-spin 0.8s linear infinite;
            }

            @keyframes scms-spin {
                to {
                    transform: rotate(360deg);
                }
            }
        `,
    ];

    connectedCallback() {
        super.connectedCallback();
        // Paste-to-replace: the preview has nothing focusable, so a listener
        // scoped to the overlay would never receive ⌘V (paste lands on whatever
        // is focused, usually document.body). We listen at the document level
        // instead and scope by behaviour — only while previewing, and never when
        // the user is pasting into a text field on the host page.
        document.addEventListener("paste", this.handlePaste);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.removeEventListener("paste", this.handlePaste);
        document.body.style.overflow = "";
    }

    updated(changed: Map<string, unknown>) {
        if (changed.has("phase")) {
            // Freeze the page behind the overlay — but never during "capturing",
            // where hiding the scrollbar would reflow the page and make the
            // snapdom shot differ from what the user was looking at.
            document.body.style.overflow = this.phase === "capturing" ? "" : "hidden";
        }
    }

    private emit(type: string, detail?: unknown) {
        this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
    }

    private handleSend = () => this.emit("cr-send");
    private handleCancel = () => this.emit("cr-cancel");
    private handleRetry = () => this.emit("cr-retry");
    private handleRevert = () => this.emit("cr-revert");

    private handleReplaceClick = () => {
        this.fileInput.value = "";
        this.fileInput.click();
    };

    private handleFileChange = (e: Event) => {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            this.emit("cr-replace-invalid");
            return;
        }
        this.emit("cr-replace", { file });
    };

    private handlePaste = (e: ClipboardEvent) => {
        // Only intercept while the user is deciding on the screenshot, and never
        // steal a paste aimed at an editable element (a form field on the host
        // page). Non-image pastes fall through untouched.
        if (this.phase !== "preview") return;
        if (this.isEditableTarget(e)) return;

        const file = this.imageFromClipboard(e.clipboardData);
        if (!file) return;

        e.preventDefault();
        this.emit("cr-replace", { file });
    };

    /** First image file on the clipboard, or null if none is present. */
    private imageFromClipboard(data: DataTransfer | null): File | null {
        const items = data?.items;
        if (!items) return null;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === "file" && item.type.startsWith("image/")) {
                const file = item.getAsFile();
                if (file) return file;
            }
        }
        return null;
    }

    /** True when focus is in a text field / contenteditable we shouldn't hijack. */
    private isEditableTarget(e: ClipboardEvent): boolean {
        const el = (e.composedPath()[0] as Element | undefined) ?? document.activeElement;
        if (!(el instanceof HTMLElement)) return false;
        if (el.isContentEditable) return true;
        const tag = el.tagName;
        return tag === "TEXTAREA" || tag === "INPUT";
    }

    private handleKeydown = (e: KeyboardEvent) => {
        // Only close on Escape while the user is still deciding.
        if (e.key === "Escape" && this.phase === "preview") {
            this.handleCancel();
        }
    };

    private handleBackdropClick = () => {
        if (this.phase === "preview") this.handleCancel();
    };

    render() {
        return html`
            <div class="backdrop" @click=${this.handleBackdropClick}></div>
            <div
                class="panel bg-white rounded-lg shadow-2xl overflow-hidden"
                @keydown=${this.handleKeydown}
            >
                ${this.renderHeader()} ${this.renderBody()}
                <input
                    type="file"
                    accept=${ACCEPTED_IMAGE_TYPES}
                    class="hidden"
                    @change=${this.handleFileChange}
                />
            </div>
        `;
    }

    private renderHeader() {
        const closable =
            this.phase === "preview" || this.phase === "error" || this.phase === "blocked";
        return html`
            <div class="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <span class="text-sm font-medium text-gray-900">Request a change</span>
                ${closable
                    ? html`<button
                          class="text-gray-400 hover:text-gray-600 p-1 [&>span>svg]:w-5 [&>span>svg]:h-5"
                          @click=${this.handleCancel}
                          aria-label="Close"
                      >
                          <span class="inline-flex">${unsafeSVG(X)}</span>
                      </button>`
                    : nothing}
            </div>
        `;
    }

    private renderBody() {
        switch (this.phase) {
            case "capturing":
            case "submitting":
                return this.renderSubmitting();
            case "error":
                return this.renderError();
            case "blocked":
                return this.renderBlocked();
            case "preview":
            default:
                return this.renderPreview();
        }
    }

    private renderPreview() {
        return html`
            <div class="p-4 overflow-auto">
                <div class="preview-frame rounded-md border border-gray-200 overflow-hidden mb-3">
                    ${this.screenshotUrl
                        ? html`<img
                              src=${this.screenshotUrl}
                              alt="Captured screenshot preview"
                              class="block max-w-full max-h-[52vh] mx-auto"
                          />`
                        : nothing}
                </div>
                ${this.manual
                    ? html`<p class="text-xs text-gray-500 mb-3 flex items-center gap-2">
                          <span>Using the screenshot you provided.</span>
                          <button
                              class="text-blue-600 hover:text-blue-800 underline"
                              @click=${this.handleRevert}
                          >
                              Use the automatic capture instead
                          </button>
                      </p>`
                    : html`<p class="text-sm text-gray-600 mb-3">
                          Does this screenshot look right? The page was recreated from your browser,
                          so some details may differ. You can use it as-is, or replace it with one
                          you capture yourself.
                      </p>`}
                <p class="text-xs text-gray-500">
                    You can also paste an image from your clipboard to replace the screenshot.
                </p>
            </div>
            <div
                class="px-4 py-3 border-t border-gray-200 flex items-center justify-between bg-gray-50 gap-2"
            >
                <button
                    class="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors inline-flex items-center gap-1.5 [&>span>svg]:w-4 [&>span>svg]:h-4"
                    @click=${this.handleReplaceClick}
                >
                    <span class="inline-flex">${unsafeSVG(ImageUp)}</span>
                    Replace screenshot
                </button>
                <div class="flex items-center gap-2">
                    <button
                        class="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
                        @click=${this.handleCancel}
                    >
                        Cancel
                    </button>
                    <button
                        class="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                        @click=${this.handleSend}
                    >
                        Create draft
                    </button>
                </div>
            </div>
        `;
    }

    private renderSubmitting() {
        return html`
            <div class="p-8 flex flex-col items-center justify-center text-center">
                <span class="inline-flex text-blue-600 [&>svg]:w-8 [&>svg]:h-8 spin mb-4">
                    ${unsafeSVG(LoaderCircle)}
                </span>
                <p class="text-sm font-medium text-gray-900">
                    ${this.statusMessage || "Creating your draft…"}
                </p>
                <p class="text-xs text-gray-500 mt-1">This only takes a moment.</p>
            </div>
        `;
    }

    private renderError() {
        return html`
            <div class="p-6 flex flex-col items-center text-center">
                <span class="inline-flex text-red-600 [&>svg]:w-8 [&>svg]:h-8 mb-3">
                    ${unsafeSVG(TriangleAlert)}
                </span>
                <p class="text-sm font-medium text-gray-900 mb-1">Couldn't create your draft</p>
                <p class="text-sm text-gray-600 mb-4">
                    ${this.errorMessage || "Something went wrong. Please try again."}
                </p>
                <div class="flex items-center gap-2">
                    <button
                        class="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
                        @click=${this.handleCancel}
                    >
                        Cancel
                    </button>
                    <button
                        class="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors inline-flex items-center gap-1.5 [&>span>svg]:w-4 [&>span>svg]:h-4"
                        @click=${this.handleRetry}
                    >
                        <span class="inline-flex">${unsafeSVG(RefreshCw)}</span>
                        Try again
                    </button>
                </div>
            </div>
        `;
    }

    private renderBlocked() {
        return html`
            <div class="p-6 flex flex-col items-center text-center">
                <p class="text-sm font-medium text-gray-900 mb-1">Your draft was created</p>
                <p class="text-sm text-gray-600 mb-4">
                    Your browser blocked the editor tab. Open it with the link below.
                </p>
                <div class="flex items-center gap-2">
                    <button
                        class="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
                        @click=${this.handleCancel}
                    >
                        Close
                    </button>
                    ${this.fallbackUrl
                        ? html`<a
                              href=${this.fallbackUrl}
                              target="_blank"
                              rel="noopener"
                              class="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors inline-flex items-center gap-1.5 [&>span>svg]:w-4 [&>span>svg]:h-4"
                              @click=${this.handleCancel}
                          >
                              <span class="inline-flex">${unsafeSVG(ExternalLink)}</span>
                              Open the editor
                          </a>`
                        : nothing}
                </div>
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "scms-change-request-overlay": ChangeRequestOverlay;
    }
}
