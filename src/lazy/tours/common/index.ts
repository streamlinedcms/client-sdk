/**
 * Common tour steps and utilities shared across tours
 */

import type { TourStep, TourContext, ObserverOptions } from "../types";
import { desktopOverrides } from "./desktop";
import { mobileOverrides } from "./mobile";

/**
 * Creates a MutationObserver that watches for an element matching a selector to appear
 */
export function observeElementAppears(selector: string, options: ObserverOptions): MutationObserver {
    const { onMatch, timeout, onTimeout } = options;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const observer = new MutationObserver(() => {
        if (document.querySelector(selector)) {
            observer.disconnect();
            if (timeoutId) clearTimeout(timeoutId);
            onMatch();
        }
    });

    // Check if already exists
    if (document.querySelector(selector)) {
        // Defer callback so caller can assign the returned observer first
        setTimeout(onMatch, 0);
        return observer;
    }

    observer.observe(document.body, { childList: true, subtree: true });

    if (timeout && onTimeout) {
        timeoutId = setTimeout(() => {
            observer.disconnect();
            onTimeout();
        }, timeout);
    }

    return observer;
}

/**
 * Creates a MutationObserver that watches for any element to gain one of the specified classes
 */
export function observeClassAdded(classNames: string[], options: ObserverOptions): MutationObserver {
    const { onMatch, timeout, onTimeout } = options;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === "attributes" && mutation.attributeName === "class") {
                const target = mutation.target as HTMLElement;
                const hasClass = classNames.some((c) => target.classList.contains(c));
                if (hasClass) {
                    observer.disconnect();
                    if (timeoutId) clearTimeout(timeoutId);
                    onMatch();
                    return;
                }
            }
        }
    });

    // Check if any element already has one of the classes
    const selector = classNames.map((c) => `.${c}`).join(", ");
    if (document.querySelector(selector)) {
        // Defer callback so caller can assign the returned observer first
        setTimeout(onMatch, 0);
        return observer;
    }

    observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
        subtree: true,
    });

    if (timeout && onTimeout) {
        timeoutId = setTimeout(() => {
            observer.disconnect();
            onTimeout();
        }, timeout);
    }

    return observer;
}

/**
 * Options for the select element step
 */
export interface SelectElementOptions {
    /** Prefer image elements over text elements */
    preferImage?: boolean;
    /** Custom title */
    title?: string;
    /** Custom description */
    description?: string;
}

/**
 * Creates a step that prompts the user to select an element and waits for selection
 */
export function selectElementStep(ctx: TourContext, options: SelectElementOptions = {}): TourStep | null {
    const { preferImage = false, title, description } = options;

    const element = preferImage
        ? ctx.findVisibleElement("[data-scms-image]") || ctx.findVisibleElement("[data-scms-text]")
        : ctx.findVisibleElement("[data-scms-text]") || ctx.findVisibleElement("[data-scms-image]");

    if (!element) return null;

    const overrides = ctx.isMobile ? mobileOverrides.selectElement : desktopOverrides.selectElement;

    return {
        element,
        popover: {
            title: title ?? overrides?.title ?? "Select an Element",
            description: description ?? overrides?.description ?? "Click on this element to select it.",
            side: overrides?.side ?? "bottom",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            // Watch for selection/editing class to be added to any element
            // Desktop: goes straight to .streamlined-editing
            // Mobile: first tap adds .streamlined-selected, second adds .streamlined-editing
            const observer = observeClassAdded(["streamlined-selected", "streamlined-editing"], {
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
 * Creates a step highlighting the toolbar
 */
export function toolbarStep(ctx: TourContext): TourStep {
    const overrides = ctx.isMobile ? mobileOverrides.toolbar : desktopOverrides.toolbar;

    return {
        element: "scms-toolbar",
        popover: {
            title: overrides?.title ?? "The Toolbar",
            description:
                overrides?.description ??
                "The toolbar shows actions for the selected element. Save your changes here when done.",
            side: "top",
            align: "center",
        },
    };
}

/**
 * Options for wait for modal step
 */
export interface WaitForModalOptions {
    /** Modal element selector */
    selector: string;
    /** Popover title */
    title: string;
    /** Popover description */
    description: string;
    /** Description for mobile (optional override) */
    mobileDescription?: string;
    /** Delay after modal appears before advancing (ms) */
    advanceDelay?: number;
}

/**
 * Creates a step that waits for a modal to appear before auto-advancing
 */
export function waitForModalStep(ctx: TourContext, options: WaitForModalOptions): TourStep {
    const { selector, title, description, mobileDescription, advanceDelay = 200 } = options;

    return {
        element: "scms-toolbar",
        popover: {
            title,
            description: ctx.isMobile && mobileDescription ? mobileDescription : description,
            side: "top",
            align: "center",
            showButtons: ["close"],
        },
        onHighlighted: () => {
            const observer = observeElementAppears(selector, {
                onMatch: () => {
                    ctx.untrackObserver(observer);
                    setTimeout(() => ctx.moveNext(), advanceDelay);
                },
            });
            ctx.trackObserver(observer);
        },
    };
}
