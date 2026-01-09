/**
 * SaveManager - Handles saving and resetting content changes
 *
 * Responsible for:
 * - Checking for unsaved changes
 * - Batching save operations
 * - Saving content to API
 * - Resetting individual elements
 * - Updating toolbar state
 */

import type { Logger } from "loganite";
import type { EditorState } from "./state.js";
import type { ContentManager } from "./content-manager.js";
import type { DraftManager } from "./draft-manager.js";
import type { TemplateManager } from "./template-manager.js";
import type { EditingManager } from "./editing-manager.js";
import type { BatchUpdateRequest, BatchUpdateResponse } from "../types.js";
import { parseTemplateKey, buildTemplateKey, parseStorageKey } from "../types.js";

/**
 * Error thrown when an API request fails due to authentication issues (401)
 */
class AuthError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AuthError";
    }
}

/**
 * Error thrown when an API request fails due to permission issues (403)
 */
class PermissionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PermissionError";
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
 * Configuration for SaveManager
 */
export interface SaveManagerConfig {
    apiUrl: string;
    appId: string;
}

/**
 * Helpers that SaveManager needs from EditorController
 */
export interface SaveManagerHelpers {
    apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
    signOut: (skipConfirmation: boolean) => void;
    fetchSavedContentKeys: () => Promise<boolean>;
    refetchPermissions: () => Promise<void>;
    disableEditing: () => void;
    updateToolbarReadOnly: () => void;
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

export class SaveManager {
    constructor(
        private state: EditorState,
        private log: Logger,
        private contentManager: ContentManager,
        private draftManager: DraftManager,
        private templateManager: TemplateManager,
        private editingManager: EditingManager,
        private config: SaveManagerConfig,
        private helpers: SaveManagerHelpers,
    ) {}

    /**
     * Check if there are any unsaved changes (dirty elements, pending deletes, or order changes)
     */
    hasUnsavedChanges(): boolean {
        return (
            this.contentManager.getDirtyElements().size > 0 ||
            this.draftManager.getPendingDeletes().length > 0 ||
            this.templateManager.getTemplatesWithOrderChanges().length > 0
        );
    }

    /**
     * Update toolbar to reflect whether there are unsaved changes
     */
    updateToolbarHasChanges(): void {
        if (this.state.toolbar) {
            this.state.toolbar.hasChanges = this.hasUnsavedChanges();
        }
        this.draftManager.saveDraftToLocalStorage();
    }

    /**
     * Save all pending changes to the API
     */
    async handleSave(): Promise<void> {
        const dirtyElements = this.contentManager.getDirtyElements();
        const pendingDeletes = this.draftManager.getPendingDeletes();
        const templatesWithOrderChanges = this.templateManager.getTemplatesWithOrderChanges();
        const hasOrderChanges = templatesWithOrderChanges.length > 0;

        // Get unsaved template elements (HTML-derived items that need to be persisted
        // when the template order changes)
        const unsavedTemplateElements =
            this.contentManager.getUnsavedTemplateElements(templatesWithOrderChanges);

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
                        ? buildTemplateKey(info.templateId, info.instanceId, info.elementId)
                        : info.elementId;

                operations.push({
                    groupId: info.groupId,
                    elementId: storageElementId,
                    content: content,
                });
            }

            // 2. Collect delete operations
            for (const key of pendingDeletes) {
                const { elementId, groupId } = parseStorageKey(key);
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

                const response = await this.helpers.apiFetch(batchUrl, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify(request),
                });

                if (!response.ok) {
                    if (response.status === 401) {
                        throw new AuthError(
                            `Batch ${i + 1}: ${response.status} ${response.statusText}`,
                        );
                    }
                    if (response.status === 403) {
                        throw new PermissionError(
                            `Batch ${i + 1}: ${response.status} ${response.statusText}`,
                        );
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
                await this.helpers.fetchSavedContentKeys();

                // Clear draft from localStorage after successful save
                this.draftManager.clearDraft();
            }

            this.updateToolbarHasChanges();
        } catch (error) {
            if (error instanceof AuthError) {
                this.log.error("Authentication failed during save", { error: error.message });
                alert("Your session has expired. Please sign in again to save your changes.");
                this.helpers.signOut(true); // Skip "unsaved changes" confirmation
                return;
            }
            if (error instanceof PermissionError) {
                this.log.warn("Permission denied during save, refetching permissions", {
                    error: error.message,
                });
                // Refetch permissions - they may have changed
                await this.helpers.refetchPermissions();
                // Disable editing if user no longer has contentWrite permission
                if (this.state.permissions?.contentWrite === false) {
                    this.helpers.disableEditing();
                    this.helpers.updateToolbarReadOnly();
                    alert(
                        "Your permissions have changed. You no longer have permission to edit content.",
                    );
                } else {
                    // Permission denied for another reason (domain not whitelisted, etc.)
                    alert(
                        "Permission denied. Check that this domain is whitelisted in Admin → Settings.",
                    );
                }
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

    /**
     * Reset the currently selected element to its original content
     */
    handleReset(): void {
        if (!this.state.selectedKey) {
            return;
        }

        const key = this.state.selectedKey;
        const originalContent = this.state.originalContent.get(key);
        const elementType = this.state.editableTypes.get(key) || "html";

        if (originalContent !== undefined) {
            this.log.debug("Resetting element", { key, elementType });
            // Restore currentContent from originalContent, then sync DOM
            this.state.currentContent.set(key, originalContent);
            this.contentManager.syncAllElementsFromContent(key);
            this.updateToolbarHasChanges();
        }
    }
}
