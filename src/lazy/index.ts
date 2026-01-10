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
import type { EditableType } from "../types.js";
import { buildTemplateKey, EDITABLE_SELECTOR } from "../types.js";

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
import "../components/help-panel.js";
import type { Toolbar } from "../components/toolbar.js";
import type { HelpPanel } from "../components/help-panel.js";
import { createEditorState, type EditorState, type EditableElementInfo } from "./state.js";
import { DraftManager } from "./draft-manager.js";
import { ContentManager } from "./content-manager.js";
import { TemplateManager } from "./template-manager.js";
import { EditingManager } from "./editing-manager.js";
import { ModalManager } from "./modal-manager.js";
import { SaveManager } from "./save-manager.js";
import { AuthManager } from "./auth-manager.js";
import { AuthBridge } from "./auth-bridge.js";
import { injectEditStyles } from "./styles.js";
import { normalizeWhitespace, normalizeHtmlWhitespace } from "./normalize.js";
import { TourManager, getTourDefinitions } from "./tours/index.js";

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

/**
 * Ready stages for the SDK lifecycle
 */
type ReadyStage = "loaded" | "auth" | "editing" | "bridges";

/**
 * Event types for SDK hooks
 */
type HookEvent = "signin" | "signout";

/**
 * Event handler function type
 */
type HookHandler = () => void;

class EditorController {
    static readonly version: string = __SDK_VERSION__;

    get version(): string {
        return EditorController.version;
    }

    private config: ViewerConfig;
    private log: Logger;
    private keyStorage: KeyStorage;
    private popupManager: PopupManager;
    private authBridge: AuthBridge;
    private state: EditorState;
    private draftManager: DraftManager;
    private contentManager: ContentManager;
    private templateManager: TemplateManager;
    private editingManager: EditingManager;
    private modalManager: ModalManager;
    private saveManager: SaveManager;
    private authManager: AuthManager;
    private tourManager: TourManager;
    // Reverse lookup: element -> key (for click handling) - WeakMap can't be reactive
    private elementToKey: WeakMap<HTMLElement, string> = new WeakMap();
    // Double-tap delay constant
    private readonly doubleTapDelay = 400; // ms
    // Spacer element to prevent toolbar from covering content
    private spacerElement: HTMLElement | null = null;
    // Loading indicator element
    private loadingIndicator: HTMLElement | null = null;
    // localStorage key for draft persistence (namespaced by app ID by default)
    private _draftStorageKey: string;

    // Stage promises for ready() API (initial load states only)
    private _loadedPromise: Promise<void>;
    private _loadedResolve!: () => void;
    private _authPromise: Promise<void>;
    private _authResolve!: () => void;
    private _editingPromise: Promise<void>;
    private _editingResolve!: () => void;
    private _bridgesPromise: Promise<void>;
    private _bridgesResolve!: () => void;

    // Event hooks
    private _eventHandlers: Map<HookEvent, Set<HookHandler>> = new Map();

    /** The app ID for this SDK instance */
    get appId(): string {
        return this.config.appId;
    }

    /** The localStorage key used for draft persistence */
    get draftStorageKey(): string {
        return this._draftStorageKey;
    }

    /** Whether the user is currently authenticated */
    get isAuthenticated(): boolean {
        return this.state.apiKey !== null;
    }

    /** The current editor mode */
    get mode(): EditorMode {
        return this.state.currentMode;
    }

    /** Whether editing is currently enabled */
    get editingEnabled(): boolean {
        return this.state.editingEnabled;
    }

    constructor(config: ViewerConfig) {
        this.config = config;
        this._draftStorageKey = config.draftStorageKey ?? `scms_draft_${config.appId}`;

        // Initialize stage promises (for initial load states only)
        this._loadedPromise = new Promise((resolve) => {
            this._loadedResolve = resolve;
        });
        this._authPromise = new Promise((resolve) => {
            this._authResolve = resolve;
        });
        this._editingPromise = new Promise((resolve) => {
            this._editingResolve = resolve;
        });
        this._bridgesPromise = new Promise((resolve) => {
            this._bridgesResolve = resolve;
        });

        // Create logger with configured level
        const logLevel = config.logLevel || "error";
        this.log = new Logger("StreamlinedCMS", logLevel);

        // Initialize reactive state
        this.state = createEditorState();

        // Initialize content manager
        this.contentManager = new ContentManager(this.state);

        // Initialize editing manager
        this.editingManager = new EditingManager(this.state, this.log, this.contentManager, {
            updateToolbarHasChanges: () => this.saveManager.updateToolbarHasChanges(),
            updateToolbarTemplateContext: () => this.templateManager.updateToolbarTemplateContext(),
            getElementToKeyMap: () => this.elementToKey,
            scrollToElement: this.scrollToElement.bind(this),
        });

        // Initialize modal manager
        this.modalManager = new ModalManager(
            this.state,
            this.log,
            this.contentManager,
            { appUrl: config.appUrl, appId: config.appId },
            {
                updateToolbarHasChanges: () => this.saveManager.updateToolbarHasChanges(),
            },
        );

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
            updateToolbarHasChanges: () => this.saveManager.updateToolbarHasChanges(),
            getElementToKeyMap: () => this.elementToKey,
            scrollToElement: this.scrollToElement.bind(this),
        });

        // Initialize draft manager
        this.draftManager = new DraftManager(this.state, this.log, this._draftStorageKey, {
            syncAllElementsFromContent: (key) =>
                this.contentManager.syncAllElementsFromContent(key),
            getEditableInfo: this.getEditableInfo.bind(this),
            getStorageContext: this.getStorageContext.bind(this),
            buildStorageKey: this.buildStorageKey.bind(this),
            registerInstanceElements: (element, templateId, instanceId, groupId) =>
                this.templateManager.registerInstanceElements(
                    element,
                    templateId,
                    instanceId,
                    groupId,
                ),
        });

        // Initialize save manager
        this.saveManager = new SaveManager(
            this.state,
            this.log,
            this.contentManager,
            this.draftManager,
            this.templateManager,
            this.editingManager,
            { apiUrl: config.apiUrl, appId: config.appId },
            {
                apiFetch: this.apiFetch.bind(this),
                signOut: (skip) => this.authManager.signOut(skip),
                fetchSavedContentKeys: this.fetchSavedContentKeys.bind(this),
                refetchPermissions: () => this.authManager.refetchPermissions(),
                disableEditing: this.disableEditing.bind(this),
                updateToolbarReadOnly: () => {
                    if (this.state.toolbar) {
                        this.state.toolbar.readOnly =
                            this.state.permissions?.contentWrite === false;
                    }
                },
            },
        );

        // Initialize key storage and popup manager
        this.keyStorage = new KeyStorage(config.appId);
        this.popupManager = new PopupManager({
            appId: config.appId,
            appUrl: config.appUrl,
        });

        // Initialize auth bridge (hidden iframe for cross-origin auth)
        this.authBridge = new AuthBridge({ appUrl: config.appUrl, appId: config.appId }, this.log);
        this.authBridge.init();

        // Initialize auth manager
        this.authManager = new AuthManager(
            this.state,
            this.log,
            this.keyStorage,
            this.popupManager,
            this.authBridge,
            {
                setMode: this.setMode.bind(this),
                enableEditing: this.enableEditing.bind(this),
                disableEditing: this.disableEditing.bind(this),
                fetchSavedContentKeys: this.fetchSavedContentKeys.bind(this),
                showToolbar: this.showToolbar.bind(this),
                removeToolbar: this.removeToolbar.bind(this),
                hasUnsavedChanges: () => this.saveManager.hasUnsavedChanges(),
                setToolbarWarning: (message) => {
                    if (this.state.toolbar) {
                        this.state.toolbar.warning = message;
                    }
                    if (message) {
                        this.state.domainWarningShown = true;
                    }
                },
                removeLoadingIndicator: () => this.removeLoadingIndicator(),
                emitSignIn: () => this.emit("signin"),
                emitSignOut: () => this.emit("signout"),
            },
        );

        // Initialize tour manager
        this.tourManager = new TourManager();
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

            this.log.debug("Fetched saved content keys", {
                count: this.state.savedContentKeys.size,
            });
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

        // Resolve 'loaded' stage - SDK module is loaded and controller created
        this._loadedResolve();

        // Show loading indicator while we wait for auth bridge
        this.showLoadingIndicator();

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

            // Resolve auth stage (mock auth is always authenticated)
            this._authResolve();

            this.modalManager.initMediaManagerModal();
            this.setMode("author");
            const success = await this.fetchSavedContentKeys();
            if (!success) {
                this.disableEditing();
            }

            // Resolve editing and bridges stages
            this._editingResolve();
            this._bridgesResolve();
            return;
        }

        // Set up auth UI based on stored state
        // This validates stored API key and sets this.state.apiKey if valid
        await this.authManager.setupAuthUI();

        // Resolve 'auth' stage - authentication status is now determined
        this._authResolve();

        // Initialize media manager modal (persistent, reused across selections)
        this.modalManager.initMediaManagerModal();

        // Resolve auth-dependent stages if authenticated
        // (If not authenticated, they stay pending - ready() will throw when called)
        if (this.isAuthenticated) {
            this._editingResolve();
            this._bridgesResolve();
        }

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
     * Build storage key from context and element ID
     */
    private buildStorageKey(
        context: { groupId: string | null; templateId: string | null; instanceId: string | null },
        elementId: string,
    ): string {
        if (context.templateId !== null && context.instanceId !== null) {
            const templateKey = buildTemplateKey(context.templateId, context.instanceId, elementId);
            return context.groupId ? `${context.groupId}:${templateKey}` : templateKey;
        } else {
            return context.groupId ? `${context.groupId}:${elementId}` : elementId;
        }
    }

    private scanEditableElements(): void {
        const selector = EDITABLE_SELECTOR;
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

    /**
     * Scroll an element into view, centered in the visible area below the toolbar.
     * Uses visualViewport when available to account for mobile keyboard.
     */
    private scrollToElement(element: HTMLElement, delay = 50): void {
        // Use setTimeout to allow DOM to settle after reorder/creation or keyboard to open
        setTimeout(() => {
            const toolbarHeight = this.state.toolbar?.offsetHeight ?? 60;

            // Two possible constraints on visible height:
            // 1. Window minus toolbar (when keyboard is closed)
            // 2. Visual viewport (when keyboard is open, it covers the toolbar)
            const windowMinusToolbar = window.innerHeight - toolbarHeight;
            const visualViewportHeight = window.visualViewport?.height ?? window.innerHeight;
            const visibleHeight = Math.min(windowMinusToolbar, visualViewportHeight);

            const viewportTop = window.visualViewport?.offsetTop ?? 0;
            const rect = element.getBoundingClientRect();
            const elementCenter = rect.top + rect.height / 2 - viewportTop;
            const targetCenter = visibleHeight / 2;
            const scrollOffset = elementCenter - targetCenter;

            window.scrollBy({ top: scrollOffset, behavior: "smooth" });
        }, delay);
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

    private handleDocumentClick = (e: Event): void => {
        const target = e.target as Node;

        // Check if clicking inside a template instance
        const clickedInstance = (target as Element).closest?.(
            "[data-scms-instance]",
        ) as HTMLElement | null;

        // Deselect instance if clicking outside all instances (but not if clicking toolbar)
        if (
            this.state.selectedInstance &&
            !clickedInstance &&
            !this.state.toolbar?.contains(target)
        ) {
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

        // Don't deselect if clicking inside any SCMS component (toolbar, modals, panels, etc.)
        if ((target as Element).closest?.(".scms-component")) {
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

    private setMode(mode: EditorMode): void {
        this.state.currentMode = mode;
        this.keyStorage.storeMode(mode);

        if (mode === "author") {
            this.log.debug("Entering author mode");
            // Only enable editing if user has contentWrite permission
            if (this.state.permissions?.contentWrite !== false) {
                this.enableEditing();
            } else {
                this.log.info("User lacks contentWrite permission, editing disabled");
            }
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
                    e.stopImmediatePropagation();

                    const isMobile = window.innerWidth < 640;

                    // Check for double-tap (mobile) on images and links
                    const now = Date.now();
                    const isDoubleTap =
                        this.state.lastTapKey === key &&
                        now - this.state.lastTapTime < this.doubleTapDelay;

                    if (isDoubleTap && isMobile) {
                        // Mobile double-tap: open media manager for images, navigate for links
                        // (Desktop uses native dblclick event instead)
                        if (elementType === "image") {
                            this.modalManager.handleChangeImage();
                        } else if (elementType === "link") {
                            this.modalManager.handleGoToLink();
                        }
                        this.state.lastTapKey = null;
                        this.state.lastTapTime = 0;
                    } else if (isMobile) {
                        // Mobile: images and links go straight to editing, others use two-step
                        if (elementType === "image" || elementType === "link") {
                            this.editingManager.startEditing(key, element);
                        } else if (
                            this.state.selectedKey === key &&
                            this.state.editingKey !== key
                        ) {
                            // Two-step: second tap edits
                            this.editingManager.startEditing(key, element);
                        } else {
                            // Two-step: first tap selects
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
                    e.stopImmediatePropagation();
                    this.modalManager.handleChangeImage();
                }
            });
            element.dataset.scmsDblClickHandler = "true";
        }

        // Double-click handler for links to navigate (desktop)
        if (elementType === "link" && !element.dataset.scmsDblClickHandler) {
            element.addEventListener("dblclick", (e) => {
                if (this.state.editingEnabled) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    this.modalManager.handleGoToLink();
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

        injectEditStyles();
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
        // Remove loading indicator if present
        this.removeLoadingIndicator();

        const isReadOnly = this.state.permissions?.contentWrite === false;
        const denyAppGui = this.state.permissions?.denyAppGui === true;

        // Update existing toolbar if present
        if (this.state.toolbar) {
            this.state.toolbar.mode = this.state.currentMode;
            this.state.toolbar.activeElement = this.state.editingKey;
            this.state.toolbar.readOnly = isReadOnly;
            this.state.toolbar.denyAppGui = denyAppGui;
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
        toolbar.readOnly = isReadOnly;
        toolbar.denyAppGui = denyAppGui;

        toolbar.addEventListener("mode-change", ((e: CustomEvent<{ mode: EditorMode }>) => {
            this.setMode(e.detail.mode);
        }) as EventListener);

        toolbar.addEventListener("save", () => {
            this.saveManager.handleSave();
        });

        toolbar.addEventListener("reset", () => {
            this.saveManager.handleReset();
        });

        toolbar.addEventListener("edit-html", () => {
            this.modalManager.handleEditHtml();
        });

        toolbar.addEventListener("change-image", () => {
            this.modalManager.handleChangeImage();
        });

        toolbar.addEventListener("edit-link", () => {
            this.modalManager.handleEditLink();
        });

        toolbar.addEventListener("go-to-link", () => {
            this.modalManager.handleGoToLink();
        });

        toolbar.addEventListener("sign-out", () => {
            this.authManager.signOut();
        });

        toolbar.addEventListener("edit-seo", () => {
            this.modalManager.handleEditSeo();
        });

        toolbar.addEventListener("edit-accessibility", () => {
            this.modalManager.handleEditAccessibility();
        });

        toolbar.addEventListener("edit-attributes", () => {
            this.modalManager.handleEditAttributes();
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

        toolbar.addEventListener("help", () => {
            this.handleHelp();
        });

        document.body.appendChild(toolbar);
        this.state.toolbar = toolbar;

        // Set initial hasChanges state (may be true if there are orphaned saved elements)
        this.saveManager.updateToolbarHasChanges();

        // Add body padding to prevent content overlap
        this.updateBodyPadding();
        window.addEventListener("resize", this.updateBodyPadding);
    }

    private updateBodyPadding = (): void => {
        const isMobile = window.innerWidth < 640;
        const height = isMobile ? TOOLBAR_HEIGHT_MOBILE : TOOLBAR_HEIGHT_DESKTOP;

        if (!this.spacerElement) {
            this.spacerElement = document.createElement("div");
            this.spacerElement.setAttribute("data-scms-spacer", "");
            this.spacerElement.style.cssText = "flex-shrink: 0; pointer-events: none;";
            document.body.appendChild(this.spacerElement);
        }
        this.spacerElement.style.height = `${height}px`;
    };

    private removeToolbar(): void {
        if (this.state.toolbar) {
            this.state.toolbar.remove();
            this.state.toolbar = null;
            window.removeEventListener("resize", this.updateBodyPadding);
        }
        if (this.spacerElement) {
            this.spacerElement.remove();
            this.spacerElement = null;
        }
    }

    /**
     * Show a loading indicator at the bottom of the page
     */
    private showLoadingIndicator(message = "Loading StreamlinedCMS editor..."): void {
        if (this.loadingIndicator) {
            // Update message if indicator already exists
            const span = this.loadingIndicator.querySelector("span");
            if (span) span.textContent = message;
            return;
        }

        const indicator = document.createElement("div");
        indicator.id = "scms-loading";
        indicator.innerHTML = `
            <style>
                #scms-loading {
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    height: 48px;
                    background: white;
                    color: #374151;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    font-size: 14px;
                    z-index: 10000;
                    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
                    border-top: 1px solid #e5e7eb;
                }
                #scms-loading .spinner {
                    width: 16px;
                    height: 16px;
                    border: 2px solid #e5e7eb;
                    border-top-color: #3b82f6;
                    border-radius: 50%;
                    animation: scms-spin 0.8s linear infinite;
                }
                @keyframes scms-spin {
                    to { transform: rotate(360deg); }
                }
            </style>
            <div class="spinner"></div>
            <span>${message}</span>
        `;
        document.body.appendChild(indicator);
        this.loadingIndicator = indicator;
    }

    /**
     * Remove the loading indicator
     */
    private removeLoadingIndicator(): void {
        if (this.loadingIndicator) {
            this.loadingIndicator.remove();
            this.loadingIndicator = null;
        }
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
            element.textContent = normalizeWhitespace(element.textContent || "");
        } else if (type === "html") {
            element.innerHTML = normalizeHtmlWhitespace(element.innerHTML);
        } else if (type === "link" && element instanceof HTMLAnchorElement) {
            element.innerHTML = normalizeHtmlWhitespace(element.innerHTML);
        }
        // image type doesn't need whitespace normalization
    }

    /**
     * Wait for a specific SDK lifecycle stage to complete.
     *
     * Stages:
     * - 'loaded': SDK module loaded, controller created (default)
     * - 'auth': Authentication status determined (check isAuthenticated after)
     * - 'editing': Editing setup complete (rejects if not authenticated at init)
     * - 'bridges': Penpal bridges ready for API calls (rejects if not authenticated at init)
     *
     * @throws Error if stage requires authentication but user was not authenticated at init
     */
    public async ready(stage: ReadyStage = "loaded"): Promise<void> {
        switch (stage) {
            case "loaded":
                return this._loadedPromise;
            case "auth":
                return this._authPromise;
            case "editing":
                await this._authPromise;
                if (!this.isAuthenticated) {
                    throw new Error("Not authenticated");
                }
                return this._editingPromise;
            case "bridges":
                await this._authPromise;
                if (!this.isAuthenticated) {
                    throw new Error("Not authenticated");
                }
                return this._bridgesPromise;
            default:
                throw new Error(`Unknown ready stage: ${stage}`);
        }
    }

    /**
     * Register an event handler for SDK lifecycle events.
     *
     * Events:
     * - 'signin': Fired when user signs in (via popup or programmatic)
     * - 'signout': Fired when user signs out
     */
    public on(event: HookEvent, handler: HookHandler): void {
        if (!this._eventHandlers.has(event)) {
            this._eventHandlers.set(event, new Set());
        }
        this._eventHandlers.get(event)!.add(handler);
    }

    /**
     * Unregister an event handler.
     */
    public off(event: HookEvent, handler: HookHandler): void {
        const handlers = this._eventHandlers.get(event);
        if (handlers) {
            handlers.delete(handler);
        }
    }

    /**
     * Emit an event to all registered handlers.
     */
    private emit(event: HookEvent): void {
        const handlers = this._eventHandlers.get(event);
        if (handlers) {
            for (const handler of handlers) {
                try {
                    handler();
                } catch (err) {
                    this.log.error(`Error in ${event} handler`, err);
                }
            }
        }
    }

    /**
     * Sign in programmatically with email and password.
     * This bypasses the login popup and authenticates directly via the auth bridge.
     * On success, stores the API key and enters author mode.
     *
     * @returns { success: true } on success, { success: false, error: string } on failure
     */
    public async signIn(
        email: string,
        password: string,
    ): Promise<{ success: true } | { success: false; error: string }> {
        this.showLoadingIndicator("Signing in...");

        const result = await this.authBridge.signIn(email, password);

        if (!result.valid) {
            this.removeLoadingIndicator();
            return { success: false, error: result.error };
        }

        // Success - store key and set up state
        this.state.apiKey = result.key;
        this.state.permissions = result.permissions;
        this.keyStorage.storeKey(result.key);

        // Remove default sign-in link if present
        const signInLink = document.getElementById("scms-signin-link");
        if (signInLink) signInLink.remove();

        // Convert all custom triggers to sign-out (mirrors auth-manager behavior)
        const customTriggers = document.querySelectorAll("[data-scms-signin]");
        customTriggers.forEach((trigger) => {
            this.state.customSignInTriggers.set(trigger, trigger.textContent || "");
            trigger.textContent = "Sign Out";
            trigger.addEventListener("click", (e) => {
                e.preventDefault();
                this.authManager.signOut();
            });
        });

        // Enter author mode
        this.setMode("author");
        const fetchSuccess = await this.fetchSavedContentKeys();
        if (!fetchSuccess) {
            this.disableEditing();
        }

        this.log.info("Programmatic sign-in successful");
        this.emit("signin");
        return { success: true };
    }

    /**
     * Open media manager for file selection
     * Returns selected file on success, null if user cancels or closes
     */
    public async openMediaManager(): Promise<MediaFile | null> {
        return this.modalManager.openMediaManager();
    }

    /**
     * Upload all data-scms-image elements to the media library.
     * This is a utility method for bulk uploading page images.
     * Call from console: StreamlinedCMS.uploadAllImages()
     */
    public async uploadAllImages(): Promise<{
        uploaded: MediaFile[];
        errors: Array<{ src: string; error: string }>;
    }> {
        if (!this.state.mediaManagerModal) {
            return { uploaded: [], errors: [{ src: "", error: "Media manager not initialized" }] };
        }
        return this.state.mediaManagerModal.uploadAllImages();
    }

    /**
     * Start a guided tour.
     *
     * Available tours:
     * - 'welcome': First-time onboarding tour
     * - 'text-editing': How to edit text elements
     * - 'image-editing': How to change images
     * - 'templates': How to work with repeating templates
     *
     * @example
     * StreamlinedCMS.startTour('welcome');
     */
    public startTour(tourId: string): void {
        // Fire and forget - tour loading is async but we don't need to wait
        this.tourManager.startTour(tourId);
    }

    /**
     * Stop the currently active tour, if any.
     */
    public stopTour(): void {
        this.tourManager.stopTour();
    }

    /**
     * Handle help button click - toggle help panel
     */
    private handleHelp(): void {
        this.toggleHelpPanel();
    }

    private helpPanel: HelpPanel | null = null;
    private helpPanelCloseHandler: ((e: MouseEvent) => void) | null = null;

    /**
     * Toggle the help panel visibility
     */
    private async toggleHelpPanel(): Promise<void> {
        // Remove existing panel if present
        if (this.helpPanel) {
            this.closeHelpPanel();
            return;
        }

        const panel = document.createElement("scms-help-panel") as HelpPanel;
        panel.loading = true;

        panel.addEventListener("close", () => this.closeHelpPanel());
        panel.addEventListener("tour-select", (e: Event) => {
            const tourId = (e as CustomEvent<{ tourId: string }>).detail.tourId;
            this.closeHelpPanel();
            this.startTour(tourId);
        });

        document.body.appendChild(panel);
        this.helpPanel = panel;

        // Close on click outside
        this.helpPanelCloseHandler = (e: MouseEvent) => {
            if (this.helpPanel && !this.helpPanel.contains(e.target as Node)) {
                this.closeHelpPanel();
            }
        };
        setTimeout(() => {
            document.addEventListener("click", this.helpPanelCloseHandler!);
        }, 0);

        // Load tours asynchronously
        const tourDefs = await getTourDefinitions();
        panel.tours = tourDefs;
        panel.loading = false;
    }

    /**
     * Close the help panel
     */
    private closeHelpPanel(): void {
        if (this.helpPanel) {
            this.helpPanel.remove();
            this.helpPanel = null;
        }
        if (this.helpPanelCloseHandler) {
            document.removeEventListener("click", this.helpPanelCloseHandler);
            this.helpPanelCloseHandler = null;
        }
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
    const controller = new EditorController(config);
    // Expose SDK on window immediately so ready() can be called during init
    (window as unknown as { StreamlinedCMS: EditorController }).StreamlinedCMS = controller;
    // Dispatch event to signal SDK is available on window
    document.dispatchEvent(new CustomEvent("streamlined-cms:ready"));
    controller.init();
}
