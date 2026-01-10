/**
 * Mode Toggle Tour - Mobile-specific steps
 */

import type { TourStep, TourContext } from "../types";
import { observeAttributeAdded } from "../common";
import { queryShadowSelector } from "../common/shadow-dom";

/**
 * Step prompting user to expand the toolbar
 * Auto-advances when toolbar is expanded
 */
export function expandToolbarStepMobile(ctx: TourContext): TourStep {
    return {
        element: "scms-toolbar",
        popover: {
            title: "Expand the Toolbar",
            description: "Tap the toolbar to expand it and see all options.",
            side: "top",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            const toolbar = document.querySelector("scms-toolbar");
            if (!toolbar) return;

            // Auto-advance if already expanded
            if ((toolbar as any).expanded) {
                setTimeout(() => ctx.moveNext(), 200);
                return;
            }

            const observer = observeAttributeAdded(toolbar, "expanded", {
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
 * Step explaining the mode toggle
 */
export function modeToggleStepMobile(): TourStep {
    return {
        element: () => queryShadowSelector("scms-toolbar >>> scms-mode-toggle"),
        popover: {
            title: "Preview & Editing Modes",
            description:
                "Use this toggle to switch modes. Preview shows the page as visitors see it. Editing lets you tap elements to make changes.",
            side: "top",
            align: "center",
            showButtons: ["next", "close"],
        },
    };
}
