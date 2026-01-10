/**
 * Help Panel Component
 *
 * A panel showing available guided tours.
 * Positioned above the toolbar in the bottom-right corner.
 */

import { html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { X } from "lucide-static";
import { ScmsElement } from "./base.js";
import type { TourDefinition } from "../lazy/tours/types.js";

@customElement("scms-help-panel")
export class HelpPanel extends ScmsElement {
    @property({ type: Array })
    tours: TourDefinition[] = [];

    @property({ type: Boolean })
    loading = true;

    static styles = [
        ...ScmsElement.styles,
        css`
            :host {
                position: fixed;
                bottom: 60px;
                right: 16px;
                z-index: 10001;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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

    private handleTourSelect(tourId: string) {
        this.dispatchEvent(
            new CustomEvent("tour-select", {
                detail: { tourId },
                bubbles: true,
                composed: true,
            }),
        );
    }

    render() {
        return html`
            <div
                class="bg-white rounded-lg shadow-xl min-w-[220px] max-h-[calc(100vh-76px)] flex flex-col"
            >
                <div class="flex items-center justify-between p-4 pb-3 shrink-0">
                    <div class="font-semibold text-sm text-gray-700">Guided Tours</div>
                    <button
                        class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 [&>svg]:w-[18px] [&>svg]:h-[18px]"
                        @click=${this.handleClose}
                        aria-label="Close"
                    >
                        ${unsafeSVG(X)}
                    </button>
                </div>

                <div class="overflow-y-auto px-4 pb-4">
                    ${this.loading
                        ? html`<div class="text-sm text-gray-500 py-2">Loading tours...</div>`
                        : this.tours.map(
                              (tour) => html`
                                  <button
                                      class="block w-full text-left p-3 mb-2 last:mb-0 border border-gray-200 rounded-md bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-all"
                                      @click=${() => this.handleTourSelect(tour.id)}
                                  >
                                      <div class="font-medium text-sm text-gray-700">
                                          ${tour.label}
                                      </div>
                                      <div class="text-xs text-gray-500 mt-0.5">
                                          ${tour.description}
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
        "scms-help-panel": HelpPanel;
    }
}
