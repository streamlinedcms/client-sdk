/**
 * Instance Badge Component
 *
 * Displays the currently selected template instance with a visual indicator.
 * Shows an empty state when no instance is selected.
 */

import { html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { Layers } from "lucide-static";
import { ScmsElement } from "./base.js";

@customElement("scms-instance-badge")
export class InstanceBadge extends ScmsElement {
    @property({ type: Number, attribute: "instance-index" })
    instanceIndex: number | null = null;

    @property({ type: Number, attribute: "instance-count" })
    instanceCount: number | null = null;

    static styles = [...ScmsElement.styles];

    render() {
        if (this.instanceIndex === null || this.instanceCount === null) {
            return nothing;
        }

        return html`
            <div class="flex items-center gap-1.5">
                <span class="flex h-2 w-2">
                    <span
                        class="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-blue-400 opacity-75"
                    ></span>
                    <span class="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
                <span
                    class="text-xs text-gray-600 font-mono bg-gray-100 px-2 py-1 rounded inline-flex items-center gap-1.5"
                >
                    <span class="[&>svg]:w-3.5 [&>svg]:h-3.5 text-gray-500">${unsafeSVG(Layers)}</span>
                    Item ${this.instanceIndex + 1} of ${this.instanceCount}
                </span>
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "scms-instance-badge": InstanceBadge;
    }
}
