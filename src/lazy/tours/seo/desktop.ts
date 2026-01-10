/**
 * SEO Tour - Desktop-specific steps
 */

import type { TourStep, TourContext } from "../types";
import { observeElementAppears, observeAttributeAdded } from "../common";
import { queryShadowSelector } from "../common/shadow-dom";
import { getToolbarDropdown } from "../common/desktop";

/**
 * Click the More dropdown
 * Highlights the toolbar, waits for More dropdown to open
 */
export function clickMoreStep(ctx: TourContext): TourStep {
    return {
        element: () => getToolbarDropdown("More"),
        popover: {
            title: "Open the More Menu",
            description: 'Click "More" to see additional options.',
            side: "top",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            const dropdown = getToolbarDropdown("More");
            if (!dropdown) return;

            // Check if already open
            if (dropdown.hasAttribute("open")) {
                setTimeout(() => ctx.moveNext(), 100);
                return;
            }

            const observer = observeAttributeAdded(dropdown, "open", {
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
 * Click SEO in the open dropdown
 * Highlights the SEO button in the dropdown menu
 */
export function clickSeoInMenuStep(ctx: TourContext): TourStep {
    return {
        element: () => queryShadowSelector("scms-toolbar >>> button[data-action='seo']"),
        popover: {
            title: "Open SEO Settings",
            description: 'Click "SEO" to configure search engine optimization.',
            side: "left",
            align: "start",
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
 * Get desktop-specific steps
 */
export function desktopSteps(_ctx: TourContext): TourStep[] {
    return [];
}
