/**
 * Image Editing Tour - Learn how to change images
 */

import type { TourDefinition, TourStep, TourContext } from "../types";
import { desktopSteps } from "./desktop";
import { mobileSteps } from "./mobile";

/**
 * Step about selecting images
 */
function selectImageStep(ctx: TourContext): TourStep | null {
    const element = ctx.findVisibleElement("[data-scms-image]");
    if (!element) return null;

    return {
        element,
        popover: {
            title: "Selecting Images",
            description: ctx.isMobile
                ? "Tap on an image to select it. A blue outline will appear."
                : "Click on an image to select it. A blue outline will appear.",
            side: "bottom",
            align: "center",
        },
    };
}

/**
 * Step about changing images
 */
function changeImageStep(ctx: TourContext): TourStep | null {
    const element = ctx.findVisibleElement("[data-scms-image]");
    if (!element) return null;

    return {
        element,
        popover: {
            title: "Changing Images",
            description: ctx.isMobile
                ? 'Double-tap or use "Change Image" in the toolbar to open the media library.'
                : 'Double-click or use "Change Image" in the toolbar to open the media library.',
            side: "bottom",
            align: "center",
        },
    };
}

/**
 * Step about image options in toolbar
 */
function imageOptionsStep(ctx: TourContext): TourStep {
    return {
        element: "scms-toolbar",
        popover: {
            title: "Image Options",
            description: ctx.isMobile
                ? "Expand the toolbar and use the Metadata section for SEO (alt text), accessibility, and more."
                : "Use the 'More' dropdown in the toolbar for SEO (alt text), accessibility, and more.",
            side: "top",
            align: "center",
        },
    };
}

export const imageEditingTour: TourDefinition = {
    id: "image-editing",
    label: "How do I change images?",
    description: "Replace images and set alt text",

    getSteps: (ctx: TourContext) => {
        const platformSteps = ctx.isMobile ? mobileSteps(ctx) : desktopSteps(ctx);

        return [
            selectImageStep(ctx),
            changeImageStep(ctx),
            ...platformSteps,
            imageOptionsStep(ctx),
        ];
    },
};
