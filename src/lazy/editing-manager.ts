/**
 * EditingManager - Handles element selection and editing state
 *
 * Responsible for:
 * - Selecting/deselecting elements (mobile two-step flow)
 * - Starting/stopping editing mode
 * - Managing contenteditable state
 * - Keyboard navigation between elements
 */

import type { Logger } from "loganite";
import type { EditorState } from "./state.js";
import type { ContentManager } from "./content-manager.js";
import { EDITABLE_SELECTOR } from "../types.js";

/**
 * Helpers that EditingManager needs from EditorController
 */
export interface EditingManagerHelpers {
    updateToolbarHasChanges: () => void;
    updateToolbarTemplateContext: () => void;
    getElementToKeyMap: () => WeakMap<HTMLElement, string>;
    scrollToElement: (element: HTMLElement, delay?: number) => void;
}

export class EditingManager {
    constructor(
        private state: EditorState,
        private log: Logger,
        private contentManager: ContentManager,
        private helpers: EditingManagerHelpers,
    ) {}

    /**
     * Select an element without starting editing (mobile two-step flow).
     * Shows visual selection and updates toolbar, but doesn't make contenteditable or focus.
     */
    selectElement(key: string, clickedElement?: HTMLElement): void {
        const infos = this.state.editableElements.get(key);
        if (!infos || infos.length === 0) {
            this.log.warn("Element not found for selection", { key });
            return;
        }

        // Use the clicked element, or first element if not specified
        const primaryInfo = clickedElement
            ? infos.find((i) => i.element === clickedElement) || infos[0]
            : infos[0];

        const elementType = this.state.editableTypes.get(key) || "html";
        this.log.trace("Selecting element", {
            key,
            elementId: primaryInfo.elementId,
            groupId: primaryInfo.groupId,
            elementType,
        });

        // Deselect previous element if different
        if (this.state.selectedKey && this.state.selectedKey !== key) {
            this.deselectElement();
        }

        // Stop editing if we're editing a different element
        if (this.state.editingKey && this.state.editingKey !== key) {
            this.stopEditing();
        }

        this.state.selectedKey = key;

        // Also select parent instance if element is inside one
        const parentInstance = primaryInfo.element.closest(
            "[data-scms-instance]",
        ) as HTMLElement | null;
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
        if (this.state.toolbar) {
            this.state.toolbar.activeElement = key;
            this.state.toolbar.activeElementType = elementType;
        }

        // Update template context on toolbar
        this.helpers.updateToolbarTemplateContext();
    }

    /**
     * Deselect the currently selected element without starting editing.
     */
    deselectElement(): void {
        if (!this.state.selectedKey) return;

        const infos = this.state.editableElements.get(this.state.selectedKey);
        if (infos) {
            for (const info of infos) {
                info.element.classList.remove("streamlined-selected");
                info.element.classList.remove("streamlined-selected-sibling");
            }
        }

        this.state.selectedKey = null;

        // Clear toolbar if not editing
        if (!this.state.editingKey && this.state.toolbar) {
            this.state.toolbar.activeElement = null;
            this.state.toolbar.activeElementType = null;
        }
    }

    /**
     * Select a template instance (for mobile controls visibility).
     */
    selectInstance(instanceElement: HTMLElement): void {
        if (this.state.selectedInstance === instanceElement) return;

        // Deselect previous instance
        if (this.state.selectedInstance) {
            this.state.selectedInstance.classList.remove("scms-instance-selected");
        }

        // Deselect any element that's in a different instance
        const newInstanceId = instanceElement.getAttribute("data-scms-instance");
        const activeKey = this.state.editingKey || this.state.selectedKey;
        if (activeKey && newInstanceId) {
            const infos = this.state.editableElements.get(activeKey);
            const activeInstanceId = infos?.[0]?.instanceId;
            if (activeInstanceId && activeInstanceId !== newInstanceId) {
                this.stopEditing();
                this.deselectElement();
            }
        }

        this.state.selectedInstance = instanceElement;
        instanceElement.classList.add("scms-instance-selected");

        // Update toolbar to show template controls
        this.helpers.updateToolbarTemplateContext();
    }

    /**
     * Deselect the currently selected template instance.
     */
    deselectInstance(): void {
        if (!this.state.selectedInstance) return;

        this.state.selectedInstance.classList.remove("scms-instance-selected");
        this.state.selectedInstance = null;

        // Update toolbar to clear template controls
        this.helpers.updateToolbarTemplateContext();
    }

    /**
     * Start editing an element (makes it contenteditable and focuses it).
     */
    startEditing(key: string, clickedElement?: HTMLElement): void {
        const infos = this.state.editableElements.get(key);
        if (!infos || infos.length === 0) {
            this.log.warn("Element not found", { key });
            return;
        }

        // Use the clicked element, or first element if not specified
        const primaryInfo = clickedElement
            ? infos.find((i) => i.element === clickedElement) || infos[0]
            : infos[0];

        const elementType = this.state.editableTypes.get(key) || "html";
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
        if (this.state.editingKey && this.state.editingKey !== key) {
            this.stopEditing();
        }

        // Already editing this element - nothing more to do
        if (this.state.editingKey === key) {
            return;
        }

        this.state.editingKey = key;

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
                    this.contentManager.updateContentFromElement(key, info.element);
                    this.helpers.updateToolbarHasChanges();
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
            this.helpers.scrollToElement(primaryInfo.element, 300);
        }
    }

    /**
     * Navigate to the next or previous editable element from the current one.
     * Uses DOM order to determine sequence. Includes all scms element types.
     */
    navigateToNextEditable(currentElement: HTMLElement, reverse: boolean): void {
        // Get all editable elements in DOM order (all scms types)
        const selector = EDITABLE_SELECTOR;
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
        const elementToKey = this.helpers.getElementToKeyMap();
        const nextKey = elementToKey.get(nextElement);

        if (nextKey) {
            this.startEditing(nextKey, nextElement);
        }
    }

    /**
     * Stop editing the currently active element.
     */
    stopEditing(): void {
        if (!this.state.editingKey) {
            return;
        }

        this.log.trace("Stopping edit");

        const infos = this.state.editableElements.get(this.state.editingKey);
        if (infos) {
            for (const info of infos) {
                info.element.classList.remove("streamlined-editing");
                info.element.classList.remove("streamlined-editing-sibling");
                info.element.setAttribute("contenteditable", "false");
            }
        }

        this.state.editingKey = null;

        // Only clear toolbar if nothing is selected (mobile two-step mode keeps selection)
        if (!this.state.selectedKey && this.state.toolbar) {
            this.state.toolbar.activeElement = null;
            this.state.toolbar.activeElementType = null;
            this.helpers.updateToolbarTemplateContext();
        }
    }
}
