/**
 * Templates Tour - Learn how to work with repeating templates
 */

import type { TourDefinition, TourStep, TourContext } from "../types";
import {
    selectInstanceStepDesktop,
    templateDropdownStepDesktop,
    templateActionsStepDesktop,
} from "./desktop";
import {
    selectInstanceStepMobile,
    expandToolbarStepMobile,
    openTemplateSectionStepMobile,
    templateActionsStepMobile,
} from "./mobile";

/**
 * Step shown when no template elements exist on the page
 */
function noTemplatesStep(): TourStep {
    return {
        popover: {
            title: "No Repeating Content",
            description:
                "This page doesn't have any repeating content sections. Try this tour on a page with lists or repeating items.",
            side: "top",
            align: "center",
            showButtons: ["next", "close"],
        },
    };
}

/**
 * Step introducing template containers
 */
function templateContainerStep(ctx: TourContext): TourStep {
    const element = ctx.findVisibleElement("[data-scms-template]");

    return {
        element: element ?? undefined,
        popover: {
            title: "Repeating Content",
            description:
                "This section contains repeating items. You can add, remove, and reorder them.",
            side: "top",
            align: "start",
            showButtons: ["next", "close"],
        },
    };
}

export const templatesTour: TourDefinition = {
    id: "templates",
    label: "How do I manage lists?",
    description: "Add, remove, and reorder items",

    getSteps: (ctx: TourContext) => {
        // Check if page has template elements
        const templateElement = ctx.findVisibleElement("[data-scms-template]");
        if (!templateElement) {
            return [noTemplatesStep()];
        }

        if (ctx.isMobile) {
            return [
                templateContainerStep(ctx),
                selectInstanceStepMobile(ctx),
                expandToolbarStepMobile(ctx),
                openTemplateSectionStepMobile(ctx),
                templateActionsStepMobile(ctx),
            ];
        }

        return [
            templateContainerStep(ctx),
            selectInstanceStepDesktop(ctx),
            templateDropdownStepDesktop(ctx),
            templateActionsStepDesktop(ctx),
        ];
    },
};
