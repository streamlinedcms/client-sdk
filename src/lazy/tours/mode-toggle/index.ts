/**
 * Mode Toggle Tour - Learn about Preview and Editing modes
 */

import type { TourDefinition, TourContext } from "../types";
import { modeToggleStepDesktop } from "./desktop";
import { expandToolbarStepMobile, modeToggleStepMobile } from "./mobile";

export const modeToggleTour: TourDefinition = {
    id: "mode-toggle",
    label: "How do I preview my changes?",
    description: "Switch between viewing and editing",

    getSteps: (ctx: TourContext) => {
        if (ctx.isMobile) {
            return [expandToolbarStepMobile(ctx), modeToggleStepMobile()];
        }

        return [modeToggleStepDesktop()];
    },
};
