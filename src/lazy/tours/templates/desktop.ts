/**
 * Templates Tour - Desktop-specific steps
 */

import type { TourStep, TourContext } from "../types";
import { observeClassAddedOnSelector, observeAttributeAdded } from "../common";
import { queryShadowSelector } from "../common/shadow-dom";
import { getToolbarDropdown } from "../common/desktop";

/**
 * Step prompting user to select a template instance
 * Auto-advances when instance is selected
 */
export function selectInstanceStepDesktop(ctx: TourContext): TourStep {
    return {
        element: () => ctx.findVisibleElement("[data-scms-instance]"),
        popover: {
            title: "Select an Item",
            description: "Click on any item in this section to select it.",
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
                        setTimeout(() => ctx.moveNext(), 300);
                    },
                },
            );
            ctx.trackObserver(observer);
        },
    };
}

/**
 * Step highlighting the Template dropdown
 * Auto-advances when dropdown is opened
 */
export function templateDropdownStepDesktop(ctx: TourContext): TourStep {
    return {
        element: () => getToolbarDropdown("Template"),
        popover: {
            title: "Template Menu",
            description: 'Click "Template" to see options for managing items.',
            side: "top",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            const dropdown = getToolbarDropdown("Template");
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
 * Step explaining the template actions
 */
export function templateActionsStepDesktop(ctx: TourContext): TourStep {
    return {
        element: () => queryShadowSelector("scms-toolbar >>> button[data-action='add-item']"),
        popover: {
            title: "Manage Items",
            description:
                "Use these buttons to add new items, delete the selected item, or reorder items in the list.",
            side: "left",
            align: "start",
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
