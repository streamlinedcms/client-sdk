/**
 * Content fetching and DOM population
 * Part of critical path - no external dependencies
 */

import type { ViewerConfig } from "./config.js";

export interface ContentElement {
    elementId: string;
    content: string;
}

/**
 * Scan DOM for editable elements
 */
export function scanEditableElements(): Map<string, HTMLElement> {
    const elements = new Map<string, HTMLElement>();
    document.querySelectorAll<HTMLElement>("[data-editable]").forEach((element) => {
        const elementId = element.getAttribute("data-editable");
        if (elementId) {
            elements.set(elementId, element);
        }
    });
    return elements;
}

/**
 * Fetch content from API and populate DOM elements
 */
export async function fetchAndPopulateContent(
    config: ViewerConfig,
    elements: Map<string, HTMLElement>
): Promise<void> {
    if (elements.size === 0) {
        return;
    }

    try {
        const url = `${config.apiUrl}/apps/${config.appId}/content`;
        const response = await fetch(url);

        if (!response.ok) {
            if (response.status === 404) {
                // No content yet - that's fine
                return;
            }
            if (response.status === 403) {
                console.warn("[StreamlinedCMS] Domain not whitelisted for this app");
                return;
            }
            throw new Error(`Failed to load content: ${response.status}`);
        }

        const data = await response.json() as { elements: ContentElement[] };

        // Populate DOM elements with content
        data.elements.forEach((item) => {
            const element = elements.get(item.elementId);
            if (element) {
                element.innerHTML = item.content;
            }
        });
    } catch (error) {
        console.warn("[StreamlinedCMS] Could not load content:", error);
        // Don't throw - allow page to render with default content
    }
}

/**
 * Remove FOUC hiding styles
 */
export function removeHidingStyles(): void {
    const style = document.getElementById("streamlined-cms-hiding");
    if (style) {
        style.remove();
    }
}
