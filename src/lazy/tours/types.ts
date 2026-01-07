/**
 * Tour type definitions
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
