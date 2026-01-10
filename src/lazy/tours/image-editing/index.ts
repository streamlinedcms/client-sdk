/**
 * Image Editing Tour - Learn how to change images
 */

import type { TourDefinition, TourStep } from "../types";
import {
    selectImageStepDesktop,
    changeImageStepDesktop,
    mediaManagerStepDesktop,
    shortcutStepDesktop,
    saveStepDesktop,
} from "./desktop";
import {
    selectImageStepMobile,
    expandToolbarStepMobile,
    openElementSectionStepMobile,
    changeImageStepMobile,
    mediaManagerStepMobile,
    shortcutStepMobile,
    saveStepMobile,
} from "./mobile";

/**
 * Step shown when no image elements exist on the page
 */
function noImageElementsStep(): TourStep {
    return {
        popover: {
            title: "No Image Elements",
            description:
                "This page doesn't have an image element. Please try again on a page with an image.",
            side: "top",
            align: "center",
        },
    };
}

export const imageEditingTour: TourDefinition = {
    id: "image-editing",
    label: "How do I change images?",
    description: "Replace images and set alt text",

    getSteps: (ctx) => {
        // Check if page has image elements
        const imageElement = ctx.findVisibleElement("[data-scms-image]");
        if (!imageElement) {
            return [noImageElementsStep()];
        }

        if (ctx.isMobile) {
            return [
                selectImageStepMobile(ctx),
                expandToolbarStepMobile(ctx),
                openElementSectionStepMobile(ctx),
                changeImageStepMobile(ctx),
                mediaManagerStepMobile(ctx),
                shortcutStepMobile(ctx),
                saveStepMobile(),
            ];
        }

        return [
            selectImageStepDesktop(ctx),
            changeImageStepDesktop(ctx),
            mediaManagerStepDesktop(ctx),
            shortcutStepDesktop(ctx),
            saveStepDesktop(),
        ];
    },
};
