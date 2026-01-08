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
import { linkEditingTour } from "./link-editing";
import { templatesTour } from "./templates";
import { modeToggleTour } from "./mode-toggle";
import { seoTour } from "./seo";
import { accessibilityTour } from "./accessibility";
import { attributesTour } from "./attributes";

/**
 * All available tours in display order
 */
const tourList: TourDefinition[] = [
    welcomeTour,
    textEditingTour,
    imageEditingTour,
    linkEditingTour,
    templatesTour,
    modeToggleTour,
    seoTour,
    accessibilityTour,
    attributesTour,
];

/**
 * Tours indexed by ID for lookup
 */
export const tours: Record<string, TourDefinition> = Object.fromEntries(
    tourList.map((tour) => [tour.id, tour])
);

export type TourId = (typeof tourList)[number]["id"];

/**
 * Get all tour definitions in display order (for help panel)
 */
export function getTourDefinitions(): TourDefinition[] {
    return tourList;
}
