/**
 * DraftManager - Handles localStorage draft persistence and restoration
 *
 * Responsible for:
 * - Saving unsaved changes to localStorage for recovery
 * - Restoring drafts on page reload
 * - Reconciling template instances with draft state
 */

import type { Logger } from "loganite";
import type { EditorState } from "./state.js";
import { EDITABLE_SELECTOR, IMAGE_PLACEHOLDER_DATA_URI, type EditableType } from "../types.js";

/**
 * Storage context for an element (used for building keys)
 */
interface StorageContext {
    groupId: string | null;
    templateId: string | null;
    instanceId: string | null;
}

/**
 * Helpers that DraftManager needs from EditorController
 */
export interface DraftManagerHelpers {
    syncAllElementsFromContent: (key: string) => void;
    getEditableInfo: (element: HTMLElement) => { id: string; type: EditableType } | null;
    getStorageContext: (element: HTMLElement) => StorageContext;
    buildStorageKey: (context: StorageContext, elementId: string) => string;
    registerInstanceElements: (
        element: HTMLElement,
        templateId: string,
        instanceId: string,
        groupId: string | null,
    ) => void;
}

export class DraftManager {
    constructor(
        private state: EditorState,
        private log: Logger,
        private draftStorageKey: string,
        private helpers: DraftManagerHelpers,
    ) {}

    /**
     * Get keys that are pending deletion (in savedContentKeys but not in currentContent)
     */
    getPendingDeletes(): string[] {
        const deletes: string[] = [];
        this.state.savedContentKeys.forEach((key) => {
            if (!this.state.currentContent.has(key)) {
                deletes.push(key);
            }
        });
        return deletes;
    }

    /**
     * Save current unsaved changes to localStorage for draft recovery.
     * Stores content changes and pending deletes so they can be restored
     * if the page is accidentally closed.
     */
    saveDraftToLocalStorage(): void {
        const draft: { content: Record<string, string>; deleted: string[] } = {
            content: {},
            deleted: [],
        };

        // First pass: find templates where order changed AND have unsaved instance content
        // These need ALL their unsaved content in the draft because HTML-derived
        // instances get new random IDs on reload and we need full content to restore
        const templatesWithUnsavedInstances = new Set<string>();
        const groupsInAffectedTemplates = new Set<string>();
        this.state.currentContent.forEach((current, key) => {
            if (key.endsWith("._order")) {
                const original = this.state.originalContent.get(key);

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
                    for (const [contentKey] of this.state.currentContent) {
                        if (
                            contentKey.startsWith(instancePrefix) &&
                            !this.state.savedContentKeys.has(contentKey)
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
                    const templateInfo = this.state.templates.get(templateId);
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
        this.state.currentContent.forEach((current, key) => {
            const original = this.state.originalContent.get(key);

            // Always save if content differs from original
            if (current !== original) {
                draft.content[key] = current;
                return;
            }

            // For unchanged content: also save if it belongs to a template with unsaved instances
            // AND is not already saved to the API (saved content will be restored from API)
            // This ensures HTML-derived instance content is preserved across reloads
            if (!key.endsWith("._order") && !this.state.savedContentKeys.has(key)) {
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
    restoreDraftFromLocalStorage(): void {
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
            if (
                key.endsWith("._order") ||
                (key.includes(":") && key.split(":")[1].endsWith("._order"))
            ) {
                continue;
            }

            this.state.currentContent.set(key, value);
            this.helpers.syncAllElementsFromContent(key);
        }

        // Step 3: Apply deletes
        for (const key of draft.deleted) {
            this.state.currentContent.delete(key);
        }

        this.log.info("Draft restored successfully");
    }

    /**
     * Clear the draft from localStorage (called after successful save)
     */
    clearDraft(): void {
        localStorage.removeItem(this.draftStorageKey);
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

            const templateInfo = this.state.templates.get(templateId);
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
            this.state.currentContent.set(key, value);
        }
    }

    /**
     * Add a template instance with a specific ID (for draft restoration).
     * Similar to addInstance() but uses a provided ID instead of generating one.
     */
    private addInstanceWithId(templateId: string, instanceId: string): void {
        const templateInfo = this.state.templates.get(templateId);
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
        const addButton = this.state.templateAddButtons.get(templateId);
        if (addButton && addButton.parentElement === container) {
            container.insertBefore(clone, addButton);
        } else {
            container.appendChild(clone);
        }

        // Update instance tracking
        templateInfo.instanceIds.push(instanceId);
        templateInfo.instanceCount = templateInfo.instanceIds.length;

        // Register editable elements in the new instance
        this.helpers.registerInstanceElements(clone, templateId, instanceId, groupId);

        this.log.debug("Added template instance from draft", { templateId, instanceId });
    }

    /**
     * Remove a template instance synchronously (for draft restoration).
     * Similar to removeInstance() but without async operations.
     */
    private removeInstanceSync(templateId: string, instanceId: string): void {
        const templateInfo = this.state.templates.get(templateId);
        if (!templateInfo) return;

        if (templateInfo.instanceCount <= 1) return;

        const { container } = templateInfo;

        const instanceElement = container.querySelector<HTMLElement>(
            `[data-scms-instance="${instanceId}"]`,
        );
        if (!instanceElement) return;

        // Collect element keys for this instance
        const keysToDelete: string[] = [];
        const selector = EDITABLE_SELECTOR;
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

        // Remove from DOM
        instanceElement.remove();

        // Update tracking
        keysToDelete.forEach((key) => {
            const infos = this.state.editableElements.get(key);
            if (infos) {
                const remaining = infos.filter((info) => info.instanceId !== instanceId);
                if (remaining.length > 0) {
                    this.state.editableElements.set(key, remaining);
                } else {
                    this.state.editableElements.delete(key);
                    this.state.editableTypes.delete(key);
                    this.state.currentContent.delete(key);
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
        const templateInfo = this.state.templates.get(templateId);
        if (!templateInfo) return;

        const { container } = templateInfo;

        // Get current instance elements
        const instanceElements = new Map<string, HTMLElement>();
        container.querySelectorAll<HTMLElement>("[data-scms-instance]").forEach((el) => {
            const id = el.getAttribute("data-scms-instance");
            if (id) instanceElements.set(id, el);
        });

        // Find insertion point (before add button or at end)
        const addButton = this.state.templateAddButtons.get(templateId);
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
}
