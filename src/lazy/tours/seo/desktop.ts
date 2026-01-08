/**
 * SEO Tour - Desktop-specific steps
 */

import type { TourStep, TourContext } from "../types";
import { observeElementAppears, observeAttributeAdded } from "../common";
import { getToolbarDropdown, getOpenDropdownMenu } from "../common/desktop";

/**
 * Click the More dropdown
 * Highlights the toolbar, waits for More dropdown to open
 */
export function clickMoreStep(ctx: TourContext): TourStep {
    return {
        element: "scms-toolbar",
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
 * Highlights the dropdown menu (found in toolbar's shadow DOM)
 */
export function clickSeoInMenuStep(ctx: TourContext): TourStep {
    return {
        element: () => getOpenDropdownMenu("More"),
        popover: {
            title: "Open SEO Settings",
            description: 'Click "SEO" in the dropdown menu.',
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
