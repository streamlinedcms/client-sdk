/**
 * Accessibility Tour - Learn how to improve accessibility for screen readers
 */

import type { TourDefinition, TourStep, TourContext } from "../types";
import {
    selectElementStep,
    repositionPopoverTop,
    getSaveButtonOrToolbar,
    observeElementRemoved,
} from "../common";
import { clickMoreStep, clickAccessibilityInMenuStep } from "./desktop";
import {
    expandToolbarStepMobile,
    openMetadataSectionStepMobile,
    tapAccessibilityStepMobile,
} from "./mobile";

/**
 * Step explaining the accessibility modal fields
 * Auto-advances when modal is closed (user clicks Apply or Cancel)
 */
function explainFieldsStep(ctx: TourContext): TourStep {
    const action = ctx.isMobile ? "Tap" : "Click";
    return {
        element: () => document.querySelector("scms-accessibility-modal") as HTMLElement,
        popover: {
            title: "Accessibility Attributes",
            description:
                "<strong>ARIA Label</strong> - Provides an accessible name for screen readers.<br><br>" +
                "<strong>Described By</strong> - References another element with a longer description.<br><br>" +
                `${action} "Apply" when done.`,
            side: "top",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            repositionPopoverTop();

            const observer = observeElementRemoved("scms-accessibility-modal", {
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
 * Step pointing to Save button
 */
function saveStep(ctx: TourContext): TourStep {
    const action = ctx.isMobile ? "Tap" : "Click";
    return {
        element: () => getSaveButtonOrToolbar(),
        popover: {
            title: "Save Your Changes",
            description: `${action} "Save" to publish your changes.`,
            side: "top",
            align: "center",
            showButtons: ["close", "next"],
        },
    };
}

export const accessibilityTour: TourDefinition = {
    id: "accessibility",
    label: "How do I improve accessibility?",
    description: "Add ARIA labels and roles for screen readers",

    getSteps: (ctx: TourContext) => {
        return [
            // Select an element
            selectElementStep(ctx, {
                title: "Select an Element",
                description: ctx.isMobile
                    ? "Tap on this element to select it."
                    : "Click on this element to select it.",
            }),

            // Open the accessibility modal
            ...(ctx.isMobile
                ? [
                      expandToolbarStepMobile(ctx),
                      openMetadataSectionStepMobile(ctx),
                      tapAccessibilityStepMobile(ctx),
                  ]
                : [clickMoreStep(ctx), clickAccessibilityInMenuStep(ctx)]),

            // Explain the modal fields (auto-advances when closed)
            explainFieldsStep(ctx),

            // Save to toolbar
            saveStep(ctx),
        ];
    },
};
