/**
 * Shared type icon rendering utility
 *
 * Returns SVG icons for editable element types: text, html, image, link.
 * Used by element-badge and content-viewer-badge components.
 */

import { html, type TemplateResult } from "lit";

export function renderTypeIcon(
    elementType: string | null,
    iconClass = "w-3.5 h-3.5 text-gray-500 shrink-0",
    iconClassAdjusted = "w-3.5 h-3.5 text-gray-500 shrink-0 -translate-y-px",
): TemplateResult | null {
    switch (elementType) {
        case "text":
            return html`
                <svg
                    class=${iconClassAdjusted}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M4 4h16M12 4v16"
                    />
                </svg>
            `;
        case "html":
            return html`
                <svg
                    class=${iconClassAdjusted}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                    />
                </svg>
            `;
        case "image":
            return html`
                <svg class=${iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                </svg>
            `;
        case "link":
            return html`
                <svg
                    class=${iconClassAdjusted}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                    />
                </svg>
            `;
        default:
            return null;
    }
}
