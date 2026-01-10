/**
 * Templates Tour - Mobile-specific steps
 */

import type { TourStep, TourContext } from "../types";
import {
    observeClassAddedOnSelector,
    observeAttributeAdded,
    observeAttributeValue,
} from "../common";
import { queryShadowSelector } from "../common/shadow-dom";

/**
 * Step prompting user to select a template instance
 * Auto-advances when instance is selected
 */
export function selectInstanceStepMobile(ctx: TourContext): TourStep {
    return {
        element: () => ctx.findVisibleElement("[data-scms-instance]"),
        popover: {
            title: "Select an Item",
            description: "Tap on any item in this section to select it.",
            side: "bottom",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            const observer = observeClassAddedOnSelector(
                "[data-scms-instance]",
                ["scms-instance-selected"],
                {
                    onMatch: () => {
                        ctx.untrackObserver(observer);
                        setTimeout(() => ctx.moveNext(), 200);
                    },
                },
            );
            ctx.trackObserver(observer);
        },
    };
}

/**
 * Step prompting user to expand the toolbar
 * Auto-advances when toolbar is expanded
 */
export function expandToolbarStepMobile(ctx: TourContext): TourStep {
    return {
        element: "scms-toolbar",
        popover: {
            title: "Expand the Toolbar",
            description: "Tap the toolbar to expand it and see all options.",
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
 * Step prompting user to open the Template section
 * Auto-advances if already open or when opened
 */
export function openTemplateSectionStepMobile(ctx: TourContext): TourStep {
    return {
        element: () =>
            queryShadowSelector("scms-toolbar >>> .mobile-section[data-section='template']"),
        popover: {
            title: "Template Options",
            description: "The Template section shows actions for managing items.",
            side: "top",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            const section = queryShadowSelector(
                "scms-toolbar >>> .mobile-section[data-section='template']",
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
 * Step explaining the template actions
 */
export function templateActionsStepMobile(ctx: TourContext): TourStep {
    return {
        element: () => queryShadowSelector("scms-toolbar >>> button[data-action='add-item']"),
        popover: {
            title: "Manage Items",
            description:
                "Use these buttons to add new items, delete the selected item, or reorder items in the list.",
            side: "top",
            align: "center",
            showButtons: ["next", "close"],
        },
        onHighlighted: () => {
            const addButton = queryShadowSelector(
                "scms-toolbar >>> button[data-action='add-item']",
            );
            if (!addButton) return;

            const handleClick = () => {
                addButton.removeEventListener("click", handleClick);
                ctx.moveNext();
            };
            addButton.addEventListener("click", handleClick);
        },
    };
}
