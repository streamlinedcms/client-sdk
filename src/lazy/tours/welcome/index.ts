/**
 * Welcome Tour - First-time onboarding tour
 */

import type { TourDefinition, TourStep, TourContext } from "../types";
import { toolbarStep } from "../common";
import { desktopSteps } from "./desktop";
import { mobileSteps } from "./mobile";

/**
 * Step for editable text elements
 */
function textElementStep(ctx: TourContext): TourStep | null {
    const element = ctx.findVisibleElement("[data-scms-text]");
    if (!element) return null;

    return {
        element,
        popover: {
            title: "Editable Content",
            description: ctx.isMobile
                ? "Elements with a blue outline are editable. Tap to start editing."
                : "Elements with a blue outline are editable. Click on them to start editing.",
            side: "bottom",
            align: "start",
        },
    };
}

/**
 * Step for editable image elements
 */
function imageElementStep(ctx: TourContext): TourStep | null {
    const element = ctx.findVisibleElement("[data-scms-image]");
    if (!element) return null;

    return {
        element,
        popover: {
            title: "Editable Images",
            description: ctx.isMobile
                ? "Tap an image to select it, then use the toolbar to change it. Double-tap to open the media library."
                : "Click an image to select it, then use the toolbar to change it. Double-click to open the media library.",
            side: "bottom",
            align: "center",
        },
    };
}

/**
 * Step for editable link elements
 */
function linkElementStep(ctx: TourContext): TourStep | null {
    const element = ctx.findVisibleElement("[data-scms-link]");
    if (!element) return null;

    return {
        element,
        popover: {
            title: "Editable Links",
            description: ctx.isMobile
                ? "Tap a link to select it, then use 'Edit Link' in the toolbar to change the URL or text."
                : "Click a link to select it, then use 'Edit Link' in the toolbar to change the URL or text.",
            side: "bottom",
            align: "start",
        },
    };
}

export const welcomeTour: TourDefinition = {
    id: "welcome",
    label: "How do I get started?",
    description: "Learn the basics of editing",

    getSteps: (ctx: TourContext) => {
        const platformSteps = ctx.isMobile ? mobileSteps(ctx) : desktopSteps(ctx);

        return [
            // Show available editable elements
            textElementStep(ctx),
            imageElementStep(ctx),
            linkElementStep(ctx),

            // Platform-specific steps
            ...platformSteps,

            // The toolbar
            toolbarStep(ctx),
        ];
    },
};
