/**
 * HTML Editor Modal Component
 *
 * A modal dialog for editing raw HTML content of an element.
 * Provides a textarea for editing and Apply/Cancel buttons.
 */

import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { tailwindSheet } from "./styles.js";

@customElement("scms-html-editor-modal")
export class HtmlEditorModal extends LitElement {
    @property({ type: String, attribute: "element-id" })
    elementId: string | null = null;

    @property({ type: String })
    content = "";

    @state()
    private editedContent = "";

    static styles = [
        tailwindSheet,
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
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
            }

            .modal {
                position: relative;
                width: 90%;
                max-width: 800px;
                max-height: 80vh;
                display: flex;
                flex-direction: column;
            }

            textarea {
                font-family:
                    ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono",
                    monospace;
                font-size: 13px;
                line-height: 1.5;
                tab-size: 2;
            }

            button {
                cursor: pointer;
            }
        `,
    ];

    connectedCallback() {
        super.connectedCallback();
        this.editedContent = this.content;
        // Prevent body scroll while modal is open
        document.body.style.overflow = "hidden";
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.body.style.overflow = "";
    }

    updated(changedProperties: Map<string, unknown>) {
        if (changedProperties.has("content")) {
            this.editedContent = this.content;
        }
    }

    private handleInput(e: Event) {
        const textarea = e.target as HTMLTextAreaElement;
        this.editedContent = textarea.value;
    }

    private handleApply() {
        this.dispatchEvent(
            new CustomEvent("apply", {
                detail: { content: this.editedContent },
                bubbles: true,
                composed: true,
            }),
        );
    }

    private handleCancel() {
        if (this.hasChanges()) {
            const confirmed = confirm("You have unsaved changes. Discard them?");
            if (!confirmed) {
                return;
            }
        }
        this.dispatchEvent(
            new CustomEvent("cancel", {
                bubbles: true,
                composed: true,
            }),
        );
    }

    private hasChanges(): boolean {
        return this.editedContent !== this.content;
    }

    private handleBackdropClick(e: Event) {
        if (e.target === e.currentTarget) {
            this.handleCancel();
        }
    }

    private handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            this.handleCancel();
        } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            this.handleApply();
        }
    }

    render() {
        return html`
            <div class="backdrop" @click=${this.handleBackdropClick}></div>
            <div
                class="modal bg-white rounded-lg shadow-2xl overflow-hidden"
                @keydown=${this.handleKeydown}
            >
                <!-- Header -->
                <div class="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-gray-900">Edit HTML</span>
                        <span
                            class="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded"
                        >
                            ${this.elementId}
                        </span>
                    </div>
                    <button
                        class="text-gray-400 hover:text-gray-600 p-1"
                        @click=${this.handleCancel}
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

                <!-- Editor -->
                <div class="flex-1 overflow-hidden">
                    <textarea
                        class="w-full h-64 p-4 border-0 resize-none focus:outline-none focus:ring-0"
                        .value=${this.editedContent}
                        @input=${this.handleInput}
                        spellcheck="false"
                        autofocus
                    ></textarea>
                </div>

                <!-- Footer -->
                <div
                    class="px-4 py-3 border-t border-gray-200 flex items-center justify-between bg-gray-50"
                >
                    <span class="text-xs text-gray-500">
                        <kbd class="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">⌘</kbd>
                        <kbd class="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">Enter</kbd>
                        to apply
                    </span>
                    <div class="flex items-center gap-2">
                        <button
                            class="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
                            @click=${this.handleCancel}
                        >
                            Cancel
                        </button>
                        <button
                            class="px-4 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                            @click=${this.handleApply}
                        >
                            Apply
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "scms-html-editor-modal": HtmlEditorModal;
    }
}
