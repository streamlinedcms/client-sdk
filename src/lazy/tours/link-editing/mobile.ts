/**
 * Link Editing Tour - Mobile-specific steps
 */

import type { TourStep, TourContext } from "../types";
import {
    observeClassAddedOnSelector,
    observeAttributeAdded,
    observeAttributeValue,
    observeElementAppears,
    observeElementRemoved,
    repositionPopoverTop,
    getSaveButtonOrToolbar,
} from "../common";
import { queryShadowSelector } from "../common/shadow-dom";

/**
 * Step prompting user to tap a link
 * Auto-advances when element enters editing mode
 */
export function selectLinkStepMobile(ctx: TourContext): TourStep | null {
    const element = ctx.findVisibleElement("[data-scms-link]");
    if (!element) return null;

    return {
        element,
        popover: {
            title: "Select a Link",
            description: "Tap on this link to select it.",
            side: "bottom",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            const observer = observeClassAddedOnSelector(
                "[data-scms-link]",
                ["streamlined-editing"],
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
 * Step prompting user to open the Element section
 * Auto-advances if already open or when opened
 */
export function openElementSectionStepMobile(ctx: TourContext): TourStep {
    return {
        element: () =>
            queryShadowSelector("scms-toolbar >>> .mobile-section[data-section='element']"),
        popover: {
            title: "Element Options",
            description: "The Element section shows actions for the selected link.",
            side: "top",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            // Check if section is already expanded (header button has aria-expanded="true")
            const section = queryShadowSelector(
                "scms-toolbar >>> .mobile-section[data-section='element']",
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
 * Step highlighting the Edit Link button
 * Auto-advances when link editor modal appears
 */
export function editLinkStepMobile(ctx: TourContext): TourStep {
    return {
        element: () => queryShadowSelector("scms-toolbar >>> button[data-action='edit-link']"),
        popover: {
            title: "Edit the Link",
            description: 'Tap "Edit Link" to open the link editor.',
            side: "top",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            const observer = observeElementAppears("scms-link-editor-modal", {
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
 * Step explaining the link editor
 * Auto-advances when modal is closed
 */
export function linkEditorStepMobile(ctx: TourContext): TourStep {
    return {
        element: "scms-link-editor-modal",
        popover: {
            title: "Link Editor",
            description:
                'Edit the URL, choose whether to open in a new tab, and modify the link content. Tap "Apply" when done.',
            side: "top",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            repositionPopoverTop();

            const observer = observeElementRemoved("scms-link-editor-modal", {
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
 * Step mentioning double-tap behavior
 */
export function goToLinkTipMobile(ctx: TourContext): TourStep {
    return {
        element: () => ctx.findVisibleElement(".streamlined-editing[data-scms-link]"),
        popover: {
            title: "Quick Tip",
            description: "You can double-tap any link to go to its destination.",
            side: "bottom",
            align: "center",
            showButtons: ["next", "close"],
        },
    };
}

/**
 * Step pointing to Save button
 */
export function saveStepMobile(): TourStep {
    return {
        element: () => getSaveButtonOrToolbar(),
        popover: {
            title: "Save Your Changes",
            description: 'Tap "Save" to publish your changes.',
            side: "top",
            align: "center",
        },
        onHighlighted: () => {
            // Trigger scroll event to force Driver.js to recalculate popover position
            window.dispatchEvent(new Event("scroll"));
        },
    };
}
