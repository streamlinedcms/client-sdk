/**
 * Text Editing Tour - Desktop-specific steps
 */

import type { TourStep, TourContext } from "../types";
import { observeClassAddedOnSelector, getSaveButtonOrToolbar } from "../common";

/**
 * Step prompting user to click a text element
 * Auto-advances when element enters editing mode
 */
export function selectTextStepDesktop(ctx: TourContext): TourStep | null {
    const element = ctx.findVisibleElement("[data-scms-text]");
    if (!element) return null;

    return {
        element,
        popover: {
            title: "Select Text to Edit",
            description: "Click on this text element to start editing.",
            side: "bottom",
            align: "start",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            // Auto-advance when text element enters editing mode
            const observer = observeClassAddedOnSelector(
                "[data-scms-text]",
                ["streamlined-editing"],
                {
                    onMatch: () => {
                        ctx.untrackObserver(observer);
                        ctx.moveNext();
                    },
                },
            );
            ctx.trackObserver(observer);
        },
    };
}

/**
 * Step explaining inline editing (after element is in editing mode)
 * Uses a function for element to find it at display time (after user has entered editing mode)
 */
export function inlineEditingStepDesktop(ctx: TourContext): TourStep {
    return {
        element: () => ctx.findVisibleElement(".streamlined-editing[data-scms-text]"),
        popover: {
            title: "Editing Text",
            description: "Type to change the text. Click outside when you're done.",
            side: "bottom",
            align: "start",
            showButtons: ["next", "close"],
        },
        onHighlighted: () => {
            // Refocus the element after Driver.js highlights it
            const element = ctx.findVisibleElement(".streamlined-editing[data-scms-text]");
            element?.focus();
        },
    };
}

/**
 * Step pointing to Save button
 */
export function saveStepDesktop(): TourStep {
    return {
        element: () => getSaveButtonOrToolbar(),
        popover: {
            title: "Save Your Changes",
            description: 'When you\'re done editing, click "Save" to publish your changes.',
            side: "top",
            align: "center",
        },
    };
}
