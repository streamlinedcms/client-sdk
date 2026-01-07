/**
 * SEO Tour - Learn how to optimize content for search engines
 */

import type { TourDefinition, TourStep, TourContext } from "../types";
import { selectElementStep, waitForModalStep } from "../common";
import { desktopSteps } from "./desktop";
import { mobileSteps } from "./mobile";

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
            // Step 1: Select an element (prefer image for SEO context)
            selectElementStep(ctx, {
                preferImage: true,
                title: "Step 1: Select an Element",
                description:
                    "Click on this element to select it. Images are ideal for SEO attributes like alt text.",
            }),

            // Step 2: Open the SEO modal
            waitForModalStep(ctx, {
                selector: "scms-seo-modal",
                title: "Step 2: Open SEO Settings",
                description: 'Click the "SEO" button in the toolbar.',
                mobileDescription: 'Tap the gear icon to open the menu, then tap "SEO".',
            }),

            // Step 3: Explain the modal fields (shared)
            explainFieldsStep(ctx),

            // Platform-specific steps (desktop has extra detail)
            ...platformSteps,

            // Final step: How to save (shared)
            saveChangesStep(ctx),
        ];
    },
};
