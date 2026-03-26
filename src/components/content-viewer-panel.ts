/**
 * Content Viewer Panel Component
 *
 * A panel listing editable elements that are hidden, off-screen, or have
 * zero dimensions. Positioned above the toolbar in the bottom-right corner.
 * Clicking an item dispatches an event to scroll to and select that element.
 */

import { html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { X } from "lucide-static";
import { ScmsElement } from "./base.js";
import { renderTypeIcon } from "./type-icon.js";

export interface HiddenElementInfo {
    key: string;
    elementId: string;
    elementType: string;
    reason: string;
}

@customElement("scms-content-viewer-panel")
export class ContentViewerPanel extends ScmsElement {
    @property({ type: Array })
    hiddenElements: HiddenElementInfo[] = [];

    static styles = [
        ...ScmsElement.styles,
        css`
            :host {
                position: fixed;
                bottom: 60px;
                right: 16px;
                z-index: 10001;
                font-family:
                    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial,
                    sans-serif;
            }

            button {
                cursor: pointer;
            }
        `,
    ];

    private handleClose() {
        this.dispatchEvent(
            new CustomEvent("close", {
                bubbles: true,
                composed: true,
            }),
        );
    }

    private handleElementClick(key: string) {
        this.dispatchEvent(
            new CustomEvent("hidden-element-click", {
                detail: { key },
                bubbles: true,
                composed: true,
            }),
        );
    }

    private renderReasonBadge(reason: string) {
        const colorClass =
            reason === "off-screen"
                ? "bg-blue-100 text-blue-600"
                : reason === "zero size"
                  ? "bg-orange-100 text-orange-600"
                  : "bg-gray-100 text-gray-600";

        return html`<span class="text-[10px] px-1.5 py-0.5 rounded-full ${colorClass}"
            >${reason}</span
        >`;
    }

    render() {
        if (this.hiddenElements.length === 0) {
            return nothing;
        }

        return html`
            <div
                class="bg-white rounded-lg shadow-xl min-w-[240px] max-w-[320px] max-h-[calc(100vh-76px)] flex flex-col"
            >
                <div class="flex items-center justify-between p-4 pb-3 shrink-0">
                    <div class="font-semibold text-sm text-gray-700">
                        Hidden Elements (${this.hiddenElements.length})
                    </div>
                    <button
                        class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 [&>svg]:w-[18px] [&>svg]:h-[18px]"
                        @click=${this.handleClose}
                        aria-label="Close"
                    >
                        ${unsafeSVG(X)}
                    </button>
                </div>

                <div class="overflow-y-auto px-4 pb-4">
                    ${this.hiddenElements.map(
                        (el) => html`
                            <button
                                class="block w-full text-left p-2.5 mb-1.5 last:mb-0 border border-gray-200 rounded-md bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-all"
                                @click=${() => this.handleElementClick(el.key)}
                                title=${el.key}
                            >
                                <div
                                    class="flex items-center gap-1.5 text-xs font-mono text-gray-700"
                                >
                                    ${renderTypeIcon(
                                        el.elementType,
                                        "w-3 h-3 text-gray-500 shrink-0",
                                        "w-3 h-3 text-gray-500 shrink-0 -translate-y-px",
                                    )}
                                    <span class="truncate">${el.elementId}</span>
                                    ${this.renderReasonBadge(el.reason)}
                                </div>
                            </button>
                        `,
                    )}
                </div>
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "scms-content-viewer-panel": ContentViewerPanel;
    }
}
