/**
 * Desktop-specific overrides for common steps
 */

export interface StepOverrides {
    title?: string;
    description?: string;
    side?: "top" | "bottom" | "left" | "right";
}

export const desktopOverrides: Record<string, StepOverrides> = {
    selectElement: {
        // Desktop uses defaults
    },
    toolbar: {
        description:
            "The toolbar shows actions for the selected element. Save your changes here when done.",
    },
};
