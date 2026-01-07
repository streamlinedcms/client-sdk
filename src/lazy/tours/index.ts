/**
 * Tour Manager - Manages guided tours using Driver.js
 *
 * Tour definitions are lazily loaded when first needed to reduce
 * initial bundle size.
 */

import { driver, type Driver, type DriveStep } from "driver.js";
import driverCss from "driver.js/dist/driver.css";
import type { TourDefinition, TourStep, TourContext } from "./types";

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
        `;

        const style = document.createElement("style");
        style.id = "driver-js-css";
        style.textContent = driverCss + customCss;
        document.head.appendChild(style);
        this.cssInjected = true;
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
        // Handle element type conversion - wrap functions that may return null
        let element: DriveStep["element"];
        if (typeof step.element === "function") {
            const elementFn = step.element;
            element = () => elementFn() as Element;
        } else {
            element = step.element;
        }

        return {
            element,
            popover: {
                title: step.popover.title,
                description: step.popover.description,
                side: step.popover.side,
                align: step.popover.align,
                showButtons: step.popover.showButtons,
            },
            onHighlighted: step.onHighlighted,
        };
    }

    /**
     * Start a specific tour by ID
     * Lazily loads tour definitions on first call.
     */
    async startTour(tourId: string): Promise<void> {
        const registry = await loadRegistry();
        const tourDef = registry.tours[tourId as keyof typeof registry.tours];

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
            overlayClickBehavior: "close",
            stagePadding: 8,
            stageRadius: 8,
            popoverOffset: 12,
            popoverClass: "scms-tour-popover",
            nextBtnText: "Next",
            prevBtnText: "Back",
            doneBtnText: "Done",
            progressText: "{{current}} of {{total}}",
            steps,
            onDestroyed: () => {
                this.driverInstance = null;
            },
        });

        this.driverInstance.drive();
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
}
