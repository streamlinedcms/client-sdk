/**
 * Welcome Tour - Desktop-specific steps
 */

import type { TourStep, TourContext } from "../types";

/**
 * Get desktop-specific steps
 * Desktop welcome tour uses shared steps with no additions
 */
export function desktopSteps(_ctx: TourContext): TourStep[] {
    return [];
}
