/**
 * SEO Tour - Learn how to optimize content for search engines
 */

import type { TourDefinition, TourStep, TourContext } from "../types";
import {
    selectElementStep,
    repositionPopoverTop,
    getSaveButtonOrToolbar,
    observeElementRemoved,
} from "../common";
import { clickMoreStep, clickSeoInMenuStep } from "./desktop";
import { expandToolbarStepMobile, openMetadataSectionStepMobile, tapSeoStepMobile } from "./mobile";

/**
 * Step explaining the SEO modal fields
 * Auto-advances when modal is closed (user clicks Apply or Cancel)
 */
function explainFieldsStep(ctx: TourContext): TourStep {
    const action = ctx.isMobile ? "Tap" : "Click";
    return {
        element: () => document.querySelector("scms-seo-modal") as HTMLElement,
        popover: {
            title: "SEO Attributes",
            description:
                "<strong>Alt Text</strong> - Describes images for screen readers and search engines.<br><br>" +
                "<strong>Title</strong> - Shows as a tooltip on hover.<br><br>" +
                `${action} "Apply" when done.`,
            side: "top",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            repositionPopoverTop();

            const observer = observeElementRemoved("scms-seo-modal", {
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

export const seoTour: TourDefinition = {
    id: "seo",
    label: "How do I improve SEO?",
    description: "Optimize for search engines",

    getSteps: (ctx: TourContext) => {
        return [
            // Select an element (prefer image for SEO context)
            selectElementStep(ctx, {
                preferImage: true,
                title: "Select an Element",
                description: ctx.isMobile
                    ? "Tap on this element to select it. Images are ideal for SEO attributes like alt text."
                    : "Click on this element to select it. Images are ideal for SEO attributes like alt text.",
            }),

            // Open the SEO modal
            ...(ctx.isMobile
                ? [
                      expandToolbarStepMobile(ctx),
                      openMetadataSectionStepMobile(ctx),
                      tapSeoStepMobile(ctx),
                  ]
                : [clickMoreStep(ctx), clickSeoInMenuStep(ctx)]),

            // Explain the modal fields (auto-advances when closed)
            explainFieldsStep(ctx),

            // Save to toolbar
            saveStep(ctx),
        ];
    },
};
