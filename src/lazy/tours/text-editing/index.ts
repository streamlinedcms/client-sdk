/**
 * Text Editing Tour - Learn how to edit text content
 */

import type { TourDefinition, TourStep, TourContext } from "../types";
import { selectTextStepDesktop, inlineEditingStepDesktop, saveStepDesktop } from "./desktop";
import { selectTextStepMobile, tapToEditStepMobile, saveStepMobile } from "./mobile";

/**
 * Step shown when no text elements exist on the page
 */
function noTextElementsStep(): TourStep {
    return {
        popover: {
            title: "No Text Elements",
            description:
                "This page doesn't have a text element. Please try again on a page with editable text.",
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
        // Check if page has text elements
        const textElement = ctx.findVisibleElement("[data-scms-text]");
        if (!textElement) {
            return [noTextElementsStep()];
        }

        if (ctx.isMobile) {
            // On mobile, skip the inline editing explanation step since
            // re-highlighting the element steals focus from contenteditable.
            // The keyboard appearing makes it obvious they can type.
            return [selectTextStepMobile(ctx), tapToEditStepMobile(ctx), saveStepMobile()];
        }

        return [selectTextStepDesktop(ctx), inlineEditingStepDesktop(ctx), saveStepDesktop()];
    },
};
