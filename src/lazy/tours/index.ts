/**
 * Tour Manager - Manages guided tours using Driver.js
 *
 * Tour definitions are lazily loaded when first needed to reduce
 * initial bundle size.
 */

import { driver, type Driver, type DriveStep } from "driver.js";
import driverCss from "driver.js/dist/driver.css";
import { GripHorizontal } from "lucide-static";
import type { TourDefinition, TourStep, TourContext } from "./types";
import * as shadowDomHelpers from "./common/shadow-dom";
import * as commonHelpers from "./common";

// Re-export types
export type { TourDefinition } from "./types";
export type { TourId } from "./registry";

// Cached registry module
let registryPromise: Promise<typeof import("./registry")> | null = null;

/**
 * Load the tour registry (lazy)
 */
async function loadRegistry() {
    if (!registryPromise) {
        registryPromise = import("./registry");
    }
    return registryPromise;
}

/**
 * Get all tour definitions (for help panel)
 * Lazily loads the tour registry on first call.
 */
export async function getTourDefinitions(): Promise<TourDefinition[]> {
    const registry = await loadRegistry();
    return registry.getTourDefinitions();
}

export class TourManager {
    private driverInstance: Driver | null = null;
    private cssInjected = false;
    private activeObservers: MutationObserver[] = [];

    /**
     * Inject Driver.js CSS into the document if not already done
     */
    private injectCss(): void {
        if (this.cssInjected) return;
        if (document.getElementById("driver-js-css")) return;

        // Custom overrides to prevent page CSS from bleeding into popover
        // z-index: toolbar=10000, modals=10001, tour overlay=10002, tour popover=10003
        const customCss = `
            .driver-overlay {
                z-index: 10002 !important;
            }
            .driver-popover.scms-tour-popover {
                box-sizing: border-box;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                line-height: 1.5;
                color: #2d2d2d;
                background: #fff;
                padding: 15px;
                border-radius: 8px;
                min-width: 250px;
                max-width: 320px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
                z-index: 10003 !important;
                position: fixed;
            }
            .driver-popover.scms-tour-popover * {
                font-family: inherit;
                color: inherit;
                background: transparent;
            }
            .driver-popover.scms-tour-popover .driver-popover-title {
                font-size: 16px;
                font-weight: 600;
                margin: 0 0 8px 0;
                padding: 0;
                color: #1a1a1a;
            }
            .driver-popover.scms-tour-popover .driver-popover-description {
                font-size: 14px;
                margin: 0;
                padding: 0;
                color: #4b5563;
            }
            .driver-popover.scms-tour-popover .driver-popover-footer {
                margin-top: 15px;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .driver-popover.scms-tour-popover .driver-popover-progress-text {
                font-size: 12px;
                color: #9ca3af;
            }
            .driver-popover.scms-tour-popover button {
                all: initial;
                font-family: inherit;
                font-size: 13px;
                padding: 6px 12px;
                border-radius: 4px;
                cursor: pointer;
                border: 1px solid #e5e7eb;
                background: #fff;
                color: #374151;
            }
            .driver-popover.scms-tour-popover button:hover {
                background: #f9fafb;
            }
            .driver-popover.scms-tour-popover .driver-popover-navigation-btns {
                display: flex;
                gap: 8px;
            }
            .driver-popover.scms-tour-popover .driver-popover-navigation-btns button:last-child {
                background: #3b82f6;
                border-color: #3b82f6;
                color: #fff;
            }
            .driver-popover.scms-tour-popover .driver-popover-navigation-btns button:last-child:hover {
                background: #2563eb;
            }
            .driver-popover.scms-tour-popover .driver-popover-close-btn {
                all: unset !important;
                box-sizing: border-box !important;
                position: absolute !important;
                top: 8px !important;
                right: 8px !important;
                width: 32px !important;
                height: 28px !important;
                cursor: pointer !important;
                font-size: 18px !important;
                color: #9ca3af !important;
                z-index: 1 !important;
                text-align: center !important;
                pointer-events: auto !important;
            }
            .driver-popover.scms-tour-popover .driver-popover-close-btn:hover {
                color: #4b5563 !important;
            }
            .driver-popover.scms-tour-popover .scms-drag-handle {
                display: flex;
                justify-content: center;
                padding: 2px 0 6px 0;
                cursor: grab;
                user-select: none;
                color: #d1d5db;
            }
            .driver-popover.scms-tour-popover .scms-drag-handle:hover {
                color: #9ca3af;
            }
            .driver-popover.scms-tour-popover .scms-drag-handle:active {
                cursor: grabbing;
            }
            .driver-popover.scms-tour-popover .scms-drag-handle svg {
                width: 20px;
                height: 20px;
            }
        `;

        const style = document.createElement("style");
        style.id = "driver-js-css";
        style.textContent = driverCss + customCss;
        document.head.appendChild(style);
        this.cssInjected = true;
    }

    /**
     * Inject pointer-events CSS into shadow roots to enable interaction
     * with highlighted elements inside shadow DOM.
     *
     * PROBLEM:
     * Driver.js adds the `.driver-active-element` class to highlighted elements
     * and uses global CSS to restore interactivity:
     *
     *   .driver-active .driver-active-element,
     *   .driver-active .driver-active-element * {
     *       pointer-events: auto;
     *   }
     *
     * However, global CSS cannot pierce shadow DOM boundaries, so elements
     * highlighted inside shadow DOM remain unclickable.
     *
     * WHY ANCESTOR INJECTION:
     * The `pointer-events` CSS property is inherited. Driver.js also sets
     * `.driver-active * { pointer-events: none }` on the document, which
     * applies to shadow host elements in the light DOM. Shadow DOM children
     * inherit this value, so even if we inject CSS into one shadow root,
     * an ancestor shadow host with `pointer-events: none` would still block
     * clicks from reaching the highlighted element.
     *
     * SOLUTION:
     * Walk up the entire ancestor chain and inject the CSS rule into every
     * shadow root we encounter. This ensures the highlighted element and all
     * its shadow DOM ancestors have `pointer-events: auto` applied.
     */
    private injectShadowDomStyles(element: Element): void {
        const styleId = "driver-shadow-fix";
        const css = `
            .driver-active-element,
            .driver-active-element * {
                pointer-events: auto !important;
            }
        `;

        // Walk up the tree and inject into all shadow roots
        let node: Node | null = element;
        while (node) {
            const root = node.getRootNode();
            if (root instanceof ShadowRoot && !root.getElementById(styleId)) {
                const style = document.createElement("style");
                style.id = styleId;
                style.textContent = css;
                root.appendChild(style);
            }
            // Move to the shadow host's parent to continue up the tree
            node = root instanceof ShadowRoot ? root.host : null;
        }
    }

    /**
     * Check if an element is visible (not hidden by CSS or in a hidden tab)
     */
    private isElementVisible(element: Element): boolean {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;

        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") return false;

        // Check if any parent has display:none (e.g., hidden tab)
        let parent = element.parentElement;
        while (parent) {
            const parentStyle = window.getComputedStyle(parent);
            if (parentStyle.display === "none") return false;
            parent = parent.parentElement;
        }

        return true;
    }

    /**
     * Find first visible element matching selector
     */
    private findVisibleElement(selector: string): HTMLElement | null {
        const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
        for (const el of elements) {
            if (this.isElementVisible(el)) {
                return el;
            }
        }
        return null;
    }

    /**
     * Track an observer for cleanup when tour stops
     */
    private trackObserver(observer: MutationObserver): void {
        this.activeObservers.push(observer);
    }

    /**
     * Remove an observer from tracking (when it completes normally)
     */
    private untrackObserver(observer: MutationObserver): void {
        const index = this.activeObservers.indexOf(observer);
        if (index !== -1) {
            this.activeObservers.splice(index, 1);
        }
    }

    /**
     * Create context object for tour step generators
     */
    private createContext(): TourContext {
        return {
            isMobile: window.innerWidth < 640,
            findVisibleElement: this.findVisibleElement.bind(this),
            trackObserver: this.trackObserver.bind(this),
            untrackObserver: this.untrackObserver.bind(this),
            moveNext: () => this.driverInstance?.moveNext(),
            movePrevious: () => this.driverInstance?.movePrevious(),
        };
    }

    /**
     * Convert TourStep to Driver.js DriveStep
     */
    private toDriverStep(step: TourStep): DriveStep {
        const driveStep: DriveStep = {
            popover: {
                title: step.popover.title,
                description: step.popover.description,
                side: step.popover.side,
                align: step.popover.align,
                showButtons: step.popover.showButtons,
            },
            onHighlighted: step.onHighlighted,
        };

        // Only include element if defined - omitting it entirely shows a centered popover without overlay
        if (step.element !== undefined) {
            if (typeof step.element === "function") {
                const elementFn = step.element;
                driveStep.element = () => elementFn() as Element;
            } else {
                driveStep.element = step.element;
            }
        }

        return driveStep;
    }

    /**
     * Start a specific tour by ID
     * Lazily loads tour definitions on first call.
     */
    async startTour(tourId: string): Promise<void> {
        const registry = await loadRegistry();
        const tourDef = registry.tours[tourId];

        if (!tourDef) {
            console.warn(`[TourManager] Unknown tour: ${tourId}`);
            return;
        }

        const ctx = this.createContext();
        const rawSteps = tourDef.getSteps(ctx);

        // Filter out null steps and convert to Driver.js format
        const steps = rawSteps
            .filter((step): step is TourStep => step !== null)
            .map((step) => this.toDriverStep(step));

        if (!steps.length) {
            console.warn(`[TourManager] No steps available for tour: ${tourId}`);
            return;
        }

        // Ensure CSS is loaded before starting tour
        this.injectCss();

        this.driverInstance = driver({
            showProgress: true,
            animate: true,
            smoothScroll: true,
            allowClose: true,
            stagePadding: 8,
            stageRadius: 8,
            popoverOffset: 12,
            popoverClass: "scms-tour-popover",
            nextBtnText: "Next",
            prevBtnText: "Back",
            doneBtnText: "Done",
            progressText: "{{current}} of {{total}}",
            steps,
            onHighlightStarted: (element) => {
                if (element) {
                    this.injectShadowDomStyles(element);
                }
            },
            onPopoverRender: (popover) => {
                // Prevent clicks inside popover from triggering document-level handlers (e.g., deselect)
                popover.wrapper.addEventListener("click", (e) => e.stopPropagation());

                // Inject drag handle at the top of the popover
                const handle = document.createElement("div");
                handle.className = "scms-drag-handle";
                handle.innerHTML = GripHorizontal;
                popover.wrapper.insertBefore(handle, popover.wrapper.firstChild);

                this.makePopoverDraggable(popover.wrapper, handle);
            },
            onDestroyed: () => {
                this.driverInstance = null;
            },
        });

        this.driverInstance.drive();

        // Prevent clicks on overlay from triggering document-level handlers (e.g., deselect)
        const overlay = document.querySelector("svg.driver-overlay");
        overlay?.addEventListener("click", (e) => e.stopPropagation());
    }

    /**
     * Stop any active tour
     */
    stopTour(): void {
        // Clean up any active observers
        for (const observer of this.activeObservers) {
            observer.disconnect();
        }
        this.activeObservers = [];

        if (this.driverInstance) {
            this.driverInstance.destroy();
            this.driverInstance = null;
        }
    }

    /**
     * Check if a tour is currently active
     */
    isActive(): boolean {
        return this.driverInstance?.isActive() ?? false;
    }

    /**
     * Debug helpers - exposed for console testing
     */
    helpers = {
        ...shadowDomHelpers,
        ...commonHelpers,
    };

    /**
     * Make a popover element draggable via a handle (works on both desktop and mobile)
     */
    private makePopoverDraggable(element: HTMLElement, handle: HTMLElement): void {
        let isDragging = false;
        let offsetX = 0;
        let offsetY = 0;

        const getEventCoords = (e: MouseEvent | TouchEvent) => {
            if ("touches" in e) {
                return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
            return { x: e.clientX, y: e.clientY };
        };

        const onStart = (e: MouseEvent | TouchEvent) => {
            isDragging = true;
            const coords = getEventCoords(e);
            const rect = element.getBoundingClientRect();

            // Calculate offset from cursor to element's top-left corner
            offsetX = coords.x - rect.left;
            offsetY = coords.y - rect.top;

            // Prevent default and stop propagation to avoid deselecting elements
            e.preventDefault();
            e.stopPropagation();
        };

        const onMove = (e: MouseEvent | TouchEvent) => {
            if (!isDragging) return;

            const coords = getEventCoords(e);
            const newLeft = coords.x - offsetX;
            const newTop = coords.y - offsetY;

            // Override all positioning - Driver.js may use various combinations
            element.style.setProperty("position", "fixed", "important");
            element.style.setProperty("left", `${newLeft}px`, "important");
            element.style.setProperty("top", `${newTop}px`, "important");
            element.style.setProperty("right", "auto", "important");
            element.style.setProperty("bottom", "auto", "important");
            element.style.setProperty("transform", "none", "important");

            e.preventDefault();
            e.stopPropagation();
        };

        const onEnd = (e: MouseEvent | TouchEvent) => {
            if (!isDragging) return;
            isDragging = false;
            e.stopPropagation();
        };

        // Mouse events - only handle initiates drag
        handle.addEventListener("mousedown", onStart);
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onEnd);

        // Touch events - only handle initiates drag
        handle.addEventListener("touchstart", onStart, { passive: false });
        document.addEventListener("touchmove", onMove, { passive: false });
        document.addEventListener("touchend", onEnd);
    }
}
