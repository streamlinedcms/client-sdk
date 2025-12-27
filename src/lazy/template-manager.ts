/**
 * TemplateManager - Handles template instance CRUD and reordering
 *
 * Responsible for:
 * - Scanning and initializing template containers
 * - Adding, removing, and reordering template instances
 * - Managing template UI controls (add buttons, delete buttons, drag handles)
 * - Tracking template order for persistence
 */

import type { Logger } from "loganite";
import Sortable from "sortablejs";
import type { EditorState, TemplateInfo, EditableElementInfo } from "./state.js";
import type { ContentManager } from "./content-manager.js";
import {
    EDITABLE_SELECTOR,
    IMAGE_PLACEHOLDER_DATA_URI,
    type EditableType,
} from "../types.js";

/**
 * Helpers that TemplateManager needs from EditorController
 */
export interface TemplateManagerHelpers {
    getGroupIdFromElement: (element: HTMLElement) => string | null;
    getEditableInfo: (element: HTMLElement) => { id: string; type: EditableType } | null;
    getStorageContext: (element: HTMLElement) => {
        groupId: string | null;
        templateId: string | null;
        instanceId: string | null;
    };
    buildStorageKey: (
        context: { groupId: string | null; templateId: string | null; instanceId: string | null },
        elementId: string,
    ) => string;
    normalizeDomWhitespace: (element: HTMLElement, type: EditableType) => void;
    isInstanceAlsoEditable: (instanceElement: HTMLElement) => boolean;
    setupElementClickHandler: (element: HTMLElement, key: string) => void;
    selectInstance: (instanceElement: HTMLElement) => void;
    stopEditing: () => void;
    updateToolbarHasChanges: () => void;
    getElementToKeyMap: () => WeakMap<HTMLElement, string>;
}

export class TemplateManager {
    private instanceDeleteButtons = new WeakMap<HTMLElement, HTMLButtonElement>();

    constructor(
        private state: EditorState,
        private log: Logger,
        private contentManager: ContentManager,
        private helpers: TemplateManagerHelpers,
    ) {}

    // ==================== Template Initialization ====================

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
        const editableSelector = EDITABLE_SELECTOR;
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
    scanTemplates(): void {
        this.state.templates.clear();
        document.querySelectorAll<HTMLElement>("[data-scms-template]").forEach((container) => {
            const templateId = container.getAttribute("data-scms-template");
            if (!templateId) return;

            // Get the first child as the template definition
            const templateElement = container.firstElementChild as HTMLElement | null;
            if (!templateElement) return;

            // Check if template is inside a group
            const groupId = this.helpers.getGroupIdFromElement(container);

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

            this.state.templates.set(templateId, {
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
            this.state.originalContent.set(contentKey, orderContent);
            this.state.currentContent.set(contentKey, orderContent);
        });

        this.log.debug("Scanned templates", { count: this.state.templates.size });
    }

    // ==================== Order Tracking ====================

    /**
     * Update currentContent for a template's order array
     */
    updateOrderContent(templateId: string, templateInfo: TemplateInfo): void {
        const orderKey = `${templateId}._order`;
        const contentKey = templateInfo.groupId ? `${templateInfo.groupId}:${orderKey}` : orderKey;
        const orderContent = JSON.stringify({ type: "order", value: templateInfo.instanceIds });
        this.state.currentContent.set(contentKey, orderContent);
    }

    /**
     * Get template IDs that have order changes (currentContent differs from originalContent)
     */
    getTemplatesWithOrderChanges(): string[] {
        const changed: string[] = [];
        this.state.templates.forEach((templateInfo, templateId) => {
            const orderKey = `${templateId}._order`;
            const contentKey = templateInfo.groupId
                ? `${templateInfo.groupId}:${orderKey}`
                : orderKey;
            const currentOrder = this.state.currentContent.get(contentKey);
            const originalOrder = this.state.originalContent.get(contentKey);
            if (currentOrder !== originalOrder) {
                changed.push(templateId);
            }
        });
        return changed;
    }

    // ==================== Template Controls UI ====================

    /**
     * Show template add buttons and instance delete buttons
     */
    showTemplateControls(): void {
        // Add "Add" button to each template container
        this.state.templates.forEach((templateInfo, templateId) => {
            if (this.state.templateAddButtons.has(templateId)) return;

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
            this.state.templateAddButtons.set(templateId, addBtn);
        });

        // Add delete buttons and drag handles to existing instances
        // (skip if instance element IS the editable element - use toolbar controls instead)
        this.state.templates.forEach((templateInfo, templateId) => {
            const { container } = templateInfo;
            const instances = container.querySelectorAll<HTMLElement>("[data-scms-instance]");
            let hasInlineControls = false;

            instances.forEach((instanceElement) => {
                // Skip inline controls if instance is also the editable element
                if (this.helpers.isInstanceAlsoEditable(instanceElement)) return;

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
                        this.helpers.selectInstance(instanceElement);
                    });
                    instanceElement.dataset.scmsInstanceClickHandler = "true";
                }
            });

            // Initialize SortableJS for drag-and-drop reordering (only if we have drag handles)
            if (
                hasInlineControls &&
                !this.state.sortableInstances.has(templateId) &&
                templateInfo.instanceCount > 1
            ) {
                this.initializeSortable(templateId, container);
            }
        });
    }

    /**
     * Hide template add buttons, delete buttons, drag handles, and destroy sortable instances
     */
    hideTemplateControls(): void {
        // Remove all add buttons
        this.state.templateAddButtons.forEach((btn) => {
            btn.remove();
        });
        this.state.templateAddButtons.clear();

        // Remove all delete buttons and drag handles (query DOM directly to catch any stragglers)
        this.state.templates.forEach((templateInfo) => {
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
        this.state.sortableInstances.forEach((sortable) => {
            sortable.destroy();
        });
        this.state.sortableInstances.clear();
    }

    // ==================== Toolbar Handlers ====================

    handleAddInstance(): void {
        if (!this.state.toolbar?.templateId) {
            this.log.debug("No template context for add instance");
            return;
        }
        this.addInstance(this.state.toolbar.templateId);
    }

    handleDeleteInstance(): void {
        if (!this.state.toolbar?.templateId || !this.state.toolbar?.instanceId) {
            this.log.debug("No template context for delete instance");
            return;
        }
        this.removeInstance(this.state.toolbar.templateId, this.state.toolbar.instanceId);
    }

    handleMoveInstanceUp(): void {
        if (!this.state.toolbar?.templateId || this.state.toolbar?.instanceIndex === null) {
            this.log.debug("No template context for move up");
            return;
        }
        const fromIndex = this.state.toolbar.instanceIndex;
        if (fromIndex > 0) {
            this.reorderInstance(this.state.toolbar.templateId, fromIndex, fromIndex - 1);
        }
    }

    handleMoveInstanceDown(): void {
        if (
            !this.state.toolbar?.templateId ||
            this.state.toolbar?.instanceIndex === null ||
            this.state.toolbar?.instanceCount === null
        ) {
            this.log.debug("No template context for move down");
            return;
        }
        const fromIndex = this.state.toolbar.instanceIndex;
        if (fromIndex < this.state.toolbar.instanceCount - 1) {
            this.reorderInstance(this.state.toolbar.templateId, fromIndex, fromIndex + 1);
        }
    }

    // ==================== Template Instance CRUD ====================

    /**
     * Add a new instance to a template
     */
    addInstance(templateId: string): void {
        const templateInfo = this.state.templates.get(templateId);
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
        const addButton = this.state.templateAddButtons.get(templateId);
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
        if (this.state.currentMode === "author") {
            this.setupInstanceForAuthorMode(clone, templateId, newInstanceId);
        }

        this.log.debug("Added template instance", { templateId, instanceId: newInstanceId });

        // If we now have 2+ instances, add delete buttons and drag handles to all instances
        // (skip if instance element IS the editable element - use toolbar controls instead)
        if (templateInfo.instanceCount >= 2 && this.state.currentMode === "author") {
            let hasInlineControls = false;
            container
                .querySelectorAll<HTMLElement>("[data-scms-instance]")
                .forEach((instanceElement) => {
                    if (this.helpers.isInstanceAlsoEditable(instanceElement)) return;
                    hasInlineControls = true;
                    this.addInstanceDeleteButton(instanceElement);
                    this.addInstanceDragHandle(instanceElement);
                });
            if (hasInlineControls && !this.state.sortableInstances.has(templateId)) {
                this.initializeSortable(templateId, container);
            }
        }

        // Select the new instance (for mobile controls visibility)
        if (!this.helpers.isInstanceAlsoEditable(clone)) {
            this.helpers.selectInstance(clone);
        }

        // Mark as having unsaved changes (order array will be saved with other changes)
        this.helpers.updateToolbarHasChanges();

        // Notify toolbar that we're in a template context
        this.updateToolbarTemplateContext();
    }

    /**
     * Remove a template instance
     */
    async removeInstance(templateId: string, instanceId: string): Promise<void> {
        const templateInfo = this.state.templates.get(templateId);
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
        const selector = EDITABLE_SELECTOR;
        // Include instanceElement itself if it matches (e.g., <li data-scms-text="item">)
        const descendants = Array.from(instanceElement.querySelectorAll<HTMLElement>(selector));
        const elements = instanceElement.matches(selector)
            ? [instanceElement, ...descendants]
            : descendants;
        elements.forEach((el) => {
            const info = this.helpers.getEditableInfo(el);
            if (info) {
                const context = this.helpers.getStorageContext(el);
                const key = this.helpers.buildStorageKey(context, info.id);
                keysToDelete.push(key);
            }
        });

        // Stop editing if we're editing something in this instance
        if (this.state.editingKey && keysToDelete.includes(this.state.editingKey)) {
            this.helpers.stopEditing();
        }

        // Remove from DOM
        instanceElement.remove();

        // Update tracking - remove from currentContent to mark for deletion
        // (deletion is derived from: key in originalContent but not in currentContent)
        keysToDelete.forEach((key) => {
            const infos = this.state.editableElements.get(key);
            if (infos) {
                // Remove elements that were in this instance
                const remaining = infos.filter((info) => info.instanceId !== instanceId);
                if (remaining.length > 0) {
                    this.state.editableElements.set(key, remaining);
                } else {
                    // No more DOM elements for this key
                    this.state.editableElements.delete(key);
                    this.state.editableTypes.delete(key);
                    // Remove from currentContent (will be detected as pending delete)
                    this.state.currentContent.delete(key);
                }
            }
        });

        // Update instance tracking (remove from order array)
        templateInfo.instanceIds = templateInfo.instanceIds.filter((id) => id !== instanceId);
        templateInfo.instanceCount = templateInfo.instanceIds.length;
        this.updateOrderContent(templateId, templateInfo);

        // Mark order array as dirty (will be saved with other changes)
        this.helpers.updateToolbarHasChanges();

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
            const sortable = this.state.sortableInstances.get(templateId);
            if (sortable) {
                sortable.destroy();
                this.state.sortableInstances.delete(templateId);
            }
        }

        // Update toolbar
        this.updateToolbarTemplateContext();
    }

    /**
     * Reorder a template instance by moving it from one index to another
     */
    reorderInstance(templateId: string, fromIndex: number, toIndex: number): void {
        const templateInfo = this.state.templates.get(templateId);
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
            const addButton = this.state.templateAddButtons.get(templateId);
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
        this.helpers.updateToolbarHasChanges();

        this.log.debug("Reordered template instance", {
            templateId,
            instanceId,
            fromIndex,
            toIndex,
        });

        // Update toolbar (index may have changed)
        this.updateToolbarTemplateContext();
    }

    // ==================== Instance Registration ====================

    /**
     * Register editable elements from a new instance
     */
    registerInstanceElements(
        instanceElement: HTMLElement,
        templateId: string,
        instanceId: string,
        groupId: string | null,
    ): void {
        const selector = EDITABLE_SELECTOR;
        // Include instanceElement itself if it matches (e.g., <li data-scms-text="item">)
        const descendants = Array.from(instanceElement.querySelectorAll<HTMLElement>(selector));
        const elements = instanceElement.matches(selector)
            ? [instanceElement, ...descendants]
            : descendants;

        const elementToKey = this.helpers.getElementToKeyMap();

        elements.forEach((element) => {
            const info = this.helpers.getEditableInfo(element);
            if (!info) return;

            // Determine context - check if element is in a group inside the template
            const elementGroupId = this.helpers.getGroupIdFromElement(element);
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

            const key = this.helpers.buildStorageKey(context, info.id);

            const elementInfo: EditableElementInfo = {
                element,
                elementId: info.id,
                groupId: context.groupId,
                templateId: context.templateId,
                instanceId: context.instanceId,
            };

            // Add to tracking
            const existing = this.state.editableElements.get(key);
            if (existing) {
                existing.push(elementInfo);
                // Sync the new element with existing shared content (e.g., group inside template)
                let content = this.state.currentContent.get(key);
                if (!content && existing.length > 0) {
                    // No saved content yet - get content from an existing element
                    content = this.contentManager.getElementContent(key, existing[0]);
                }
                if (content) {
                    this.contentManager.applyElementContent(key, elementInfo, content);
                }
            } else {
                this.state.editableElements.set(key, [elementInfo]);

                // Initialize content state from DOM (first element for this key)
                // This mirrors what scanEditableElements does for initial elements
                this.state.editableTypes.set(key, info.type);

                // For new instance elements, normalize whitespace (no saved content exists yet)
                this.helpers.normalizeDomWhitespace(element, info.type);

                const content = this.contentManager.getElementContent(key, elementInfo);
                this.state.originalContent.set(key, content);
                this.state.currentContent.set(key, content);
            }

            elementToKey.set(element, key);
            // Type may already be set above or from existing registration
            if (!this.state.editableTypes.has(key)) {
                this.state.editableTypes.set(key, info.type);
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
        const selector = EDITABLE_SELECTOR;
        // Include instanceElement itself if it matches (e.g., <li data-scms-text="item">)
        const descendants = Array.from(instanceElement.querySelectorAll<HTMLElement>(selector));
        const elements = instanceElement.matches(selector)
            ? [instanceElement, ...descendants]
            : descendants;

        const elementToKey = this.helpers.getElementToKeyMap();

        elements.forEach((element) => {
            const key = elementToKey.get(element);
            if (!key) return;

            element.classList.add("streamlined-editable");
            this.helpers.setupElementClickHandler(element, key);
        });

        // Add delete button for this instance (skip if instance is also the editable element)
        if (!this.helpers.isInstanceAlsoEditable(instanceElement)) {
            this.addInstanceDeleteButton(instanceElement);
        }
    }

    // ==================== Instance UI Controls ====================

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
        const templateInfo = this.state.templates.get(templateId);
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
                const templateInfo = this.state.templates.get(templateId);
                if (!templateInfo) return;

                // Update the instanceIds array to match the new DOM order
                const [movedId] = templateInfo.instanceIds.splice(oldIndex, 1);
                templateInfo.instanceIds.splice(newIndex, 0, movedId);

                // Update order in content
                this.updateOrderContent(templateId, templateInfo);

                // Mark as having unsaved changes
                this.helpers.updateToolbarHasChanges();

                // Update toolbar context if editing an element in this template
                this.updateToolbarTemplateContext();

                this.log.debug("Reordered via drag-and-drop", { templateId, oldIndex, newIndex });
            },
        });

        this.state.sortableInstances.set(templateId, sortable);
    }

    // ==================== Toolbar Context ====================

    /**
     * Update toolbar with current template context
     * Shows add/remove/reorder controls when editing an element inside a template
     */
    updateToolbarTemplateContext(): void {
        if (!this.state.toolbar) return;

        // Get template context from currently editing or selected element
        const activeKey = this.state.editingKey || this.state.selectedKey;
        if (!activeKey) {
            // Clear template context when nothing is active
            this.state.toolbar.templateId = null;
            this.state.toolbar.instanceId = null;
            this.state.toolbar.instanceIndex = null;
            this.state.toolbar.instanceCount = null;
            this.state.toolbar.structureMismatch = false;
            return;
        }

        const infos = this.state.editableElements.get(activeKey);
        if (!infos || infos.length === 0) {
            this.state.toolbar.templateId = null;
            this.state.toolbar.instanceId = null;
            this.state.toolbar.instanceIndex = null;
            this.state.toolbar.instanceCount = null;
            this.state.toolbar.structureMismatch = false;
            return;
        }

        // Use the first info to get template context
        const info = infos[0];
        if (!info.templateId || !info.instanceId) {
            // Element is not in a template
            this.state.toolbar.templateId = null;
            this.state.toolbar.instanceId = null;
            this.state.toolbar.instanceIndex = null;
            this.state.toolbar.instanceCount = null;
            this.state.toolbar.structureMismatch = false;
            return;
        }

        const templateInfo = this.state.templates.get(info.templateId);
        if (!templateInfo) {
            this.state.toolbar.templateId = null;
            this.state.toolbar.instanceId = null;
            this.state.toolbar.instanceIndex = null;
            this.state.toolbar.instanceCount = null;
            this.state.toolbar.structureMismatch = false;
            return;
        }

        // Set template context on toolbar
        this.state.toolbar.templateId = info.templateId;
        this.state.toolbar.instanceId = info.instanceId;
        this.state.toolbar.instanceIndex = templateInfo.instanceIds.indexOf(info.instanceId);
        this.state.toolbar.instanceCount = templateInfo.instanceIds.length;

        // Check if this instance has a structure mismatch
        const instanceElement = templateInfo.container.querySelector(
            `[data-scms-instance="${info.instanceId}"]`,
        );
        this.state.toolbar.structureMismatch =
            instanceElement?.hasAttribute("data-scms-structure-mismatch") ?? false;
    }

    // ==================== Public Accessors ====================

    /**
     * Get info about a template (for toolbar use)
     */
    getTemplateInfo(templateId: string): TemplateInfo | undefined {
        return this.state.templates.get(templateId);
    }

    /**
     * Get all templates
     */
    getTemplates(): Map<string, TemplateInfo> {
        return this.state.templates;
    }
}
