/**
 * Apply saved content to an editable element.
 *
 * Shared by the loader (what visitors see) and the editor's ContentManager,
 * so an element shows the same thing in both by construction.
 */

import { applyAttributesToElement } from "./types.js";
import type { EditableType, ElementAttributes } from "./types.js";

export interface ApplyContentOptions {
    /**
     * Set an element's HTML. The editor passes a Tiptap-aware setter;
     * defaults to innerHTML.
     */
    setHTML?: (element: HTMLElement, html: string) => void;
    /**
     * Swap an <img> for a fresh copy with the new src instead of changing
     * src in place, so the original image doesn't flash before the new one
     * loads. The loader uses this; the editor can't, since it holds
     * references to the element.
     */
    replaceImage?: boolean;
}

/**
 * Set text content with \n converted to <br> elements.
 * Uses DOM APIs (createTextNode + createElement) to avoid XSS from innerHTML.
 */
export function setTextWithBreaks(element: HTMLElement, text: string): void {
    element.textContent = "";
    const parts = text.split("\n");
    for (let i = 0; i < parts.length; i++) {
        if (i > 0) element.appendChild(document.createElement("br"));
        if (parts[i]) element.appendChild(document.createTextNode(parts[i]));
    }
}

/**
 * Read the saved attributes from a content string, or null if it has none.
 */
export function parseContentAttributes(content: string): ElementAttributes | null {
    try {
        const data = JSON.parse(content) as { attributes?: ElementAttributes };
        if (data.attributes && Object.keys(data.attributes).length > 0) {
            return data.attributes;
        }
    } catch {
        // Not JSON - no attributes
    }
    return null;
}

function setImageSrc(img: HTMLImageElement, src: string, replace: boolean): HTMLElement {
    if (!replace) {
        img.src = src;
        return img;
    }
    const newImg = document.createElement("img");
    for (let i = 0; i < img.attributes.length; i++) {
        const attr = img.attributes[i];
        newImg.setAttribute(attr.name, attr.value);
    }
    newImg.src = src;
    img.replaceWith(newImg);
    return newImg;
}

/**
 * Apply a saved content string to an element, attributes included.
 * Content with a `type` field is applied by that type; content without one
 * is applied by the element's declared type.
 * Returns the element, which is a new element if an image was replaced.
 */
export function applyContentToElement(
    element: HTMLElement,
    type: EditableType,
    content: string,
    options: ApplyContentOptions = {},
): HTMLElement {
    const setHTML =
        options.setHTML ??
        ((el: HTMLElement, html: string) => {
            el.innerHTML = html;
        });
    const replaceImage = options.replaceImage ?? false;

    try {
        const data = JSON.parse(content) as {
            type?: string;
            value?: string;
            src?: string;
            href?: string;
            target?: string;
            attributes?: ElementAttributes;
        };

        // Before the content, so an image replacement copies them and the
        // content's own href/src wins over a same-named attribute
        if (data.attributes) {
            applyAttributesToElement(element, data.attributes);
        }

        if (data.type) {
            if (data.type === "text") {
                setTextWithBreaks(element, data.value as string);
            } else if (data.type === "html") {
                setHTML(element, data.value as string);
            } else if (data.type === "image" && element instanceof HTMLImageElement) {
                return setImageSrc(element, data.src as string, replaceImage);
            } else if (data.type === "link" && element instanceof HTMLAnchorElement) {
                element.href = data.href as string;
                element.target = data.target as string;
                setHTML(element, data.value as string);
            } else if (data.type === "href" && element instanceof HTMLAnchorElement) {
                element.href = data.href as string;
                element.target = data.target as string;
            }
            // Unknown type with type field - don't process
            return element;
        }

        // No type field in JSON - use element's declared type
        if (type === "link" && element instanceof HTMLAnchorElement) {
            if (data.href !== undefined) {
                element.href = data.href;
                element.target = data.target || "";
                setHTML(element, data.value || "");
            }
        } else if (type === "href" && element instanceof HTMLAnchorElement) {
            if (data.href !== undefined) {
                element.href = data.href;
                element.target = data.target || "";
            }
        } else if (type === "image" && element instanceof HTMLImageElement) {
            if (data.src !== undefined) {
                return setImageSrc(element, data.src, replaceImage);
            }
        } else if (type === "text") {
            if (data.value !== undefined) {
                setTextWithBreaks(element, data.value);
            }
        } else if (type === "html") {
            if (data.value !== undefined) {
                setHTML(element, data.value);
            }
        }
        return element;
    } catch {
        // Not JSON or malformed - ignore, content should always be valid JSON
        return element;
    }
}
