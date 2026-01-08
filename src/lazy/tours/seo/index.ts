/**
 * SEO Tour - Learn how to optimize content for search engines
 */

import type { TourDefinition, TourStep, TourContext } from "../types";
import { selectElementStep } from "../common";
import { desktopSteps, clickMoreStep, clickSeoInMenuStep } from "./desktop";
import { mobileSteps, expandToolbarStepMobile, tapSeoStepMobile } from "./mobile";

/**
 * Step explaining the SEO modal fields
 */
function explainFieldsStep(ctx: TourContext): TourStep {
    return {
        element: () => document.querySelector("scms-seo-modal") as HTMLElement,
        popover: {
            title: "SEO Attributes",
            description:
                "<strong>Alt Text</strong> - Describes images for screen readers and search engines.<br><br>" +
                "<strong>Title</strong> - Shows as a tooltip on hover.<br><br>" +
                "<strong>Rel</strong> - For links, controls search engine behavior.",
            side: ctx.isMobile ? "top" : "left",
            align: "center",
            showButtons: ["next", "close"],
        },
    };
}

/**
 * Step explaining how to save changes
 */
function saveChangesStep(ctx: TourContext): TourStep {
    return {
        element: () => document.querySelector("scms-seo-modal") as HTMLElement,
        popover: {
            title: "Saving Changes",
            description:
                'Click "Apply" to save your SEO changes. They\'ll be included when you save the page from the toolbar.',
            side: ctx.isMobile ? "top" : "left",
            align: "center",
        },
    };
}

export const seoTour: TourDefinition = {
    id: "seo",
    label: "How do I improve SEO?",
    description: "Optimize for search engines",

    getSteps: (ctx: TourContext) => {
        const platformSteps = ctx.isMobile ? mobileSteps(ctx) : desktopSteps(ctx);

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
            // Both platforms have two steps to guide through the UI
            ...(ctx.isMobile
                ? [expandToolbarStepMobile(ctx), tapSeoStepMobile(ctx)]
                : [clickMoreStep(ctx), clickSeoInMenuStep(ctx)]),

            // Explain the modal fields (shared)
            explainFieldsStep(ctx),

            // Platform-specific steps (desktop has extra detail)
            ...platformSteps,

            // Final step: How to save (shared)
            saveChangesStep(ctx),
        ];
    },
};
