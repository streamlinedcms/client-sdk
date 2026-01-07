/**
 * Tour Registry - All tour definitions
 *
 * This file is dynamically imported when tours are needed,
 * keeping the main bundle smaller.
 */

import type { TourDefinition } from "./types";
import { welcomeTour } from "./welcome";
import { textEditingTour } from "./text-editing";
import { imageEditingTour } from "./image-editing";
import { templatesTour } from "./templates";
import { seoTour } from "./seo";

/**
 * All available tours
 */
export const tours = {
    welcome: welcomeTour,
    "text-editing": textEditingTour,
    "image-editing": imageEditingTour,
    templates: templatesTour,
    seo: seoTour,
} as const;

export type TourId = keyof typeof tours;

/**
 * Get all tour definitions (for help panel)
 */
export function getTourDefinitions(): TourDefinition[] {
    return Object.values(tours);
}
