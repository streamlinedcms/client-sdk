/**
 * Dropdown Menu Component
 *
 * A reusable menu that opens from a trigger button.
 * Supports both dropdown (down) and dropup (up) directions.
 */

import { html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { ChevronUp, ChevronDown } from "lucide-static";
import { ScmsElement } from "./base.js";

@customElement("scms-dropdown-menu")
export class DropdownMenu extends ScmsElement {
    @property({ type: String })
    label = "";

    @property({ type: String })
    icon = "";

    @property({ type: String })
    direction: "up" | "down" = "up";

    @property({ type: Boolean })
    disabled = false;

    @property({ type: Boolean, reflect: true })
    open = false;

    private clickOutsideHandler: ((e: MouseEvent) => void) | null = null;
    private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

    static styles = [
        ...ScmsElement.styles,
        css`
            :host {
                position: relative;
                display: inline-block;
            }

            button {
                cursor: pointer;
            }

            button:disabled {
                cursor: not-allowed;
            }

            ::slotted(button) {
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
                width: 100% !important;
                box-sizing: border-box !important;
                margin: 0 !important;
                padding: 10px 14px !important;
                text-align: left !important;
                font-size: 13px !important;
                line-height: 1.4 !important;
                color: #374151;
                background: none !important;
                border: none !important;
                border-radius: 0 !important;
                cursor: pointer !important;
                transition: background-color 0.15s !important;
            }

            ::slotted(button:hover) {
                background-color: #f3f4f6 !important;
            }

            ::slotted(button:disabled) {
                color: #9ca3af !important;
                cursor: not-allowed !important;
            }

            ::slotted(button:disabled:hover) {
                background-color: transparent !important;
            }

            ::slotted(hr) {
                margin: 4px 10px !important;
                border: none !important;
                border-top: 1px solid #f3f4f6 !important;
            }
        `,
    ];

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeListeners();
    }

    private toggle() {
        if (this.disabled) return;

        if (this.open) {
            this.close();
        } else {
            this.openMenu();
        }
    }

    private openMenu() {
        this.open = true;

        // Add listeners after a tick to avoid catching the current click
        setTimeout(() => {
            this.clickOutsideHandler = (e: MouseEvent) => {
                if (!this.contains(e.target as Node)) {
                    this.close();
                }
            };
            this.keydownHandler = (e: KeyboardEvent) => {
                if (e.key === "Escape") {
                    this.close();
                }
            };
            document.addEventListener("click", this.clickOutsideHandler);
            document.addEventListener("keydown", this.keydownHandler);
        }, 0);
    }

    private close() {
        this.open = false;
        this.removeListeners();
    }

    private removeListeners() {
        if (this.clickOutsideHandler) {
            document.removeEventListener("click", this.clickOutsideHandler);
            this.clickOutsideHandler = null;
        }
        if (this.keydownHandler) {
            document.removeEventListener("keydown", this.keydownHandler);
            this.keydownHandler = null;
        }
    }

    private handleSlotClick() {
        // Close menu when a slotted button is clicked
        this.close();
    }

    render() {
        const buttonClass = this.disabled
            ? "px-2 py-1.5 text-xs font-medium text-gray-300 border border-gray-200 rounded-md flex items-center gap-1"
            : "px-2 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-1";

        const menuPositionClass =
            this.direction === "up"
                ? "bottom-full left-0 mb-1 shadow-[0_-4px_12px_rgba(0,0,0,0.1)]"
                : "top-full left-0 mt-1 shadow-lg";

        const chevronIcon = this.direction === "up" ? ChevronUp : ChevronDown;

        return html`
            <button
                class=${buttonClass}
                ?disabled=${this.disabled}
                @click=${this.toggle}
                aria-haspopup="true"
                aria-expanded=${this.open}
            >
                ${this.icon
                    ? html`<span class="[&>svg]:w-4 [&>svg]:h-4">${unsafeSVG(this.icon)}</span>`
                    : null}
                <span>${this.label}</span>
                <span class="[&>svg]:w-3 [&>svg]:h-3 text-gray-400">
                    ${unsafeSVG(chevronIcon)}
                </span>
            </button>

            ${this.open
                ? html`
                      <div
                          class="absolute ${menuPositionClass} min-w-40 bg-white border border-gray-200 rounded-md z-50 overflow-hidden"
                          @click=${this.handleSlotClick}
                      >
                          <slot></slot>
                      </div>
                  `
                : null}
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "scms-dropdown-menu": DropdownMenu;
    }
}
