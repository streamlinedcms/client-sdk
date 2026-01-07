/**
 * Link Editor Modal Component
 *
 * A modal dialog for editing link properties (href, target, text).
 * Provides form inputs and Apply/Cancel buttons.
 */

import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { tailwindSheet } from "./styles.js";

export interface LinkData {
    href: string;
    target: string;
    value: string;
}

@customElement("scms-link-editor-modal")
export class LinkEditorModal extends LitElement {
    @property({ type: String, attribute: "element-id" })
    elementId: string | null = null;

    @property({ type: Object })
    linkData: LinkData = { href: "", target: "", value: "" };

    @state()
    private editedHref = "";

    @state()
    private editedTarget = "";

    @state()
    private editedValue = "";

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
                max-width: 500px;
                display: flex;
                flex-direction: column;
            }

            input,
            select,
            textarea {
                font-size: 14px;
            }

            button {
                cursor: pointer;
            }
        `,
    ];

    connectedCallback() {
        super.connectedCallback();
        this.editedHref = this.linkData.href;
        this.editedTarget = this.linkData.target;
        this.editedValue = this.linkData.value;
        // Prevent body scroll while modal is open
        document.body.style.overflow = "hidden";
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.body.style.overflow = "";
    }

    updated(changedProperties: Map<string, unknown>) {
        if (changedProperties.has("linkData")) {
            this.editedHref = this.linkData.href;
            this.editedTarget = this.linkData.target;
            this.editedValue = this.linkData.value;
        }
    }

    private handleHrefInput(e: Event) {
        const input = e.target as HTMLInputElement;
        this.editedHref = input.value;
    }

    private handleTargetChange(e: Event) {
        const select = e.target as HTMLSelectElement;
        this.editedTarget = select.value;
    }

    private handleValueInput(e: Event) {
        const textarea = e.target as HTMLTextAreaElement;
        this.editedValue = textarea.value;
    }

    private handleApply() {
        this.dispatchEvent(
            new CustomEvent("apply", {
                detail: {
                    linkData: {
                        href: this.editedHref,
                        target: this.editedTarget,
                        value: this.editedValue,
                    },
                },
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
        return (
            this.editedHref !== this.linkData.href ||
            this.editedTarget !== this.linkData.target ||
            this.editedValue !== this.linkData.value
        );
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
                        <span class="text-sm font-medium text-gray-900">Edit Link</span>
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

                <!-- Form -->
                <div class="p-4 space-y-4">
                    <!-- Link Content -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">
                            Link Content (HTML)
                        </label>
                        <textarea
                            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 font-mono text-sm"
                            rows="3"
                            .value=${this.editedValue}
                            @input=${this.handleValueInput}
                            placeholder="Click here"
                        ></textarea>
                    </div>

                    <!-- URL -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1"> URL </label>
                        <input
                            type="url"
                            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                            .value=${this.editedHref}
                            @input=${this.handleHrefInput}
                            placeholder="https://example.com"
                            autofocus
                        />
                    </div>

                    <!-- Target -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">
                            Open In
                        </label>
                        <select
                            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 bg-white"
                            .value=${this.editedTarget}
                            @change=${this.handleTargetChange}
                        >
                            <option value="">Same window</option>
                            <option value="_blank">New tab</option>
                        </select>
                    </div>
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
        "scms-link-editor-modal": LinkEditorModal;
    }
}
