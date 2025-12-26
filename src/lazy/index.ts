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
import type {
    EditableType,
    HtmlContentData,
    ImageContentData,
    LinkContentData,
    BatchUpdateRequest,
    BatchUpdateResponse,
} from "../types.js";
import { parseTemplateKey } from "../types.js";

/**
 * Error thrown when an API request fails due to authentication issues (401/403)
 */
class AuthError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AuthError";
    }
}

/**
 * Maximum number of operations allowed in a single batch request
 */
const MAX_BATCH_OPERATIONS = 100;

/**
 * A single batch operation (save or delete)
 */
interface BatchOperation {
    groupId: string | null;
    elementId: string;
    content: string | null; // null = delete
}

/**
 * An atomic unit of operations that should stay together (e.g., template instance)
 */
interface AtomicUnit {
    /** Unique identifier for grouping (e.g., "templateId.instanceId" or "single:elementId") */
    unitId: string;
    operations: BatchOperation[];
}

/**
 * Group batch operations by atomic unit (template instances stay together)
 */
function groupByAtomicUnit(operations: BatchOperation[]): AtomicUnit[] {
    const unitMap = new Map<string, BatchOperation[]>();

    for (const op of operations) {
        // Check if this is a template element by parsing the elementId
        const parsed = parseTemplateKey(op.elementId);
        let unitId: string;

        if (parsed) {
            // Template element: group by templateId.instanceId (with groupId prefix if grouped)
            unitId = op.groupId
                ? `${op.groupId}:${parsed.templateId}.${parsed.instanceId}`
                : `${parsed.templateId}.${parsed.instanceId}`;
        } else if (op.elementId.endsWith("._order")) {
            // Order array: treat as its own unit (or group with template if we want)
            // For simplicity, treat order arrays as their own atomic unit
            unitId = op.groupId ? `${op.groupId}:${op.elementId}` : op.elementId;
        } else {
            // Non-template element: each is its own unit
            unitId = op.groupId ? `single:${op.groupId}:${op.elementId}` : `single:${op.elementId}`;
        }

        const existing = unitMap.get(unitId);
        if (existing) {
            existing.push(op);
        } else {
            unitMap.set(unitId, [op]);
        }
    }

    return Array.from(unitMap.entries()).map(([unitId, ops]) => ({
        unitId,
        operations: ops,
    }));
}

/**
 * Chunk atomic units into batches respecting the max operations limit.
 * Units larger than the limit are split with a console warning.
 */
function chunkAtomicUnits(units: AtomicUnit[], maxOps: number): BatchOperation[][] {
    const chunks: BatchOperation[][] = [];
    let currentChunk: BatchOperation[] = [];

    for (const unit of units) {
        if (unit.operations.length > maxOps) {
            // Large unit: warn and split it
            console.warn(
                `[StreamlinedCMS] Template instance "${unit.unitId}" has ${unit.operations.length} operations, ` +
                    `exceeding the batch limit of ${maxOps}. It will be split across multiple requests, ` +
                    `which may result in partial updates if an error occurs.`,
            );

            // Flush current chunk if not empty
            if (currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = [];
            }

            // Split the large unit into chunks
            for (let i = 0; i < unit.operations.length; i += maxOps) {
                chunks.push(unit.operations.slice(i, i + maxOps));
            }
        } else if (currentChunk.length + unit.operations.length > maxOps) {
            // Adding this unit would exceed limit, start a new chunk
            chunks.push(currentChunk);
            currentChunk = [...unit.operations];
        } else {
            // Add unit to current chunk
            currentChunk.push(...unit.operations);
        }
    }

    // Don't forget the last chunk
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    return chunks;
}

/**
 * Build a BatchUpdateRequest from a list of operations
 */
function buildBatchRequest(operations: BatchOperation[]): BatchUpdateRequest {
    const request: BatchUpdateRequest = {};

    for (const op of operations) {
        const value = op.content !== null ? { content: op.content } : null;

        if (op.groupId) {
            // Grouped element
            if (!request.groups) {
                request.groups = {};
            }
            if (!request.groups[op.groupId]) {
                request.groups[op.groupId] = { elements: {} };
            }
            request.groups[op.groupId].elements[op.elementId] = value;
        } else {
            // Ungrouped element
            if (!request.elements) {
                request.elements = {};
            }
            request.elements[op.elementId] = value;
        }
    }

    return request;
}

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
    /** Custom localStorage key for draft persistence. Defaults to `scms_draft_${appId}` */
    draftStorageKey?: string;
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
        mockAuth:
            scriptTag.dataset.mockAuth === "true"
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
import "../components/media-manager-modal.js";
import type { Toolbar } from "../components/toolbar.js";
import type { HtmlEditorModal } from "../components/html-editor-modal.js";
import type { LinkEditorModal, LinkData } from "../components/link-editor-modal.js";
import type { SeoModal } from "../components/seo-modal.js";
import type { AccessibilityModal } from "../components/accessibility-modal.js";
import type { AttributesModal } from "../components/attributes-modal.js";
import type { MediaManagerModal } from "../components/media-manager-modal.js";
import type { ElementAttributes } from "../types.js";
import {
    createEditorState,
    type EditorState,
    type EditableElementInfo,
} from "./state.js";
import { DraftManager } from "./draft-manager.js";
import { ContentManager } from "./content-manager.js";
import { TemplateManager } from "./template-manager.js";
import { EditingManager } from "./editing-manager.js";

// Toolbar height constants
const TOOLBAR_HEIGHT_DESKTOP = 48;
const TOOLBAR_HEIGHT_MOBILE = 56;

/**
 * Content response from API
 */
interface ContentResponse {
    elements: Record<string, { content: string }>;
    groups: Record<string, { elements: Record<string, { content: string }> }>;
}

class EditorController {
    static readonly version: string = __SDK_VERSION__;

    get version(): string {
        return EditorController.version;
    }

    private config: ViewerConfig;
    private log: Logger;
    private keyStorage: KeyStorage;
    private popupManager: PopupManager;
    private state: EditorState;
    private draftManager: DraftManager;
    private contentManager: ContentManager;
    private templateManager: TemplateManager;
    private editingManager: EditingManager;
    // Reverse lookup: element -> key (for click handling) - WeakMap can't be reactive
    private elementToKey: WeakMap<HTMLElement, string> = new WeakMap();
    // Double-tap delay constant
    private readonly doubleTapDelay = 400; // ms
    // localStorage key for draft persistence (namespaced by app ID by default)
    private _draftStorageKey: string;

    /** The app ID for this SDK instance */
    get appId(): string {
        return this.config.appId;
    }

    /** The localStorage key used for draft persistence */
    get draftStorageKey(): string {
        return this._draftStorageKey;
    }

    constructor(config: ViewerConfig) {
        this.config = config;
        this._draftStorageKey = config.draftStorageKey ?? `scms_draft_${config.appId}`;

        // Create logger with configured level
        const logLevel = config.logLevel || "error";
        this.log = new Logger("StreamlinedCMS", logLevel);

        // Initialize reactive state
        this.state = createEditorState();

        // Initialize content manager
        this.contentManager = new ContentManager(this.state, {
            getEditableType: this.getEditableType.bind(this),
            applyAttributesToElement: this.applyAttributesToElement.bind(this),
        });

        // Initialize editing manager
        this.editingManager = new EditingManager(this.state, this.log, this.contentManager, {
            getEditableType: this.getEditableType.bind(this),
            updateToolbarHasChanges: this.updateToolbarHasChanges.bind(this),
            updateToolbarTemplateContext: () => this.templateManager.updateToolbarTemplateContext(),
            getElementToKeyMap: () => this.elementToKey,
        });

        // Initialize template manager
        this.templateManager = new TemplateManager(this.state, this.log, this.contentManager, {
            getGroupIdFromElement: this.getGroupIdFromElement.bind(this),
            getEditableInfo: this.getEditableInfo.bind(this),
            getStorageContext: this.getStorageContext.bind(this),
            buildStorageKey: this.buildStorageKey.bind(this),
            normalizeDomWhitespace: this.normalizeDomWhitespace.bind(this),
            isInstanceAlsoEditable: this.isInstanceAlsoEditable.bind(this),
            setupElementClickHandler: this.setupElementClickHandler.bind(this),
            selectInstance: (el) => this.editingManager.selectInstance(el),
            stopEditing: () => this.editingManager.stopEditing(),
            updateToolbarHasChanges: this.updateToolbarHasChanges.bind(this),
            getElementToKeyMap: () => this.elementToKey,
        });

        // Initialize draft manager
        this.draftManager = new DraftManager(this.state, this.log, this._draftStorageKey, {
            syncAllElementsFromContent: (key) => this.contentManager.syncAllElementsFromContent(key),
            getEditableInfo: this.getEditableInfo.bind(this),
            getStorageContext: this.getStorageContext.bind(this),
            buildStorageKey: this.buildStorageKey.bind(this),
            registerInstanceElements: (element, templateId, instanceId, groupId) =>
                this.templateManager.registerInstanceElements(element, templateId, instanceId, groupId),
        });

        // Initialize key storage and popup manager
        this.keyStorage = new KeyStorage(config.appId);
        this.popupManager = new PopupManager({
            appId: config.appId,
            appUrl: config.appUrl,
        });
    }

    /**
     * Wrapper for fetch that handles common API error cases.
     * Shows warning on 402/403, clears it on success.
     */
    private async apiFetch(url: string, options?: RequestInit): Promise<Response> {
        const response = await fetch(url, options);

        // Show warning on 402 (payment required - upgrade needed for custom domain)
        if (response.status === 402 && !this.state.domainWarningShown) {
            if (this.state.toolbar) {
                const domain = window.location.hostname;
                this.state.toolbar.warning = `A paid plan is required to edit on live domains like "${domain}". See Admin → Billing.`;
            }
            this.state.domainWarningShown = true;
        }

        // Show warning on 403 (domain not whitelisted)
        if (response.status === 403 && !this.state.domainWarningShown) {
            if (this.state.toolbar) {
                const domain = window.location.hostname;
                this.state.toolbar.warning = `Domain "${domain}" is not whitelisted. Add it in Admin → Settings.`;
            }
            this.state.domainWarningShown = true;
        }

        // Clear warning on successful request (user may have fixed the issue in another tab)
        if (response.ok && this.state.domainWarningShown) {
            if (this.state.toolbar) {
                this.state.toolbar.warning = null;
            }
            this.state.domainWarningShown = false;
        }

        return response;
    }

    /**
     * Fetch content from API to determine which elements have saved content.
     * Elements with saved content should not have their whitespace normalized.
     * Returns true on success, false if access denied (402/403).
     */
    private async fetchSavedContentKeys(): Promise<boolean> {
        try {
            const url = `${this.config.apiUrl}/apps/${this.config.appId}/content`;
            const response = await this.apiFetch(url);

            if (response.status === 402 || response.status === 403) {
                // Access denied - apiFetch already showed warning
                return false;
            }

            if (!response.ok) {
                // Other error (404, 500, etc.) - all elements will be normalized
                return true;
            }

            const data = (await response.json()) as ContentResponse;

            // Collect all keys that have saved content
            // Ungrouped elements
            for (const elementId of Object.keys(data.elements)) {
                this.state.savedContentKeys.add(elementId);
            }

            // Grouped elements (key format: groupId:elementId)
            for (const [groupId, group] of Object.entries(data.groups)) {
                for (const elementId of Object.keys(group.elements)) {
                    this.state.savedContentKeys.add(`${groupId}:${elementId}`);
                }
            }

            this.log.debug("Fetched saved content keys", { count: this.state.savedContentKeys.size });
            return true;
        } catch (error) {
            this.log.warn("Could not fetch saved content keys", error);
            return true; // Network error - assume ok to avoid blocking editing
        }
    }

    async init(): Promise<void> {
        this.log.info("Lazy module initializing", {
            appId: this.config.appId,
        });

        // Scan for templates first (assigns instance IDs when no API data)
        this.templateManager.scanTemplates();

        // Then scan editable elements (needs instance IDs to build correct keys)
        this.scanEditableElements();

        // Restore any draft from localStorage (unsaved changes from previous session)
        this.draftManager.restoreDraftFromLocalStorage();

        // Check for mock auth
        if (this.config.mockAuth?.enabled) {
            this.state.apiKey = "mock-api-key";
            this.log.debug("Mock authentication enabled");
            this.initMediaManagerModal();
            this.setMode("author");
            const success = await this.fetchSavedContentKeys();
            if (!success) {
                this.disableEditing();
            }
            return;
        }

        // Set up auth UI based on stored state
        // This validates stored API key and sets this.state.apiKey if valid
        await this.setupAuthUI();

        // Initialize media manager modal (persistent, reused across selections)
        this.initMediaManagerModal();

        this.log.info("Lazy module initialized", {
            editableCount: this.state.editableElements.size,
            templateCount: this.state.templates.size,
            hasApiKey: !!this.state.apiKey,
            mode: this.state.currentMode,
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

        // Check element itself first (handles case where instance/group is on same element as data-scms-*)
        instanceId = element.getAttribute("data-scms-instance");
        groupId = element.getAttribute("data-scms-group");

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
        elementId: string,
    ): string {
        if (context.templateId !== null && context.instanceId !== null) {
            const templateKey = this.buildTemplateKey(
                context.templateId,
                context.instanceId,
                elementId,
            );
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
                const existing = this.state.editableElements.get(key);
                if (existing) {
                    existing.push(elementInfo);
                    // Sync the new element with existing content (e.g., group inside template)
                    const content = this.state.currentContent.get(key);
                    if (content) {
                        this.contentManager.applyElementContent(key, elementInfo, content);
                    }
                } else {
                    this.state.editableElements.set(key, [elementInfo]);

                    // Initialize content state from DOM (first element for this key)
                    // Type must be set before getElementContent is called
                    this.state.editableTypes.set(key, info.type);

                    // For elements without saved content, normalize whitespace in the DOM
                    // (to clean up DOM formatting from source HTML, but preserve user intent)
                    const hasSavedContent = this.state.savedContentKeys.has(key);
                    if (!hasSavedContent) {
                        this.normalizeDomWhitespace(elementInfo.element, info.type);
                    }

                    const content = this.contentManager.getElementContent(key, elementInfo);
                    this.state.originalContent.set(key, content);
                    this.state.currentContent.set(key, content);
                }

                // Reverse lookup for click handling
                this.elementToKey.set(element, key);

                // Type is the same for all elements sharing a key (may already be set above)
                if (!this.state.editableTypes.has(key)) {
                    this.state.editableTypes.set(key, info.type);
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

    /**
     * Check if a template instance element is also the editable element.
     * When true, we can't add inline controls (delete button, drag handle) inside it
     * because they would become part of the editable content.
     */
    private isInstanceAlsoEditable(instanceElement: HTMLElement): boolean {
        return (
            instanceElement.hasAttribute("data-scms-text") ||
            instanceElement.hasAttribute("data-scms-html") ||
            instanceElement.hasAttribute("data-scms-image") ||
            instanceElement.hasAttribute("data-scms-link")
        );
    }

    private getEditableType(key: string): EditableType {
        return this.state.editableTypes.get(key) || "html";
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

    private async setupAuthUI(): Promise<void> {
        const storedKey = this.keyStorage.getStoredKey();

        if (storedKey) {
            // Validate the stored key before trusting it
            const isValid = await this.validateApiKey(storedKey);
            if (!isValid) {
                this.log.info("Stored API key is no longer valid, clearing");
                this.keyStorage.clearStoredKey();
                this.showSignInLink();
                return;
            }

            this.state.apiKey = storedKey;
            this.updateMediaManagerApiKey();

            // Set up all custom triggers as sign-out
            const customTriggers = document.querySelectorAll("[data-scms-signin]");
            customTriggers.forEach((trigger) => {
                this.state.customSignInTriggers.set(trigger, trigger.textContent || "");
                trigger.textContent = "Sign Out";
                trigger.addEventListener("click", this.handleSignOutClick);
            });

            const storedMode = this.keyStorage.getStoredMode();
            const mode = storedMode === "author" ? "author" : "viewer";
            this.setMode(mode);
            if (mode === "author") {
                const success = await this.fetchSavedContentKeys();
                if (!success) {
                    this.disableEditing();
                }
            }
            this.log.debug("Restored auth state", {
                mode: this.state.currentMode,
                triggerCount: customTriggers.length,
            });
        } else {
            this.showSignInLink();
            this.log.debug("No valid API key, showing sign-in link");
        }
    }

    /**
     * Validate an API key by making a request to the keys/@me endpoint
     * Returns true if valid, false if invalid (401/403) or on network error
     */
    private async validateApiKey(apiKey: string): Promise<boolean> {
        try {
            const response = await fetch(
                `${this.config.apiUrl}/apps/${this.config.appId}/keys/@me`,
                {
                    headers: { Authorization: `Bearer ${apiKey}` },
                },
            );

            if (response.status === 401 || response.status === 403) {
                return false;
            }

            return response.ok;
        } catch (error) {
            this.log.warn("Failed to validate API key", error);
            // On network error, assume key is still valid to avoid logging user out
            return true;
        }
    }

    private showSignInLink(): void {
        this.removeToolbar();

        // Check for custom triggers
        const customTriggers = document.querySelectorAll("[data-scms-signin]");
        if (customTriggers.length > 0) {
            customTriggers.forEach((trigger) => {
                // Store original text if not already stored
                if (!this.state.customSignInTriggers.has(trigger)) {
                    this.state.customSignInTriggers.set(trigger, trigger.textContent || "");
                }
                // Restore original text
                const originalText = this.state.customSignInTriggers.get(trigger);
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
        const target = e.target as Node;

        // Check if clicking inside a template instance
        const clickedInstance = (target as Element).closest?.("[data-scms-instance]") as HTMLElement | null;

        // Deselect instance if clicking outside all instances
        if (this.state.selectedInstance && !clickedInstance) {
            this.editingManager.deselectInstance();
        }

        if (!this.state.editingKey && !this.state.selectedKey) return;

        // Don't deselect if clicking inside an editable element
        for (const infos of this.state.editableElements.values()) {
            for (const info of infos) {
                if (info.element.contains(target)) {
                    return;
                }
            }
        }

        // Don't deselect if clicking inside the toolbar
        if (this.state.toolbar?.contains(target)) {
            return;
        }

        // Stop editing and deselect
        this.editingManager.stopEditing();
        this.editingManager.deselectElement();

        // Clear toolbar
        if (this.state.toolbar) {
            this.state.toolbar.activeElement = null;
            this.state.toolbar.activeElementType = null;
        }
        this.templateManager.updateToolbarTemplateContext();
    };

    private async handleSignIn(): Promise<void> {
        this.log.debug("Opening login popup");

        const key = await this.popupManager.openLoginPopup();
        if (key) {
            this.state.apiKey = key;
            this.updateMediaManagerApiKey();
            this.keyStorage.storeKey(key);

            // Remove default sign-in link if present
            const signInLink = document.getElementById("scms-signin-link");
            if (signInLink) signInLink.remove();

            // Convert all custom triggers to sign-out
            this.state.customSignInTriggers.forEach((_, trigger) => {
                trigger.removeEventListener("click", this.handleSignInClick);
                trigger.textContent = "Sign Out";
                trigger.addEventListener("click", this.handleSignOutClick);
            });

            this.setMode("author");
            const success = await this.fetchSavedContentKeys();
            if (!success) {
                this.disableEditing();
            }

            this.log.info("User authenticated via popup, entering author mode");
        } else {
            this.log.debug("Login popup closed without authentication");
        }
    }

    private setMode(mode: EditorMode): void {
        this.state.currentMode = mode;
        this.keyStorage.storeMode(mode);

        if (mode === "author") {
            this.log.debug("Entering author mode");
            this.enableEditing();
        } else {
            this.log.debug("Entering viewer mode");
            this.disableEditing();
        }

        this.showToolbar();
    }

    /**
     * Set up click and double-click handlers for an editable element.
     * Shared by enableEditing() and setupInstanceForAuthorMode().
     */
    private setupElementClickHandler(element: HTMLElement, key: string): void {
        const elementType = this.getEditableType(key);

        if (!element.dataset.scmsClickHandler) {
            element.addEventListener("click", (e) => {
                if (this.state.editingEnabled) {
                    e.preventDefault();
                    e.stopPropagation();

                    const isMobile = window.innerWidth < 640;

                    // Check for double-tap (mobile) on images and links
                    const now = Date.now();
                    const isDoubleTap =
                        this.state.lastTapKey === key && now - this.state.lastTapTime < this.doubleTapDelay;

                    if (isDoubleTap && isMobile) {
                        // Mobile double-tap: open media manager for images, navigate for links
                        // (Desktop uses native dblclick event instead)
                        if (elementType === "image") {
                            this.handleChangeImage();
                        } else if (elementType === "link") {
                            this.handleGoToLink();
                        }
                        this.state.lastTapKey = null;
                        this.state.lastTapTime = 0;
                    } else if (isMobile) {
                        // Mobile two-step: first tap selects, second tap edits
                        if (this.state.selectedKey === key && this.state.editingKey !== key) {
                            this.editingManager.startEditing(key, element);
                        } else {
                            this.editingManager.selectElement(key, element);
                        }
                        this.state.lastTapKey = key;
                        this.state.lastTapTime = now;
                    } else {
                        // Desktop: edit immediately
                        this.editingManager.startEditing(key, element);
                        this.state.lastTapKey = key;
                        this.state.lastTapTime = now;
                    }
                }
            });
            element.dataset.scmsClickHandler = "true";
        }

        // Double-click handler for images to open media manager (desktop)
        if (elementType === "image" && !element.dataset.scmsDblClickHandler) {
            element.addEventListener("dblclick", (e) => {
                if (this.state.editingEnabled) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleChangeImage();
                }
            });
            element.dataset.scmsDblClickHandler = "true";
        }

        // Double-click handler for links to navigate (desktop)
        if (elementType === "link" && !element.dataset.scmsDblClickHandler) {
            element.addEventListener("dblclick", (e) => {
                if (this.state.editingEnabled) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleGoToLink();
                }
            });
            element.dataset.scmsDblClickHandler = "true";
        }
    }

    /**
     * Enable editing on elements - adds classes, handlers, template controls
     */
    private enableEditing(): void {
        if (this.state.editingEnabled) return;
        this.state.editingEnabled = true;

        this.state.editableElements.forEach((infos, key) => {
            for (const info of infos) {
                info.element.classList.add("streamlined-editable");
                this.setupElementClickHandler(info.element, key);
            }
        });

        // Add click-outside handler to deselect elements
        document.addEventListener("click", this.handleDocumentClick);

        this.injectEditStyles();
        this.templateManager.showTemplateControls();
    }

    /**
     * Disable editing on elements - removes classes, contenteditable, template controls
     */
    private disableEditing(): void {
        this.state.editingEnabled = false;

        this.state.editableElements.forEach((infos) => {
            for (const info of infos) {
                info.element.classList.remove(
                    "streamlined-editable",
                    "streamlined-selected",
                    "streamlined-selected-sibling",
                    "streamlined-editing",
                    "streamlined-editing-sibling",
                );
                info.element.removeAttribute("contenteditable");
            }
        });

        // Remove click-outside handler
        document.removeEventListener("click", this.handleDocumentClick);

        this.templateManager.hideTemplateControls();
        this.editingManager.deselectInstance();
        this.editingManager.deselectElement();
        this.editingManager.stopEditing();
    }

    private showToolbar(): void {
        // Update existing toolbar if present
        if (this.state.toolbar) {
            this.state.toolbar.mode = this.state.currentMode;
            this.state.toolbar.activeElement = this.state.editingKey;
            return;
        }

        // Create new toolbar
        const toolbar = document.createElement("scms-toolbar") as Toolbar;
        toolbar.id = "scms-toolbar";
        toolbar.mode = this.state.currentMode;
        toolbar.activeElement = this.state.editingKey;
        toolbar.appUrl = this.config.appUrl;
        toolbar.appId = this.config.appId;
        toolbar.mockAuth = this.config.mockAuth?.enabled ?? false;

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

        toolbar.addEventListener("add-instance", () => {
            this.templateManager.handleAddInstance();
        });

        toolbar.addEventListener("delete-instance", () => {
            this.templateManager.handleDeleteInstance();
        });

        toolbar.addEventListener("move-instance-up", () => {
            this.templateManager.handleMoveInstanceUp();
        });

        toolbar.addEventListener("move-instance-down", () => {
            this.templateManager.handleMoveInstanceDown();
        });

        document.body.appendChild(toolbar);
        this.state.toolbar = toolbar;

        // Set initial hasChanges state (may be true if there are orphaned saved elements)
        this.updateToolbarHasChanges();

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
        if (this.state.toolbar) {
            this.state.toolbar.remove();
            this.state.toolbar = null;
            document.body.style.paddingBottom = "";
            window.removeEventListener("resize", this.updateBodyPadding);
        }
    }

    private signOut(skipConfirmation = false): void {
        if (!skipConfirmation && this.hasUnsavedChanges()) {
            const confirmed = confirm("You have unsaved changes. Sign out anyway?");
            if (!confirmed) return;
        }

        this.log.info("Signing out");

        this.keyStorage.clearStoredKey();
        this.state.apiKey = null;
        this.updateMediaManagerApiKey();
        this.state.currentMode = "viewer";

        this.disableEditing();

        // Convert all custom triggers back to sign-in
        this.state.customSignInTriggers.forEach((originalText, trigger) => {
            trigger.removeEventListener("click", this.handleSignOutClick);
            trigger.textContent = originalText;
            trigger.addEventListener("click", this.handleSignInClick);
        });

        this.removeToolbar();

        // Only show default sign-in link if no custom triggers
        if (this.state.customSignInTriggers.size === 0) {
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
                outline-offset: -2px;
                transition: outline 0.2s;
                cursor: pointer;
                position: relative;
            }

            .streamlined-editable:hover {
                outline-color: #ef4444;
            }

            .streamlined-editable:empty::before {
                content: "Click to edit";
                color: #9ca3af;
                font-style: italic;
            }

            .streamlined-selected {
                outline: 2px solid #ef4444;
                outline-offset: -2px;
            }

            .streamlined-selected-sibling {
                outline: 2px solid #fca5a5;
                outline-offset: -2px;
            }

            .streamlined-editing {
                outline: 2px solid #ef4444;
                outline-offset: -2px;
            }

            .streamlined-editing-sibling {
                outline: 2px solid #fca5a5;
                outline-offset: -2px;
            }

            /* Template instance controls */
            .scms-instance-delete {
                position: absolute;
                top: 4px;
                right: 4px;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                background: rgba(0, 0, 0, 0.4);
                color: white;
                border: none;
                font-size: 18px;
                line-height: 1;
                cursor: pointer;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s, background 0.2s;
                z-index: 10;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .scms-instance-delete:hover {
                background: rgba(0, 0, 0, 0.6);
            }

            /* Desktop: show on hover */
            @media (hover: hover) {
                [data-scms-instance]:hover > .scms-instance-delete {
                    opacity: 1;
                    pointer-events: auto;
                }
            }

            /* Touch devices: show when instance is selected */
            @media (hover: none) {
                [data-scms-instance].scms-instance-selected > .scms-instance-delete {
                    opacity: 1;
                    pointer-events: auto;
                }
            }

            /* Template structure mismatch indicator */
            [data-scms-structure-mismatch] {
                outline: 2px dashed #f97316 !important;
                outline-offset: -2px;
                position: relative;
            }

            [data-scms-structure-mismatch]::after {
                content: "⚠";
                position: absolute;
                bottom: 4px;
                left: 4px;
                width: 20px;
                height: 20px;
                background: #f97316;
                color: white;
                border-radius: 50%;
                font-size: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10;
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

            /* Drag handle for reordering */
            .scms-instance-drag-handle {
                position: absolute;
                top: 4px;
                left: 4px;
                width: 24px;
                height: 24px;
                border-radius: 4px;
                background: transparent;
                color: rgba(0, 0, 0, 0.4);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: grab;
                opacity: 0;
                transition: opacity 0.2s, background 0.2s, color 0.2s;
                z-index: 10;
            }

            .scms-instance-drag-handle:hover {
                background: rgba(0, 0, 0, 0.1);
                color: rgba(0, 0, 0, 0.6);
            }

            .scms-instance-drag-handle:active {
                cursor: grabbing;
            }

            /* Desktop: show on hover */
            @media (hover: hover) {
                [data-scms-instance]:hover > .scms-instance-drag-handle {
                    opacity: 1;
                }
            }

            /* Touch devices: show when instance is selected */
            @media (hover: none) {
                [data-scms-instance].scms-instance-selected > .scms-instance-drag-handle {
                    opacity: 1;
                }
            }

            .scms-instance-drag-handle svg {
                width: 16px;
                height: 16px;
            }

            /* SortableJS classes */
            .scms-sortable-ghost {
                opacity: 0.4;
            }

            .scms-sortable-chosen {
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            }

            .scms-sortable-drag {
                opacity: 1;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Check if there are any unsaved changes (dirty elements, pending deletes, or order changes)
     */
    private hasUnsavedChanges(): boolean {
        return (
            this.contentManager.getDirtyElements().size > 0 ||
            this.draftManager.getPendingDeletes().length > 0 ||
            this.templateManager.getTemplatesWithOrderChanges().length > 0
        );
    }

    private updateToolbarHasChanges(): void {
        if (this.state.toolbar) {
            this.state.toolbar.hasChanges = this.hasUnsavedChanges();
        }
        this.draftManager.saveDraftToLocalStorage();
    }

    private async handleSave(): Promise<void> {
        const dirtyElements = this.contentManager.getDirtyElements();
        const pendingDeletes = this.draftManager.getPendingDeletes();
        const templatesWithOrderChanges = this.templateManager.getTemplatesWithOrderChanges();
        const hasOrderChanges = templatesWithOrderChanges.length > 0;

        // Get unsaved template elements (HTML-derived items that need to be persisted
        // when the template order changes)
        const unsavedTemplateElements = this.contentManager.getUnsavedTemplateElements(templatesWithOrderChanges);

        if (dirtyElements.size === 0 && pendingDeletes.length === 0 && !hasOrderChanges) {
            return;
        }
        if (this.state.saving) {
            return;
        }

        this.log.debug("Saving changes", {
            dirtyCount: dirtyElements.size,
            unsavedTemplateCount: unsavedTemplateElements.size,
            deleteCount: pendingDeletes.length,
            orderChanges: hasOrderChanges,
        });

        this.state.saving = true;
        if (this.state.toolbar) {
            this.state.toolbar.saving = true;
        }

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (this.state.apiKey) {
            headers["Authorization"] = `Bearer ${this.state.apiKey}`;
        }

        const errors: string[] = [];
        const saved: string[] = [];
        const deleted: string[] = [];

        try {
            // Collect all operations into a flat list
            const operations: BatchOperation[] = [];

            // 1. Collect save operations (dirty elements + unsaved template elements)
            const elementsToSave = new Map(unsavedTemplateElements);
            dirtyElements.forEach((value, key) => elementsToSave.set(key, value));

            for (const [, { content, info }] of elementsToSave) {
                const storageElementId =
                    info.templateId !== null && info.instanceId !== null
                        ? this.buildTemplateKey(info.templateId, info.instanceId, info.elementId)
                        : info.elementId;

                operations.push({
                    groupId: info.groupId,
                    elementId: storageElementId,
                    content: content,
                });
            }

            // 2. Collect delete operations
            for (const key of pendingDeletes) {
                const { elementId, groupId } = this.parseStorageKey(key);
                operations.push({
                    groupId,
                    elementId,
                    content: null, // null = delete
                });
            }

            // 3. Collect order array operations
            for (const templateId of templatesWithOrderChanges) {
                const templateInfo = this.state.templates.get(templateId);
                if (!templateInfo) continue;

                const orderKey = `${templateId}._order`;
                const content = JSON.stringify({ type: "order", value: templateInfo.instanceIds });

                operations.push({
                    groupId: templateInfo.groupId,
                    elementId: orderKey,
                    content,
                });
            }

            // Group by atomic unit (template instances stay together)
            const atomicUnits = groupByAtomicUnit(operations);

            // Chunk into batches respecting the max operations limit
            const chunks = chunkAtomicUnits(atomicUnits, MAX_BATCH_OPERATIONS);

            this.log.debug("Batch save", {
                totalOperations: operations.length,
                atomicUnits: atomicUnits.length,
                chunks: chunks.length,
            });

            // Execute chunks sequentially
            const batchUrl = `${this.config.apiUrl}/apps/${this.config.appId}/content`;

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const request = buildBatchRequest(chunk);

                this.log.debug(`Executing batch ${i + 1}/${chunks.length}`, {
                    operations: chunk.length,
                });

                const response = await this.apiFetch(batchUrl, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify(request),
                });

                if (!response.ok) {
                    if (response.status === 401 || response.status === 403) {
                        throw new AuthError(`Batch ${i + 1}: ${response.status} ${response.statusText}`);
                    }
                    throw new Error(`Batch ${i + 1}: ${response.status} ${response.statusText}`);
                }

                const result = (await response.json()) as BatchUpdateResponse;

                // Process saved elements from response
                for (const [elementId, element] of Object.entries(result.elements ?? {})) {
                    const key = elementId;
                    this.state.originalContent.set(key, element.content);
                    this.state.savedContentKeys.add(key);
                    saved.push(key);
                }

                // Process saved grouped elements from response
                for (const [groupId, group] of Object.entries(result.groups ?? {})) {
                    for (const [elementId, element] of Object.entries(group.elements)) {
                        const key = `${groupId}:${elementId}`;
                        this.state.originalContent.set(key, element.content);
                        this.state.savedContentKeys.add(key);
                        saved.push(key);
                    }
                }

                // Process deleted elements from response
                for (const elementId of result.deleted?.elements ?? []) {
                    const key = elementId;
                    this.state.originalContent.delete(key);
                    this.state.savedContentKeys.delete(key);
                    deleted.push(key);
                }

                // Process deleted grouped elements from response
                for (const [groupId, elementIds] of Object.entries(result.deleted?.groups ?? {})) {
                    for (const elementId of elementIds) {
                        const key = `${groupId}:${elementId}`;
                        this.state.originalContent.delete(key);
                        this.state.savedContentKeys.delete(key);
                        deleted.push(key);
                    }
                }

                // Update currentContent for order arrays
                for (const templateId of templatesWithOrderChanges) {
                    const templateInfo = this.state.templates.get(templateId);
                    if (!templateInfo) continue;

                    const orderKey = `${templateId}._order`;
                    const orderContentKey = templateInfo.groupId
                        ? `${templateInfo.groupId}:${orderKey}`
                        : orderKey;
                    const orderContent = JSON.stringify({
                        type: "order",
                        value: templateInfo.instanceIds,
                    });
                    this.state.currentContent.set(orderContentKey, orderContent);
                }
            }

            if (errors.length > 0) {
                this.log.error("Some operations failed", { errors });
                alert(`Failed to save some changes:\n${errors.join("\n")}`);
            } else {
                this.log.info("All changes saved", {
                    saved: saved.length,
                    deleted: deleted.length,
                });
                this.editingManager.stopEditing();

                // Refresh saved content keys after successful save
                await this.fetchSavedContentKeys();

                // Clear draft from localStorage after successful save
                this.draftManager.clearDraft();
            }

            this.updateToolbarHasChanges();
        } catch (error) {
            if (error instanceof AuthError) {
                this.log.error("Authentication failed during save", { error: error.message });
                alert("Your session has expired. Please sign in again to save your changes.");
                this.signOut(true); // Skip "unsaved changes" confirmation
                return;
            }
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.log.error("Failed to save content", error);
            alert(`Failed to save: ${errorMessage}\n\nCheck console for details.`);
        } finally {
            this.state.saving = false;
            if (this.state.toolbar) {
                this.state.toolbar.saving = false;
            }
        }
    }

    private handleReset(): void {
        if (!this.state.selectedKey) {
            return;
        }

        const key = this.state.selectedKey;
        const originalContent = this.state.originalContent.get(key);
        const elementType = this.getEditableType(key);

        if (originalContent !== undefined) {
            this.log.debug("Resetting element", { key, elementType });
            // Restore currentContent from originalContent, then sync DOM
            this.state.currentContent.set(key, originalContent);
            this.contentManager.syncAllElementsFromContent(key);
            this.updateToolbarHasChanges();
        }
    }

    private async handleChangeImage(): Promise<void> {
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

        this.log.debug("Opening media manager for image change", {
            key,
            elementId: infos[0].elementId,
        });

        const file = await this.openMediaManager();
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
            this.updateToolbarHasChanges();
            this.log.debug("Image changed", {
                key,
                elementId: infos[0].elementId,
                newUrl: file.publicUrl,
                count: infos.length,
            });
        }
    }

    private handleEditHtml(): void {
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
        modal.elementId = primaryInfo.elementId;
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
            this.closeHtmlEditor();
            this.updateToolbarHasChanges();
            this.log.debug("HTML applied", {
                key,
                elementId: primaryInfo.elementId,
                count: infos.length,
            });
        }) as EventListener);

        modal.addEventListener("cancel", () => {
            this.closeHtmlEditor();
        });

        document.body.appendChild(modal);
        this.state.htmlEditorModal = modal;
    }

    private closeHtmlEditor(): void {
        if (this.state.htmlEditorModal) {
            this.state.htmlEditorModal.remove();
            this.state.htmlEditorModal = null;
        }
    }

    private handleEditLink(): void {
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
        modal.elementId = primaryInfo.elementId;
        modal.linkData = {
            href: primaryAnchor.href,
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
            this.closeLinkEditor();
            this.updateToolbarHasChanges();
            this.log.debug("Link updated", {
                key,
                elementId: primaryInfo.elementId,
                linkData: e.detail.linkData,
                count: infos.length,
            });
        }) as EventListener);

        modal.addEventListener("cancel", () => {
            this.closeLinkEditor();
        });

        document.body.appendChild(modal);
        this.state.linkEditorModal = modal;
    }

    private closeLinkEditor(): void {
        if (this.state.linkEditorModal) {
            this.state.linkEditorModal.remove();
            this.state.linkEditorModal = null;
        }
    }

    private handleGoToLink(): void {
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

    private getElementAttributes(key: string): ElementAttributes {
        return this.state.elementAttributes.get(key) || {};
    }

    /**
     * Element attributes are core attributes that define what the element is
     * (e.g., src for images, href/target for links)
     */
    private static readonly ELEMENT_ATTRIBUTES = ["src", "href", "target"];

    /**
     * Normalize whitespace in text content from DOM.
     * Collapses multiple whitespace characters (including newlines from HTML formatting)
     * into single spaces and trims leading/trailing whitespace.
     */
    private normalizeWhitespace(text: string): string {
        return text.replace(/\s+/g, " ").trim();
    }

    /**
     * Normalize HTML whitespace from DOM innerHTML.
     * Collapses runs of whitespace between tags into single spaces,
     * and trims leading/trailing whitespace.
     */
    private normalizeHtmlWhitespace(html: string): string {
        return html.replace(/>\s+</g, "> <").replace(/\s+/g, " ").trim();
    }

    /**
     * Normalize whitespace directly in the DOM for an element.
     * Called on load for elements without saved content to clean up source HTML formatting.
     */
    private normalizeDomWhitespace(element: HTMLElement, type: EditableType): void {
        if (type === "text") {
            // Check for actual HTML elements (not just entity-encoded text like &amp;)
            const hasHtmlElements = Array.from(element.childNodes).some(
                (node) => node.nodeType === Node.ELEMENT_NODE,
            );
            if (hasHtmlElements) {
                const id = element.getAttribute("data-scms-text");
                this.log.warn(
                    `Element "${id}" has data-scms-text but contains HTML. Use data-scms-html to preserve formatting.`,
                    { innerHTML: element.innerHTML },
                );
            }
            element.textContent = this.normalizeWhitespace(element.textContent || "");
        } else if (type === "html") {
            element.innerHTML = this.normalizeHtmlWhitespace(element.innerHTML);
        } else if (type === "link" && element instanceof HTMLAnchorElement) {
            element.innerHTML = this.normalizeHtmlWhitespace(element.innerHTML);
        }
        // image type doesn't need whitespace normalization
    }

    /** Reserved attributes that should be shown but not editable */
    private static readonly RESERVED_ATTRIBUTES = ["class", "id", "style"];

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
            if (EditorController.ELEMENT_ATTRIBUTES.includes(attr.name)) {
                elementAttrs[attr.name] = attr.value;
            } else if (EditorController.RESERVED_ATTRIBUTES.includes(attr.name)) {
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
        attributeFilter?: string[],
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

    /** SEO-related attribute names */
    private static readonly SEO_ATTRIBUTES = ["alt", "title", "rel"];

    /** Accessibility-related attribute names */
    private static readonly ACCESSIBILITY_ATTRIBUTES = [
        "aria-label",
        "aria-describedby",
        "role",
        "tabindex",
    ];

    private handleEditSeo(): void {
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
        const elementType = this.getEditableType(key);
        this.log.debug("Opening SEO modal", { key, elementId: primaryInfo.elementId, elementType });

        const modal = document.createElement("scms-seo-modal") as SeoModal;
        modal.elementId = primaryInfo.elementId;
        modal.elementType = elementType;
        // Merge DOM attributes (as defaults) with stored attributes (take precedence)
        modal.elementAttrs = this.getMergedAttributes(
            key,
            primaryInfo.element,
            EditorController.SEO_ATTRIBUTES,
        );

        modal.addEventListener("click", (e: Event) => e.stopPropagation());

        modal.addEventListener("apply", ((e: CustomEvent<{ attributes: ElementAttributes }>) => {
            this.state.elementAttributes.set(key, e.detail.attributes);
            // Apply attributes to all elements sharing this key
            for (const info of infos) {
                this.applyAttributesToElement(info.element, e.detail.attributes);
            }
            this.closeSeoModal();
            this.updateToolbarHasChanges();
            this.log.debug("SEO attributes applied", {
                key,
                attributes: e.detail.attributes,
                count: infos.length,
            });
        }) as EventListener);

        modal.addEventListener("cancel", () => this.closeSeoModal());

        document.body.appendChild(modal);
        this.state.seoModal = modal;
    }

    private closeSeoModal(): void {
        if (this.state.seoModal) {
            this.state.seoModal.remove();
            this.state.seoModal = null;
        }
    }

    private handleEditAccessibility(): void {
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
        const elementType = this.getEditableType(key);
        this.log.debug("Opening accessibility modal", {
            key,
            elementId: primaryInfo.elementId,
            elementType,
        });

        const modal = document.createElement("scms-accessibility-modal") as AccessibilityModal;
        modal.elementId = primaryInfo.elementId;
        modal.elementType = elementType;
        // Merge DOM attributes (as defaults) with stored attributes (take precedence)
        modal.elementAttrs = this.getMergedAttributes(
            key,
            primaryInfo.element,
            EditorController.ACCESSIBILITY_ATTRIBUTES,
        );

        modal.addEventListener("click", (e: Event) => e.stopPropagation());

        modal.addEventListener("apply", ((e: CustomEvent<{ attributes: ElementAttributes }>) => {
            this.state.elementAttributes.set(key, e.detail.attributes);
            // Apply attributes to all elements sharing this key
            for (const info of infos) {
                this.applyAttributesToElement(info.element, e.detail.attributes);
            }
            this.closeAccessibilityModal();
            this.updateToolbarHasChanges();
            this.log.debug("Accessibility attributes applied", {
                key,
                attributes: e.detail.attributes,
                count: infos.length,
            });
        }) as EventListener);

        modal.addEventListener("cancel", () => this.closeAccessibilityModal());

        document.body.appendChild(modal);
        this.state.accessibilityModal = modal;
    }

    private closeAccessibilityModal(): void {
        if (this.state.accessibilityModal) {
            this.state.accessibilityModal.remove();
            this.state.accessibilityModal = null;
        }
    }

    private handleEditAttributes(): void {
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
        modal.elementId = primaryInfo.elementId;
        modal.elementAttrs = this.getElementAttributes(key);
        const { elementAttrs: elementDefinedAttrs, reservedAttrs, otherAttrs } = this.getDomAttributes(
            primaryInfo.element,
        );
        modal.elementDefinedAttrs = elementDefinedAttrs;
        modal.reservedAttrs = reservedAttrs;
        modal.otherAttrs = otherAttrs;

        modal.addEventListener("click", (e: Event) => e.stopPropagation());

        modal.addEventListener("apply", ((e: CustomEvent<{ attributes: ElementAttributes }>) => {
            this.state.elementAttributes.set(key, e.detail.attributes);
            // Apply attributes to all elements sharing this key
            for (const info of infos) {
                this.applyAttributesToElement(info.element, e.detail.attributes);
            }
            this.closeAttributesModal();
            this.updateToolbarHasChanges();
            this.log.debug("Custom attributes applied", {
                key,
                attributes: e.detail.attributes,
                count: infos.length,
            });
        }) as EventListener);

        modal.addEventListener("cancel", () => this.closeAttributesModal());

        document.body.appendChild(modal);
        this.state.attributesModal = modal;
    }

    private closeAttributesModal(): void {
        if (this.state.attributesModal) {
            this.state.attributesModal.remove();
            this.state.attributesModal = null;
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
     * Initialize the persistent media manager modal
     */
    private initMediaManagerModal(): void {
        const modal = document.createElement("scms-media-manager-modal") as MediaManagerModal;
        modal.appUrl = this.config.appUrl;
        modal.appId = this.config.appId;
        if (this.state.apiKey) {
            modal.apiKey = this.state.apiKey;
        }
        document.body.appendChild(modal);
        this.state.mediaManagerModal = modal;
        this.log.debug("Media manager modal initialized");
    }

    private updateMediaManagerApiKey(): void {
        if (this.state.mediaManagerModal) {
            this.state.mediaManagerModal.apiKey = this.state.apiKey || "";
        }
    }

    /**
     * Open media manager for file selection
     * Returns selected file on success, null if user cancels or closes
     */
    public async openMediaManager(): Promise<MediaFile | null> {
        if (!this.state.mediaManagerModal) {
            this.log.warn("Media manager modal not initialized");
            return null;
        }

        this.log.debug("Opening media manager");
        const file = await this.state.mediaManagerModal.selectMedia();
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
