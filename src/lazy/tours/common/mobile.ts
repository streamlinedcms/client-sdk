/**
 * Mobile-specific overrides for common steps
 */

import type { StepOverrides } from "./desktop";

export const mobileOverrides: Record<string, StepOverrides> = {
    selectElement: {
        description: "Tap on this element to select it.",
    },
    toolbar: {
        description:
            "Tap the toolbar to expand it and see more options. Save your changes when done.",
    },
};
