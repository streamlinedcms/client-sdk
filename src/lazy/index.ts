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
import Sortable from "sortablejs";
import { KeyStorage, type EditorMode } from "../key-storage.js";
import { PopupManager, type MediaFile } from "../popup-manager.js";
import type {
    EditableType,
    ContentData,
    TextContentData,
    HtmlContentData,
    ImageContentData,
    LinkContentData,
    BatchUpdateRequest,
    BatchUpdateResponse,
} from "../types.js";
import { parseTemplateKey } from "../types.js";

/**
 * Placeholder image for new template instances (gray background with "add image" icon at 50% centered)
 */
const IMAGE_PLACEHOLDER_DATA_URI =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect fill='%23e5e7eb' width='48' height='48'/%3E%3Cg transform='translate(12,12)'%3E%3Cpath d='M18 20H4V6h9V4H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-9h-2v9zm-7.79-3.17l-1.96-2.36L5.5 18h11l-3.54-4.71zM20 4V1h-2v3h-3c.01.01 0 2 0 2h3v2.99c.01.01 2 0 2 0V6h3V4h-3z' fill='%239ca3af'/%3E%3C/g%3E%3C/svg%3E";

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
    private apiKey: string | null = null;
    private currentMode: EditorMode = "viewer";
    private editingEnabled = false;
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
    private selectedKey: string | null = null; // Currently selected element (visual highlight, toolbar shows info)
    private editingKey: string | null = null; // Currently editing element (contenteditable, focused)
    private selectedInstance: HTMLElement | null = null; // Currently selected template instance (for mobile controls)
    private customSignInTriggers: Map<Element, string> = new Map(); // element -> original text
    private toolbar: Toolbar | null = null;
    private htmlEditorModal: HtmlEditorModal | null = null;
    private linkEditorModal: LinkEditorModal | null = null;
    private seoModal: SeoModal | null = null;
    private accessibilityModal: AccessibilityModal | null = null;
    private attributesModal: AttributesModal | null = null;
    private mediaManagerModal: MediaManagerModal | null = null;
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
    private sortableInstances: Map<string, Sortable> = new Map();
    // Keys that have saved content from API (used to skip whitespace normalization)
    private savedContentKeys: Set<string> = new Set();
    // Track if domain warning has been shown (only show once)
    private domainWarningShown = false;
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
        if (response.status === 402 && !this.domainWarningShown) {
            if (this.toolbar) {
                const domain = window.location.hostname;
                this.toolbar.warning = `A paid plan is required to edit on live domains like "${domain}". See Admin → Billing.`;
            }
            this.domainWarningShown = true;
        }

        // Show warning on 403 (domain not whitelisted)
        if (response.status === 403 && !this.domainWarningShown) {
            if (this.toolbar) {
                const domain = window.location.hostname;
                this.toolbar.warning = `Domain "${domain}" is not whitelisted. Add it in Admin → Settings.`;
            }
            this.domainWarningShown = true;
        }

        // Clear warning on successful request (user may have fixed the issue in another tab)
        if (response.ok && this.domainWarningShown) {
            if (this.toolbar) {
                this.toolbar.warning = null;
            }
            this.domainWarningShown = false;
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
                this.savedContentKeys.add(elementId);
            }

            // Grouped elements (key format: groupId:elementId)
            for (const [groupId, group] of Object.entries(data.groups)) {
                for (const elementId of Object.keys(group.elements)) {
                    this.savedContentKeys.add(`${groupId}:${elementId}`);
                }
            }

            this.log.debug("Fetched saved content keys", { count: this.savedContentKeys.size });
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
        this.scanTemplates();

        // Then scan editable elements (needs instance IDs to build correct keys)
        this.scanEditableElements();

        // Restore any draft from localStorage (unsaved changes from previous session)
        this.restoreDraftFromLocalStorage();

        // Check for mock auth
        if (this.config.mockAuth?.enabled) {
            this.apiKey = "mock-api-key";
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
        // This validates stored API key and sets this.apiKey if valid
        await this.setupAuthUI();

        // Initialize media manager modal (persistent, reused across selections)
        this.initMediaManagerModal();

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
                const existing = this.editableElements.get(key);
                if (existing) {
                    existing.push(elementInfo);
                    // Sync the new element with existing content (e.g., group inside template)
                    const content = this.currentContent.get(key);
                    if (content) {
                        this.applyElementContent(key, elementInfo, content);
                    }
                } else {
                    this.editableElements.set(key, [elementInfo]);

                    // Initialize content state from DOM (first element for this key)
                    // Type must be set before getElementContent is called
                    this.editableTypes.set(key, info.type);

                    // For elements without saved content, normalize whitespace in the DOM
                    // (to clean up DOM formatting from source HTML, but preserve user intent)
                    const hasSavedContent = this.savedContentKeys.has(key);
                    if (!hasSavedContent) {
                        this.normalizeDomWhitespace(elementInfo.element, info.type);
                    }

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
     * Strip content from template HTML for structure comparison.
     * - Removes text content
     * - Strips instance IDs
     * - For editable elements: keeps only reserved attributes (id, class, data-scms-*)
     */
    private stripTemplateContent(html: string): string {
        const div = document.createElement("div");
        div.innerHTML = html;

        // Strip instance IDs (they vary between instances)
        div.querySelectorAll("[data-scms-instance]").forEach((el) =>
            el.removeAttribute("data-scms-instance"),
        );

        // For editable elements, strip all attributes except reserved ones
        // This handles src, href, alt, title, and any custom attributes set via modals
        const editableSelector =
            "[data-scms-text], [data-scms-html], [data-scms-image], [data-scms-link]";
        div.querySelectorAll(editableSelector).forEach((el) => {
            const attributesToRemove: string[] = [];
            for (let i = 0; i < el.attributes.length; i++) {
                const attr = el.attributes[i];
                // Keep: id, class, and data-scms-* attributes (element ID defines structure)
                if (attr.name === "id" || attr.name === "class" || attr.name.startsWith("data-scms-")) {
                    continue;
                }
                attributesToRemove.push(attr.name);
            }
            attributesToRemove.forEach((name) => el.removeAttribute(name));
        });

        // Replace all text nodes with empty strings
        const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
        const textNodes: Text[] = [];
        while (walker.nextNode()) {
            textNodes.push(walker.currentNode as Text);
        }
        textNodes.forEach((node) => (node.textContent = ""));

        return div.innerHTML;
    }

    /**
     * Normalize template HTML for structure comparison.
     * Strips content and normalizes whitespace for reliable comparison.
     */
    private normalizeForComparison(html: string): string {
        return this.stripTemplateContent(html).replace(/\s+/g, " ").trim();
    }

    /**
     * Scan for template containers in the DOM.
     * Initializes uninitialized children (no API data case) by assigning IDs
     * and validating structure.
     */
    private scanTemplates(): void {
        this.templates.clear();
        document.querySelectorAll<HTMLElement>("[data-scms-template]").forEach((container) => {
            const templateId = container.getAttribute("data-scms-template");
            if (!templateId) return;

            // Get the first child as the template definition
            const templateElement = container.firstElementChild as HTMLElement | null;
            if (!templateElement) return;

            // Check if template is inside a group
            const groupId = this.getGroupIdFromElement(container);

            // Get original HTML from loader (stored before content population)
            const templateHtml =
                container.getAttribute("data-scms-template-html") || templateElement.outerHTML;

            // Get all direct children (potential instances)
            const allChildren = Array.from(container.children).filter(
                (child): child is HTMLElement => child instanceof HTMLElement,
            );

            // Check if children need initialization (no instance IDs = no API data)
            const hasInstanceIds = allChildren.some((child) =>
                child.hasAttribute("data-scms-instance"),
            );

            const instanceIds: string[] = [];

            if (!hasInstanceIds && allChildren.length > 0) {
                // No API data - initialize all children as instances
                const normalizedTemplate = this.normalizeForComparison(templateHtml);

                allChildren.forEach((child, index) => {
                    const instanceId = this.generateInstanceId();
                    child.setAttribute("data-scms-instance", instanceId);
                    instanceIds.push(instanceId);

                    // Validate structure (skip first child, it's the template definition)
                    if (index > 0) {
                        const normalizedChild = this.normalizeForComparison(child.outerHTML);
                        if (normalizedChild !== normalizedTemplate) {
                            child.setAttribute("data-scms-structure-mismatch", "true");
                            this.log.warn(
                                `Template "${templateId}" instance ${index + 1} has different structure than template definition`,
                            );
                        }
                    }
                });

                this.log.debug("Initialized template children", {
                    templateId,
                    instanceCount: allChildren.length,
                });
            } else {
                // Collect existing instance IDs from DOM (in order)
                allChildren.forEach((child) => {
                    const id = child.getAttribute("data-scms-instance");
                    if (id) instanceIds.push(id);
                });
            }

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

            this.apiKey = storedKey;
            this.updateMediaManagerApiKey();

            // Set up all custom triggers as sign-out
            const customTriggers = document.querySelectorAll("[data-scms-signin]");
            customTriggers.forEach((trigger) => {
                this.customSignInTriggers.set(trigger, trigger.textContent || "");
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
                mode: this.currentMode,
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
        const target = e.target as Node;

        // Check if clicking inside a template instance
        const clickedInstance = (target as Element).closest?.("[data-scms-instance]") as HTMLElement | null;

        // Deselect instance if clicking outside all instances
        if (this.selectedInstance && !clickedInstance) {
            this.deselectInstance();
        }

        if (!this.editingKey && !this.selectedKey) return;

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

        // Stop editing and deselect
        this.stopEditing();
        this.deselectElement();

        // Clear toolbar
        if (this.toolbar) {
            this.toolbar.activeElement = null;
            this.toolbar.activeElementType = null;
        }
        this.updateToolbarTemplateContext();
    };

    private async handleSignIn(): Promise<void> {
        this.log.debug("Opening login popup");

        const key = await this.popupManager.openLoginPopup();
        if (key) {
            this.apiKey = key;
            this.updateMediaManagerApiKey();
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
        this.currentMode = mode;
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
                if (this.editingEnabled) {
                    e.preventDefault();
                    e.stopPropagation();

                    const isMobile = window.innerWidth < 640;

                    // Check for double-tap (mobile) on images and links
                    const now = Date.now();
                    const isDoubleTap =
                        this.lastTapKey === key && now - this.lastTapTime < this.doubleTapDelay;

                    if (isDoubleTap && isMobile) {
                        // Mobile double-tap: open media manager for images, navigate for links
                        // (Desktop uses native dblclick event instead)
                        if (elementType === "image") {
                            this.handleChangeImage();
                        } else if (elementType === "link") {
                            this.handleGoToLink();
                        }
                        this.lastTapKey = null;
                        this.lastTapTime = 0;
                    } else if (isMobile) {
                        // Mobile two-step: first tap selects, second tap edits
                        if (this.selectedKey === key && this.editingKey !== key) {
                            this.startEditing(key, element);
                        } else {
                            this.selectElement(key, element);
                        }
                        this.lastTapKey = key;
                        this.lastTapTime = now;
                    } else {
                        // Desktop: edit immediately
                        this.startEditing(key, element);
                        this.lastTapKey = key;
                        this.lastTapTime = now;
                    }
                }
            });
            element.dataset.scmsClickHandler = "true";
        }

        // Double-click handler for images to open media manager (desktop)
        if (elementType === "image" && !element.dataset.scmsDblClickHandler) {
            element.addEventListener("dblclick", (e) => {
                if (this.editingEnabled) {
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
                if (this.editingEnabled) {
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
        if (this.editingEnabled) return;
        this.editingEnabled = true;

        this.editableElements.forEach((infos, key) => {
            for (const info of infos) {
                info.element.classList.add("streamlined-editable");
                this.setupElementClickHandler(info.element, key);
            }
        });

        // Add click-outside handler to deselect elements
        document.addEventListener("click", this.handleDocumentClick);

        this.injectEditStyles();
        this.showTemplateControls();
    }

    /**
     * Disable editing on elements - removes classes, contenteditable, template controls
     */
    private disableEditing(): void {
        this.editingEnabled = false;

        this.editableElements.forEach((infos) => {
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

        this.hideTemplateControls();
        this.deselectInstance();
        this.deselectElement();
        this.stopEditing();
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

        // Add delete buttons and drag handles to existing instances
        // (skip if instance element IS the editable element - use toolbar controls instead)
        this.templates.forEach((templateInfo, templateId) => {
            const { container } = templateInfo;
            const instances = container.querySelectorAll<HTMLElement>("[data-scms-instance]");
            let hasInlineControls = false;

            instances.forEach((instanceElement) => {
                // Skip inline controls if instance is also the editable element
                if (this.isInstanceAlsoEditable(instanceElement)) return;

                hasInlineControls = true;
                if (!this.instanceDeleteButtons.has(instanceElement)) {
                    this.addInstanceDeleteButton(instanceElement);
                }
                // Add drag handle if multiple instances
                if (templateInfo.instanceCount > 1) {
                    this.addInstanceDragHandle(instanceElement);
                }
                // Add click handler for instance selection (mobile controls visibility)
                if (!instanceElement.dataset.scmsInstanceClickHandler) {
                    instanceElement.addEventListener("click", () => {
                        this.selectInstance(instanceElement);
                    });
                    instanceElement.dataset.scmsInstanceClickHandler = "true";
                }
            });

            // Initialize SortableJS for drag-and-drop reordering (only if we have drag handles)
            if (
                hasInlineControls &&
                !this.sortableInstances.has(templateId) &&
                templateInfo.instanceCount > 1
            ) {
                this.initializeSortable(templateId, container);
            }
        });
    }

    /**
     * Hide template add buttons, delete buttons, drag handles, and destroy sortable instances
     */
    private hideTemplateControls(): void {
        // Remove all add buttons
        this.templateAddButtons.forEach((btn) => {
            btn.remove();
        });
        this.templateAddButtons.clear();

        // Remove all delete buttons and drag handles (query DOM directly to catch any stragglers)
        this.templates.forEach((templateInfo) => {
            const { container } = templateInfo;
            container
                .querySelectorAll<HTMLElement>("[data-scms-instance]")
                .forEach((instanceElement) => {
                    // Remove delete button - query DOM directly
                    const deleteBtn = instanceElement.querySelector(".scms-instance-delete");
                    if (deleteBtn) {
                        deleteBtn.remove();
                    }
                    // Remove drag handle
                    const dragHandle = instanceElement.querySelector(".scms-instance-drag-handle");
                    if (dragHandle) {
                        dragHandle.remove();
                    }
                });
        });
        // Clear the WeakMap tracking
        this.instanceDeleteButtons = new WeakMap();

        // Destroy all sortable instances
        this.sortableInstances.forEach((sortable) => {
            sortable.destroy();
        });
        this.sortableInstances.clear();
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
            this.handleAddInstance();
        });

        toolbar.addEventListener("delete-instance", () => {
            this.handleDeleteInstance();
        });

        toolbar.addEventListener("move-instance-up", () => {
            this.handleMoveInstanceUp();
        });

        toolbar.addEventListener("move-instance-down", () => {
            this.handleMoveInstanceDown();
        });

        document.body.appendChild(toolbar);
        this.toolbar = toolbar;

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
        if (this.toolbar) {
            this.toolbar.remove();
            this.toolbar = null;
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
        this.apiKey = null;
        this.updateMediaManagerApiKey();
        this.currentMode = "viewer";

        this.disableEditing();

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
     * Select an element without starting editing (mobile two-step flow).
     * Shows visual selection and updates toolbar, but doesn't make contenteditable or focus.
     */
    private selectElement(key: string, clickedElement?: HTMLElement): void {
        const infos = this.editableElements.get(key);
        if (!infos || infos.length === 0) {
            this.log.warn("Element not found for selection", { key });
            return;
        }

        // Use the clicked element, or first element if not specified
        const primaryInfo = clickedElement
            ? infos.find((i) => i.element === clickedElement) || infos[0]
            : infos[0];

        const elementType = this.getEditableType(key);
        this.log.trace("Selecting element", {
            key,
            elementId: primaryInfo.elementId,
            groupId: primaryInfo.groupId,
            elementType,
        });

        // Deselect previous element if different
        if (this.selectedKey && this.selectedKey !== key) {
            this.deselectElement();
        }

        // Stop editing if we're editing a different element
        if (this.editingKey && this.editingKey !== key) {
            this.stopEditing();
        }

        this.selectedKey = key;

        // Also select parent instance if element is inside one
        const parentInstance = primaryInfo.element.closest("[data-scms-instance]") as HTMLElement | null;
        if (parentInstance) {
            this.selectInstance(parentInstance);
        }

        // Add selection classes
        for (const info of infos) {
            const isPrimary = info.element === primaryInfo.element;
            if (isPrimary) {
                info.element.classList.add("streamlined-selected");
            } else {
                info.element.classList.add("streamlined-selected-sibling");
            }
        }

        // Update toolbar
        if (this.toolbar) {
            this.toolbar.activeElement = key;
            this.toolbar.activeElementType = elementType;
        }

        // Update template context on toolbar
        this.updateToolbarTemplateContext();
    }

    /**
     * Deselect the currently selected element without starting editing.
     */
    private deselectElement(): void {
        if (!this.selectedKey) return;

        const infos = this.editableElements.get(this.selectedKey);
        if (infos) {
            for (const info of infos) {
                info.element.classList.remove("streamlined-selected");
                info.element.classList.remove("streamlined-selected-sibling");
            }
        }

        this.selectedKey = null;

        // Clear toolbar if not editing
        if (!this.editingKey && this.toolbar) {
            this.toolbar.activeElement = null;
            this.toolbar.activeElementType = null;
        }
    }

    /**
     * Select a template instance (for mobile controls visibility).
     */
    private selectInstance(instanceElement: HTMLElement): void {
        if (this.selectedInstance === instanceElement) return;

        // Deselect previous instance
        if (this.selectedInstance) {
            this.selectedInstance.classList.remove("scms-instance-selected");
        }

        this.selectedInstance = instanceElement;
        instanceElement.classList.add("scms-instance-selected");
    }

    /**
     * Deselect the currently selected template instance.
     */
    private deselectInstance(): void {
        if (!this.selectedInstance) return;

        this.selectedInstance.classList.remove("scms-instance-selected");
        this.selectedInstance = null;
    }

    private startEditing(key: string, clickedElement?: HTMLElement): void {
        const infos = this.editableElements.get(key);
        if (!infos || infos.length === 0) {
            this.log.warn("Element not found", { key });
            return;
        }

        // Use the clicked element, or first element if not specified
        const primaryInfo = clickedElement
            ? infos.find((i) => i.element === clickedElement) || infos[0]
            : infos[0];

        const elementType = this.getEditableType(key);
        this.log.trace("Starting edit", {
            key,
            elementId: primaryInfo.elementId,
            groupId: primaryInfo.groupId,
            elementType,
            sharedCount: infos.length,
        });

        // Ensure element is selected first (handles deselecting previous, updating toolbar)
        this.selectElement(key, clickedElement);

        // Stop editing previous element if any (different from current)
        if (this.editingKey && this.editingKey !== key) {
            this.stopEditing();
        }

        // Already editing this element - nothing more to do
        if (this.editingKey === key) {
            return;
        }

        this.editingKey = key;

        // Transition from selected to editing state
        for (const info of infos) {
            const isPrimary = info.element === primaryInfo.element;

            // Remove selected classes, add editing classes
            info.element.classList.remove("streamlined-selected");
            info.element.classList.remove("streamlined-selected-sibling");

            if (isPrimary) {
                info.element.classList.add("streamlined-editing");
            } else {
                info.element.classList.add("streamlined-editing-sibling");
            }

            // Add input listener to all elements for change tracking and synchronization
            if (
                (elementType === "text" || elementType === "html") &&
                !info.element.dataset.scmsInputHandler
            ) {
                info.element.addEventListener("input", () => {
                    // Update currentContent from DOM, then sync all elements
                    this.updateContentFromElement(key, info.element);
                    this.updateToolbarHasChanges();
                });
                info.element.dataset.scmsInputHandler = "true";
            }

            // Add keydown listener for Tab navigation (all element types)
            if (!info.element.dataset.scmsKeydownHandler) {
                info.element.addEventListener("keydown", (e: KeyboardEvent) => {
                    if (e.key === "Tab") {
                        e.preventDefault();
                        this.navigateToNextEditable(info.element, e.shiftKey);
                    }
                });
                info.element.dataset.scmsKeydownHandler = "true";
            }

            // Make text and html elements contenteditable (not images or links)
            // Only the primary element is focused, but all are editable for consistency
            if (elementType === "text" || elementType === "html") {
                info.element.setAttribute("contenteditable", "true");
            }

            // Make images and links focusable for keyboard navigation
            if (elementType === "image" || elementType === "link") {
                info.element.setAttribute("tabindex", "-1");
            }
        }

        // Focus the primary element (all types need focus for keyboard navigation)
        primaryInfo.element.focus();

        // On mobile, scroll the element into view after keyboard opens
        if (window.innerWidth < 640) {
            setTimeout(() => {
                primaryInfo.element.scrollIntoView({ block: "center", behavior: "smooth" });
            }, 300);
        }
    }

    /**
     * Navigate to the next or previous editable element from the current one.
     * Uses DOM order to determine sequence. Includes all scms element types.
     */
    private navigateToNextEditable(currentElement: HTMLElement, reverse: boolean): void {
        // Get all editable elements in DOM order (all scms types)
        const selector = "[data-scms-text], [data-scms-html], [data-scms-image], [data-scms-link]";
        const allEditables = Array.from(document.querySelectorAll<HTMLElement>(selector));

        if (allEditables.length === 0) return;

        const currentIndex = allEditables.indexOf(currentElement);
        if (currentIndex === -1) return;

        // Calculate next index with wrapping
        let nextIndex: number;
        if (reverse) {
            nextIndex = currentIndex === 0 ? allEditables.length - 1 : currentIndex - 1;
        } else {
            nextIndex = currentIndex === allEditables.length - 1 ? 0 : currentIndex + 1;
        }

        const nextElement = allEditables[nextIndex];
        const nextKey = this.elementToKey.get(nextElement);

        if (nextKey) {
            this.startEditing(nextKey, nextElement);
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
        const sourceInfo = infos.find((i) => i.element === sourceElement);
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

        // Only clear toolbar if nothing is selected (mobile two-step mode keeps selection)
        if (!this.selectedKey && this.toolbar) {
            this.toolbar.activeElement = null;
            this.toolbar.activeElementType = null;
            this.updateToolbarTemplateContext();
        }
    }

    /**
     * Get the current content value for an element based on its type.
     * Returns JSON string with type field for all element types.
     * Includes attributes if any have been set.
     * Note: DOM whitespace should be normalized before calling this (via normalizeDomWhitespace).
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
                value: info.element.innerHTML,
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
            const data = JSON.parse(content) as
                | (ContentData & { attributes?: ElementAttributes })
                | { type?: undefined; attributes?: ElementAttributes };

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
                info.element.innerHTML = linkData.value;
            } else if (!data.type) {
                // No type field in JSON - use element's declared type
                if (elementType === "link" && info.element instanceof HTMLAnchorElement) {
                    const linkData = data as { href?: string; target?: string; value?: string };
                    if (linkData.href !== undefined) {
                        info.element.href = linkData.href;
                        info.element.target = linkData.target || "";
                        info.element.innerHTML = linkData.value || "";
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
     * Get keys that are pending deletion (saved on server but not in currentContent)
     * Only includes keys that were actually saved to the API (in savedContentKeys),
     * not elements that only existed in the hard-coded HTML.
     */
    private getPendingDeletes(): string[] {
        const deletes: string[] = [];
        this.savedContentKeys.forEach((key) => {
            if (!this.currentContent.has(key)) {
                deletes.push(key);
            }
        });
        return deletes;
    }

    /**
     * Get template elements that have never been saved to the API.
     * These are elements derived from HTML that need to be persisted when
     * the template order changes (e.g., when adding a new item to a list
     * that already had HTML-defined items).
     *
     * Only returns elements for templates that have order changes, since
     * that's when we need to ensure all items are persisted.
     */
    private getUnsavedTemplateElements(
        templatesWithOrderChanges: string[],
    ): Map<string, { content: string; info: EditableElementInfo }> {
        const unsaved = new Map<string, { content: string; info: EditableElementInfo }>();

        // Build a set of template IDs with order changes for fast lookup
        const changedTemplates = new Set(templatesWithOrderChanges);
        if (changedTemplates.size === 0) {
            return unsaved;
        }

        // Check each editable element
        this.editableElements.forEach((infos, key) => {
            const info = infos[0];
            if (!info || !info.templateId || !info.instanceId) {
                return; // Not a template element
            }

            // Only include elements from templates with order changes
            if (!changedTemplates.has(info.templateId)) {
                return;
            }

            // Skip if already saved to API
            if (this.savedContentKeys.has(key)) {
                return;
            }

            // Get the current content
            const content = this.currentContent.get(key);
            if (content !== undefined) {
                unsaved.set(key, { content, info });
            }
        });

        return unsaved;
    }

    /**
     * Check if there are any unsaved changes (dirty elements, pending deletes, or order changes)
     */
    private hasUnsavedChanges(): boolean {
        return (
            this.getDirtyElements().size > 0 ||
            this.getPendingDeletes().length > 0 ||
            this.getTemplatesWithOrderChanges().length > 0
        );
    }

    private updateToolbarHasChanges(): void {
        if (this.toolbar) {
            this.toolbar.hasChanges = this.hasUnsavedChanges();
        }
        this.saveDraftToLocalStorage();
    }

    /**
     * Save current unsaved changes to localStorage for draft recovery.
     * Stores content changes and pending deletes so they can be restored
     * if the page is accidentally closed.
     */
    private saveDraftToLocalStorage(): void {
        const draft: { content: Record<string, string>; deleted: string[] } = {
            content: {},
            deleted: [],
        };

        // First pass: find templates where order changed AND have unsaved instance content
        // These need ALL their unsaved content in the draft because HTML-derived
        // instances get new random IDs on reload and we need full content to restore
        const templatesWithUnsavedInstances = new Set<string>();
        const groupsInAffectedTemplates = new Set<string>();
        this.currentContent.forEach((current, key) => {
            if (key.endsWith("._order")) {
                const original = this.originalContent.get(key);

                // Only consider templates where order has actually changed
                if (current === original) {
                    return;
                }

                // Parse the order to get instance IDs
                let instanceIds: string[] = [];
                try {
                    const parsed = JSON.parse(current);
                    if (parsed.type === "order" && Array.isArray(parsed.value)) {
                        instanceIds = parsed.value;
                    }
                } catch {
                    return;
                }

                // Key format: "templateId._order" or "groupId:templateId._order"
                const prefix = key.slice(0, -"._order".length);

                // Check if any instance in the order has content not saved to the API
                // These are HTML-derived instances whose IDs will change on reload
                const hasUnsavedInstances = instanceIds.some((instanceId) => {
                    const instancePrefix = `${prefix}.${instanceId}.`;
                    for (const [contentKey] of this.currentContent) {
                        if (
                            contentKey.startsWith(instancePrefix) &&
                            !this.savedContentKeys.has(contentKey)
                        ) {
                            return true;
                        }
                    }
                    return false;
                });

                if (hasUnsavedInstances) {
                    templatesWithUnsavedInstances.add(prefix);

                    // Also find groups inside this template - their content needs saving too
                    const templateId = prefix.includes(":") ? prefix.split(":")[1] : prefix;
                    const templateInfo = this.templates.get(templateId);
                    if (templateInfo) {
                        templateInfo.container
                            .querySelectorAll<HTMLElement>("[data-scms-group]")
                            .forEach((el) => {
                                const groupId = el.getAttribute("data-scms-group");
                                if (groupId) groupsInAffectedTemplates.add(groupId);
                            });
                    }
                }
            }
        });

        // Collect content to save
        this.currentContent.forEach((current, key) => {
            const original = this.originalContent.get(key);

            // Always save if content differs from original
            if (current !== original) {
                draft.content[key] = current;
                return;
            }

            // For unchanged content: also save if it belongs to a template with unsaved instances
            // AND is not already saved to the API (saved content will be restored from API)
            // This ensures HTML-derived instance content is preserved across reloads
            if (!key.endsWith("._order") && !this.savedContentKeys.has(key)) {
                // Check template content keys (templateId.instanceId.elementId)
                for (const prefix of templatesWithUnsavedInstances) {
                    if (key.startsWith(prefix + ".")) {
                        draft.content[key] = current;
                        return;
                    }
                }
                // Check group content keys (groupId:elementId) for groups inside affected templates
                for (const groupId of groupsInAffectedTemplates) {
                    if (key.startsWith(groupId + ":")) {
                        draft.content[key] = current;
                        return;
                    }
                }
            }
        });

        // Collect pending deletes
        draft.deleted = this.getPendingDeletes();

        // If no changes, remove draft from storage
        if (Object.keys(draft.content).length === 0 && draft.deleted.length === 0) {
            localStorage.removeItem(this.draftStorageKey);
            return;
        }

        // Save draft to localStorage
        try {
            localStorage.setItem(this.draftStorageKey, JSON.stringify(draft));
        } catch (error) {
            this.log.warn("Failed to save draft to localStorage", error);
        }
    }

    /**
     * Restore unsaved changes from localStorage draft.
     * Called during initialization to recover work if the page was accidentally closed.
     */
    private restoreDraftFromLocalStorage(): void {
        let draft: { content: Record<string, string>; deleted: string[] };

        try {
            const stored = localStorage.getItem(this.draftStorageKey);
            if (!stored) return;
            draft = JSON.parse(stored);
        } catch (error) {
            this.log.warn("Failed to load draft from localStorage", error);
            return;
        }

        // Validate draft structure
        if (!draft || typeof draft.content !== "object" || !Array.isArray(draft.deleted)) {
            this.log.warn("Invalid draft structure in localStorage");
            localStorage.removeItem(this.draftStorageKey);
            return;
        }

        const hasContent = Object.keys(draft.content).length > 0;
        const hasDeletes = draft.deleted.length > 0;

        if (!hasContent && !hasDeletes) {
            localStorage.removeItem(this.draftStorageKey);
            return;
        }

        this.log.info("Restoring draft from localStorage", {
            contentKeys: Object.keys(draft.content).length,
            deleteKeys: draft.deleted.length,
        });

        // Step 1: Reconcile template instances based on _order keys in draft
        this.reconcileTemplateInstances(draft.content);

        // Step 2: Apply content changes
        for (const [key, value] of Object.entries(draft.content)) {
            // Skip _order keys - they were handled in reconciliation
            if (key.endsWith("._order") || key.includes(":") && key.split(":")[1].endsWith("._order")) {
                continue;
            }

            this.currentContent.set(key, value);
            this.syncAllElementsFromContent(key);
        }

        // Step 3: Apply deletes
        for (const key of draft.deleted) {
            this.currentContent.delete(key);
        }

        this.log.info("Draft restored successfully");
    }

    /**
     * Reconcile template instances based on _order keys from draft.
     * Adds missing instances and removes extra instances to match draft state.
     */
    private reconcileTemplateInstances(draftContent: Record<string, string>): void {
        // Find all _order keys in the draft
        for (const [key, value] of Object.entries(draftContent)) {
            // Match keys like "templateId._order" or "groupId:templateId._order"
            let templateId: string;
            if (key.endsWith("._order")) {
                if (key.includes(":")) {
                    // Grouped: "groupId:templateId._order"
                    const afterColon = key.split(":")[1];
                    templateId = afterColon.replace("._order", "");
                } else {
                    // Ungrouped: "templateId._order"
                    templateId = key.replace("._order", "");
                }
            } else {
                continue; // Not an order key
            }

            const templateInfo = this.templates.get(templateId);
            if (!templateInfo) {
                this.log.warn("Template not found for draft order key", { templateId, key });
                continue;
            }

            // Parse the draft order value
            let draftInstanceIds: string[];
            try {
                const parsed = JSON.parse(value);
                if (parsed.type === "order" && Array.isArray(parsed.value)) {
                    draftInstanceIds = parsed.value;
                } else {
                    this.log.warn("Invalid order format in draft", { key, value });
                    continue;
                }
            } catch {
                this.log.warn("Failed to parse order value in draft", { key, value });
                continue;
            }

            const currentInstanceIds = [...templateInfo.instanceIds];
            const currentSet = new Set(currentInstanceIds);
            const draftSet = new Set(draftInstanceIds);

            // Find instances to add (in draft but not in current DOM)
            const toAdd = draftInstanceIds.filter((id) => !currentSet.has(id));

            // Find instances to remove (in current DOM but not in draft)
            const toRemove = currentInstanceIds.filter((id) => !draftSet.has(id));

            this.log.debug("Reconciling template instances", {
                templateId,
                current: currentInstanceIds,
                draft: draftInstanceIds,
                toAdd,
                toRemove,
            });

            // Add missing instances
            for (const instanceId of toAdd) {
                this.addInstanceWithId(templateId, instanceId);
            }

            // Remove extra instances (but never remove the last one)
            for (const instanceId of toRemove) {
                if (templateInfo.instanceCount > 1) {
                    this.removeInstanceSync(templateId, instanceId);
                }
            }

            // Reorder to match draft order
            this.reorderInstances(templateId, draftInstanceIds);

            // Update order content to match draft
            this.currentContent.set(key, value);
        }
    }

    /**
     * Add a template instance with a specific ID (for draft restoration).
     * Similar to addInstance() but uses a provided ID instead of generating one.
     */
    private addInstanceWithId(templateId: string, instanceId: string): void {
        const templateInfo = this.templates.get(templateId);
        if (!templateInfo) {
            this.log.error("Template not found", { templateId });
            return;
        }

        const { container, templateHtml, groupId } = templateInfo;

        // Create new instance from original template HTML
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = templateHtml;
        const clone = tempDiv.firstElementChild as HTMLElement;
        if (!clone) {
            this.log.error("Failed to create clone from template HTML");
            return;
        }

        clone.setAttribute("data-scms-instance", instanceId);
        clone.removeAttribute("data-scms-template");

        // Add placeholder to image elements without src
        clone.querySelectorAll<HTMLImageElement>("img[data-scms-image]").forEach((img) => {
            if (!img.src) {
                img.src = IMAGE_PLACEHOLDER_DATA_URI;
            }
        });
        if (
            clone instanceof HTMLImageElement &&
            clone.hasAttribute("data-scms-image") &&
            !clone.src
        ) {
            clone.src = IMAGE_PLACEHOLDER_DATA_URI;
        }

        // Insert at end of container (will be reordered later)
        const addButton = this.templateAddButtons.get(templateId);
        if (addButton && addButton.parentElement === container) {
            container.insertBefore(clone, addButton);
        } else {
            container.appendChild(clone);
        }

        // Update instance tracking
        templateInfo.instanceIds.push(instanceId);
        templateInfo.instanceCount = templateInfo.instanceIds.length;

        // Register editable elements in the new instance
        this.registerInstanceElements(clone, templateId, instanceId, groupId);

        this.log.debug("Added template instance from draft", { templateId, instanceId });
    }

    /**
     * Remove a template instance synchronously (for draft restoration).
     * Similar to removeInstance() but without async operations.
     */
    private removeInstanceSync(templateId: string, instanceId: string): void {
        const templateInfo = this.templates.get(templateId);
        if (!templateInfo) return;

        if (templateInfo.instanceCount <= 1) return;

        const { container } = templateInfo;

        const instanceElement = container.querySelector<HTMLElement>(
            `[data-scms-instance="${instanceId}"]`,
        );
        if (!instanceElement) return;

        // Collect element keys for this instance
        const keysToDelete: string[] = [];
        const selector = "[data-scms-text], [data-scms-html], [data-scms-image], [data-scms-link]";
        const descendants = Array.from(instanceElement.querySelectorAll<HTMLElement>(selector));
        const elements = instanceElement.matches(selector)
            ? [instanceElement, ...descendants]
            : descendants;
        elements.forEach((el) => {
            const info = this.getEditableInfo(el);
            if (info) {
                const context = this.getStorageContext(el);
                const key = this.buildStorageKey(context, info.id);
                keysToDelete.push(key);
            }
        });

        // Remove from DOM
        instanceElement.remove();

        // Update tracking
        keysToDelete.forEach((key) => {
            const infos = this.editableElements.get(key);
            if (infos) {
                const remaining = infos.filter((info) => info.instanceId !== instanceId);
                if (remaining.length > 0) {
                    this.editableElements.set(key, remaining);
                } else {
                    this.editableElements.delete(key);
                    this.editableTypes.delete(key);
                    this.currentContent.delete(key);
                }
            }
        });

        // Update instance tracking
        templateInfo.instanceIds = templateInfo.instanceIds.filter((id) => id !== instanceId);
        templateInfo.instanceCount = templateInfo.instanceIds.length;

        this.log.debug("Removed template instance for draft", { templateId, instanceId });
    }

    /**
     * Reorder template instances to match a specific order.
     */
    private reorderInstances(templateId: string, targetOrder: string[]): void {
        const templateInfo = this.templates.get(templateId);
        if (!templateInfo) return;

        const { container } = templateInfo;

        // Get current instance elements
        const instanceElements = new Map<string, HTMLElement>();
        container.querySelectorAll<HTMLElement>("[data-scms-instance]").forEach((el) => {
            const id = el.getAttribute("data-scms-instance");
            if (id) instanceElements.set(id, el);
        });

        // Find insertion point (before add button or at end)
        const addButton = this.templateAddButtons.get(templateId);
        const insertBefore = addButton?.parentElement === container ? addButton : null;

        // Reorder by removing and re-inserting in correct order
        for (const instanceId of targetOrder) {
            const element = instanceElements.get(instanceId);
            if (element) {
                if (insertBefore) {
                    container.insertBefore(element, insertBefore);
                } else {
                    container.appendChild(element);
                }
            }
        }

        // Update templateInfo.instanceIds to match
        templateInfo.instanceIds = targetOrder.filter((id) => instanceElements.has(id));
    }

    private async handleSave(): Promise<void> {
        const dirtyElements = this.getDirtyElements();
        const pendingDeletes = this.getPendingDeletes();
        const templatesWithOrderChanges = this.getTemplatesWithOrderChanges();
        const hasOrderChanges = templatesWithOrderChanges.length > 0;

        // Get unsaved template elements (HTML-derived items that need to be persisted
        // when the template order changes)
        const unsavedTemplateElements = this.getUnsavedTemplateElements(templatesWithOrderChanges);

        if (dirtyElements.size === 0 && pendingDeletes.length === 0 && !hasOrderChanges) {
            return;
        }
        if (this.saving) {
            return;
        }

        this.log.debug("Saving changes", {
            dirtyCount: dirtyElements.size,
            unsavedTemplateCount: unsavedTemplateElements.size,
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
                const templateInfo = this.templates.get(templateId);
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
                    this.originalContent.set(key, element.content);
                    this.savedContentKeys.add(key);
                    saved.push(key);
                }

                // Process saved grouped elements from response
                for (const [groupId, group] of Object.entries(result.groups ?? {})) {
                    for (const [elementId, element] of Object.entries(group.elements)) {
                        const key = `${groupId}:${elementId}`;
                        this.originalContent.set(key, element.content);
                        this.savedContentKeys.add(key);
                        saved.push(key);
                    }
                }

                // Process deleted elements from response
                for (const elementId of result.deleted?.elements ?? []) {
                    const key = elementId;
                    this.originalContent.delete(key);
                    this.savedContentKeys.delete(key);
                    deleted.push(key);
                }

                // Process deleted grouped elements from response
                for (const [groupId, elementIds] of Object.entries(result.deleted?.groups ?? {})) {
                    for (const elementId of elementIds) {
                        const key = `${groupId}:${elementId}`;
                        this.originalContent.delete(key);
                        this.savedContentKeys.delete(key);
                        deleted.push(key);
                    }
                }

                // Update currentContent for order arrays
                for (const templateId of templatesWithOrderChanges) {
                    const templateInfo = this.templates.get(templateId);
                    if (!templateInfo) continue;

                    const orderKey = `${templateId}._order`;
                    const orderContentKey = templateInfo.groupId
                        ? `${templateInfo.groupId}:${orderKey}`
                        : orderKey;
                    const orderContent = JSON.stringify({
                        type: "order",
                        value: templateInfo.instanceIds,
                    });
                    this.currentContent.set(orderContentKey, orderContent);
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
                this.stopEditing();

                // Refresh saved content keys after successful save
                await this.fetchSavedContentKeys();

                // Clear draft from localStorage after successful save
                localStorage.removeItem(this.draftStorageKey);
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
            const contentKey = templateInfo.groupId
                ? `${templateInfo.groupId}:${orderKey}`
                : orderKey;
            const currentOrder = this.currentContent.get(contentKey);
            const originalOrder = this.originalContent.get(contentKey);
            if (currentOrder !== originalOrder) {
                changed.push(templateId);
            }
        });
        return changed;
    }

    private handleReset(): void {
        if (!this.selectedKey) {
            return;
        }

        const key = this.selectedKey;
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
        if (!this.selectedKey) {
            this.log.debug("No element selected for image change");
            return;
        }

        const key = this.selectedKey;
        const infos = this.editableElements.get(key);
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
            const attributes = this.elementAttributes.get(key);
            const data: ImageContentData = {
                type: "image",
                src: file.publicUrl,
                ...(attributes && Object.keys(attributes).length > 0 ? { attributes } : {}),
            };
            // Update via setContent - this updates currentContent and syncs all DOM elements
            this.setContent(key, JSON.stringify(data));
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
        if (!this.selectedKey) {
            this.log.debug("No element selected for HTML editing");
            return;
        }

        // Prevent opening multiple modals
        if (this.htmlEditorModal) {
            this.log.debug("HTML editor already open");
            return;
        }

        const key = this.selectedKey;
        const infos = this.editableElements.get(key);
        if (!infos || infos.length === 0) {
            return;
        }

        const primaryInfo = infos[0];
        this.log.debug("Opening HTML editor", { key, elementId: primaryInfo.elementId });

        // Get content from currentContent (already normalized) rather than DOM
        let htmlValue = primaryInfo.element.innerHTML;
        const storedContent = this.currentContent.get(key);
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
            const attributes = this.elementAttributes.get(key);
            const data: HtmlContentData = {
                type: "html",
                value: e.detail.content,
                ...(attributes && Object.keys(attributes).length > 0 ? { attributes } : {}),
            };
            this.setContent(key, JSON.stringify(data));
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
        this.htmlEditorModal = modal;
    }

    private closeHtmlEditor(): void {
        if (this.htmlEditorModal) {
            this.htmlEditorModal.remove();
            this.htmlEditorModal = null;
        }
    }

    private handleEditLink(): void {
        if (!this.selectedKey) {
            this.log.debug("No element selected for link editing");
            return;
        }

        // Prevent opening multiple modals
        if (this.linkEditorModal) {
            this.log.debug("Link editor already open");
            return;
        }

        const key = this.selectedKey;
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
            value: primaryAnchor.innerHTML,
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
                value: e.detail.linkData.value,
                ...(attributes && Object.keys(attributes).length > 0 ? { attributes } : {}),
            };
            this.setContent(key, JSON.stringify(data));
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
        this.linkEditorModal = modal;
    }

    private closeLinkEditor(): void {
        if (this.linkEditorModal) {
            this.linkEditorModal.remove();
            this.linkEditorModal = null;
        }
    }

    private handleGoToLink(): void {
        if (!this.selectedKey) {
            this.log.debug("No element selected for go to link");
            return;
        }

        const key = this.selectedKey;
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
        if (!this.selectedKey) {
            this.log.debug("No element selected for SEO editing");
            return;
        }

        if (this.seoModal) {
            this.log.debug("SEO modal already open");
            return;
        }

        const key = this.selectedKey;
        const infos = this.editableElements.get(key);
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
            this.elementAttributes.set(key, e.detail.attributes);
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
        this.seoModal = modal;
    }

    private closeSeoModal(): void {
        if (this.seoModal) {
            this.seoModal.remove();
            this.seoModal = null;
        }
    }

    private handleEditAccessibility(): void {
        if (!this.selectedKey) {
            this.log.debug("No element selected for accessibility editing");
            return;
        }

        if (this.accessibilityModal) {
            this.log.debug("Accessibility modal already open");
            return;
        }

        const key = this.selectedKey;
        const infos = this.editableElements.get(key);
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
            this.elementAttributes.set(key, e.detail.attributes);
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
        this.accessibilityModal = modal;
    }

    private closeAccessibilityModal(): void {
        if (this.accessibilityModal) {
            this.accessibilityModal.remove();
            this.accessibilityModal = null;
        }
    }

    private handleEditAttributes(): void {
        if (!this.selectedKey) {
            this.log.debug("No element selected for attributes editing");
            return;
        }

        if (this.attributesModal) {
            this.log.debug("Attributes modal already open");
            return;
        }

        const key = this.selectedKey;
        const infos = this.editableElements.get(key);
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
            this.elementAttributes.set(key, e.detail.attributes);
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
     * Initialize the persistent media manager modal
     */
    private initMediaManagerModal(): void {
        const modal = document.createElement("scms-media-manager-modal") as MediaManagerModal;
        modal.appUrl = this.config.appUrl;
        modal.appId = this.config.appId;
        if (this.apiKey) {
            modal.apiKey = this.apiKey;
        }
        document.body.appendChild(modal);
        this.mediaManagerModal = modal;
        this.log.debug("Media manager modal initialized");
    }

    private updateMediaManagerApiKey(): void {
        if (this.mediaManagerModal) {
            this.mediaManagerModal.apiKey = this.apiKey || "";
        }
    }

    /**
     * Open media manager for file selection
     * Returns selected file on success, null if user cancels or closes
     */
    public async openMediaManager(): Promise<MediaFile | null> {
        if (!this.mediaManagerModal) {
            this.log.warn("Media manager modal not initialized");
            return null;
        }

        this.log.debug("Opening media manager");
        const file = await this.mediaManagerModal.selectMedia();
        if (file) {
            this.log.debug("Media file selected", { fileId: file.fileId, filename: file.filename });
        } else {
            this.log.debug("Media manager closed without selection");
        }
        return file;
    }

    // ==================== Template Toolbar Handlers ====================

    private handleAddInstance(): void {
        if (!this.toolbar?.templateId) {
            this.log.debug("No template context for add instance");
            return;
        }
        this.addInstance(this.toolbar.templateId);
    }

    private handleDeleteInstance(): void {
        if (!this.toolbar?.templateId || !this.toolbar?.instanceId) {
            this.log.debug("No template context for delete instance");
            return;
        }
        this.removeInstance(this.toolbar.templateId, this.toolbar.instanceId);
    }

    private handleMoveInstanceUp(): void {
        if (!this.toolbar?.templateId || this.toolbar?.instanceIndex === null) {
            this.log.debug("No template context for move up");
            return;
        }
        const fromIndex = this.toolbar.instanceIndex;
        if (fromIndex > 0) {
            this.reorderInstance(this.toolbar.templateId, fromIndex, fromIndex - 1);
        }
    }

    private handleMoveInstanceDown(): void {
        if (
            !this.toolbar?.templateId ||
            this.toolbar?.instanceIndex === null ||
            this.toolbar?.instanceCount === null
        ) {
            this.log.debug("No template context for move down");
            return;
        }
        const fromIndex = this.toolbar.instanceIndex;
        if (fromIndex < this.toolbar.instanceCount - 1) {
            this.reorderInstance(this.toolbar.templateId, fromIndex, fromIndex + 1);
        }
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

        // Add placeholder to image elements without src
        clone.querySelectorAll<HTMLImageElement>("img[data-scms-image]").forEach((img) => {
            if (!img.src) {
                img.src = IMAGE_PLACEHOLDER_DATA_URI;
            }
        });
        // Also check if clone itself is the image element
        if (
            clone instanceof HTMLImageElement &&
            clone.hasAttribute("data-scms-image") &&
            !clone.src
        ) {
            clone.src = IMAGE_PLACEHOLDER_DATA_URI;
        }

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

        // If we now have 2+ instances, add delete buttons and drag handles to all instances
        // (skip if instance element IS the editable element - use toolbar controls instead)
        if (templateInfo.instanceCount >= 2 && this.currentMode === "author") {
            let hasInlineControls = false;
            container
                .querySelectorAll<HTMLElement>("[data-scms-instance]")
                .forEach((instanceElement) => {
                    if (this.isInstanceAlsoEditable(instanceElement)) return;
                    hasInlineControls = true;
                    this.addInstanceDeleteButton(instanceElement);
                    this.addInstanceDragHandle(instanceElement);
                });
            if (hasInlineControls && !this.sortableInstances.has(templateId)) {
                this.initializeSortable(templateId, container);
            }
        }

        // Select the new instance (for mobile controls visibility)
        if (!this.isInstanceAlsoEditable(clone)) {
            this.selectInstance(clone);
        }

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
            `[data-scms-instance="${instanceId}"]`,
        );
        if (!instanceElement) {
            this.log.error("Instance element not found", { templateId, instanceId });
            return;
        }

        // Collect all element keys for this instance
        const keysToDelete: string[] = [];
        const selector = "[data-scms-text], [data-scms-html], [data-scms-image], [data-scms-link]";
        // Include instanceElement itself if it matches (e.g., <li data-scms-text="item">)
        const descendants = Array.from(instanceElement.querySelectorAll<HTMLElement>(selector));
        const elements = instanceElement.matches(selector)
            ? [instanceElement, ...descendants]
            : descendants;
        elements.forEach((el) => {
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
                const remaining = infos.filter((info) => info.instanceId !== instanceId);
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
        templateInfo.instanceIds = templateInfo.instanceIds.filter((id) => id !== instanceId);
        templateInfo.instanceCount = templateInfo.instanceIds.length;
        this.updateOrderContent(templateId, templateInfo);

        // Mark order array as dirty (will be saved with other changes)
        this.updateToolbarHasChanges();

        this.log.debug("Removed template instance", { templateId, instanceId });

        // If we're down to 1 instance, remove delete buttons and drag handles from remaining instance
        if (templateInfo.instanceCount === 1) {
            container.querySelectorAll<HTMLElement>("[data-scms-instance]").forEach((el) => {
                const deleteBtn = el.querySelector(".scms-instance-delete");
                if (deleteBtn) deleteBtn.remove();
                const dragHandle = el.querySelector(".scms-instance-drag-handle");
                if (dragHandle) dragHandle.remove();
            });
            // Destroy sortable instance
            const sortable = this.sortableInstances.get(templateId);
            if (sortable) {
                sortable.destroy();
                this.sortableInstances.delete(templateId);
            }
        }

        // Update toolbar
        this.updateToolbarTemplateContext();
    }

    /**
     * Reorder a template instance by moving it from one index to another
     */
    public reorderInstance(templateId: string, fromIndex: number, toIndex: number): void {
        const templateInfo = this.templates.get(templateId);
        if (!templateInfo) {
            this.log.error("Template not found", { templateId });
            return;
        }

        const { container, instanceIds } = templateInfo;

        // Validate indices
        if (
            fromIndex < 0 ||
            fromIndex >= instanceIds.length ||
            toIndex < 0 ||
            toIndex >= instanceIds.length
        ) {
            this.log.error("Invalid reorder indices", {
                fromIndex,
                toIndex,
                count: instanceIds.length,
            });
            return;
        }

        if (fromIndex === toIndex) {
            return; // No-op
        }

        const instanceId = instanceIds[fromIndex];

        // Find the instance element
        const instanceElement = container.querySelector<HTMLElement>(
            `[data-scms-instance="${instanceId}"]`,
        );
        if (!instanceElement) {
            this.log.error("Instance element not found", { templateId, instanceId });
            return;
        }

        // Update the order array
        instanceIds.splice(fromIndex, 1);
        instanceIds.splice(toIndex, 0, instanceId);

        // Move DOM element to new position
        // Find the element at the target position (after array update)
        if (toIndex === instanceIds.length - 1) {
            // Moving to last position - insert before the add button
            const addButton = this.templateAddButtons.get(templateId);
            if (addButton && addButton.parentElement === container) {
                container.insertBefore(instanceElement, addButton);
            } else {
                container.appendChild(instanceElement);
            }
        } else {
            // Insert before the element that's now at toIndex + 1
            const nextInstanceId = instanceIds[toIndex + 1];
            const nextElement = container.querySelector<HTMLElement>(
                `[data-scms-instance="${nextInstanceId}"]`,
            );
            if (nextElement) {
                container.insertBefore(instanceElement, nextElement);
            }
        }

        // Update order in content
        this.updateOrderContent(templateId, templateInfo);

        // Mark as having unsaved changes
        this.updateToolbarHasChanges();

        this.log.debug("Reordered template instance", {
            templateId,
            instanceId,
            fromIndex,
            toIndex,
        });

        // Update toolbar (index may have changed)
        this.updateToolbarTemplateContext();
    }

    /**
     * Register editable elements from a new instance
     */
    private registerInstanceElements(
        instanceElement: HTMLElement,
        templateId: string,
        instanceId: string,
        groupId: string | null,
    ): void {
        const selector = "[data-scms-text], [data-scms-html], [data-scms-image], [data-scms-link]";
        // Include instanceElement itself if it matches (e.g., <li data-scms-text="item">)
        const descendants = Array.from(instanceElement.querySelectorAll<HTMLElement>(selector));
        const elements = instanceElement.matches(selector)
            ? [instanceElement, ...descendants]
            : descendants;
        elements.forEach((element) => {
            const info = this.getEditableInfo(element);
            if (!info) return;

            // Determine context - check if element is in a group inside the template
            const elementGroupId = this.getGroupIdFromElement(element);
            const isGroupInsideTemplate = elementGroupId !== null && elementGroupId !== groupId;

            let context: {
                groupId: string | null;
                templateId: string | null;
                instanceId: string | null;
            };
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
                // Sync the new element with existing shared content (e.g., group inside template)
                let content = this.currentContent.get(key);
                if (!content && existing.length > 0) {
                    // No saved content yet - get content from an existing element
                    content = this.getElementContent(key, existing[0]);
                }
                if (content) {
                    this.applyElementContent(key, elementInfo, content);
                }
            } else {
                this.editableElements.set(key, [elementInfo]);

                // Initialize content state from DOM (first element for this key)
                // This mirrors what scanEditableElements does for initial elements
                this.editableTypes.set(key, info.type);

                // For new instance elements, normalize whitespace (no saved content exists yet)
                this.normalizeDomWhitespace(element, info.type);

                const content = this.getElementContent(key, elementInfo);
                this.originalContent.set(key, content);
                this.currentContent.set(key, content);
            }

            this.elementToKey.set(element, key);
            // Type may already be set above or from existing registration
            if (!this.editableTypes.has(key)) {
                this.editableTypes.set(key, info.type);
            }
        });
    }

    /**
     * Set up click handlers and styles for a new instance in author mode
     */
    private setupInstanceForAuthorMode(
        instanceElement: HTMLElement,
        _templateId: string,
        _instanceId: string,
    ): void {
        const selector = "[data-scms-text], [data-scms-html], [data-scms-image], [data-scms-link]";
        // Include instanceElement itself if it matches (e.g., <li data-scms-text="item">)
        const descendants = Array.from(instanceElement.querySelectorAll<HTMLElement>(selector));
        const elements = instanceElement.matches(selector)
            ? [instanceElement, ...descendants]
            : descendants;
        elements.forEach((element) => {
            const key = this.elementToKey.get(element);
            if (!key) return;

            element.classList.add("streamlined-editable");
            this.setupElementClickHandler(element, key);
        });

        // Add delete button for this instance (skip if instance is also the editable element)
        if (!this.isInstanceAlsoEditable(instanceElement)) {
            this.addInstanceDeleteButton(instanceElement);
        }
    }

    /**
     * Add floating delete button to a template instance
     */
    private addInstanceDeleteButton(instanceElement: HTMLElement): void {
        // Don't add if already has one
        if (instanceElement.querySelector(".scms-instance-delete")) return;

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
     * Add drag handle to a template instance for reordering
     */
    private addInstanceDragHandle(instanceElement: HTMLElement): void {
        // Don't add if already has one
        if (instanceElement.querySelector(".scms-instance-drag-handle")) return;

        const dragHandle = document.createElement("div");
        dragHandle.className = "scms-instance-drag-handle";
        // 3x3 dot grip icon (like Lucide's grip icon)
        dragHandle.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="6" cy="6" r="1.5"/>
                <circle cx="12" cy="6" r="1.5"/>
                <circle cx="18" cy="6" r="1.5"/>
                <circle cx="6" cy="12" r="1.5"/>
                <circle cx="12" cy="12" r="1.5"/>
                <circle cx="18" cy="12" r="1.5"/>
                <circle cx="6" cy="18" r="1.5"/>
                <circle cx="12" cy="18" r="1.5"/>
                <circle cx="18" cy="18" r="1.5"/>
            </svg>
        `;
        dragHandle.title = "Drag to reorder";

        instanceElement.appendChild(dragHandle);
    }

    /**
     * Initialize SortableJS on a template container for drag-and-drop reordering
     */
    private initializeSortable(templateId: string, container: HTMLElement): void {
        const sortable = Sortable.create(container, {
            animation: 150,
            handle: ".scms-instance-drag-handle",
            draggable: "[data-scms-instance]",
            ghostClass: "scms-sortable-ghost",
            chosenClass: "scms-sortable-chosen",
            dragClass: "scms-sortable-drag",
            filter: ".scms-template-add", // Don't drag the add button
            onEnd: (evt) => {
                const { oldIndex, newIndex } = evt;
                if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) {
                    return;
                }

                // SortableJS already moved the DOM element, but we need to update our tracking
                const templateInfo = this.templates.get(templateId);
                if (!templateInfo) return;

                // Update the instanceIds array to match the new DOM order
                const [movedId] = templateInfo.instanceIds.splice(oldIndex, 1);
                templateInfo.instanceIds.splice(newIndex, 0, movedId);

                // Update order in content
                this.updateOrderContent(templateId, templateInfo);

                // Mark as having unsaved changes
                this.updateToolbarHasChanges();

                // Update toolbar context if editing an element in this template
                this.updateToolbarTemplateContext();

                this.log.debug("Reordered via drag-and-drop", { templateId, oldIndex, newIndex });
            },
        });

        this.sortableInstances.set(templateId, sortable);
    }

    /**
     * Update toolbar with current template context
     * Shows add/remove/reorder controls when editing an element inside a template
     */
    private updateToolbarTemplateContext(): void {
        if (!this.toolbar) return;

        // Get template context from currently editing or selected element
        const activeKey = this.editingKey || this.selectedKey;
        if (!activeKey) {
            // Clear template context when nothing is active
            this.toolbar.templateId = null;
            this.toolbar.instanceId = null;
            this.toolbar.instanceIndex = null;
            this.toolbar.instanceCount = null;
            this.toolbar.structureMismatch = false;
            return;
        }

        const infos = this.editableElements.get(activeKey);
        if (!infos || infos.length === 0) {
            this.toolbar.templateId = null;
            this.toolbar.instanceId = null;
            this.toolbar.instanceIndex = null;
            this.toolbar.instanceCount = null;
            this.toolbar.structureMismatch = false;
            return;
        }

        // Use the first info to get template context
        const info = infos[0];
        if (!info.templateId || !info.instanceId) {
            // Element is not in a template
            this.toolbar.templateId = null;
            this.toolbar.instanceId = null;
            this.toolbar.instanceIndex = null;
            this.toolbar.instanceCount = null;
            this.toolbar.structureMismatch = false;
            return;
        }

        const templateInfo = this.templates.get(info.templateId);
        if (!templateInfo) {
            this.toolbar.templateId = null;
            this.toolbar.instanceId = null;
            this.toolbar.instanceIndex = null;
            this.toolbar.instanceCount = null;
            this.toolbar.structureMismatch = false;
            return;
        }

        // Set template context on toolbar
        this.toolbar.templateId = info.templateId;
        this.toolbar.instanceId = info.instanceId;
        this.toolbar.instanceIndex = templateInfo.instanceIds.indexOf(info.instanceId);
        this.toolbar.instanceCount = templateInfo.instanceIds.length;

        // Check if this instance has a structure mismatch
        const instanceElement = templateInfo.container.querySelector(
            `[data-scms-instance="${info.instanceId}"]`,
        );
        this.toolbar.structureMismatch =
            instanceElement?.hasAttribute("data-scms-structure-mismatch") ?? false;
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
