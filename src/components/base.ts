/**
 * Base class for all SCMS components
 *
 * Provides shared functionality:
 * - Tailwind CSS injection
 * - Marker class (scms-component) for event handling exclusions
 */

import { LitElement } from "lit";
import { tailwindSheet } from "./styles.js";

export class ScmsElement extends LitElement {
    // Include tailwind in all components - subclasses should spread this into their styles
    static styles = [tailwindSheet];

    connectedCallback() {
        super.connectedCallback();
        // Add marker class to host element for event handling exclusions
        // (e.g., handleDocumentClick won't deselect when clicking inside SCMS components)
        this.classList.add("scms-component");
    }
}
