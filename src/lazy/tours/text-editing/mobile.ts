/**
 * Text Editing Tour - Mobile-specific steps
 */

import type { TourStep, TourContext } from "../types";
import { observeClassAddedOnSelector, getSaveButtonOrToolbar } from "../common";

/**
 * Step prompting user to tap a text element
 * Auto-advances when element becomes selected
 */
export function selectTextStepMobile(ctx: TourContext): TourStep | null {
    const element = ctx.findVisibleElement("[data-scms-text]");
    if (!element) return null;

    return {
        element,
        popover: {
            title: "Select Text to Edit",
            description: "Tap on this text element to select it.",
            side: "bottom",
            align: "start",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            // Auto-advance when text element becomes selected
            const observer = observeClassAddedOnSelector(
                "[data-scms-text]",
                ["streamlined-selected"],
                {
                    onMatch: () => {
                        ctx.untrackObserver(observer);
                        setTimeout(() => ctx.moveNext(), 200);
                    },
                },
            );
            ctx.trackObserver(observer);
        },
    };
}

/**
 * Step prompting user to tap again to enter editing mode
 * User clicks Next manually to proceed (auto-advance causes popover positioning issues)
 * Uses a function for element to find it at display time (after user has selected)
 */
export function tapToEditStepMobile(ctx: TourContext): TourStep {
    return {
        element: () => ctx.findVisibleElement(".streamlined-selected[data-scms-text]"),
        popover: {
            title: "Tap to Edit",
            description: "Tap again to open the keyboard and start editing the text.",
            side: "bottom",
            align: "start",
            showButtons: ["next", "close"],
        },
    };
}

/**
 * Step pointing to Save button (mobile)
 */
export function saveStepMobile(): TourStep {
    return {
        element: () => getSaveButtonOrToolbar(),
        popover: {
            title: "Save Your Changes",
            description: 'When you\'re done editing, tap "Save" to publish your changes.',
            side: "top",
            align: "center",
        },
        onHighlighted: () => {
            // Trigger scroll event to force Driver.js to recalculate popover position
            window.dispatchEvent(new Event("scroll"));
        },
    };
}
