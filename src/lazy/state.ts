/**
 * Reactive state for the editor
 *
 * This module defines the shared state that managers operate on.
 * State is made reactive using @vue/reactivity so managers can
 * subscribe to changes rather than calling each other directly.
 */

import { reactive } from "@vue/reactivity";
import type Sortable from "sortablejs";
import type { EditorMode } from "../key-storage.js";
import type { EditableType, ElementAttributes } from "../types.js";
import type { Toolbar } from "../components/toolbar.js";
import type { HtmlEditorModal } from "../components/html-editor-modal.js";
import type { LinkEditorModal } from "../components/link-editor-modal.js";
import type { SeoModal } from "../components/seo-modal.js";
import type { AccessibilityModal } from "../components/accessibility-modal.js";
import type { AttributesModal } from "../components/attributes-modal.js";
import type { MediaManagerModal } from "../components/media-manager-modal.js";

/**
 * Info about an editable element in the DOM
 */
export interface EditableElementInfo {
    element: HTMLElement;
    elementId: string;
    groupId: string | null;
    templateId: string | null;
    instanceId: string | null;
}

/**
 * Info about a template container and its instances
 */
export interface TemplateInfo {
    templateId: string;
    container: HTMLElement;
    templateElement: HTMLElement;
    templateHtml: string;
    groupId: string | null;
    instanceIds: string[];
    instanceCount: number;
}

/**
 * The reactive state shared across all managers
 */
export interface EditorState {
    // Auth & mode
    apiKey: string | null;
    currentMode: EditorMode;
    editingEnabled: boolean;
    domainWarningShown: boolean;
    saving: boolean;

    // Element registry
    editableElements: Map<string, EditableElementInfo[]>;
    editableTypes: Map<string, EditableType>;

    // Content state
    originalContent: Map<string, string>;
    currentContent: Map<string, string>;
    savedContentKeys: Set<string>;
    elementAttributes: Map<string, ElementAttributes>;

    // Selection & editing
    selectedKey: string | null;
    editingKey: string | null;
    selectedInstance: HTMLElement | null;

    // Templates
    templates: Map<string, TemplateInfo>;
    templateAddButtons: Map<string, HTMLButtonElement>;
    sortableInstances: Map<string, Sortable>;

    // UI components
    toolbar: Toolbar | null;
    htmlEditorModal: HtmlEditorModal | null;
    linkEditorModal: LinkEditorModal | null;
    seoModal: SeoModal | null;
    accessibilityModal: AccessibilityModal | null;
    attributesModal: AttributesModal | null;
    mediaManagerModal: MediaManagerModal | null;

    // Sign-in UI
    customSignInTriggers: Map<Element, string>;

    // Mobile interaction
    lastTapTime: number;
    lastTapKey: string | null;
}

/**
 * Create initial reactive state
 */
export function createEditorState(): EditorState {
    return reactive({
        // Auth & mode
        apiKey: null,
        currentMode: "viewer",
        editingEnabled: false,
        domainWarningShown: false,
        saving: false,

        // Element registry
        editableElements: new Map(),
        editableTypes: new Map(),

        // Content state
        originalContent: new Map(),
        currentContent: new Map(),
        savedContentKeys: new Set(),
        elementAttributes: new Map(),

        // Selection & editing
        selectedKey: null,
        editingKey: null,
        selectedInstance: null,

        // Templates
        templates: new Map(),
        templateAddButtons: new Map(),
        sortableInstances: new Map(),

        // UI components
        toolbar: null,
        htmlEditorModal: null,
        linkEditorModal: null,
        seoModal: null,
        accessibilityModal: null,
        attributesModal: null,
        mediaManagerModal: null,

        // Sign-in UI
        customSignInTriggers: new Map(),

        // Mobile interaction
        lastTapTime: 0,
        lastTapKey: null,
    });
}
