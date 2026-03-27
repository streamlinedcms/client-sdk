/**
 * Element Badge Component
 *
 * Displays the currently selected editable element ID with a visual indicator.
 * Shows an empty state when no element is selected.
 */

import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ScmsElement } from "./base.js";
import { renderTypeIcon } from "./type-icon.js";

@customElement("scms-element-badge")
export class ElementBadge extends ScmsElement {
    @property({ type: String, attribute: "element-id" })
    elementId: string | null = null;

    @property({ type: String, attribute: "element-type" })
    elementType: string | null = null;

    static styles = [...ScmsElement.styles];

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
                    ${renderTypeIcon(this.elementType)}${this.elementId}
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
