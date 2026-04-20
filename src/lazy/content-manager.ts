/**
 * ContentManager - Handles content state and synchronization
 *
 * Responsible for:
 * - Getting/setting content from elements
 * - Syncing content between state and DOM
 * - Tracking dirty (changed) elements
 */

import type { EditorState, EditableElementInfo } from "./state.js";
import type {
    ElementAttributes,
    ContentData,
    TextContentData,
    HtmlContentData,
    ImageContentData,
    LinkContentData,
    HrefContentData,
} from "../types.js";
import { applyAttributesToElement } from "../types.js";

function readTextWithBreaks(element: HTMLElement): string {
    const clone = document.createElement("div");
    clone.innerHTML = element.innerHTML;

    // Chrome's contenteditable wraps each Enter in a <div>.
    // A <div><br></div> is an empty line (the <br> is just a height placeholder).
    // A <div>text</div> is a line of content.
    // Handle these before standalone <br> tags.
    clone.querySelectorAll("div").forEach((div) => {
        const isEmptyDiv = div.childNodes.length === 1 && div.firstChild instanceof HTMLBRElement;
        // A <br> immediately before a content-bearing <div> is redundant —
        // Chrome inserts it to end the inline flow, but the block boundary
        // already creates the line break. However, before an empty
        // <div><br></div> (blank line), the <br> IS a real line break.
        const prev = div.previousSibling;
        if (prev instanceof HTMLBRElement && !isEmptyDiv) {
            prev.remove();
        }
        const newline = document.createTextNode("\n");
        div.before(newline);
        // Remove placeholder <br> inside otherwise-empty divs
        if (isEmptyDiv) {
            div.firstChild!.remove();
        }
        // Unwrap: move children out, remove the div shell
        while (div.firstChild) div.before(div.firstChild);
        div.remove();
    });

    // Handle standalone <br> tags (e.g. from our own writeTextWithBreaks or Shift+Enter)
    clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));

    // Normalize &nbsp; (U+00A0) to regular spaces — Chrome's contenteditable
    // inserts &nbsp; for leading/trailing spaces when splitting lines
    return (clone.textContent || "").replace(/\u00a0/g, " ");
}

/**
 * Whether an editable element has no visible content. Used to toggle the
 * "Click to edit" placeholder so an emptied element retains a clickable area.
 *
 * Treats as empty:
 * - Truly empty elements
 * - Stray <br> from contenteditable after the last character is deleted
 * - Tiptap's empty wrappers (<p></p>, <p><br></p>, <span><br></span>, etc.)
 * - Whitespace-only / nbsp-only text nodes
 *
 * Treats as non-empty:
 * - Any visible text (after trimming whitespace and nbsp)
 * - Any media-like child (img, video, svg, iframe, input, button, etc.)
 */
export function isVisuallyEmpty(element: HTMLElement): boolean {
    if (
        element.querySelector(
            "img, video, audio, canvas, svg, iframe, input, button, picture, object, embed",
        )
    ) {
        return false;
    }
    return (element.textContent || "").replace(/\u00a0/g, " ").trim() === "";
}

/**
 * Toggle the `streamlined-empty` class so the placeholder rule in styles.ts
 * matches when the element has no visible content.
 */
export function updateEmptyState(element: HTMLElement): void {
    // href elements manage their own inner markup; the SDK doesn't own the
    // content inside, so a "Click to edit" placeholder would be misleading.
    if (element.hasAttribute("data-scms-href")) {
        element.classList.remove("streamlined-empty");
        return;
    }
    element.classList.toggle("streamlined-empty", isVisuallyEmpty(element));
}

function writeTextWithBreaks(element: HTMLElement, text: string): void {
    element.textContent = "";
    const parts = text.split("\n");
    for (let i = 0; i < parts.length; i++) {
        if (i > 0) element.appendChild(document.createElement("br"));
        if (parts[i]) element.appendChild(document.createTextNode(parts[i]));
    }
}

export class ContentManager {
    constructor(private state: EditorState) {}

    /**
     * Update currentContent from a DOM element, then sync other elements.
     * Called when user edits an element directly.
     */
    updateContentFromElement(key: string, sourceElement: HTMLElement): void {
        const infos = this.state.editableElements.get(key);
        if (!infos || infos.length === 0) return;

        // Find the info for the source element to get proper content
        const sourceInfo = infos.find((i) => i.element === sourceElement);
        if (!sourceInfo) return;

        // Update currentContent from the source element
        const content = this.getElementContent(key, sourceInfo);
        this.state.currentContent.set(key, content);

        // Sync all other DOM elements from currentContent
        this.syncAllElementsFromContent(key, sourceElement);

        // Refresh placeholder state for the element the user just typed in
        // (sync handles the others via applyElementContent).
        updateEmptyState(sourceElement);
    }

    /**
     * Sync all DOM elements for a key from currentContent.
     * Optionally skip a source element (to avoid overwriting what user just typed).
     */
    syncAllElementsFromContent(key: string, skipElement?: HTMLElement): void {
        const infos = this.state.editableElements.get(key);
        if (!infos) return;

        const content = this.state.currentContent.get(key);
        if (content === undefined) return;

        for (const info of infos) {
            if (skipElement && info.element === skipElement) continue;
            this.applyElementContent(key, info, content);
        }
    }

    /**
     * Update currentContent directly (for modal-based edits like image/link).
     * Then sync all DOM elements.
     */
    setContent(key: string, content: string): void {
        this.state.currentContent.set(key, content);
        this.syncAllElementsFromContent(key);
    }

    /**
     * Get the current content value for an element based on its type.
     * Returns JSON string with type field for all element types.
     * Includes attributes if any have been set.
     */
    /**
     * Get the HTML content of an element, using Tiptap's clean output if available.
     */
    private getElementHTML(element: HTMLElement): string {
        const editor = this.state.tiptapEditors.get(element);
        return editor ? editor.getHTML() : element.innerHTML;
    }

    getElementContent(key: string, info: EditableElementInfo): string {
        const elementType = this.state.editableTypes.get(key) || "html";
        const attributes = this.state.elementAttributes.get(key);

        if (elementType === "image" && info.element instanceof HTMLImageElement) {
            const data: ImageContentData = {
                type: "image",
                src: info.element.src,
                ...(attributes && Object.keys(attributes).length > 0 ? { attributes } : {}),
            };
            return JSON.stringify(data);
        } else if (elementType === "link" && info.element instanceof HTMLAnchorElement) {
            const data: LinkContentData = {
                type: "link",
                href: info.element.getAttribute("href") || "",
                target: info.element.target,
                value: this.getElementHTML(info.element),
                ...(attributes && Object.keys(attributes).length > 0 ? { attributes } : {}),
            };
            return JSON.stringify(data);
        } else if (elementType === "href" && info.element instanceof HTMLAnchorElement) {
            const data: HrefContentData = {
                type: "href",
                href: info.element.getAttribute("href") || "",
                target: info.element.target,
                ...(attributes && Object.keys(attributes).length > 0 ? { attributes } : {}),
            };
            return JSON.stringify(data);
        } else if (elementType === "text") {
            const data: TextContentData = {
                type: "text",
                value: readTextWithBreaks(info.element),
                ...(attributes && Object.keys(attributes).length > 0 ? { attributes } : {}),
            };
            return JSON.stringify(data);
        } else {
            // html (default)
            const data: HtmlContentData = {
                type: "html",
                value: this.getElementHTML(info.element),
                ...(attributes && Object.keys(attributes).length > 0 ? { attributes } : {}),
            };
            return JSON.stringify(data);
        }
    }

    /**
     * Set the HTML content of an element, using Tiptap's API if available.
     */
    private setElementHTML(element: HTMLElement, htmlContent: string): void {
        const editor = this.state.tiptapEditors.get(element);
        if (editor) {
            editor.commands.setContent(htmlContent, { emitUpdate: false });
        } else {
            element.innerHTML = htmlContent;
        }
    }

    /**
     * Apply content to an element based on stored type.
     * Also extracts and applies attributes if present.
     */
    applyElementContent(key: string, info: EditableElementInfo, content: string): void {
        const elementType = this.state.editableTypes.get(key) || "html";

        try {
            const data = JSON.parse(content) as
                | (ContentData & { attributes?: ElementAttributes })
                | { type?: undefined; attributes?: ElementAttributes };

            // Extract and store attributes if present
            if (data.attributes && Object.keys(data.attributes).length > 0) {
                this.state.elementAttributes.set(key, data.attributes);
                applyAttributesToElement(info.element, data.attributes);
            }

            if (data.type === "text") {
                writeTextWithBreaks(info.element, (data as TextContentData).value);
            } else if (data.type === "html") {
                this.setElementHTML(info.element, (data as HtmlContentData).value);
            } else if (data.type === "image" && info.element instanceof HTMLImageElement) {
                info.element.src = (data as ImageContentData).src;
            } else if (data.type === "link" && info.element instanceof HTMLAnchorElement) {
                const linkData = data as LinkContentData;
                info.element.href = linkData.href;
                info.element.target = linkData.target;
                this.setElementHTML(info.element, linkData.value);
            } else if (data.type === "href" && info.element instanceof HTMLAnchorElement) {
                const hrefData = data as HrefContentData;
                info.element.href = hrefData.href;
                info.element.target = hrefData.target;
            } else if (!data.type) {
                // No type field in JSON - use element's declared type
                if (elementType === "link" && info.element instanceof HTMLAnchorElement) {
                    const linkData = data as { href?: string; target?: string; value?: string };
                    if (linkData.href !== undefined) {
                        info.element.href = linkData.href;
                        info.element.target = linkData.target || "";
                        this.setElementHTML(info.element, linkData.value || "");
                    }
                } else if (elementType === "href" && info.element instanceof HTMLAnchorElement) {
                    const hrefData = data as { href?: string; target?: string };
                    if (hrefData.href !== undefined) {
                        info.element.href = hrefData.href;
                        info.element.target = hrefData.target || "";
                    }
                } else if (elementType === "image" && info.element instanceof HTMLImageElement) {
                    const imageData = data as { src?: string };
                    if (imageData.src !== undefined) {
                        info.element.src = imageData.src;
                    }
                } else if (elementType === "text") {
                    const textData = data as { value?: string };
                    if (textData.value !== undefined) {
                        writeTextWithBreaks(info.element, textData.value);
                    }
                } else if (elementType === "html") {
                    const htmlData = data as { value?: string };
                    if (htmlData.value !== undefined) {
                        this.setElementHTML(info.element, htmlData.value);
                    }
                }
            }
        } catch {
            // Not JSON - ignore, content should always be JSON
        }

        updateEmptyState(info.element);
    }

    /**
     * Get elements that have changes (currentContent differs from originalContent).
     */
    getDirtyElements(): Map<string, { content: string; info: EditableElementInfo }> {
        const dirty = new Map<string, { content: string; info: EditableElementInfo }>();
        // Compare currentContent vs originalContent (not DOM)
        this.state.currentContent.forEach((current, key) => {
            const original = this.state.originalContent.get(key);
            if (original !== undefined && current !== original) {
                // Get info for the key (need it for save metadata)
                const infos = this.state.editableElements.get(key);
                const info = infos?.[0];
                if (info) {
                    dirty.set(key, { content: current, info });
                }
            }
        });
        return dirty;
    }

    /**
     * Get template elements that have never been saved to the API.
     * These are elements derived from HTML that need to be persisted when
     * the template order changes.
     */
    getUnsavedTemplateElements(
        templatesWithOrderChanges: string[],
    ): Map<string, { content: string; info: EditableElementInfo }> {
        const unsaved = new Map<string, { content: string; info: EditableElementInfo }>();

        // Build a set of template IDs with order changes for fast lookup
        const changedTemplates = new Set(templatesWithOrderChanges);
        if (changedTemplates.size === 0) {
            return unsaved;
        }

        // Check each editable element
        this.state.editableElements.forEach((infos, key) => {
            const info = infos[0];
            if (!info || !info.templateId || !info.instanceId) {
                return; // Not a template element
            }

            // Only include elements from templates with order changes
            if (!changedTemplates.has(info.templateId)) {
                return;
            }

            // Skip if already saved to API
            if (this.state.savedContentKeys.has(key)) {
                return;
            }

            // Get the current content
            const content = this.state.currentContent.get(key);
            if (content !== undefined) {
                unsaved.set(key, { content, info });
            }
        });

        return unsaved;
    }
}
