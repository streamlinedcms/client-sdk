/**
 * Hold Button Component
 *
 * A button that requires holding for a duration before triggering.
 * Shows a visual progress indicator while holding.
 */

import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { tailwindSheet } from "./styles.js";

@customElement("scms-hold-button")
export class HoldButton extends LitElement {
    @property({ type: String })
    label = "Hold";

    @property({ type: Number, attribute: "hold-duration" })
    holdDuration = 1000; // milliseconds

    @state()
    private progress = 0;

    private holdTimer: number | null = null;
    private progressInterval: number | null = null;
    private startTime = 0;

    static styles = [
        tailwindSheet,
        css`
            button {
                cursor: pointer;
            }

            .progress-bg {
                position: absolute;
                top: 0;
                left: 0;
                height: 100%;
                background-color: rgba(239, 68, 68, 0.2);
                transition: width 50ms linear;
                border-radius: inherit;
            }
        `,
    ];

    private startHold = (e: Event) => {
        e.preventDefault();
        this.progress = 0;
        this.startTime = Date.now();

        // Update progress every 50ms
        this.progressInterval = window.setInterval(() => {
            const elapsed = Date.now() - this.startTime;
            this.progress = Math.min((elapsed / this.holdDuration) * 100, 100);
        }, 50);

        // Trigger action after hold duration
        this.holdTimer = window.setTimeout(() => {
            this.completeHold();
        }, this.holdDuration);
    };

    private cancelHold = () => {
        this.progress = 0;

        if (this.holdTimer) {
            clearTimeout(this.holdTimer);
            this.holdTimer = null;
        }
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    };

    private completeHold() {
        this.cancelHold();
        this.dispatchEvent(
            new CustomEvent("hold-complete", {
                bubbles: true,
                composed: true,
            })
        );
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.cancelHold();
    }

    render() {
        return html`
            <button
                class="relative overflow-hidden px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors select-none"
                @mousedown=${this.startHold}
                @mouseup=${this.cancelHold}
                @mouseleave=${this.cancelHold}
                @touchstart=${this.startHold}
                @touchend=${this.cancelHold}
                @touchcancel=${this.cancelHold}
            >
                <div class="progress-bg" style="width: ${this.progress}%"></div>
                <span class="relative z-10">${this.label}</span>
            </button>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "scms-hold-button": HoldButton;
    }
}
