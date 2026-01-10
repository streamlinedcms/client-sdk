/**
 * Welcome Tour - First-time onboarding tour
 */

import type { TourDefinition, TourStep } from "../types";

/**
 * Welcome introduction step (centered, no element)
 */
function welcomeStep(): TourStep {
    return {
        popover: {
            title: "Welcome to Streamlined CMS",
            description:
                "You can edit text, images, and links directly on this page. " +
                "Select any editable element to see available actions in the toolbar.<br><br>" +
                "Use the <strong>Help</strong> button in the toolbar to access guided tours for specific tasks.",
            side: "top",
            align: "center",
            showButtons: ["next", "close"],
        },
    };
}

export const welcomeTour: TourDefinition = {
    id: "welcome",
    label: "How do I get started?",
    description: "Quick introduction to the editor",

    getSteps: () => [welcomeStep()],
};
