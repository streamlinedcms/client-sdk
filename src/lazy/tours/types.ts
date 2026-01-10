/**
 * Tour type definitions
 *
 * FILE ORGANIZATION FOR TOURS:
 * Each tour has its own folder with three files:
 *   - index.ts: Main tour definition with shared steps and getSteps() that assembles the tour
 *   - desktop.ts: Desktop-specific steps (e.g., steps that reference dropdowns, hover interactions)
 *   - mobile.ts: Mobile-specific steps (e.g., steps that reference expanded toolbar drawer)
 *
 * GUIDELINES:
 * - Put shared steps (same on both platforms) in index.ts
 * - Put platform-specific steps in desktop.ts or mobile.ts, then import/use in index.ts
 * - Use ctx.isMobile to conditionally include different steps in getSteps()
 * - For text differences only (e.g., "click" vs "tap"), use ternary in the step itself
 * - For structural differences (different element targets, different observers), use separate step functions
 *
 * AUTO-ADVANCE PATTERN:
 * Use onHighlighted + MutationObserver to auto-advance when user completes an action:
 * - observeClassAdded(): Watch for element to gain a class (e.g., "streamlined-editing")
 * - observeElementAppears(): Watch for element to appear in DOM (e.g., modal opens)
 * Always call ctx.trackObserver() and ctx.untrackObserver() for cleanup.
 */

/**
 * A tour step definition with platform-aware properties
 */
export interface TourStep {
    /** Element selector or function that returns element */
    element?: string | HTMLElement | (() => HTMLElement | null);

    /** Popover content */
    popover: {
        title: string;
        description: string;
        side?: "top" | "bottom" | "left" | "right";
        align?: "start" | "center" | "end";
        showButtons?: ("next" | "previous" | "close")[];
    };

    /** Callback when step is highlighted */
    onHighlighted?: () => void;
}

/**
 * A tour definition with metadata and step generator
 */
export interface TourDefinition {
    id: string;
    label: string;
    description: string;
    /** Function that returns steps for this tour */
    getSteps: (ctx: TourContext) => (TourStep | null)[];
}

/**
 * Context passed to step generators
 */
export interface TourContext {
    /** Whether the current viewport is mobile-sized */
    isMobile: boolean;

    /** Find the first visible element matching a selector */
    findVisibleElement: (selector: string) => HTMLElement | null;

    /** Track an observer for cleanup when tour stops */
    trackObserver: (observer: MutationObserver) => void;

    /** Remove an observer from tracking (when it completes normally) */
    untrackObserver: (observer: MutationObserver) => void;

    /** Advance to the next step */
    moveNext: () => void;

    /** Move to the previous step */
    movePrevious: () => void;
}

/**
 * Options for observing DOM changes
 */
export interface ObserverOptions {
    /** Called when condition is met */
    onMatch: () => void;
    /** Optional timeout in ms */
    timeout?: number;
    /** Called when timeout is reached */
    onTimeout?: () => void;
}
