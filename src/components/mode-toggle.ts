/**
 * Mode Toggle Component
 *
 * A Lit web component that displays an Editing/Preview mode toggle switch.
 * Uses Shadow DOM with Tailwind for styling.
 *
 * This is a composable component - it has no positioning and can be used
 * inside other components like the toolbar.
 */

import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import { tailwindSheet } from "./styles.js";

export type EditorMode = "author" | "viewer";

@customElement("scms-mode-toggle")
export class ModeToggle extends LitElement {
    @property({ type: String })
    mode: EditorMode = "viewer";

    static styles = [tailwindSheet];

    private handleModeChange(newMode: EditorMode) {
        if (newMode !== this.mode) {
            this.mode = newMode;
            this.dispatchEvent(
                new CustomEvent("mode-change", {
                    detail: { mode: newMode },
                    bubbles: true,
                    composed: true,
                }),
            );
        }
    }

    render() {
        const isViewer = this.mode === "viewer";
        const sliderStyles = {
            transition: "transform 0.2s ease-out",
            transform: `translateX(${isViewer ? "0" : "100%"})`,
        };

        const baseButtonClasses =
            "relative z-10 px-3 py-1 border-none bg-transparent rounded-full cursor-pointer text-xs font-medium transition-colors";

        return html`
            <div class="relative flex items-center bg-gray-100 p-1 rounded-full">
                <div
                    class="absolute left-1 top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-full shadow"
                    style=${styleMap(sliderStyles)}
                ></div>
                <button
                    class="${baseButtonClasses} ${isViewer
                        ? "text-gray-900"
                        : "text-gray-500 hover:text-gray-700"}"
                    @click=${() => this.handleModeChange("viewer")}
                >
                    Preview
                </button>
                <button
                    class="${baseButtonClasses} ${!isViewer
                        ? "text-gray-900"
                        : "text-gray-500 hover:text-gray-700"}"
                    @click=${() => this.handleModeChange("author")}
                >
                    Editing
                </button>
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "scms-mode-toggle": ModeToggle;
    }
}
