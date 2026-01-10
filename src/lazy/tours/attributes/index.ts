/**
 * Custom Attributes Tour - Learn how to add custom data attributes
 */

import type { TourDefinition, TourStep, TourContext } from "../types";
import {
    selectElementStep,
    repositionPopoverTop,
    getSaveButtonOrToolbar,
    observeElementRemoved,
} from "../common";
import { clickMoreStep, clickAttributesInMenuStep } from "./desktop";
import {
    expandToolbarStepMobile,
    openMetadataSectionStepMobile,
    tapAttributesStepMobile,
} from "./mobile";

/**
 * Step explaining the attributes modal
 * Auto-advances when modal is closed (user clicks Apply or Cancel)
 */
function explainModalStep(ctx: TourContext): TourStep {
    const action = ctx.isMobile ? "Tap" : "Click";
    return {
        element: () => document.querySelector("scms-attributes-modal") as HTMLElement,
        popover: {
            title: "Custom Attributes",
            description:
                "Add custom data attributes like <strong>data-tracking</strong> or <strong>data-category</strong>. " +
                `${action} "Apply" when done.`,
            side: "top",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            repositionPopoverTop();

            const observer = observeElementRemoved("scms-attributes-modal", {
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

export const attributesTour: TourDefinition = {
    id: "attributes",
    label: "How do I add custom attributes?",
    description: "Add data attributes for tracking and integrations",

    getSteps: (ctx: TourContext) => {
        return [
            // Select an element
            selectElementStep(ctx, {
                title: "Select an Element",
                description: ctx.isMobile
                    ? "Tap on this element to select it."
                    : "Click on this element to select it.",
            }),

            // Open the attributes modal
            ...(ctx.isMobile
                ? [
                      expandToolbarStepMobile(ctx),
                      openMetadataSectionStepMobile(ctx),
                      tapAttributesStepMobile(ctx),
                  ]
                : [clickMoreStep(ctx), clickAttributesInMenuStep(ctx)]),

            // Explain the modal (auto-advances when closed)
            explainModalStep(ctx),

            // Save to toolbar
            saveStep(ctx),
        ];
    },
};
