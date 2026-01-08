/**
 * SEO Tour - Mobile-specific steps
 */

import type { TourStep, TourContext } from "../types";
import { observeAttributeAdded, observeElementAppears } from "../common";

/**
 * Mobile step 2a: Expand the toolbar
 * Auto-advances when toolbar is expanded (or immediately if already expanded)
 */
export function expandToolbarStepMobile(ctx: TourContext): TourStep {
    return {
        element: "scms-toolbar",
        popover: {
            title: "Expand the Toolbar",
            description: "Tap the toolbar to expand it.",
            side: "left",
            align: "end",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            const toolbar = document.querySelector("scms-toolbar");
            if (!toolbar) return;

            const observer = observeAttributeAdded(toolbar, "expanded", {
                onMatch: () => {
                    ctx.untrackObserver(observer);
                    setTimeout(() => ctx.moveNext(), 200);
                },
            });
            ctx.trackObserver(observer);
        },
    };
}

/**
 * Mobile step 2b: Tap SEO in the Metadata section
 * Auto-advances when SEO modal opens
 */
export function tapSeoStepMobile(ctx: TourContext): TourStep {
    return {
        element: "scms-toolbar",
        popover: {
            title: "Open SEO Settings",
            description: 'Now tap "SEO" in the Metadata section.',
            side: "left",
            align: "end",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            const observer = observeElementAppears("scms-seo-modal", {
                onMatch: () => {
                    ctx.untrackObserver(observer);
                    setTimeout(() => ctx.moveNext(), 200);
                },
            });
            ctx.trackObserver(observer);
        },
    };
}

/**
 * Get mobile-specific steps
 * Mobile skips the detailed field relevance explanation
 */
export function mobileSteps(_ctx: TourContext): TourStep[] {
    // No mobile-specific steps - we skip the verbose field relevance step
    return [];
}
