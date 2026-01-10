/**
 * Link Editing Tour - Desktop-specific steps
 */

import type { TourStep, TourContext } from "../types";
import {
    observeClassAddedOnSelector,
    observeElementAppears,
    observeElementRemoved,
    repositionPopoverTop,
    getSaveButtonOrToolbar,
} from "../common";
import { queryShadowSelector } from "../common/shadow-dom";

/**
 * Step prompting user to click a link
 * Auto-advances when element enters editing mode
 */
export function selectLinkStepDesktop(ctx: TourContext): TourStep | null {
    const element = ctx.findVisibleElement("[data-scms-link]");
    if (!element) return null;

    return {
        element,
        popover: {
            title: "Select a Link",
            description: "Click on this link to select it.",
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
                        // Delay to let toolbar re-render with link-specific buttons
                        setTimeout(() => ctx.moveNext(), 300);
                    },
                },
            );
            ctx.trackObserver(observer);
        },
    };
}

/**
 * Step highlighting the Edit Link button
 * Auto-advances when link editor modal appears
 */
export function editLinkStepDesktop(ctx: TourContext): TourStep {
    return {
        element: () => queryShadowSelector("scms-toolbar >>> button[data-action='edit-link']"),
        popover: {
            title: "Edit the Link",
            description: 'Click "Edit Link" to open the link editor.',
            side: "top",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            const observer = observeElementAppears("scms-link-editor-modal", {
                onMatch: () => {
                    ctx.untrackObserver(observer);
                    ctx.moveNext();
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
export function linkEditorStepDesktop(ctx: TourContext): TourStep {
    return {
        element: "scms-link-editor-modal",
        popover: {
            title: "Link Editor",
            description:
                'Edit the URL, choose whether to open in a new tab, and modify the link content. Click "Apply" when done.',
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
 * Step mentioning double-click behavior
 */
export function goToLinkTipDesktop(ctx: TourContext): TourStep {
    return {
        element: () => ctx.findVisibleElement(".streamlined-editing[data-scms-link]"),
        popover: {
            title: "Quick Tip",
            description: "You can double-click any link to go to its destination.",
            side: "bottom",
            align: "center",
            showButtons: ["next", "close"],
        },
    };
}

/**
 * Step pointing to Save button
 */
export function saveStepDesktop(): TourStep {
    return {
        element: () => getSaveButtonOrToolbar(),
        popover: {
            title: "Save Your Changes",
            description: 'Click "Save" to publish your changes.',
            side: "top",
            align: "center",
        },
    };
}
