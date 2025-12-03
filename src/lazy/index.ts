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
    templateId: string | null;
    instanceId: string | null;
}

interface TemplateInfo {
    templateId: string;
    container: HTMLElement;
    templateElement: HTMLElement; // The first child (template definition)
    templateHtml: string; // Original HTML before content population
    groupId: string | null; // If template is inside a group
    instanceIds: string[]; // Ordered list of instance IDs
    instanceCount: number;
}

class EditorController {
    private config: ViewerConfig;
    private log: Logger;
    private keyStorage: KeyStorage;
    private popupManager: PopupManager;
    private apiKey: string | null = null;
    private currentMode: EditorMode = "viewer";
    // Map key is composite: groupId:elementId for grouped, just elementId for ungrouped
    // Multiple elements can share the same key (groups inside templates)
    private editableElements: Map<string, EditableElementInfo[]> = new Map();
    // Reverse lookup: element -> key (for click handling)
    private elementToKey: WeakMap<HTMLElement, string> = new WeakMap();
    private editableTypes: Map<string, EditableType> = new Map();
    // Content state: originalContent is snapshot at load/save, currentContent is authoritative local state
    // Keys in originalContent but not in currentContent = pending deletes
    private originalContent: Map<string, string> = new Map();
    private currentContent: Map<string, string> = new Map();
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
    // Template tracking for instance management
    private templates: Map<string, TemplateInfo> = new Map();
    // Track template UI elements for cleanup
    private templateAddButtons: Map<string, HTMLButtonElement> = new Map();
    private instanceDeleteButtons: WeakMap<HTMLElement, HTMLButtonElement> = new WeakMap();

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

        // Scan for templates (for instance management)
        this.scanTemplates();

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
            templateCount: this.templates.size,
            hasApiKey: !!this.apiKey,
            mode: this.currentMode,
        });
    }

    /**
     * Storage context for an element - determines how its key is built
     */
    private getStorageContext(element: HTMLElement): {
        groupId: string | null;
        templateId: string | null;
        instanceId: string | null;
    } {
        let groupId: string | null = null;
        let templateId: string | null = null;
        let instanceId: string | null = null;
        let foundGroupBeforeTemplate = false;

        let current = element.parentElement;
        while (current) {
            // Check for group
            const gid = current.getAttribute("data-scms-group");
            if (gid && groupId === null) {
                groupId = gid;
                if (templateId === null) {
                    // Found group before any template - we're in shared mode
                    foundGroupBeforeTemplate = true;
                }
            }

            // Only look for template context if we haven't found a group first
            if (!foundGroupBeforeTemplate) {
                // Check for instance marker (set by cloneTemplateInstances in loader)
                const instanceAttr = current.getAttribute("data-scms-instance");
                if (instanceAttr !== null && instanceId === null) {
                    instanceId = instanceAttr;
                }

                // Check for template container
                const tid = current.getAttribute("data-scms-template");
                if (tid && templateId === null) {
                    templateId = tid;
                }
            }

            current = current.parentElement;
        }

        // If we found group before template, clear template context
        if (foundGroupBeforeTemplate) {
            templateId = null;
            instanceId = null;
        }

        return { groupId, templateId, instanceId };
    }

    /**
     * Build a template element key from components
     */
    private buildTemplateKey(templateId: string, instanceId: string, elementId: string): string {
        return `${templateId}.${instanceId}.${elementId}`;
    }

    /**
     * Build storage key from context and element ID
     */
    private buildStorageKey(
        context: { groupId: string | null; templateId: string | null; instanceId: string | null },
        elementId: string
    ): string {
        if (context.templateId !== null && context.instanceId !== null) {
            const templateKey = this.buildTemplateKey(context.templateId, context.instanceId, elementId);
            return context.groupId ? `${context.groupId}:${templateKey}` : templateKey;
        } else {
            return context.groupId ? `${context.groupId}:${elementId}` : elementId;
        }
    }

    /**
     * Parse a storage key back into groupId and elementId
     * Used to build API URLs for DELETE requests
     */
    private parseStorageKey(key: string): { elementId: string; groupId: string | null } {
        const colonIndex = key.indexOf(":");
        if (colonIndex !== -1) {
            return { groupId: key.slice(0, colonIndex), elementId: key.slice(colonIndex + 1) };
        }
        return { groupId: null, elementId: key };
    }

    private scanEditableElements(): void {
        const selector = "[data-scms-text], [data-scms-html], [data-scms-image], [data-scms-link]";
        document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
            const info = this.getEditableInfo(element);
            if (info) {
                const context = this.getStorageContext(element);
                const key = this.buildStorageKey(context, info.id);

                const elementInfo: EditableElementInfo = {
                    element,
                    elementId: info.id,
                    groupId: context.groupId,
                    templateId: context.templateId,
                    instanceId: context.instanceId,
                };

                // Multiple elements can share the same key (groups inside templates)
                const existing = this.editableElements.get(key);
                if (existing) {
                    existing.push(elementInfo);
                } else {
                    this.editableElements.set(key, [elementInfo]);

                    // Initialize content state from DOM (first element for this key)
                    // Type must be set before getElementContent is called
                    this.editableTypes.set(key, info.type);
                    const content = this.getElementContent(key, elementInfo);
                    this.originalContent.set(key, content);
                    this.currentContent.set(key, content);
                }

                // Reverse lookup for click handling
                this.elementToKey.set(element, key);

                // Type is the same for all elements sharing a key (may already be set above)
                if (!this.editableTypes.has(key)) {
                    this.editableTypes.set(key, info.type);
                }
            }
        });
    }

    /**
     * Get editable info from element by checking data-scms-{type} attributes
     */
    private getEditableInfo(element: HTMLElement): { id: string; type: EditableType } | null {
        const types: EditableType[] = ["text", "html", "image", "link"];
        for (const type of types) {
            const id = element.getAttribute(`data-scms-${type}`);
            if (id) return { id, type };
        }
        return null;
    }

    private getEditableType(key: string): EditableType {
        return this.editableTypes.get(key) || "html";
    }

    /**
     * Get the group ID for an element by walking up the DOM
     */
    private getGroupIdFromElement(element: HTMLElement): string | null {
        let current = element.parentElement;
        while (current) {
            const groupId = current.getAttribute("data-scms-group");
            if (groupId) return groupId;
            current = current.parentElement;
        }
        return null;
    }

    /**
     * Generate a stable instance ID (5 alphanumeric characters)
     */
    private generateInstanceId(): string {
        const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
        const array = new Uint8Array(5);
        crypto.getRandomValues(array);
        return Array.from(array, (byte) => chars[byte % chars.length]).join("");
    }

    /**
     * Scan for template containers in the DOM
     */
    private scanTemplates(): void {
        this.templates.clear();
        document.querySelectorAll<HTMLElement>("[data-scms-template]").forEach((container) => {
            const templateId = container.getAttribute("data-scms-template");
            if (!templateId) return;

            // Get the first child as the template definition
            const templateElement = container.firstElementChild as HTMLElement | null;
            if (!templateElement) return;

            // Collect instance IDs from DOM (in order)
            const instances = container.querySelectorAll<HTMLElement>("[data-scms-instance]");
            const instanceIds: string[] = [];
            instances.forEach((instance) => {
                const id = instance.getAttribute("data-scms-instance");
                if (id) instanceIds.push(id);
            });

            // Check if template is inside a group
            const groupId = this.getGroupIdFromElement(container);

            // Get original HTML from loader (stored before content population)
            const templateHtml = container.getAttribute("data-scms-template-html") || templateElement.outerHTML;

            this.templates.set(templateId, {
                templateId,
                container,
                templateElement,
                templateHtml,
                groupId,
                instanceIds,
                instanceCount: instanceIds.length || 1,
            });

            // Initialize order array in content maps (for change detection)
            const orderKey = `${templateId}._order`;
            const contentKey = groupId ? `${groupId}:${orderKey}` : orderKey;
            const orderContent = JSON.stringify({ type: "order", value: instanceIds });
            this.originalContent.set(contentKey, orderContent);
            this.currentContent.set(contentKey, orderContent);
        });

        this.log.debug("Scanned templates", { count: this.templates.size });
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
        for (const infos of this.editableElements.values()) {
            for (const info of infos) {
                if (info.element.contains(target)) {
                    return;
                }
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

        this.editableElements.forEach((infos, key) => {
            const elementType = this.getEditableType(key);

            for (const info of infos) {
                info.element.classList.add("streamlined-editable");

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
                                this.startEditing(key, info.element);
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
            }
        });

        // Add click-outside handler to deselect elements
        document.addEventListener("click", this.handleDocumentClick);

        this.injectEditStyles();
        this.showTemplateControls();
        this.showToolbar();
    }

    private enableViewerMode(): void {
        this.log.debug("Entering viewer mode");

        this.editableElements.forEach((infos) => {
            for (const info of infos) {
                info.element.classList.remove("streamlined-editable", "streamlined-editing", "streamlined-editing-sibling");
                info.element.removeAttribute("contenteditable");
            }
        });

        // Remove click-outside handler
        document.removeEventListener("click", this.handleDocumentClick);

        this.hideTemplateControls();
        this.stopEditing();
        this.showToolbar();
    }

    /**
     * Show template add buttons and instance delete buttons
     */
    private showTemplateControls(): void {
        // Add "Add" button to each template container
        this.templates.forEach((templateInfo, templateId) => {
            if (this.templateAddButtons.has(templateId)) return;

            const addBtn = document.createElement("button");
            addBtn.className = "scms-template-add";
            addBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                Add item
            `;
            addBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.addInstance(templateId);
            });

            templateInfo.container.appendChild(addBtn);
            this.templateAddButtons.set(templateId, addBtn);
        });

        // Add delete buttons to existing instances (except instance 0 when it's the only one)
        this.templates.forEach((templateInfo) => {
            const { container } = templateInfo;
            container.querySelectorAll<HTMLElement>("[data-scms-instance]").forEach((instanceElement) => {
                if (!this.instanceDeleteButtons.has(instanceElement)) {
                    this.addInstanceDeleteButton(instanceElement);
                }
            });
        });
    }

    /**
     * Hide template add buttons and instance delete buttons
     */
    private hideTemplateControls(): void {
        // Remove all add buttons
        this.templateAddButtons.forEach((btn) => {
            btn.remove();
        });
        this.templateAddButtons.clear();

        // Remove all delete buttons
        this.templates.forEach((templateInfo) => {
            const { container } = templateInfo;
            container.querySelectorAll<HTMLElement>("[data-scms-instance]").forEach((instanceElement) => {
                const deleteBtn = this.instanceDeleteButtons.get(instanceElement);
                if (deleteBtn) {
                    deleteBtn.remove();
                    // WeakMap will clean up automatically when instanceElement is removed
                }
            });
        });
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

        this.editableElements.forEach((infos) => {
            for (const info of infos) {
                info.element.classList.remove("streamlined-editable", "streamlined-editing", "streamlined-editing-sibling");
                info.element.removeAttribute("contenteditable");
            }
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

            .streamlined-editing-sibling {
                outline: 2px solid #fca5a5;
                outline-offset: 2px;
            }

            /* Template instance controls */
            .scms-instance-delete {
                position: absolute;
                top: -8px;
                right: -8px;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                background: #ef4444;
                color: white;
                border: 2px solid white;
                font-size: 16px;
                line-height: 1;
                cursor: pointer;
                opacity: 0;
                transition: opacity 0.2s;
                z-index: 10;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            }

            .scms-instance-delete:hover {
                background: #dc2626;
            }

            [data-scms-instance]:hover > .scms-instance-delete {
                opacity: 1;
            }

            /* Template add button */
            .scms-template-add {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                width: 100%;
                padding: 12px;
                margin-top: 8px;
                border: 2px dashed #d1d5db;
                border-radius: 8px;
                background: transparent;
                color: #6b7280;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s;
            }

            .scms-template-add:hover {
                border-color: #ef4444;
                color: #ef4444;
                background: #fef2f2;
            }

            .scms-template-add svg {
                width: 16px;
                height: 16px;
            }
        `;
        document.head.appendChild(style);
    }

    private startEditing(key: string, clickedElement?: HTMLElement): void {
        const infos = this.editableElements.get(key);
        if (!infos || infos.length === 0) {
            this.log.warn("Element not found", { key });
            return;
        }

        // Use the clicked element, or first element if not specified
        const primaryInfo = clickedElement
            ? infos.find(i => i.element === clickedElement) || infos[0]
            : infos[0];

        const elementType = this.getEditableType(key);
        this.log.trace("Starting edit", { key, elementId: primaryInfo.elementId, groupId: primaryInfo.groupId, elementType, sharedCount: infos.length });

        // Stop editing previous element if any
        if (this.editingKey) {
            const prevInfos = this.editableElements.get(this.editingKey);
            if (prevInfos) {
                for (const prevInfo of prevInfos) {
                    prevInfo.element.classList.remove("streamlined-editing");
                    prevInfo.element.classList.remove("streamlined-editing-sibling");
                    prevInfo.element.setAttribute("contenteditable", "false");
                }
            }
        }

        // originalContent is already set during scanEditableElements
        // No need to snapshot here

        this.editingKey = key;

        // Set up editing state for all elements sharing this key
        for (const info of infos) {
            const isPrimary = info.element === primaryInfo.element;

            if (isPrimary) {
                info.element.classList.add("streamlined-editing");
            } else {
                // Sibling elements get subtle highlight
                info.element.classList.add("streamlined-editing-sibling");
            }

            // Add input listener to all elements for change tracking and synchronization
            if ((elementType === "text" || elementType === "html") && !info.element.dataset.scmsInputHandler) {
                info.element.addEventListener("input", () => {
                    // Update currentContent from DOM, then sync all elements
                    this.updateContentFromElement(key, info.element);
                    this.updateToolbarHasChanges();
                });
                info.element.dataset.scmsInputHandler = "true";
            }

            // Make text and html elements contenteditable (not images or links)
            // Only the primary element is focused, but all are editable for consistency
            if (elementType === "text" || elementType === "html") {
                info.element.setAttribute("contenteditable", "true");
            }
        }

        // Focus the primary element
        if (elementType === "text" || elementType === "html") {
            primaryInfo.element.focus();
        }

        // Update toolbar
        if (this.toolbar) {
            this.toolbar.activeElement = key;
            this.toolbar.activeElementType = elementType;
        }
    }

    /**
     * Update currentContent from a DOM element, then sync all DOM elements for that key.
     * This is the authoritative flow: DOM edit -> currentContent -> sync all DOM elements.
     */
    private updateContentFromElement(key: string, sourceElement: HTMLElement): void {
        const infos = this.editableElements.get(key);
        if (!infos || infos.length === 0) return;

        // Find the info for the source element to get proper content
        const sourceInfo = infos.find(i => i.element === sourceElement);
        if (!sourceInfo) return;

        // Update currentContent from the source element
        const content = this.getElementContent(key, sourceInfo);
        this.currentContent.set(key, content);

        // Sync all other DOM elements from currentContent
        this.syncAllElementsFromContent(key, sourceElement);
    }

    /**
     * Sync all DOM elements for a key from currentContent.
     * Optionally skip a source element (to avoid overwriting what user just typed).
     */
    private syncAllElementsFromContent(key: string, skipElement?: HTMLElement): void {
        const infos = this.editableElements.get(key);
        if (!infos) return;

        const content = this.currentContent.get(key);
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
    private setContent(key: string, content: string): void {
        this.currentContent.set(key, content);
        this.syncAllElementsFromContent(key);
    }

    private stopEditing(): void {
        if (!this.editingKey) {
            return;
        }

        this.log.trace("Stopping edit");

        const infos = this.editableElements.get(this.editingKey);
        if (infos) {
            for (const info of infos) {
                info.element.classList.remove("streamlined-editing");
                info.element.classList.remove("streamlined-editing-sibling");
                info.element.setAttribute("contenteditable", "false");
            }
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
     * Also extracts and applies attributes if present
     */
    private applyElementContent(key: string, info: EditableElementInfo, content: string): void {
        const elementType = this.getEditableType(key);

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
                // No type field in JSON - use element's declared type
                if (elementType === "link" && info.element instanceof HTMLAnchorElement) {
                    const linkData = data as { href?: string; target?: string; text?: string };
                    if (linkData.href !== undefined) {
                        info.element.href = linkData.href;
                        info.element.target = linkData.target || "";
                        info.element.textContent = linkData.text || "";
                        return;
                    }
                } else if (elementType === "image" && info.element instanceof HTMLImageElement) {
                    const imageData = data as { src?: string };
                    if (imageData.src !== undefined) {
                        info.element.src = imageData.src;
                        return;
                    }
                } else if (elementType === "text") {
                    const textData = data as { value?: string };
                    if (textData.value !== undefined) {
                        info.element.textContent = textData.value;
                        return;
                    }
                } else if (elementType === "html") {
                    const htmlData = data as { value?: string };
                    if (htmlData.value !== undefined) {
                        info.element.innerHTML = htmlData.value;
                        return;
                    }
                }
            }
        } catch {
            // Not JSON - ignore, content should always be JSON
        }
    }

    private getDirtyElements(): Map<string, { content: string; info: EditableElementInfo }> {
        const dirty = new Map<string, { content: string; info: EditableElementInfo }>();
        // Compare currentContent vs originalContent (not DOM)
        this.currentContent.forEach((current, key) => {
            const original = this.originalContent.get(key);
            if (original !== undefined && current !== original) {
                // Get info for the key (need it for save metadata)
                const infos = this.editableElements.get(key);
                const info = infos?.[0];
                if (info) {
                    dirty.set(key, { content: current, info });
                }
            }
        });
        return dirty;
    }

    /**
     * Get keys that are pending deletion (in originalContent but not in currentContent)
     */
    private getPendingDeletes(): string[] {
        const deletes: string[] = [];
        this.originalContent.forEach((_, key) => {
            if (!this.currentContent.has(key)) {
                deletes.push(key);
            }
        });
        return deletes;
    }

    /**
     * Check if there are any unsaved changes (dirty elements, pending deletes, or order changes)
     */
    private hasUnsavedChanges(): boolean {
        return this.getDirtyElements().size > 0 ||
            this.getPendingDeletes().length > 0 ||
            this.getTemplatesWithOrderChanges().length > 0;
    }

    private updateToolbarHasChanges(): void {
        if (this.toolbar) {
            this.toolbar.hasChanges = this.hasUnsavedChanges();
        }
    }

    private async handleSave(): Promise<void> {
        const dirtyElements = this.getDirtyElements();
        const pendingDeletes = this.getPendingDeletes();
        const hasOrderChanges = this.getTemplatesWithOrderChanges().length > 0;

        if (dirtyElements.size === 0 && pendingDeletes.length === 0 && !hasOrderChanges) {
            return;
        }
        if (this.saving) {
            return;
        }

        this.log.debug("Saving changes", {
            dirtyCount: dirtyElements.size,
            deleteCount: pendingDeletes.length,
            orderChanges: hasOrderChanges,
        });

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
        const deleted: string[] = [];

        try {
            // 1. Save all dirty elements in parallel
            const savePromises = Array.from(dirtyElements.entries()).map(
                async ([key, { content, info }]) => {
                    const storageElementId = info.templateId !== null && info.instanceId !== null
                        ? this.buildTemplateKey(info.templateId, info.instanceId, info.elementId)
                        : info.elementId;

                    const url = info.groupId
                        ? `${this.config.apiUrl}/apps/${this.config.appId}/content/groups/${info.groupId}/elements/${storageElementId}`
                        : `${this.config.apiUrl}/apps/${this.config.appId}/content/elements/${storageElementId}`;
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

            // 2. Delete pending deletes in parallel (derived from map comparison)
            const deletePromises = pendingDeletes.map(async (key) => {
                const { elementId, groupId } = this.parseStorageKey(key);

                const url = groupId
                    ? `${this.config.apiUrl}/apps/${this.config.appId}/content/groups/${groupId}/elements/${elementId}`
                    : `${this.config.apiUrl}/apps/${this.config.appId}/content/elements/${elementId}`;

                const response = await fetch(url, {
                    method: "DELETE",
                    headers: { Authorization: headers["Authorization"] },
                });

                if (!response.ok && response.status !== 404) {
                    throw new Error(`Delete ${key}: ${response.status} ${response.statusText}`);
                }

                // Remove from original content (currentContent already doesn't have it)
                this.originalContent.delete(key);
                deleted.push(key);
            });

            // 3. Save order arrays for templates that changed
            const orderPromises = this.getTemplatesWithOrderChanges().map(async (templateId) => {
                const templateInfo = this.templates.get(templateId);
                if (!templateInfo) return;

                const orderKey = `${templateId}._order`;
                const content = JSON.stringify({ type: "order", value: templateInfo.instanceIds });

                const url = templateInfo.groupId
                    ? `${this.config.apiUrl}/apps/${this.config.appId}/content/groups/${templateInfo.groupId}/elements/${orderKey}`
                    : `${this.config.apiUrl}/apps/${this.config.appId}/content/elements/${orderKey}`;

                const response = await fetch(url, {
                    method: "PUT",
                    headers,
                    body: JSON.stringify({ content }),
                });

                if (!response.ok) {
                    throw new Error(`Order ${templateId}: ${response.status} ${response.statusText}`);
                }

                // Update original order to match current
                const orderContentKey = templateInfo.groupId ? `${templateInfo.groupId}:${orderKey}` : orderKey;
                this.originalContent.set(orderContentKey, content);
                this.currentContent.set(orderContentKey, content);
            });

            // Run all operations in parallel
            const results = await Promise.allSettled([...savePromises, ...deletePromises, ...orderPromises]);

            results.forEach((result) => {
                if (result.status === "rejected") {
                    errors.push(result.reason?.message || "Unknown error");
                }
            });

            if (errors.length > 0) {
                this.log.error("Some operations failed", { errors });
                alert(`Failed to save some changes:\n${errors.join("\n")}`);
            } else {
                this.log.info("All changes saved", { saved: saved.length, deleted: deleted.length });
                this.stopEditing();
            }

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

    /**
     * Update currentContent for a template's order array
     */
    private updateOrderContent(templateId: string, templateInfo: TemplateInfo): void {
        const orderKey = `${templateId}._order`;
        const contentKey = templateInfo.groupId ? `${templateInfo.groupId}:${orderKey}` : orderKey;
        const orderContent = JSON.stringify({ type: "order", value: templateInfo.instanceIds });
        this.currentContent.set(contentKey, orderContent);
    }

    /**
     * Get template IDs that have order changes (currentContent differs from originalContent)
     */
    private getTemplatesWithOrderChanges(): string[] {
        const changed: string[] = [];
        this.templates.forEach((templateInfo, templateId) => {
            const orderKey = `${templateId}._order`;
            const contentKey = templateInfo.groupId ? `${templateInfo.groupId}:${orderKey}` : orderKey;
            const currentOrder = this.currentContent.get(contentKey);
            const originalOrder = this.originalContent.get(contentKey);
            if (currentOrder !== originalOrder) {
                changed.push(templateId);
            }
        });
        return changed;
    }

    private handleReset(): void {
        if (!this.editingKey) {
            return;
        }

        const key = this.editingKey;
        const originalContent = this.originalContent.get(key);
        const elementType = this.getEditableType(key);

        if (originalContent !== undefined) {
            this.log.debug("Resetting element", { key, elementType });
            // Restore currentContent from originalContent, then sync DOM
            this.currentContent.set(key, originalContent);
            this.syncAllElementsFromContent(key);
            this.updateToolbarHasChanges();
        }
    }

    private async handleChangeImage(): Promise<void> {
        if (!this.editingKey) {
            this.log.debug("No element selected for image change");
            return;
        }

        const key = this.editingKey;
        const infos = this.editableElements.get(key);
        if (!infos || infos.length === 0 || !(infos[0].element instanceof HTMLImageElement)) {
            this.log.warn("Selected element is not an image");
            return;
        }

        this.log.debug("Opening media manager for image change", { key, elementId: infos[0].elementId });

        const file = await this.openMediaManager();
        if (file) {
            // Build new content with updated src
            const attributes = this.elementAttributes.get(key);
            const data: ImageContentData = {
                type: "image",
                src: file.publicUrl,
                ...(attributes && Object.keys(attributes).length > 0 ? { attributes } : {}),
            };
            // Update via setContent - this updates currentContent and syncs all DOM elements
            this.setContent(key, JSON.stringify(data));
            this.updateToolbarHasChanges();
            this.log.debug("Image changed", { key, elementId: infos[0].elementId, newUrl: file.publicUrl, count: infos.length });
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
        const infos = this.editableElements.get(key);
        if (!infos || infos.length === 0) {
            return;
        }

        const primaryInfo = infos[0];
        this.log.debug("Opening HTML editor", { key, elementId: primaryInfo.elementId });

        // Create and show modal
        const modal = document.createElement("scms-html-editor-modal") as HtmlEditorModal;
        modal.elementId = primaryInfo.elementId;
        modal.content = primaryInfo.element.innerHTML;

        // Prevent clicks inside modal from deselecting the element
        modal.addEventListener("click", (e: Event) => {
            e.stopPropagation();
        });

        modal.addEventListener("apply", ((e: CustomEvent<{ content: string }>) => {
            // Build content and update via setContent
            const attributes = this.elementAttributes.get(key);
            const data: HtmlContentData = {
                type: "html",
                value: e.detail.content,
                ...(attributes && Object.keys(attributes).length > 0 ? { attributes } : {}),
            };
            this.setContent(key, JSON.stringify(data));
            this.closeHtmlEditor();
            this.updateToolbarHasChanges();
            this.log.debug("HTML applied", { key, elementId: primaryInfo.elementId, count: infos.length });
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
        const infos = this.editableElements.get(key);
        if (!infos || infos.length === 0 || !(infos[0].element instanceof HTMLAnchorElement)) {
            this.log.warn("Selected element is not a link");
            return;
        }

        const primaryInfo = infos[0];
        const primaryAnchor = primaryInfo.element as HTMLAnchorElement;
        this.log.debug("Opening link editor", { key, elementId: primaryInfo.elementId });

        // Create and show modal
        const modal = document.createElement("scms-link-editor-modal") as LinkEditorModal;
        modal.elementId = primaryInfo.elementId;
        modal.linkData = {
            href: primaryAnchor.href,
            target: primaryAnchor.target,
            text: primaryAnchor.textContent || "",
        };

        // Prevent clicks inside modal from deselecting the element
        modal.addEventListener("click", (e: Event) => {
            e.stopPropagation();
        });

        modal.addEventListener("apply", ((e: CustomEvent<{ linkData: LinkData }>) => {
            // Build content and update via setContent
            const attributes = this.elementAttributes.get(key);
            const data: LinkContentData = {
                type: "link",
                href: e.detail.linkData.href,
                target: e.detail.linkData.target,
                text: e.detail.linkData.text,
                ...(attributes && Object.keys(attributes).length > 0 ? { attributes } : {}),
            };
            this.setContent(key, JSON.stringify(data));
            this.closeLinkEditor();
            this.updateToolbarHasChanges();
            this.log.debug("Link updated", { key, elementId: primaryInfo.elementId, linkData: e.detail.linkData, count: infos.length });
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
        const infos = this.editableElements.get(key);
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
        const infos = this.editableElements.get(key);
        if (!infos || infos.length === 0) return;

        const primaryInfo = infos[0];
        const elementType = this.getEditableType(key);
        this.log.debug("Opening SEO modal", { key, elementId: primaryInfo.elementId, elementType });

        const modal = document.createElement("scms-seo-modal") as SeoModal;
        modal.elementId = primaryInfo.elementId;
        modal.elementType = elementType;
        modal.elementAttrs = this.getElementAttributes(key);

        modal.addEventListener("click", (e: Event) => e.stopPropagation());

        modal.addEventListener("apply", ((e: CustomEvent<{ attributes: ElementAttributes }>) => {
            this.elementAttributes.set(key, e.detail.attributes);
            // Apply attributes to all elements sharing this key
            for (const info of infos) {
                this.applyAttributesToElement(info.element, e.detail.attributes);
            }
            this.closeSeoModal();
            this.updateToolbarHasChanges();
            this.log.debug("SEO attributes applied", { key, attributes: e.detail.attributes, count: infos.length });
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
        const infos = this.editableElements.get(key);
        if (!infos || infos.length === 0) return;

        const primaryInfo = infos[0];
        const elementType = this.getEditableType(key);
        this.log.debug("Opening accessibility modal", { key, elementId: primaryInfo.elementId, elementType });

        const modal = document.createElement("scms-accessibility-modal") as AccessibilityModal;
        modal.elementId = primaryInfo.elementId;
        modal.elementType = elementType;
        modal.elementAttrs = this.getElementAttributes(key);

        modal.addEventListener("click", (e: Event) => e.stopPropagation());

        modal.addEventListener("apply", ((e: CustomEvent<{ attributes: ElementAttributes }>) => {
            this.elementAttributes.set(key, e.detail.attributes);
            // Apply attributes to all elements sharing this key
            for (const info of infos) {
                this.applyAttributesToElement(info.element, e.detail.attributes);
            }
            this.closeAccessibilityModal();
            this.updateToolbarHasChanges();
            this.log.debug("Accessibility attributes applied", { key, attributes: e.detail.attributes, count: infos.length });
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
        const infos = this.editableElements.get(key);
        if (!infos || infos.length === 0) return;

        const primaryInfo = infos[0];
        this.log.debug("Opening attributes modal", { key, elementId: primaryInfo.elementId });

        const modal = document.createElement("scms-attributes-modal") as AttributesModal;
        modal.elementId = primaryInfo.elementId;
        modal.elementAttrs = this.getElementAttributes(key);
        const { elementAttrs: elementDefinedAttrs, otherAttrs } = this.getDomAttributes(primaryInfo.element);
        modal.elementDefinedAttrs = elementDefinedAttrs;
        modal.otherAttrs = otherAttrs;

        modal.addEventListener("click", (e: Event) => e.stopPropagation());

        modal.addEventListener("apply", ((e: CustomEvent<{ attributes: ElementAttributes }>) => {
            this.elementAttributes.set(key, e.detail.attributes);
            // Apply attributes to all elements sharing this key
            for (const info of infos) {
                this.applyAttributesToElement(info.element, e.detail.attributes);
            }
            this.closeAttributesModal();
            this.updateToolbarHasChanges();
            this.log.debug("Custom attributes applied", { key, attributes: e.detail.attributes, count: infos.length });
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

    // ==================== Template Instance Management ====================

    /**
     * Add a new instance to a template
     */
    public addInstance(templateId: string): void {
        const templateInfo = this.templates.get(templateId);
        if (!templateInfo) {
            this.log.error("Template not found", { templateId });
            return;
        }

        const { container, templateHtml, groupId } = templateInfo;

        // Generate a new stable ID for this instance
        const newInstanceId = this.generateInstanceId();

        // Create new instance from original template HTML (with default content)
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = templateHtml;
        const clone = tempDiv.firstElementChild as HTMLElement;
        if (!clone) {
            this.log.error("Failed to create clone from template HTML");
            return;
        }

        clone.setAttribute("data-scms-instance", newInstanceId);
        clone.removeAttribute("data-scms-template");

        // Insert before the add button (which is the last child)
        const addButton = this.templateAddButtons.get(templateId);
        if (addButton && addButton.parentElement === container) {
            container.insertBefore(clone, addButton);
        } else {
            container.appendChild(clone);
        }

        // Update instance tracking
        templateInfo.instanceIds.push(newInstanceId);
        templateInfo.instanceCount = templateInfo.instanceIds.length;
        this.updateOrderContent(templateId, templateInfo);

        // Register editable elements in the new instance
        this.registerInstanceElements(clone, templateId, newInstanceId, groupId);

        // If in author mode, set up click handlers and styles for new elements
        if (this.currentMode === "author") {
            this.setupInstanceForAuthorMode(clone, templateId, newInstanceId);
        }

        this.log.debug("Added template instance", { templateId, instanceId: newInstanceId });

        // Mark as having unsaved changes (order array will be saved with other changes)
        this.updateToolbarHasChanges();

        // Notify toolbar that we're in a template context
        this.updateToolbarTemplateContext();
    }

    /**
     * Remove a template instance
     */
    public async removeInstance(templateId: string, instanceId: string): Promise<void> {
        const templateInfo = this.templates.get(templateId);
        if (!templateInfo) {
            this.log.error("Template not found", { templateId });
            return;
        }

        // Don't allow removing the last instance
        if (templateInfo.instanceCount <= 1) {
            this.log.warn("Cannot remove last template instance");
            return;
        }

        const { container } = templateInfo;

        // Find the instance element
        const instanceElement = container.querySelector<HTMLElement>(
            `[data-scms-instance="${instanceId}"]`
        );
        if (!instanceElement) {
            this.log.error("Instance element not found", { templateId, instanceId });
            return;
        }

        // Collect all element keys for this instance
        const keysToDelete: string[] = [];
        const selector = "[data-scms-text], [data-scms-html], [data-scms-image], [data-scms-link]";
        instanceElement.querySelectorAll<HTMLElement>(selector).forEach((el) => {
            const info = this.getEditableInfo(el);
            if (info) {
                const context = this.getStorageContext(el);
                const key = this.buildStorageKey(context, info.id);
                keysToDelete.push(key);
            }
        });

        // Stop editing if we're editing something in this instance
        if (this.editingKey && keysToDelete.includes(this.editingKey)) {
            this.stopEditing();
        }

        // Remove from DOM
        instanceElement.remove();

        // Update tracking - remove from currentContent to mark for deletion
        // (deletion is derived from: key in originalContent but not in currentContent)
        keysToDelete.forEach((key) => {
            const infos = this.editableElements.get(key);
            if (infos) {
                // Remove elements that were in this instance
                const remaining = infos.filter(info => info.instanceId !== instanceId);
                if (remaining.length > 0) {
                    this.editableElements.set(key, remaining);
                } else {
                    // No more DOM elements for this key
                    this.editableElements.delete(key);
                    this.editableTypes.delete(key);
                    // Remove from currentContent (will be detected as pending delete)
                    this.currentContent.delete(key);
                }
            }
        });

        // Update instance tracking (remove from order array)
        templateInfo.instanceIds = templateInfo.instanceIds.filter(id => id !== instanceId);
        templateInfo.instanceCount = templateInfo.instanceIds.length;
        this.updateOrderContent(templateId, templateInfo);

        // Mark order array as dirty (will be saved with other changes)
        this.updateToolbarHasChanges();

        this.log.debug("Removed template instance", { templateId, instanceId });

        // Update toolbar
        this.updateToolbarTemplateContext();
    }

    /**
     * Register editable elements from a new instance
     */
    private registerInstanceElements(
        instanceElement: HTMLElement,
        templateId: string,
        instanceId: string,
        groupId: string | null
    ): void {
        const selector = "[data-scms-text], [data-scms-html], [data-scms-image], [data-scms-link]";
        instanceElement.querySelectorAll<HTMLElement>(selector).forEach((element) => {
            const info = this.getEditableInfo(element);
            if (!info) return;

            // Determine context - check if element is in a group inside the template
            const elementGroupId = this.getGroupIdFromElement(element);
            const isGroupInsideTemplate = elementGroupId !== null && elementGroupId !== groupId;

            let context: { groupId: string | null; templateId: string | null; instanceId: string | null };
            if (isGroupInsideTemplate) {
                // Group inside template - ignore template context
                context = { groupId: elementGroupId, templateId: null, instanceId: null };
            } else {
                // Normal template element
                context = { groupId, templateId, instanceId };
            }

            const key = this.buildStorageKey(context, info.id);

            const elementInfo: EditableElementInfo = {
                element,
                elementId: info.id,
                groupId: context.groupId,
                templateId: context.templateId,
                instanceId: context.instanceId,
            };

            // Add to tracking
            const existing = this.editableElements.get(key);
            if (existing) {
                existing.push(elementInfo);
            } else {
                this.editableElements.set(key, [elementInfo]);
            }

            this.elementToKey.set(element, key);
            this.editableTypes.set(key, info.type);
        });
    }

    /**
     * Set up click handlers and styles for a new instance in author mode
     */
    private setupInstanceForAuthorMode(
        instanceElement: HTMLElement,
        _templateId: string,
        _instanceId: string
    ): void {
        const selector = "[data-scms-text], [data-scms-html], [data-scms-image], [data-scms-link]";
        instanceElement.querySelectorAll<HTMLElement>(selector).forEach((element) => {
            const key = this.elementToKey.get(element);
            if (!key) return;

            const elementType = this.getEditableType(key);

            element.classList.add("streamlined-editable");

            if (!element.dataset.scmsClickHandler) {
                element.addEventListener("click", (e) => {
                    if (this.currentMode === "author") {
                        e.preventDefault();
                        e.stopPropagation();

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
                            this.startEditing(key, element);
                            this.lastTapKey = key;
                            this.lastTapTime = now;
                        }
                    }
                });
                element.dataset.scmsClickHandler = "true";
            }

            // Double-click handlers for desktop
            if (elementType === "image" && !element.dataset.scmsDblClickHandler) {
                element.addEventListener("dblclick", (e) => {
                    if (this.currentMode === "author") {
                        e.preventDefault();
                        e.stopPropagation();
                        this.handleChangeImage();
                    }
                });
                element.dataset.scmsDblClickHandler = "true";
            }

            if (elementType === "link" && !element.dataset.scmsDblClickHandler) {
                element.addEventListener("dblclick", (e) => {
                    if (this.currentMode === "author") {
                        e.preventDefault();
                        e.stopPropagation();
                        this.handleGoToLink();
                    }
                });
                element.dataset.scmsDblClickHandler = "true";
            }
        });

        // Add delete button for this instance
        this.addInstanceDeleteButton(instanceElement);
    }

    /**
     * Add floating delete button to a template instance
     */
    private addInstanceDeleteButton(instanceElement: HTMLElement): void {
        // Get template info from instance
        const instanceId = instanceElement.getAttribute("data-scms-instance");
        if (!instanceId) return;

        const container = instanceElement.parentElement;
        if (!container) return;

        const templateId = container.getAttribute("data-scms-template");
        if (!templateId) return;

        // Don't add delete button if it's the only instance
        const templateInfo = this.templates.get(templateId);
        if (!templateInfo || templateInfo.instanceCount <= 1) {
            return;
        }

        // Create delete button
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "scms-instance-delete";
        deleteBtn.innerHTML = "×";
        deleteBtn.title = "Remove this item";
        deleteBtn.setAttribute("aria-label", "Remove this item");

        // Position relative to instance
        instanceElement.style.position = "relative";

        deleteBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.removeInstance(templateId, instanceId);
        });

        instanceElement.appendChild(deleteBtn);
        this.instanceDeleteButtons.set(instanceElement, deleteBtn);
    }

    /**
     * Update toolbar with current template context
     * TODO: Add templateContext property to Toolbar component
     */
    private updateToolbarTemplateContext(): void {
        // Placeholder for future toolbar integration
        // Will show add/remove controls when editing a template element
    }

    /**
     * Get info about a template (for toolbar use)
     */
    public getTemplateInfo(templateId: string): TemplateInfo | undefined {
        return this.templates.get(templateId);
    }

    /**
     * Get all templates
     */
    public getTemplates(): Map<string, TemplateInfo> {
        return this.templates;
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
