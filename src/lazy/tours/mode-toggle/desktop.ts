/**
 * Mode Toggle Tour - Desktop-specific steps
 */

import type { TourStep } from "../types";
import { queryShadowSelector } from "../common/shadow-dom";

/**
 * Step explaining the mode toggle
 */
export function modeToggleStepDesktop(): TourStep {
    return {
        element: () => queryShadowSelector("scms-toolbar >>> scms-mode-toggle"),
        popover: {
            title: "Preview & Editing Modes",
            description:
                "Use this toggle to switch modes. Preview shows the page as visitors see it. Editing lets you click elements to make changes.",
            side: "top",
            align: "center",
            showButtons: ["next", "close"],
        },
    };
}
