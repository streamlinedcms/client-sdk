/**
 * Templates Tour - Learn how to work with repeating templates
 */

import type { TourDefinition, TourStep, TourContext } from "../types";
import { desktopSteps } from "./desktop";
import { mobileSteps } from "./mobile";

/**
 * Step introducing template containers
 */
function templateContainerStep(ctx: TourContext): TourStep | null {
    const element = ctx.findVisibleElement("[data-scms-template]");
    if (!element) return null;

    return {
        element,
        popover: {
            title: "Repeating Templates",
            description:
                "This section contains repeating items. You can add, remove, and reorder them.",
            side: "top",
            align: "start",
        },
    };
}

/**
 * Step about template instances
 */
function templateInstanceStep(ctx: TourContext): TourStep | null {
    const element = ctx.findVisibleElement("[data-scms-instance]");
    if (!element) return null;

    return {
        element,
        popover: {
            title: "Template Items",
            description: ctx.isMobile
                ? "Each item can be edited independently. Tap to select, then use the menu to manage."
                : "Each item can be edited independently. Click to select, then use the toolbar to manage.",
            side: "bottom",
            align: "center",
        },
    };
}

/**
 * Step about template controls in toolbar
 */
function templateControlsStep(_ctx: TourContext): TourStep {
    return {
        element: "scms-toolbar",
        popover: {
            title: "Template Controls",
            description:
                "With a template item selected, use the toolbar to add new items, delete, or reorder.",
            side: "top",
            align: "center",
        },
    };
}

export const templatesTour: TourDefinition = {
    id: "templates",
    label: "How do I manage lists?",
    description: "Add, remove, and reorder items",

    getSteps: (ctx: TourContext) => {
        const platformSteps = ctx.isMobile ? mobileSteps(ctx) : desktopSteps(ctx);

        return [
            templateContainerStep(ctx),
            templateInstanceStep(ctx),
            ...platformSteps,
            templateControlsStep(ctx),
        ];
    },
};
