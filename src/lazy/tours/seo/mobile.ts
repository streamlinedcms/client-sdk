/**
 * SEO Tour - Mobile-specific steps
 */

import type { TourStep, TourContext } from "../types";

/**
 * Get mobile-specific steps
 * Mobile skips the detailed field relevance explanation
 */
export function mobileSteps(_ctx: TourContext): TourStep[] {
    // No mobile-specific steps - we skip the verbose field relevance step
    return [];
}
