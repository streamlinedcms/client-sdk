/**
 * Content Viewer Badge Component
 *
 * A floating pill that appears over an editable element when the content viewer
 * is active. Shows the element type icon and element ID. Clicking it selects
 * that element for editing.
 */

import { html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ScmsElement } from "./base.js";
import { renderTypeIcon } from "./type-icon.js";

@customElement("scms-content-viewer-badge")
export class ContentViewerBadge extends ScmsElement {
    @property({ type: String, attribute: "element-key" })
    elementKey = "";

    @property({ type: String, attribute: "element-id" })
    elementId = "";

    @property({ type: String, attribute: "element-type" })
    elementType = "";

    static styles = [
        ...ScmsElement.styles,
        css`
            :host {
                position: fixed;
                z-index: 10002;
                pointer-events: auto;
                font-family:
                    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial,
                    sans-serif;
            }
        `,
    ];

    private handleClick(e: Event) {
        e.stopPropagation();
        this.dispatchEvent(
            new CustomEvent("badge-click", {
                detail: { key: this.elementKey },
                bubbles: true,
                composed: true,
            }),
        );
    }

    render() {
        return html`
            <button
                class="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono text-gray-700 bg-white border border-gray-300 rounded-full shadow-md hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-colors cursor-pointer whitespace-nowrap"
                @click=${this.handleClick}
                title=${this.elementKey}
            >
                ${renderTypeIcon(
                    this.elementType,
                    "w-3 h-3 text-gray-500 shrink-0",
                    "w-3 h-3 text-gray-500 shrink-0 -translate-y-px",
                )}
                <span class="max-w-[120px] truncate">${this.elementId}</span>
            </button>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "scms-content-viewer-badge": ContentViewerBadge;
    }
}
