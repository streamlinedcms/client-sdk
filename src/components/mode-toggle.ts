/**
 * Mode Toggle Component
 *
 * A Lit web component that displays Author/Viewer mode toggle
 * with a sign-out link. Uses Shadow DOM with Tailwind for styling.
 */

import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import { tailwindSheet } from "./styles.js";

export type EditorMode = "author" | "viewer";

@customElement("scms-mode-toggle")
export class ModeToggle extends LitElement {
    @property({ type: String })
    mode: EditorMode = "viewer";

    static styles = [
        tailwindSheet,
        css`
            :host {
                position: fixed;
                bottom: 20px;
                left: 20px;
                z-index: 10000;
            }
        `,
    ];

    private handleModeChange(newMode: EditorMode) {
        if (newMode !== this.mode) {
            this.mode = newMode;
            this.dispatchEvent(
                new CustomEvent("mode-change", {
                    detail: { mode: newMode },
                    bubbles: true,
                    composed: true,
                })
            );
        }
    }

    private handleSignOut() {
        this.dispatchEvent(
            new CustomEvent("sign-out", {
                bubbles: true,
                composed: true,
            })
        );
    }

    render() {
        const isViewer = this.mode === "viewer";
        const sliderStyles = {
            transition: "transform 0.2s ease-out",
            transform: `translateX(${isViewer ? "0" : "100%"})`,
        };
        return html`
            <div class="flex flex-col items-start gap-1.5 text-xs font-medium">
                <div class="relative flex items-center bg-gray-100 p-1 rounded-full shadow-md border border-gray-200">
                    <div
                        class="absolute left-1 top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-full shadow"
                        style=${styleMap(sliderStyles)}
                    ></div>
                    <button
                        class="relative z-10 px-4 py-1.5 border-none bg-transparent rounded-full cursor-pointer text-xs font-medium transition-colors ${isViewer ? "text-gray-900" : "text-gray-500 hover:text-gray-700"}"
                        @click="${() => this.handleModeChange("viewer")}"
                    >
                        Viewer
                    </button>
                    <button
                        class="relative z-10 px-4 py-1.5 border-none bg-transparent rounded-full cursor-pointer text-xs font-medium transition-colors ${!isViewer ? "text-gray-900" : "text-gray-500 hover:text-gray-700"}"
                        @click="${() => this.handleModeChange("author")}"
                    >
                        Author
                    </button>
                </div>
                <a
                    class="text-[11px] text-gray-400 no-underline pl-2 cursor-pointer hover:underline"
                    @click="${this.handleSignOut}"
                >
                    Sign Out
                </a>
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "scms-mode-toggle": ModeToggle;
    }
}
