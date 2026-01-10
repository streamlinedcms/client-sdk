/**
 * Custom Attributes Tour - Mobile-specific steps
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
        element: () =>
            queryShadowSelector("scms-toolbar >>> .mobile-section[data-section='metadata']"),
        popover: {
            title: "Metadata Options",
            description: "The Metadata section contains SEO, accessibility, and custom attributes.",
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
 * Tap Attributes button
 * Auto-advances when attributes modal opens
 */
export function tapAttributesStepMobile(ctx: TourContext): TourStep {
    return {
        element: () => queryShadowSelector("scms-toolbar >>> button[data-action='attributes']"),
        popover: {
            title: "Open Attributes",
            description: 'Tap "Attributes" to view and add custom data attributes.',
            side: "top",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            const observer = observeElementAppears("scms-attributes-modal", {
                onMatch: () => {
                    ctx.untrackObserver(observer);
                    setTimeout(() => ctx.moveNext(), 200);
                },
            });
            ctx.trackObserver(observer);
        },
    };
}
