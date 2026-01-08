/**
 * Accessibility Tour - Mobile-specific steps
 */

import type { TourStep, TourContext } from "../types";
import { observeAttributeAdded, observeAttributeValue, observeElementAppears } from "../common";
import { queryShadowSelector } from "../common/shadow-dom";

/**
 * Expand the toolbar
 * Auto-advances when toolbar is expanded (or immediately if already expanded)
 */
export function expandToolbarStepMobile(ctx: TourContext): TourStep {
    return {
        element: "scms-toolbar",
        popover: {
            title: "Expand the Toolbar",
            description: "Tap the toolbar to expand it.",
            side: "top",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            const toolbar = document.querySelector("scms-toolbar");
            if (!toolbar) return;

            // Auto-advance if already expanded
            if ((toolbar as any).expanded) {
                setTimeout(() => ctx.moveNext(), 200);
                return;
            }

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
 * Open the Metadata section
 * Auto-advances when section is expanded (or immediately if already open)
 */
export function openMetadataSectionStepMobile(ctx: TourContext): TourStep {
    return {
        element: () => queryShadowSelector("scms-toolbar >>> .mobile-section[data-section='metadata']"),
        popover: {
            title: "Metadata Options",
            description: "The Metadata section contains SEO and accessibility settings.",
            side: "top",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            const section = queryShadowSelector("scms-toolbar >>> .mobile-section[data-section='metadata']");
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
 * Tap Accessibility button
 * Auto-advances when accessibility modal opens
 */
export function tapAccessibilityStepMobile(ctx: TourContext): TourStep {
    return {
        element: () => queryShadowSelector("scms-toolbar >>> button[data-action='accessibility']"),
        popover: {
            title: "Open Accessibility Settings",
            description: 'Tap "Accessibility" to configure screen reader attributes.',
            side: "top",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            const observer = observeElementAppears("scms-accessibility-modal", {
                onMatch: () => {
                    ctx.untrackObserver(observer);
                    setTimeout(() => ctx.moveNext(), 200);
                },
            });
            ctx.trackObserver(observer);
        },
    };
}
