/**
 * Element Badge Component
 *
 * Displays the currently selected editable element ID with a visual indicator.
 * Shows an empty state when no element is selected.
 */

import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ScmsElement } from "./base.js";

@customElement("scms-element-badge")
export class ElementBadge extends ScmsElement {
    @property({ type: String, attribute: "element-id" })
    elementId: string | null = null;

    @property({ type: String, attribute: "element-type" })
    elementType: string | null = null;

    static styles = [...ScmsElement.styles];

    private renderTypeIcon() {
        const iconClass = "w-3.5 h-3.5 text-gray-500 shrink-0";
        const iconClassAdjusted = "w-3.5 h-3.5 text-gray-500 shrink-0 -translate-y-px";

        switch (this.elementType) {
            case "text":
                // "T" text icon
                return html`
                    <svg
                        class=${iconClassAdjusted}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M4 4h16M12 4v16"
                        />
                    </svg>
                `;
            case "html":
                // Code/HTML icon
                return html`
                    <svg
                        class=${iconClassAdjusted}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                        />
                    </svg>
                `;
            case "image":
                // Image icon
                return html`
                    <svg class=${iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                    </svg>
                `;
            case "link":
                // Link icon
                return html`
                    <svg
                        class=${iconClassAdjusted}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                        />
                    </svg>
                `;
            default:
                return null;
        }
    }

    render() {
        if (!this.elementId) {
            return html` <span class="text-xs text-gray-400 italic">No element selected</span> `;
        }

        return html`
            <div class="flex items-center gap-1.5">
                <span class="flex h-2 w-2">
                    <span
                        class="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-red-400 opacity-75"
                    ></span>
                    <span class="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                <span
                    class="text-xs text-gray-600 font-mono bg-gray-100 px-2 py-1 rounded inline-flex items-center gap-1.5"
                >
                    ${this.renderTypeIcon()}${this.elementId}
                </span>
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "scms-element-badge": ElementBadge;
    }
}
