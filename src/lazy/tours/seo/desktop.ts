/**
 * SEO Tour - Desktop-specific steps
 */

import type { TourStep, TourContext } from "../types";

/**
 * Detailed explanation of field relevance (desktop only - too verbose for mobile)
 */
export function fieldRelevanceStep(_ctx: TourContext): TourStep {
    return {
        element: () => document.querySelector("scms-seo-modal") as HTMLElement,
        popover: {
            title: "Field Relevance",
            description:
                "Fields are organized by relevance:<br><br>" +
                "<strong>Primary</strong> - Most important for this element type.<br><br>" +
                "<strong>Secondary</strong> - Available but less common.<br><br>" +
                'Toggle "Show all fields" to see everything.',
            side: "left",
            align: "center",
        },
    };
}

/**
 * Get desktop-specific steps
 */
export function desktopSteps(ctx: TourContext): TourStep[] {
    return [fieldRelevanceStep(ctx)];
}
