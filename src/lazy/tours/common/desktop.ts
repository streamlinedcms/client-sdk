/**
 * Desktop-specific overrides for common steps
 */

import { queryShadowSelector } from "./shadow-dom";

export interface StepOverrides {
    title?: string;
    description?: string;
    side?: "top" | "bottom" | "left" | "right";
}

export const desktopOverrides: Record<string, StepOverrides> = {
    selectElement: {
        // Desktop uses defaults
    },
    toolbar: {
        description:
            "The toolbar shows actions for the selected element. Save your changes here when done.",
    },
};

/**
 * Helper to get a dropdown menu element from toolbar's shadow DOM by label
 */
export function getToolbarDropdown(label: string): HTMLElement | null {
    return queryShadowSelector(`scms-toolbar >>> scms-dropdown-menu[label="${label}"]`);
}

/**
 * Helper to get the open dropdown menu content (the popup menu, not the button)
 * Returns the menu content div when open, or the dropdown element if closed
 */
export function getOpenDropdownMenu(label: string): HTMLElement | null {
    return (
        queryShadowSelector(
            `scms-toolbar >>> scms-dropdown-menu[label="${label}"] >>> div.absolute`,
        ) ?? getToolbarDropdown(label)
    );
}
