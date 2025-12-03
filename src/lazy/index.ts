/**
 * Lazy-loaded module for auth and UI
 *
 * This module is loaded AFTER the critical path completes (content visible).
 * It contains:
 * - Loganite logger (for detailed logging)
 * - Auth module (API key management, login popup)
 * - Lit web components (sign-in link, toolbar)
 * - Editing functionality
 */

import { Logger } from "loganite";
import { KeyStorage, type EditorMode } from "../key-storage.js";
import { PopupManager, type MediaFile } from "../popup-manager.js";
import type { EditableType, ContentData, TextContentData, HtmlContentData, ImageContentData, LinkContentData } from "../types.js";

/**
 * Configuration for StreamlinedCMS
 */
interface ViewerConfig {
    apiUrl: string;
    appUrl: string;
    appId: string;
    logLevel?: string;
    mockAuth?: {
        enabled: boolean;
        userId?: string;
    };
}

/**
 * Get configuration from script tag data attributes
 */
function getConfigFromScriptTag(): ViewerConfig | null {
    const scripts = document.querySelectorAll<HTMLScriptElement>('script[src*="streamlined-cms"]');
    const scriptTag = scripts[scripts.length - 1];

    if (!scriptTag) {
        return null;
    }

    const appId = scriptTag.dataset.appId;
    if (!appId) {
        console.error("[StreamlinedCMS] App ID is required. Add data-app-id to your script tag.");
        return null;
    }

    return {
        apiUrl: scriptTag.dataset.apiUrl || __SDK_API_URL__,
        appUrl: scriptTag.dataset.appUrl || __SDK_APP_URL__,
        appId,
        logLevel: scriptTag.dataset.logLevel,
        mockAuth: scriptTag.dataset.mockAuth === "true"
            ? { enabled: true, userId: scriptTag.dataset.mockUserId }
            : undefined,
    };
}

// Import Lit components to register them
import "../components/toolbar.js";
import "../components/sign-in-link.js";
import "../components/html-editor-modal.js";
import "../components/link-editor-modal.js";
import "../components/seo-modal.js";
import "../components/accessibility-modal.js";
import "../components/attributes-modal.js";
import type { Toolbar } from "../components/toolbar.js";
import type { HtmlEditorModal } from "../components/html-editor-modal.js";
import type { LinkEditorModal, LinkData } from "../components/link-editor-modal.js";
import type { SeoModal } from "../components/seo-modal.js";
import type { AccessibilityModal } from "../components/accessibility-modal.js";
import type { AttributesModal } from "../components/attributes-modal.js";
import type { ElementAttributes } from "../types.js";

// Toolbar height constants
const TOOLBAR_HEIGHT_DESKTOP = 48;
const TOOLBAR_HEIGHT_MOBILE = 56;

interface EditableElementInfo {
    element: HTMLElement;
    elementId: string;
    groupId: string | null;
}

class EditorController {
    private config: ViewerConfig;
    private log: Logger;
    private keyStorage: KeyStorage;
    private popupManager: PopupManager;
    private apiKey: string | null = null;
    private currentMode: EditorMode = "viewer";
    // Map key is composite: groupId:elementId for grouped, just elementId for ungrouped
    private editableElements: Map<string, EditableElementInfo> = new Map();
    private editableTypes: Map<string, EditableType> = new Map();
    private originalContent: Map<string, string> = new Map();
    private editingKey: string | null = null;
    private customSignInTriggers: Map<Element, string> = new Map(); // element -> original text
    private toolbar: Toolbar | null = null;
    private htmlEditorModal: HtmlEditorModal | null = null;
    private linkEditorModal: LinkEditorModal | null = null;
    private seoModal: SeoModal | null = null;
    private accessibilityModal: AccessibilityModal | null = null;
    private attributesModal: AttributesModal | null = null;
    private saving = false;
    // Store attributes per element (keyed by composite key)
    private elementAttributes: Map<string, ElementAttributes> = new Map();
    // Double-tap tracking for mobile
    private lastTapTime = 0;
    private lastTapKey: string | null = null;
    private readonly doubleTapDelay = 400; // ms

    constructor(config: ViewerConfig) {
        this.config = config;

        // Create logger with configured level
        const logLevel = config.logLevel || "error";
        this.log = new Logger("StreamlinedCMS", logLevel);

        // Initialize key storage and popup manager
        this.keyStorage = new KeyStorage(config.appId);
        this.popupManager = new PopupManager({
            appId: config.appId,
            appUrl: config.appUrl,
        });
    }

    async init(): Promise<void> {
        this.log.info("Lazy module initializing", {
            appId: this.config.appId,
        });

        // Re-scan editable elements (viewer already populated them)
        this.scanEditableElements();

        // Check for mock auth
        if (this.config.mockAuth?.enabled) {
            this.apiKey = "mock-api-key";
            this.log.debug("Mock authentication enabled");
            this.setMode("author");
            return;
        }

        // Set up auth UI based on stored state
        this.setupAuthUI();

        this.log.info("Lazy module initialized", {
            editableCount: this.editableElements.size,
            hasApiKey: !!this.apiKey,
            mode: this.currentMode,
        });
    }

    /**
     * Get group ID for an element by checking data-group on self or ancestors
     */
    private getGroupId(element: HTMLElement): string | null {
        // First check the element itself
        const selfGroup = element.getAttribute("data-group");
        if (selfGroup) return selfGroup;

        // Walk up to find nearest ancestor with data-group
        let parent = element.parentElement;
        while (parent) {
            const parentGroup = parent.getAttribute("data-group");
            if (parentGroup) return parentGroup;
            parent = parent.parentElement;
        }
        return null;
    }

    private scanEditableElements(): void {
        document.querySelectorAll<HTMLElement>("[data-editable]").forEach((element) => {
            const elementId = element.getAttribute("data-editable");
            if (elementId) {
                const groupId = this.getGroupId(element);
                // Use composite key for grouped elements: groupId:elementId
                const key = groupId ? `${groupId}:${elementId}` : elementId;
                this.editableElements.set(key, { element, elementId, groupId });
                // Check for explicit type or infer from element tag
                const explicitType = element.getAttribute("data-editable-type") as EditableType | null;
                if (explicitType === "image" || (!explicitType && element.tagName === "IMG")) {
                    this.editableTypes.set(key, "image");
                } else if (explicitType === "link") {
                    this.editableTypes.set(key, "link");
                } else if (explicitType === "text") {
                    this.editableTypes.set(key, "text");
                } else {
                    // Default to html for backwards compatibility
                    this.editableTypes.set(key, "html");
                }
            }
        });
    }

    private getEditableType(key: string): EditableType {
        return this.editableTypes.get(key) || "html";
    }

    private setupAuthUI(): void {
        const storedKey = this.keyStorage.getStoredKey();

        if (storedKey) {
            this.apiKey = storedKey;

            // Set up all custom triggers as sign-out
            const customTriggers = document.querySelectorAll("[data-scms-signin]");
            customTriggers.forEach((trigger) => {
                this.customSignInTriggers.set(trigger, trigger.textContent || "");
                trigger.textContent = "Sign Out";
                trigger.addEventListener("click", this.handleSignOutClick);
            });

            const storedMode = this.keyStorage.getStoredMode();
            this.setMode(storedMode === "author" ? "author" : "viewer");
            this.log.debug("Restored auth state", { mode: this.currentMode, triggerCount: customTriggers.length });
        } else {
            this.showSignInLink();
            this.log.debug("No valid API key, showing sign-in link");
        }
    }

    private showSignInLink(): void {
        this.removeToolbar();

        // Check for custom triggers
        const customTriggers = document.querySelectorAll("[data-scms-signin]");
        if (customTriggers.length > 0) {
            customTriggers.forEach((trigger) => {
                // Store original text if not already stored
                if (!this.customSignInTriggers.has(trigger)) {
                    this.customSignInTriggers.set(trigger, trigger.textContent || "");
                }
                // Restore original text
                const originalText = this.customSignInTriggers.get(trigger);
                if (originalText) {
                    trigger.textContent = originalText;
                }
                trigger.addEventListener("click", this.handleSignInClick);
            });
            return;
        }

        // Use Lit component (fallback when no custom triggers)
        const signInLink = document.createElement("scms-sign-in-link");
        signInLink.id = "scms-signin-link";
        signInLink.addEventListener("sign-in-click", () => {
            this.handleSignIn();
        });
        document.body.appendChild(signInLink);
    }

    private handleSignInClick = (e: Event): void => {
        e.preventDefault();
        this.handleSignIn();
    };

    private handleSignOutClick = (e: Event): void => {
        e.preventDefault();
        this.signOut();
    };

    private handleDocumentClick = (e: Event): void => {
        if (!this.editingKey) return;

        const target = e.target as Node;

        // Don't deselect if clicking inside an editable element
        for (const info of this.editableElements.values()) {
            if (info.element.contains(target)) {
                return;
            }
        }

        // Don't deselect if clicking inside the toolbar
        if (this.toolbar?.contains(target)) {
            return;
        }

        this.stopEditing();
    };

    private async handleSignIn(): Promise<void> {
        this.log.debug("Opening login popup");

        const key = await this.popupManager.openLoginPopup();
        if (key) {
            this.apiKey = key;
            this.keyStorage.storeKey(key);

            // Remove default sign-in link if present
            const signInLink = document.getElementById("scms-signin-link");
            if (signInLink) signInLink.remove();

            // Convert all custom triggers to sign-out
            this.customSignInTriggers.forEach((_, trigger) => {
                trigger.removeEventListener("click", this.handleSignInClick);
                trigger.textContent = "Sign Out";
                trigger.addEventListener("click", this.handleSignOutClick);
            });

            this.setMode("author");
            this.log.info("User authenticated via popup, entering author mode");
        } else {
            this.log.debug("Login popup closed without authentication");
        }
    }

    private setMode(mode: EditorMode): void {
        this.currentMode = mode;
        this.keyStorage.storeMode(mode);

        if (mode === "author") {
            this.enableAuthorMode();
        } else {
            this.enableViewerMode();
        }

        // Update toolbar mode
        if (this.toolbar) {
            this.toolbar.mode = mode;
        }
    }

    private enableAuthorMode(): void {
        this.log.debug("Entering author mode");

        this.editableElements.forEach((info, key) => {
            info.element.classList.add("streamlined-editable");
            const elementType = this.getEditableType(key);

            if (!info.element.dataset.scmsClickHandler) {
                info.element.addEventListener("click", (e) => {
                    if (this.currentMode === "author") {
                        e.preventDefault();
                        e.stopPropagation();

                        // Check for double-tap (mobile) on images and links
                        const now = Date.now();
                        const isDoubleTap = this.lastTapKey === key && (now - this.lastTapTime) < this.doubleTapDelay;

                        if (isDoubleTap) {
                            if (elementType === "image") {
                                this.handleChangeImage();
                            } else if (elementType === "link") {
                                this.handleGoToLink();
                            }
                            this.lastTapKey = null;
                            this.lastTapTime = 0;
                        } else {
                            this.startEditing(key);
                            this.lastTapKey = key;
                            this.lastTapTime = now;
                        }
                    }
                });
                info.element.dataset.scmsClickHandler = "true";
            }

            // Add double-click handler for images to open media manager (desktop)
            if (elementType === "image" && !info.element.dataset.scmsDblClickHandler) {
                info.element.addEventListener("dblclick", (e) => {
                    if (this.currentMode === "author") {
                        e.preventDefault();
                        e.stopPropagation();
                        this.handleChangeImage();
                    }
                });
                info.element.dataset.scmsDblClickHandler = "true";
            }

            // Add double-click handler for links to navigate (desktop)
            if (elementType === "link" && !info.element.dataset.scmsDblClickHandler) {
                info.element.addEventListener("dblclick", (e) => {
                    if (this.currentMode === "author") {
                        e.preventDefault();
                        e.stopPropagation();
                        this.handleGoToLink();
                    }
                });
                info.element.dataset.scmsDblClickHandler = "true";
            }
        });

        // Add click-outside handler to deselect elements
        document.addEventListener("click", this.handleDocumentClick);

        this.injectEditStyles();
        this.showToolbar();
    }

    private enableViewerMode(): void {
        this.log.debug("Entering viewer mode");

        this.editableElements.forEach((info) => {
            info.element.classList.remove("streamlined-editable", "streamlined-editing");
            info.element.removeAttribute("contenteditable");
        });

        // Remove click-outside handler
        document.removeEventListener("click", this.handleDocumentClick);

        this.stopEditing();
        this.showToolbar();
    }

    private showToolbar(): void {
        // Update existing toolbar if present
        if (this.toolbar) {
            this.toolbar.mode = this.currentMode;
            this.toolbar.activeElement = this.editingKey;
            return;
        }

        // Create new toolbar
        const toolbar = document.createElement("scms-toolbar") as Toolbar;
        toolbar.id = "scms-toolbar";
        toolbar.mode = this.currentMode;
        toolbar.activeElement = this.editingKey;
        toolbar.appUrl = this.config.appUrl;
        toolbar.appId = this.config.appId;

        toolbar.addEventListener("mode-change", ((e: CustomEvent<{ mode: EditorMode }>) => {
            this.setMode(e.detail.mode);
        }) as EventListener);

        toolbar.addEventListener("save", () => {
            this.handleSave();
        });

        toolbar.addEventListener("reset", () => {
            this.handleReset();
        });

        toolbar.addEventListener("edit-html", () => {
            this.handleEditHtml();
        });

        toolbar.addEventListener("change-image", () => {
            this.handleChangeImage();
        });

        toolbar.addEventListener("edit-link", () => {
            this.handleEditLink();
        });

        toolbar.addEventListener("go-to-link", () => {
            this.handleGoToLink();
        });

        toolbar.addEventListener("sign-out", () => {
            this.signOut();
        });

        toolbar.addEventListener("edit-seo", () => {
            this.handleEditSeo();
        });

        toolbar.addEventListener("edit-accessibility", () => {
            this.handleEditAccessibility();
        });

        toolbar.addEventListener("edit-attributes", () => {
            this.handleEditAttributes();
        });

        document.body.appendChild(toolbar);
        this.toolbar = toolbar;

        // Add body padding to prevent content overlap
        this.updateBodyPadding();
        window.addEventListener("resize", this.updateBodyPadding);
    }

    private updateBodyPadding = (): void => {
        const isMobile = window.innerWidth < 640;
        const height = isMobile ? TOOLBAR_HEIGHT_MOBILE : TOOLBAR_HEIGHT_DESKTOP;
        document.body.style.paddingBottom = `${height}px`;
    };

    private removeToolbar(): void {
        if (this.toolbar) {
            this.toolbar.remove();
            this.toolbar = null;
            document.body.style.paddingBottom = "";
            window.removeEventListener("resize", this.updateBodyPadding);
        }
    }

    private signOut(): void {
        this.log.info("Signing out");

        this.keyStorage.clearStoredKey();
        this.apiKey = null;

        this.editableElements.forEach((info) => {
            info.element.classList.remove("streamlined-editable", "streamlined-editing");
            info.element.removeAttribute("contenteditable");
        });
        this.stopEditing();

        // Convert all custom triggers back to sign-in
        this.customSignInTriggers.forEach((originalText, trigger) => {
            trigger.removeEventListener("click", this.handleSignOutClick);
            trigger.textContent = originalText;
            trigger.addEventListener("click", this.handleSignInClick);
        });

        this.removeToolbar();

        // Only show default sign-in link if no custom triggers
        if (this.customSignInTriggers.size === 0) {
            this.showSignInLink();
        }
    }

    private injectEditStyles(): void {
        if (document.getElementById("streamlined-cms-styles")) {
            return;
        }

        const style = document.createElement("style");
        style.id = "streamlined-cms-styles";
        style.textContent = `
            .streamlined-editable {
                outline: 2px dashed transparent;
                outline-offset: 2px;
                transition: outline 0.2s;
                cursor: pointer;
                position: relative;
            }

            .streamlined-editable:hover {
                outline-color: #ef4444;
            }

            .streamlined-editing {
                outline: 2px solid #ef4444;
                outline-offset: 2px;
            }
        `;
        document.head.appendChild(style);
    }

    private startEditing(key: string): void {
        const info = this.editableElements.get(key);
        if (!info) {
            this.log.warn("Element not found", { key });
            return;
        }

        const elementType = this.getEditableType(key);
        this.log.trace("Starting edit", { key, elementId: info.elementId, groupId: info.groupId, elementType });

        // Stop editing previous element if any
        if (this.editingKey) {
            const prevInfo = this.editableElements.get(this.editingKey);
            if (prevInfo) {
                prevInfo.element.classList.remove("streamlined-editing");
                prevInfo.element.setAttribute("contenteditable", "false");
            }
        }

        // Store original content for reset
        if (!this.originalContent.has(key)) {
            this.originalContent.set(key, this.getElementContent(key, info));
        }

        // Add input listener to track changes (for text and html elements)
        if ((elementType === "text" || elementType === "html") && !info.element.dataset.scmsInputHandler) {
            info.element.addEventListener("input", () => this.updateToolbarHasChanges());
            info.element.dataset.scmsInputHandler = "true";
        }

        this.editingKey = key;
        info.element.classList.add("streamlined-editing");

        // Make text and html elements contenteditable (not images or links)
        if (elementType === "text" || elementType === "html") {
            info.element.setAttribute("contenteditable", "true");
            info.element.focus();
        }

        // Update toolbar
        if (this.toolbar) {
            this.toolbar.activeElement = key;
            this.toolbar.activeElementType = elementType;
        }
    }

    private stopEditing(): void {
        if (!this.editingKey) {
            return;
        }

        this.log.trace("Stopping edit");

        const info = this.editableElements.get(this.editingKey);
        if (info) {
            info.element.classList.remove("streamlined-editing");
            info.element.setAttribute("contenteditable", "false");
        }

        this.editingKey = null;

        // Update toolbar
        if (this.toolbar) {
            this.toolbar.activeElement = null;
            this.toolbar.activeElementType = null;
        }
    }

    /**
     * Get the current content value for an element based on its type
     * Returns JSON string with type field for all element types
     * Includes attributes if any have been set
     */
    private getElementContent(key: string, info: EditableElementInfo): string {
        const elementType = this.getEditableType(key);
        const attributes = this.elementAttributes.get(key);

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
                href: info.element.href,
                target: info.element.target,
                text: info.element.textContent || "",
                ...(attributes && Object.keys(attributes).length > 0 ? { attributes } : {}),
            };
            return JSON.stringify(data);
        } else if (elementType === "text") {
            const data: TextContentData = {
                type: "text",
                value: info.element.textContent || "",
                ...(attributes && Object.keys(attributes).length > 0 ? { attributes } : {}),
            };
            return JSON.stringify(data);
        } else {
            // html (default)
            const data: HtmlContentData = {
                type: "html",
                value: info.element.innerHTML,
                ...(attributes && Object.keys(attributes).length > 0 ? { attributes } : {}),
            };
            return JSON.stringify(data);
        }
    }

    /**
     * Apply content to an element based on stored type
     * Handles backwards compatibility for content without type field
     * Also extracts and applies attributes if present
     */
    private applyElementContent(key: string, info: EditableElementInfo, content: string): void {
        try {
            const data = JSON.parse(content) as (ContentData & { attributes?: ElementAttributes }) | { type?: undefined; attributes?: ElementAttributes };

            // Extract and store attributes if present
            if (data.attributes && Object.keys(data.attributes).length > 0) {
                this.elementAttributes.set(key, data.attributes);
                this.applyAttributesToElement(info.element, data.attributes);
            }

            if (data.type === "text") {
                info.element.textContent = (data as TextContentData).value;
            } else if (data.type === "html") {
                info.element.innerHTML = (data as HtmlContentData).value;
            } else if (data.type === "image" && info.element instanceof HTMLImageElement) {
                info.element.src = (data as ImageContentData).src;
            } else if (data.type === "link" && info.element instanceof HTMLAnchorElement) {
                const linkData = data as LinkContentData;
                info.element.href = linkData.href;
                info.element.target = linkData.target;
                info.element.textContent = linkData.text;
            } else if (!data.type) {
                // No type field - infer from element's data-editable-type attribute
                const attrType = info.element.getAttribute("data-editable-type");
                if (attrType === "link" && info.element instanceof HTMLAnchorElement) {
                    const linkData = data as { href?: string; target?: string; text?: string };
                    if (linkData.href !== undefined) {
                        info.element.href = linkData.href;
                        info.element.target = linkData.target || "";
                        info.element.textContent = linkData.text || "";
                        return;
                    }
                } else if (attrType === "image" && info.element instanceof HTMLImageElement) {
                    const imageData = data as { src?: string };
                    if (imageData.src !== undefined) {
                        info.element.src = imageData.src;
                        return;
                    }
                } else if (attrType === "text") {
                    const textData = data as { value?: string };
                    if (textData.value !== undefined) {
                        info.element.textContent = textData.value;
                        return;
                    }
                } else if (attrType === "html") {
                    const htmlData = data as { value?: string };
                    if (htmlData.value !== undefined) {
                        info.element.innerHTML = htmlData.value;
                        return;
                    }
                }
                // Unrecognized JSON - treat as html
                info.element.innerHTML = content;
            }
        } catch {
            // Not JSON - treat as legacy html content
            info.element.innerHTML = content;
        }
    }

    private getDirtyElements(): Map<string, { content: string; info: EditableElementInfo }> {
        const dirty = new Map<string, { content: string; info: EditableElementInfo }>();
        this.editableElements.forEach((info, key) => {
            const original = this.originalContent.get(key);
            const current = this.getElementContent(key, info);
            if (original !== undefined && current !== original) {
                dirty.set(key, { content: current, info });
            }
        });
        return dirty;
    }

    private updateToolbarHasChanges(): void {
        if (this.toolbar) {
            this.toolbar.hasChanges = this.getDirtyElements().size > 0;
        }
    }

    private async handleSave(): Promise<void> {
        const dirtyElements = this.getDirtyElements();
        if (dirtyElements.size === 0 || this.saving) {
            return;
        }

        this.log.debug("Saving all dirty elements", { count: dirtyElements.size });

        this.saving = true;
        if (this.toolbar) {
            this.toolbar.saving = true;
        }

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (this.apiKey) {
            headers["Authorization"] = `Bearer ${this.apiKey}`;
        }

        const errors: string[] = [];
        const saved: string[] = [];

        try {
            // Save all dirty elements in parallel
            const savePromises = Array.from(dirtyElements.entries()).map(
                async ([key, { content, info }]) => {
                    // Build URL based on whether element is grouped
                    const url = info.groupId
                        ? `${this.config.apiUrl}/apps/${this.config.appId}/content/groups/${info.groupId}/elements/${info.elementId}`
                        : `${this.config.apiUrl}/apps/${this.config.appId}/content/elements/${info.elementId}`;
                    const response = await fetch(url, {
                        method: "PUT",
                        headers,
                        body: JSON.stringify({ content }),
                    });

                    if (!response.ok) {
                        throw new Error(`${key}: ${response.status} ${response.statusText}`);
                    }

                    await response.json();

                    // Update original content to saved version
                    this.originalContent.set(key, content);
                    saved.push(key);
                }
            );

            const results = await Promise.allSettled(savePromises);

            results.forEach((result) => {
                if (result.status === "rejected") {
                    errors.push(result.reason?.message || "Unknown error");
                }
            });

            if (errors.length > 0) {
                this.log.error("Some elements failed to save", { errors });
                alert(`Failed to save some elements:\n${errors.join("\n")}`);
            } else {
                this.log.info("All content saved", { count: saved.length });
                // Deselect element after successful save
                this.stopEditing();
            }

            // Update toolbar
            this.updateToolbarHasChanges();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.log.error("Failed to save content", error);
            alert(`Failed to save: ${errorMessage}\n\nCheck console for details.`);
        } finally {
            this.saving = false;
            if (this.toolbar) {
                this.toolbar.saving = false;
            }
        }
    }

    private handleReset(): void {
        if (!this.editingKey) {
            return;
        }

        const key = this.editingKey;
        const info = this.editableElements.get(key);
        const originalContent = this.originalContent.get(key);
        const elementType = this.getEditableType(key);

        if (info && originalContent !== undefined) {
            this.log.debug("Resetting element", { key, elementId: info.elementId, groupId: info.groupId, elementType });
            this.applyElementContent(key, info, originalContent);
            this.updateToolbarHasChanges();
        }
    }

    private async handleChangeImage(): Promise<void> {
        if (!this.editingKey) {
            this.log.debug("No element selected for image change");
            return;
        }

        const key = this.editingKey;
        const info = this.editableElements.get(key);
        if (!info || !(info.element instanceof HTMLImageElement)) {
            this.log.warn("Selected element is not an image");
            return;
        }

        this.log.debug("Opening media manager for image change", { key, elementId: info.elementId });

        const file = await this.openMediaManager();
        if (file) {
            info.element.src = file.publicUrl;
            this.updateToolbarHasChanges();
            this.log.debug("Image changed", { key, elementId: info.elementId, newUrl: file.publicUrl });
        }
    }

    private handleEditHtml(): void {
        if (!this.editingKey) {
            this.log.debug("No element selected for HTML editing");
            return;
        }

        // Prevent opening multiple modals
        if (this.htmlEditorModal) {
            this.log.debug("HTML editor already open");
            return;
        }

        const key = this.editingKey;
        const info = this.editableElements.get(key);
        if (!info) {
            return;
        }

        this.log.debug("Opening HTML editor", { key, elementId: info.elementId });

        // Create and show modal
        const modal = document.createElement("scms-html-editor-modal") as HtmlEditorModal;
        modal.elementId = info.elementId;
        modal.content = info.element.innerHTML;

        // Prevent clicks inside modal from deselecting the element
        modal.addEventListener("click", (e: Event) => {
            e.stopPropagation();
        });

        modal.addEventListener("apply", ((e: CustomEvent<{ content: string }>) => {
            info.element.innerHTML = e.detail.content;
            this.closeHtmlEditor();
            this.updateToolbarHasChanges();
            this.log.debug("HTML applied", { key, elementId: info.elementId });
        }) as EventListener);

        modal.addEventListener("cancel", () => {
            this.closeHtmlEditor();
        });

        document.body.appendChild(modal);
        this.htmlEditorModal = modal;
    }

    private closeHtmlEditor(): void {
        if (this.htmlEditorModal) {
            this.htmlEditorModal.remove();
            this.htmlEditorModal = null;
        }
    }

    private handleEditLink(): void {
        if (!this.editingKey) {
            this.log.debug("No element selected for link editing");
            return;
        }

        // Prevent opening multiple modals
        if (this.linkEditorModal) {
            this.log.debug("Link editor already open");
            return;
        }

        const key = this.editingKey;
        const info = this.editableElements.get(key);
        if (!info || !(info.element instanceof HTMLAnchorElement)) {
            this.log.warn("Selected element is not a link");
            return;
        }

        this.log.debug("Opening link editor", { key, elementId: info.elementId });

        // Create and show modal
        const modal = document.createElement("scms-link-editor-modal") as LinkEditorModal;
        modal.elementId = info.elementId;
        modal.linkData = {
            href: info.element.href,
            target: info.element.target,
            text: info.element.textContent || "",
        };

        // Prevent clicks inside modal from deselecting the element
        modal.addEventListener("click", (e: Event) => {
            e.stopPropagation();
        });

        modal.addEventListener("apply", ((e: CustomEvent<{ linkData: LinkData }>) => {
            const anchor = info.element as HTMLAnchorElement;
            anchor.href = e.detail.linkData.href;
            anchor.target = e.detail.linkData.target;
            anchor.textContent = e.detail.linkData.text;
            this.closeLinkEditor();
            this.updateToolbarHasChanges();
            this.log.debug("Link updated", { key, elementId: info.elementId, linkData: e.detail.linkData });
        }) as EventListener);

        modal.addEventListener("cancel", () => {
            this.closeLinkEditor();
        });

        document.body.appendChild(modal);
        this.linkEditorModal = modal;
    }

    private closeLinkEditor(): void {
        if (this.linkEditorModal) {
            this.linkEditorModal.remove();
            this.linkEditorModal = null;
        }
    }

    private handleGoToLink(): void {
        if (!this.editingKey) {
            this.log.debug("No element selected for go to link");
            return;
        }

        const key = this.editingKey;
        const info = this.editableElements.get(key);
        if (!info || !(info.element instanceof HTMLAnchorElement)) {
            this.log.warn("Selected element is not a link");
            return;
        }

        const href = info.element.href;
        const target = info.element.target;

        this.log.debug("Navigating to link", { key, elementId: info.elementId, href, target });

        if (target === "_blank") {
            window.open(href, "_blank");
        } else {
            window.location.href = href;
        }
    }

    private getElementAttributes(key: string): ElementAttributes {
        return this.elementAttributes.get(key) || {};
    }

    /**
     * Element attributes are core attributes that define what the element is
     * (e.g., src for images, href/target for links)
     */
    private static readonly ELEMENT_ATTRIBUTES = ['src', 'href', 'target'];

    /**
     * Get attributes from the DOM element, split into element attrs and other attrs.
     * Element attrs are core attributes (src, href, target).
     * Other attrs are everything else (dynamic, extensions, etc).
     */
    private getDomAttributes(element: HTMLElement): { elementAttrs: ElementAttributes; otherAttrs: ElementAttributes } {
        const elementAttrs: ElementAttributes = {};
        const otherAttrs: ElementAttributes = {};
        const excludePatterns = [
            /^data-editable/,
            /^data-group$/,
            /^data-scms-/,
            /^class$/,
            /^id$/,
            /^style$/,
            /^contenteditable$/,
        ];

        for (let i = 0; i < element.attributes.length; i++) {
            const attr = element.attributes[i];
            // Skip excluded attributes
            if (excludePatterns.some((p) => p.test(attr.name))) {
                continue;
            }
            // Separate element attributes from other attributes
            if (EditorController.ELEMENT_ATTRIBUTES.includes(attr.name)) {
                elementAttrs[attr.name] = attr.value;
            } else {
                otherAttrs[attr.name] = attr.value;
            }
        }

        return { elementAttrs, otherAttrs };
    }

    private handleEditSeo(): void {
        if (!this.editingKey) {
            this.log.debug("No element selected for SEO editing");
            return;
        }

        if (this.seoModal) {
            this.log.debug("SEO modal already open");
            return;
        }

        const key = this.editingKey;
        const info = this.editableElements.get(key);
        if (!info) return;

        const elementType = this.getEditableType(key);
        this.log.debug("Opening SEO modal", { key, elementId: info.elementId, elementType });

        const modal = document.createElement("scms-seo-modal") as SeoModal;
        modal.elementId = info.elementId;
        modal.elementType = elementType;
        modal.elementAttrs = this.getElementAttributes(key);

        modal.addEventListener("click", (e: Event) => e.stopPropagation());

        modal.addEventListener("apply", ((e: CustomEvent<{ attributes: ElementAttributes }>) => {
            this.elementAttributes.set(key, e.detail.attributes);
            this.applyAttributesToElement(info.element, e.detail.attributes);
            this.closeSeoModal();
            this.updateToolbarHasChanges();
            this.log.debug("SEO attributes applied", { key, attributes: e.detail.attributes });
        }) as EventListener);

        modal.addEventListener("cancel", () => this.closeSeoModal());

        document.body.appendChild(modal);
        this.seoModal = modal;
    }

    private closeSeoModal(): void {
        if (this.seoModal) {
            this.seoModal.remove();
            this.seoModal = null;
        }
    }

    private handleEditAccessibility(): void {
        if (!this.editingKey) {
            this.log.debug("No element selected for accessibility editing");
            return;
        }

        if (this.accessibilityModal) {
            this.log.debug("Accessibility modal already open");
            return;
        }

        const key = this.editingKey;
        const info = this.editableElements.get(key);
        if (!info) return;

        const elementType = this.getEditableType(key);
        this.log.debug("Opening accessibility modal", { key, elementId: info.elementId, elementType });

        const modal = document.createElement("scms-accessibility-modal") as AccessibilityModal;
        modal.elementId = info.elementId;
        modal.elementType = elementType;
        modal.elementAttrs = this.getElementAttributes(key);

        modal.addEventListener("click", (e: Event) => e.stopPropagation());

        modal.addEventListener("apply", ((e: CustomEvent<{ attributes: ElementAttributes }>) => {
            this.elementAttributes.set(key, e.detail.attributes);
            this.applyAttributesToElement(info.element, e.detail.attributes);
            this.closeAccessibilityModal();
            this.updateToolbarHasChanges();
            this.log.debug("Accessibility attributes applied", { key, attributes: e.detail.attributes });
        }) as EventListener);

        modal.addEventListener("cancel", () => this.closeAccessibilityModal());

        document.body.appendChild(modal);
        this.accessibilityModal = modal;
    }

    private closeAccessibilityModal(): void {
        if (this.accessibilityModal) {
            this.accessibilityModal.remove();
            this.accessibilityModal = null;
        }
    }

    private handleEditAttributes(): void {
        if (!this.editingKey) {
            this.log.debug("No element selected for attributes editing");
            return;
        }

        if (this.attributesModal) {
            this.log.debug("Attributes modal already open");
            return;
        }

        const key = this.editingKey;
        const info = this.editableElements.get(key);
        if (!info) return;

        this.log.debug("Opening attributes modal", { key, elementId: info.elementId });

        const modal = document.createElement("scms-attributes-modal") as AttributesModal;
        modal.elementId = info.elementId;
        modal.elementAttrs = this.getElementAttributes(key);
        const { elementAttrs: elementDefinedAttrs, otherAttrs } = this.getDomAttributes(info.element);
        modal.elementDefinedAttrs = elementDefinedAttrs;
        modal.otherAttrs = otherAttrs;

        modal.addEventListener("click", (e: Event) => e.stopPropagation());

        modal.addEventListener("apply", ((e: CustomEvent<{ attributes: ElementAttributes }>) => {
            this.elementAttributes.set(key, e.detail.attributes);
            this.applyAttributesToElement(info.element, e.detail.attributes);
            this.closeAttributesModal();
            this.updateToolbarHasChanges();
            this.log.debug("Custom attributes applied", { key, attributes: e.detail.attributes });
        }) as EventListener);

        modal.addEventListener("cancel", () => this.closeAttributesModal());

        document.body.appendChild(modal);
        this.attributesModal = modal;
    }

    private closeAttributesModal(): void {
        if (this.attributesModal) {
            this.attributesModal.remove();
            this.attributesModal = null;
        }
    }

    private applyAttributesToElement(element: HTMLElement, attributes: ElementAttributes): void {
        // Apply each attribute to the element
        for (const [name, value] of Object.entries(attributes)) {
            if (value) {
                element.setAttribute(name, value);
            } else {
                element.removeAttribute(name);
            }
        }
    }

    /**
     * Open media manager popup for file selection
     * Returns selected file on success, null if user cancels or closes popup
     */
    public async openMediaManager(): Promise<MediaFile | null> {
        this.log.debug("Opening media manager popup");
        const file = await this.popupManager.openMediaManager();
        if (file) {
            this.log.debug("Media file selected", { fileId: file.fileId, filename: file.filename });
        } else {
            this.log.debug("Media manager closed without selection");
        }
        return file;
    }
}

/**
 * Initialize the lazy-loaded functionality
 */
export async function initLazy(config: ViewerConfig): Promise<EditorController> {
    const controller = new EditorController(config);
    await controller.init();
    return controller;
}

// Auto-initialize when loaded directly
const config = getConfigFromScriptTag();
if (config) {
    initLazy(config).then((controller) => {
        // Expose SDK on window for console access and programmatic use
        (window as unknown as { StreamlinedCMS: EditorController }).StreamlinedCMS = controller;
    });
}
