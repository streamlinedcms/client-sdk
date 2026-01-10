/**
 * Image Editing Tour - Mobile-specific steps
 */

import type { TourStep, TourContext } from "../types";
import {
    observeClassAddedOnSelector,
    observeAttributeAdded,
    observeAttributeRemoved,
    observeAttributeValue,
    repositionPopoverTop,
    getSaveButtonOrToolbar,
} from "../common";
import { queryShadowSelector } from "../common/shadow-dom";

/**
 * Step prompting user to tap an image
 * Auto-advances when element enters editing mode (images go straight to editing on mobile)
 */
export function selectImageStepMobile(ctx: TourContext): TourStep | null {
    const element = ctx.findVisibleElement("[data-scms-image]");
    if (!element) return null;

    return {
        element,
        popover: {
            title: "Select an Image",
            description: "Tap on this image to select it.",
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
            description: "The Element section shows actions for the selected image.",
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
 * Step highlighting the Change Image button
 * Auto-advances when media manager modal appears
 */
export function changeImageStepMobile(ctx: TourContext): TourStep {
    return {
        element: () => queryShadowSelector("scms-toolbar >>> button[data-action='change-image']"),
        popover: {
            title: "Change the Image",
            description: 'Tap "Change Image" to open the media library.',
            side: "top",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            const modal = document.querySelector("scms-media-manager-modal");
            if (!modal) return;

            // Auto-advance if already open
            if (modal.hasAttribute("open")) {
                setTimeout(() => ctx.moveNext(), 200);
                return;
            }

            const observer = observeAttributeAdded(modal, "open", {
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
 * Step explaining the media manager
 */
export function mediaManagerStepMobile(ctx: TourContext): TourStep {
    return {
        element: "scms-media-manager-modal",
        popover: {
            title: "Media Library",
            description: 'Select an image and tap "Insert" to replace the current image.',
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
 * Step mentioning the double-tap shortcut
 */
export function shortcutStepMobile(ctx: TourContext): TourStep {
    return {
        element: () => ctx.findVisibleElement(".streamlined-editing[data-scms-image]"),
        popover: {
            title: "Quick Tip",
            description: "You can double-tap any image to open the media library directly.",
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
