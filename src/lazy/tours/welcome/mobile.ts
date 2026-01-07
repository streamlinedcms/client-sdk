/**
 * Welcome Tour - Mobile-specific steps
 */

import type { TourStep, TourContext } from "../types";

/**
 * Get mobile-specific steps
 * Mobile welcome tour uses shared steps with no additions
 */
export function mobileSteps(_ctx: TourContext): TourStep[] {
    return [];
}
