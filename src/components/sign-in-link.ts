/**
 * Sign In Link Component
 *
 * A Lit web component that displays a subtle sign-in link
 * in the footer area. Uses Shadow DOM with Tailwind for styling.
 */

import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { tailwindSheet } from "./styles.js";

@customElement("scms-sign-in-link")
export class SignInLink extends LitElement {
    static styles = [tailwindSheet];

    private handleClick(e: Event) {
        e.preventDefault();
        this.dispatchEvent(
            new CustomEvent("sign-in-click", {
                bubbles: true,
                composed: true,
            })
        );
    }

    render() {
        return html`
            <div class="text-center py-5 mt-10 text-xs">
                <a
                    class="text-gray-500 no-underline cursor-pointer hover:underline"
                    @click="${this.handleClick}"
                >
                    Sign In
                </a>
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "scms-sign-in-link": SignInLink;
    }
}
