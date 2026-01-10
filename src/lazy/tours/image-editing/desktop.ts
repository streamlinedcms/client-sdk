/**
 * Image Editing Tour - Desktop-specific steps
 */

import type { TourStep, TourContext } from "../types";
import {
    observeClassAddedOnSelector,
    observeAttributeAdded,
    observeAttributeRemoved,
    repositionPopoverTop,
    getSaveButtonOrToolbar,
} from "../common";
import { queryShadowSelector } from "../common/shadow-dom";

/**
 * Step prompting user to click an image
 * Auto-advances when element enters editing mode
 */
export function selectImageStepDesktop(ctx: TourContext): TourStep | null {
    const element = ctx.findVisibleElement("[data-scms-image]");
    if (!element) return null;

    return {
        element,
        popover: {
            title: "Select an Image",
            description: "Click on this image to select it.",
            side: "bottom",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            const observer = observeClassAddedOnSelector(
                "[data-scms-image]",
                ["streamlined-editing"],
                {
                    onMatch: () => {
                        ctx.untrackObserver(observer);
                        // Delay to let toolbar re-render with image-specific buttons
                        setTimeout(() => ctx.moveNext(), 300);
                    },
                },
            );
            ctx.trackObserver(observer);
        },
    };
}

/**
 * Step highlighting the Change Image button
 * Auto-advances when media manager modal appears
 */
export function changeImageStepDesktop(ctx: TourContext): TourStep {
    return {
        element: () => queryShadowSelector("scms-toolbar >>> button[data-action='change-image']"),
        popover: {
            title: "Change the Image",
            description: 'Click "Change Image" to open the media library.',
            side: "top",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            const modal = document.querySelector("scms-media-manager-modal");
            if (!modal) return;

            // Auto-advance if already open
            if (modal.hasAttribute("open")) {
                ctx.moveNext();
                return;
            }

            const observer = observeAttributeAdded(modal, "open", {
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
 * Step explaining the media manager
 * Auto-advances when modal is closed
 */
export function mediaManagerStepDesktop(ctx: TourContext): TourStep {
    return {
        element: "scms-media-manager-modal",
        popover: {
            title: "Media Library",
            description: 'Select an image and click "Insert" to replace the current image.',
            side: "top",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            repositionPopoverTop();

            const modal = document.querySelector("scms-media-manager-modal");
            if (!modal) return;

            const observer = observeAttributeRemoved(modal, "open", {
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
 * Step mentioning the double-click shortcut
 */
export function shortcutStepDesktop(ctx: TourContext): TourStep {
    return {
        element: () => ctx.findVisibleElement(".streamlined-editing[data-scms-image]"),
        popover: {
            title: "Quick Tip",
            description: "You can double-click any image to open the media library directly.",
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
