/**
 * Accessibility Tour - Desktop-specific steps
 */

import type { TourStep, TourContext } from "../types";
import { observeElementAppears, observeAttributeAdded } from "../common";
import { queryShadowSelector } from "../common/shadow-dom";
import { getToolbarDropdown } from "../common/desktop";

/**
 * Click the More dropdown
 * Highlights the toolbar, waits for More dropdown to open
 */
export function clickMoreStep(ctx: TourContext): TourStep {
    return {
        element: () => getToolbarDropdown("More"),
        popover: {
            title: "Open the More Menu",
            description: 'Click "More" to see additional options.',
            side: "top",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            const dropdown = getToolbarDropdown("More");
            if (!dropdown) return;

            // Check if already open
            if (dropdown.hasAttribute("open")) {
                setTimeout(() => ctx.moveNext(), 100);
                return;
            }

            const observer = observeAttributeAdded(dropdown, "open", {
                onMatch: () => {
                    ctx.untrackObserver(observer);
                    setTimeout(() => ctx.moveNext(), 200);
                },
            });
            ctx.trackObserver(observer);
        },
    };
}

/**
 * Click Accessibility in the open dropdown
 * Highlights the Accessibility button in the dropdown menu
 */
export function clickAccessibilityInMenuStep(ctx: TourContext): TourStep {
    return {
        element: () => queryShadowSelector("scms-toolbar >>> button[data-action='accessibility']"),
        popover: {
            title: "Open Accessibility Settings",
            description: 'Click "Accessibility" to configure screen reader attributes.',
            side: "left",
            align: "start",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            const observer = observeElementAppears("scms-accessibility-modal", {
                onMatch: () => {
                    ctx.untrackObserver(observer);
                    setTimeout(() => ctx.moveNext(), 200);
                },
            });
            ctx.trackObserver(observer);
        },
    };
}
