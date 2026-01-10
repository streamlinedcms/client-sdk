/**
 * ModalManager - Handles modal dialogs for element editing
 *
 * Responsible for:
 * - HTML editor modal
 * - Link editor modal
 * - SEO modal
 * - Accessibility modal
 * - Attributes modal
 * - Media manager modal
 * - Image change handling
 */

import type { Logger } from "loganite";
import type { EditorState } from "./state.js";
import type { ContentManager } from "./content-manager.js";
import type {
    ElementAttributes,
    HtmlContentData,
    ImageContentData,
    LinkContentData,
} from "../types.js";
import {
    ELEMENT_ATTRIBUTES,
    RESERVED_ATTRIBUTES,
    SEO_ATTRIBUTES,
    ACCESSIBILITY_ATTRIBUTES,
    applyAttributesToElement,
} from "../types.js";
import type { MediaFile } from "../popup-manager.js";
import type { HtmlEditorModal } from "../components/html-editor-modal.js";
import type { SelectFileOptions } from "../components/media-manager-modal.js";
import type { LinkEditorModal, LinkData } from "../components/link-editor-modal.js";
import type { SeoModal } from "../components/seo-modal.js";
import type { AccessibilityModal } from "../components/accessibility-modal.js";
import type { AttributesModal } from "../components/attributes-modal.js";
import type { MediaManagerModal } from "../components/media-manager-modal.js";

/**
 * Configuration for ModalManager
 */
export interface ModalManagerConfig {
    appUrl: string;
    appId: string;
}

/**
 * Helpers that ModalManager needs from EditorController
 */
export interface ModalManagerHelpers {
    updateToolbarHasChanges: () => void;
}

/** Modal state property names that can be closed */
type ModalKey =
    | "htmlEditorModal"
    | "linkEditorModal"
    | "seoModal"
    | "accessibilityModal"
    | "attributesModal";

export class ModalManager {
    constructor(
        private state: EditorState,
        private log: Logger,
        private contentManager: ContentManager,
        private config: ModalManagerConfig,
        private helpers: ModalManagerHelpers,
    ) {}

    /**
     * Close a modal by its state property key
     */
    private closeModal(modalKey: ModalKey): void {
        const modal = this.state[modalKey];
        if (modal) {
            modal.remove();
            this.state[modalKey] = null;
        }
    }

    /**
     * Initialize the persistent media manager modal
     */
    initMediaManagerModal(): void {
        const modal = document.createElement("scms-media-manager-modal") as MediaManagerModal;
        modal.appUrl = this.config.appUrl;
        modal.appId = this.config.appId;
        document.body.appendChild(modal);
        this.state.mediaManagerModal = modal;
        this.log.debug("Media manager modal initialized");
    }

    /**
     * Open media manager for file selection
     * Returns selected file on success, null if user cancels or closes
     */
    async openMediaManager(options?: SelectFileOptions): Promise<MediaFile | null> {
        if (!this.state.mediaManagerModal) {
            this.log.warn("Media manager modal not initialized");
            return null;
        }

        this.log.debug("Opening media manager", { options });
        const file = await this.state.mediaManagerModal.selectMedia(options);
        if (file) {
            this.log.debug("Media file selected", { fileId: file.fileId, filename: file.filename });
        } else {
            this.log.debug("Media manager closed without selection");
        }
        return file;
    }

    /**
     * Handle image change via media manager
     */
    async handleChangeImage(): Promise<void> {
        if (!this.state.selectedKey) {
            this.log.debug("No element selected for image change");
            return;
        }

        const key = this.state.selectedKey;
        const infos = this.state.editableElements.get(key);
        if (!infos || infos.length === 0 || !(infos[0].element instanceof HTMLImageElement)) {
            this.log.warn("Selected element is not an image");
            return;
        }

        const img = infos[0].element as HTMLImageElement;

        this.log.debug("Opening media manager for image change", {
            key,
            elementId: infos[0].elementId,
        });

        // Try to offer the current image as a candidate for upload
        const options: SelectFileOptions = { accept: ["image/*"] };
        if (this.state.mediaManagerModal) {
            const candidate = await this.state.mediaManagerModal.fetchImageAsCandidate(img);
            if (candidate) {
                options.candidates = [candidate];
                this.log.debug("Offering current image as candidate", {
                    filename: candidate.filename,
                });
            }
        }

        const file = await this.openMediaManager(options);
        if (file) {
            // Build new content with updated src
            const attributes = this.state.elementAttributes.get(key);
            const data: ImageContentData = {
                type: "image",
                src: file.publicUrl,
                ...(attributes && Object.keys(attributes).length > 0 ? { attributes } : {}),
            };
            // Update via setContent - this updates currentContent and syncs all DOM elements
            this.contentManager.setContent(key, JSON.stringify(data));
            this.helpers.updateToolbarHasChanges();
            this.log.debug("Image changed", {
                key,
                elementId: infos[0].elementId,
                newUrl: file.publicUrl,
                count: infos.length,
            });
        }
    }

    /**
     * Open HTML editor modal for the selected element
     */
    handleEditHtml(): void {
        if (!this.state.selectedKey) {
            this.log.debug("No element selected for HTML editing");
            return;
        }

        // Prevent opening multiple modals
        if (this.state.htmlEditorModal) {
            this.log.debug("HTML editor already open");
            return;
        }

        const key = this.state.selectedKey;
        const infos = this.state.editableElements.get(key);
        if (!infos || infos.length === 0) {
            return;
        }

        const primaryInfo = infos[0];
        this.log.debug("Opening HTML editor", { key, elementId: primaryInfo.elementId });

        // Get content from currentContent (already normalized) rather than DOM
        let htmlValue = primaryInfo.element.innerHTML;
        const storedContent = this.state.currentContent.get(key);
        if (storedContent) {
            try {
                const data = JSON.parse(storedContent) as { type?: string; value?: string };
                if ((data.type === "html" || data.type === "text") && data.value !== undefined) {
                    htmlValue = data.value;
                }
            } catch {
                // Use DOM fallback
            }
        }

        // Create and show modal
        const modal = document.createElement("scms-html-editor-modal") as HtmlEditorModal;
        modal.elementId = key;
        modal.content = htmlValue;

        // Prevent clicks inside modal from deselecting the element
        modal.addEventListener("click", (e: Event) => {
            e.stopPropagation();
        });

        modal.addEventListener("apply", ((e: CustomEvent<{ content: string }>) => {
            // Build content and update via setContent
            const attributes = this.state.elementAttributes.get(key);
            const data: HtmlContentData = {
                type: "html",
                value: e.detail.content,
                ...(attributes && Object.keys(attributes).length > 0 ? { attributes } : {}),
            };
            this.contentManager.setContent(key, JSON.stringify(data));
            this.closeModal("htmlEditorModal");
            this.helpers.updateToolbarHasChanges();
            this.log.debug("HTML applied", {
                key,
                elementId: primaryInfo.elementId,
                count: infos.length,
            });
        }) as EventListener);

        modal.addEventListener("cancel", () => {
            this.closeModal("htmlEditorModal");
        });

        document.body.appendChild(modal);
        this.state.htmlEditorModal = modal;
    }

    /**
     * Open link editor modal for the selected element
     */
    handleEditLink(): void {
        if (!this.state.selectedKey) {
            this.log.debug("No element selected for link editing");
            return;
        }

        // Prevent opening multiple modals
        if (this.state.linkEditorModal) {
            this.log.debug("Link editor already open");
            return;
        }

        const key = this.state.selectedKey;
        const infos = this.state.editableElements.get(key);
        if (!infos || infos.length === 0 || !(infos[0].element instanceof HTMLAnchorElement)) {
            this.log.warn("Selected element is not a link");
            return;
        }

        const primaryInfo = infos[0];
        const primaryAnchor = primaryInfo.element as HTMLAnchorElement;
        this.log.debug("Opening link editor", { key, elementId: primaryInfo.elementId });

        // Create and show modal
        const modal = document.createElement("scms-link-editor-modal") as LinkEditorModal;
        modal.elementId = key;
        modal.linkData = {
            href: primaryAnchor.getAttribute("href") || "",
            target: primaryAnchor.target,
            value: primaryAnchor.innerHTML,
        };

        // Prevent clicks inside modal from deselecting the element
        modal.addEventListener("click", (e: Event) => {
            e.stopPropagation();
        });

        modal.addEventListener("apply", ((e: CustomEvent<{ linkData: LinkData }>) => {
            // Build content and update via setContent
            const attributes = this.state.elementAttributes.get(key);
            const data: LinkContentData = {
                type: "link",
                href: e.detail.linkData.href,
                target: e.detail.linkData.target,
                value: e.detail.linkData.value,
                ...(attributes && Object.keys(attributes).length > 0 ? { attributes } : {}),
            };
            this.contentManager.setContent(key, JSON.stringify(data));
            this.closeModal("linkEditorModal");
            this.helpers.updateToolbarHasChanges();
            this.log.debug("Link updated", {
                key,
                elementId: primaryInfo.elementId,
                linkData: e.detail.linkData,
                count: infos.length,
            });
        }) as EventListener);

        modal.addEventListener("cancel", () => {
            this.closeModal("linkEditorModal");
        });

        document.body.appendChild(modal);
        this.state.linkEditorModal = modal;
    }

    /**
     * Navigate to the link URL of the selected element
     */
    handleGoToLink(): void {
        if (!this.state.selectedKey) {
            this.log.debug("No element selected for go to link");
            return;
        }

        const key = this.state.selectedKey;
        const infos = this.state.editableElements.get(key);
        if (!infos || infos.length === 0 || !(infos[0].element instanceof HTMLAnchorElement)) {
            this.log.warn("Selected element is not a link");
            return;
        }

        const primaryAnchor = infos[0].element as HTMLAnchorElement;
        const href = primaryAnchor.href;
        const target = primaryAnchor.target;

        this.log.debug("Navigating to link", { key, elementId: infos[0].elementId, href, target });

        if (target === "_blank") {
            window.open(href, "_blank");
        } else {
            window.location.href = href;
        }
    }

    /**
     * Get stored attributes for an element
     */
    private getElementAttributes(key: string): ElementAttributes {
        return this.state.elementAttributes.get(key) || {};
    }

    /**
     * Get attributes from the DOM element, split into categories.
     * - elementAttrs: core attributes (src, href, target)
     * - reservedAttrs: class, id, style (read-only)
     * - otherAttrs: everything else (dynamic, extensions, etc)
     */
    private getDomAttributes(element: HTMLElement): {
        elementAttrs: ElementAttributes;
        reservedAttrs: ElementAttributes;
        otherAttrs: ElementAttributes;
    } {
        const elementAttrs: ElementAttributes = {};
        const reservedAttrs: ElementAttributes = {};
        const otherAttrs: ElementAttributes = {};
        const excludePatterns = [/^data-scms-/, /^contenteditable$/];

        for (let i = 0; i < element.attributes.length; i++) {
            const attr = element.attributes[i];
            // Skip excluded attributes
            if (excludePatterns.some((p) => p.test(attr.name))) {
                continue;
            }
            // Categorize attributes
            if ((ELEMENT_ATTRIBUTES as readonly string[]).includes(attr.name)) {
                elementAttrs[attr.name] = attr.value;
            } else if ((RESERVED_ATTRIBUTES as readonly string[]).includes(attr.name)) {
                reservedAttrs[attr.name] = attr.value;
            } else {
                otherAttrs[attr.name] = attr.value;
            }
        }

        return { elementAttrs, reservedAttrs, otherAttrs };
    }

    /**
     * Get merged attributes for modals: DOM attributes as defaults, stored attributes take precedence.
     * Only includes attributes matching the provided filter (e.g., SEO or accessibility attribute names).
     */
    private getMergedAttributes(
        key: string,
        element: HTMLElement,
        attributeFilter?: readonly string[],
    ): ElementAttributes {
        const { otherAttrs } = this.getDomAttributes(element);
        const storedAttrs = this.getElementAttributes(key);

        // Start with DOM attributes (filtered if filter provided)
        const domDefaults: ElementAttributes = {};
        for (const [name, value] of Object.entries(otherAttrs)) {
            if (!attributeFilter || attributeFilter.includes(name)) {
                domDefaults[name] = value;
            }
        }

        // Merge stored attributes on top (they take precedence)
        return { ...domDefaults, ...storedAttrs };
    }

    /**
     * Open SEO modal for the selected element
     */
    handleEditSeo(): void {
        if (!this.state.selectedKey) {
            this.log.debug("No element selected for SEO editing");
            return;
        }

        if (this.state.seoModal) {
            this.log.debug("SEO modal already open");
            return;
        }

        const key = this.state.selectedKey;
        const infos = this.state.editableElements.get(key);
        if (!infos || infos.length === 0) return;

        const primaryInfo = infos[0];
        const elementType = this.state.editableTypes.get(key) || "html";
        this.log.debug("Opening SEO modal", { key, elementId: primaryInfo.elementId, elementType });

        const modal = document.createElement("scms-seo-modal") as SeoModal;
        modal.elementId = key;
        modal.elementType = elementType;
        // Merge DOM attributes (as defaults) with stored attributes (take precedence)
        modal.elementAttrs = this.getMergedAttributes(key, primaryInfo.element, SEO_ATTRIBUTES);

        modal.addEventListener("click", (e: Event) => e.stopPropagation());

        modal.addEventListener("apply", ((e: CustomEvent<{ attributes: ElementAttributes }>) => {
            this.state.elementAttributes.set(key, e.detail.attributes);
            // Apply attributes to all elements sharing this key
            for (const info of infos) {
                applyAttributesToElement(info.element, e.detail.attributes);
            }
            this.closeModal("seoModal");
            this.helpers.updateToolbarHasChanges();
            this.log.debug("SEO attributes applied", {
                key,
                attributes: e.detail.attributes,
                count: infos.length,
            });
        }) as EventListener);

        modal.addEventListener("cancel", () => this.closeModal("seoModal"));

        document.body.appendChild(modal);
        this.state.seoModal = modal;
    }

    /**
     * Open accessibility modal for the selected element
     */
    handleEditAccessibility(): void {
        if (!this.state.selectedKey) {
            this.log.debug("No element selected for accessibility editing");
            return;
        }

        if (this.state.accessibilityModal) {
            this.log.debug("Accessibility modal already open");
            return;
        }

        const key = this.state.selectedKey;
        const infos = this.state.editableElements.get(key);
        if (!infos || infos.length === 0) return;

        const primaryInfo = infos[0];
        const elementType = this.state.editableTypes.get(key) || "html";
        this.log.debug("Opening accessibility modal", {
            key,
            elementId: primaryInfo.elementId,
            elementType,
        });

        const modal = document.createElement("scms-accessibility-modal") as AccessibilityModal;
        modal.elementId = key;
        modal.elementType = elementType;
        // Merge DOM attributes (as defaults) with stored attributes (take precedence)
        modal.elementAttrs = this.getMergedAttributes(
            key,
            primaryInfo.element,
            ACCESSIBILITY_ATTRIBUTES,
        );

        modal.addEventListener("click", (e: Event) => e.stopPropagation());

        modal.addEventListener("apply", ((e: CustomEvent<{ attributes: ElementAttributes }>) => {
            this.state.elementAttributes.set(key, e.detail.attributes);
            // Apply attributes to all elements sharing this key
            for (const info of infos) {
                applyAttributesToElement(info.element, e.detail.attributes);
            }
            this.closeModal("accessibilityModal");
            this.helpers.updateToolbarHasChanges();
            this.log.debug("Accessibility attributes applied", {
                key,
                attributes: e.detail.attributes,
                count: infos.length,
            });
        }) as EventListener);

        modal.addEventListener("cancel", () => this.closeModal("accessibilityModal"));

        document.body.appendChild(modal);
        this.state.accessibilityModal = modal;
    }

    /**
     * Open attributes modal for the selected element
     */
    handleEditAttributes(): void {
        if (!this.state.selectedKey) {
            this.log.debug("No element selected for attributes editing");
            return;
        }

        if (this.state.attributesModal) {
            this.log.debug("Attributes modal already open");
            return;
        }

        const key = this.state.selectedKey;
        const infos = this.state.editableElements.get(key);
        if (!infos || infos.length === 0) return;

        const primaryInfo = infos[0];
        this.log.debug("Opening attributes modal", { key, elementId: primaryInfo.elementId });

        const modal = document.createElement("scms-attributes-modal") as AttributesModal;
        modal.elementId = key;
        modal.elementAttrs = this.getElementAttributes(key);
        const {
            elementAttrs: elementDefinedAttrs,
            reservedAttrs,
            otherAttrs,
        } = this.getDomAttributes(primaryInfo.element);
        modal.elementDefinedAttrs = elementDefinedAttrs;
        modal.reservedAttrs = reservedAttrs;
        modal.otherAttrs = otherAttrs;

        modal.addEventListener("click", (e: Event) => e.stopPropagation());

        modal.addEventListener("apply", ((e: CustomEvent<{ attributes: ElementAttributes }>) => {
            this.state.elementAttributes.set(key, e.detail.attributes);
            // Apply attributes to all elements sharing this key
            for (const info of infos) {
                applyAttributesToElement(info.element, e.detail.attributes);
            }
            this.closeModal("attributesModal");
            this.helpers.updateToolbarHasChanges();
            this.log.debug("Custom attributes applied", {
                key,
                attributes: e.detail.attributes,
                count: infos.length,
            });
        }) as EventListener);

        modal.addEventListener("cancel", () => this.closeModal("attributesModal"));

        document.body.appendChild(modal);
        this.state.attributesModal = modal;
    }
}
