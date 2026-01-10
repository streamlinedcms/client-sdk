/**
 * SEO Tour - Mobile-specific steps
 */

import type { TourStep, TourContext } from "../types";
import { observeAttributeAdded, observeAttributeValue, observeElementAppears } from "../common";
import { queryShadowSelector } from "../common/shadow-dom";

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
            align: "center",
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
 * Mobile step 2b: Open the Metadata section
 * Auto-advances when section is expanded (or immediately if already open)
 */
export function openMetadataSectionStepMobile(ctx: TourContext): TourStep {
    return {
        element: () =>
            queryShadowSelector("scms-toolbar >>> .mobile-section[data-section='metadata']"),
        popover: {
            title: "Metadata Options",
            description: "The Metadata section contains SEO and accessibility settings.",
            side: "top",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            const section = queryShadowSelector(
                "scms-toolbar >>> .mobile-section[data-section='metadata']",
            );
            const headerButton = section?.querySelector("button[aria-expanded]");
            if (!headerButton) return;

            const observer = observeAttributeValue(headerButton, "aria-expanded", "true", {
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
 * Mobile step 2c: Tap SEO button
 * Auto-advances when SEO modal opens
 */
export function tapSeoStepMobile(ctx: TourContext): TourStep {
    return {
        element: () => queryShadowSelector("scms-toolbar >>> button[data-action='seo']"),
        popover: {
            title: "Open SEO Settings",
            description: 'Tap "SEO" to configure search engine optimization.',
            side: "top",
            align: "center",
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
