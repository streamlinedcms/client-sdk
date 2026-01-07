/**
 * Text Editing Tour - Learn how to edit text content
 */

import type { TourDefinition, TourStep, TourContext } from "../types";
import { desktopSteps } from "./desktop";
import { mobileSteps } from "./mobile";

/**
 * Step introducing text elements
 */
function textElementStep(ctx: TourContext): TourStep | null {
    const element = ctx.findVisibleElement("[data-scms-text]");
    if (!element) return null;

    return {
        element,
        popover: {
            title: "Text Elements",
            description: ctx.isMobile
                ? "Tap on any text element to edit it directly. Your changes appear instantly."
                : "Click on any text element to edit it directly. Your changes appear instantly.",
            side: "bottom",
            align: "start",
        },
    };
}

/**
 * Step explaining how to edit
 */
function editingStep(ctx: TourContext): TourStep | null {
    const element = ctx.findVisibleElement("[data-scms-text]");
    if (!element) return null;

    return {
        element,
        popover: {
            title: "Editing Text",
            description: ctx.isMobile
                ? "Just type to replace the text. Tap outside to finish editing."
                : "Just type to replace the text. Press Enter or click outside to finish editing.",
            side: "bottom",
            align: "start",
        },
    };
}

/**
 * Step about saving
 */
function saveStep(ctx: TourContext): TourStep {
    return {
        element: "scms-toolbar",
        popover: {
            title: "Save Your Changes",
            description: ctx.isMobile
                ? 'When you\'re done editing, tap "Save" in the toolbar to publish your changes.'
                : 'When you\'re done editing, click "Save" in the toolbar to publish your changes.',
            side: "top",
            align: "center",
        },
    };
}

export const textEditingTour: TourDefinition = {
    id: "text-editing",
    label: "How do I edit text?",
    description: "Change headings, paragraphs, and more",

    getSteps: (ctx: TourContext) => {
        const platformSteps = ctx.isMobile ? mobileSteps(ctx) : desktopSteps(ctx);

        return [
            textElementStep(ctx),
            editingStep(ctx),
            ...platformSteps,
            saveStep(ctx),
        ];
    },
};
