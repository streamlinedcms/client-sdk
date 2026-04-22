/**
 * Link Editing Tour - Learn how to edit links
 */

import type { TourDefinition, TourStep } from "../types";
import {
    selectLinkStepDesktop,
    editLinkStepDesktop,
    linkEditorStepDesktop,
    saveStepDesktop,
} from "./desktop";
import {
    selectLinkStepMobile,
    expandToolbarStepMobile,
    openElementSectionStepMobile,
    editLinkStepMobile,
    linkEditorStepMobile,
    saveStepMobile,
} from "./mobile";

/**
 * Step shown when no link elements exist on the page
 */
function noLinkElementsStep(): TourStep {
    return {
        popover: {
            title: "No Link Elements",
            description:
                "This page doesn't have a link element. Please try again on a page with a link.",
            side: "top",
            align: "center",
        },
    };
}

export const linkEditingTour: TourDefinition = {
    id: "link-editing",
    label: "How do I edit links?",
    description: "Change link URLs, targets, and content",

    getSteps: (ctx) => {
        // Check if page has link elements
        const linkElement = ctx.findVisibleElement("[data-scms-link]");
        if (!linkElement) {
            return [noLinkElementsStep()];
        }

        if (ctx.isMobile) {
            return [
                selectLinkStepMobile(ctx),
                expandToolbarStepMobile(ctx),
                openElementSectionStepMobile(ctx),
                editLinkStepMobile(ctx),
                linkEditorStepMobile(ctx),
                saveStepMobile(),
            ];
        }

        return [
            selectLinkStepDesktop(ctx),
            editLinkStepDesktop(ctx),
            linkEditorStepDesktop(ctx),
            saveStepDesktop(),
        ];
    },
};
