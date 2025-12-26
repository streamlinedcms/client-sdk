/**
 * Log level options (matches loganite levels)
 * fatal = silent, error, warn, normal, info, debug, trace
 */
export type LogLevel = "fatal" | "error" | "warn" | "normal" | "info" | "debug" | "trace";

/**
 * Log level input options (accepts false/null which normalize to 'fatal')
 */
export type LogLevelInput = LogLevel | false | null;

/**
 * Configuration options for StreamlinedCMS
 */
export interface StreamlinedCMSConfig {
    /**
     * API endpoint URL (e.g., 'https://api.streamlinedcms.com')
     */
    apiUrl: string;

    /**
     * App GUI URL (e.g., 'https://app.streamlinedcms.com')
     * Used for login popup and media manager popup
     */
    appUrl: string;

    /**
     * Application ID (required)
     */
    appId: string;

    /**
     * Logging level: 'fatal' | 'error' | 'warn' | 'normal' | 'info' | 'debug' | 'trace' | false | null
     * Defaults to 'error'. Use false/null or 'fatal' to disable all logging.
     */
    logLevel?: LogLevelInput;

    /**
     * Mock authentication (for development)
     */
    mockAuth?: {
        enabled: boolean;
        userId?: string;
    };
}

/**
 * Content element data structure (stored/response format)
 * Note: appId, groupId, and elementId are derived from context/keys, not stored in the value
 */
export interface ContentElement {
    content: string;
    updatedAt: string;
    updatedBy?: string;
}

/**
 * Content element with elementId (for individual element responses)
 */
export interface ContentElementResponse extends ContentElement {
    elementId: string;
}

/**
 * Grouped content response structure (key-value format)
 */
export interface ContentGroup {
    elements: Record<string, ContentElement>;
}

/**
 * All content response from API (key-value format)
 * Elements are keyed by elementId, groups are keyed by groupId
 */
export interface AllContentResponse {
    elements: Record<string, ContentElement>;
    groups: Record<string, ContentGroup>;
}

/**
 * API response for saving content
 */
export interface SaveResponse {
    success: boolean;
    element?: ContentElement;
    error?: string;
}

/**
 * Input for creating/updating a content element in batch operations
 */
export interface ContentElementInput {
    content: string;
}

/**
 * Batch update request body for PATCH /apps/{appId}/content
 * Set element value to null to delete it
 */
export interface BatchUpdateRequest {
    elements?: Record<string, ContentElementInput | null>;
    groups?: Record<string, { elements: Record<string, ContentElementInput | null> }>;
}

/**
 * Batch update response from PATCH /apps/{appId}/content
 */
export interface BatchUpdateResponse {
    elements: Record<string, ContentElement>;
    groups: Record<string, { elements: Record<string, ContentElement> }>;
    deleted: {
        elements: string[];
        groups: Record<string, string[]>;
    };
}

/**
 * Editable element types
 */
export type EditableType = "text" | "html" | "image" | "link";

/**
 * CSS selector for all editable elements
 */
export const EDITABLE_SELECTOR =
    "[data-scms-text], [data-scms-html], [data-scms-image], [data-scms-link]";

/**
 * Placeholder image for new template instances (SVG data URI)
 */
export const IMAGE_PLACEHOLDER_DATA_URI =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect fill='%23e5e7eb' width='48' height='48'/%3E%3Cg transform='translate(12,12)'%3E%3Cpath d='M18 20H4V6h9V4H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-9h-2v9zm-7.79-3.17l-1.96-2.36L5.5 18h11l-3.54-4.71zM20 4V1h-2v3h-3c.01.01 0 2 0 2h3v2.99c.01.01 2 0 2 0V6h3V4h-3z' fill='%239ca3af'/%3E%3C/g%3E%3C/svg%3E";

/**
 * Element attributes (applied as HTML attributes)
 * Keys are attribute names (lowercase, e.g., 'aria-label', 'data-custom')
 */
export type ElementAttributes = Record<string, string>;

/**
 * Base content data with optional attributes
 */
interface BaseContentData {
    attributes?: ElementAttributes;
}

/**
 * Content data structures (stored as JSON in content field)
 */
export interface TextContentData extends BaseContentData {
    type: "text";
    value: string;
}

export interface HtmlContentData extends BaseContentData {
    type: "html";
    value: string;
}

export interface ImageContentData extends BaseContentData {
    type: "image";
    src: string;
}

export interface LinkContentData extends BaseContentData {
    type: "link";
    href: string;
    target: string;
    value: string;
}

export type ContentData = TextContentData | HtmlContentData | ImageContentData | LinkContentData;

/**
 * Template instance info for repeating content blocks
 */
export interface TemplateInfo {
    /** The template ID from data-scms-template attribute */
    templateId: string;
    /** The container element with data-scms-template */
    container: HTMLElement;
    /** The template definition (first child structure, cloned for each instance) */
    templateElement: HTMLElement;
    /** Number of instances currently in the DOM */
    instanceCount: number;
}

/**
 * Parsed template element key
 * Format: {templateId}.{instanceId}.{elementId}
 * instanceId is a stable 5-character alphanumeric ID (not a numeric index)
 */
export interface ParsedTemplateKey {
    templateId: string;
    instanceId: string;
    elementId: string;
}

/**
 * Parse a template element key into its components
 * Returns null if the key is not a valid template key
 */
export function parseTemplateKey(key: string): ParsedTemplateKey | null {
    // Template keys have format: templateId.instanceId.elementId
    // Need at least 3 parts separated by dots
    const firstDot = key.indexOf(".");
    if (firstDot === -1) return null;

    const secondDot = key.indexOf(".", firstDot + 1);
    if (secondDot === -1) return null;

    const templateId = key.slice(0, firstDot);
    const instanceId = key.slice(firstDot + 1, secondDot);
    const elementId = key.slice(secondDot + 1);

    if (!templateId || !instanceId || !elementId) return null;

    return { templateId, instanceId, elementId };
}

/**
 * Build a template element key from components
 */
export function buildTemplateKey(
    templateId: string,
    instanceId: string,
    elementId: string,
): string {
    return `${templateId}.${instanceId}.${elementId}`;
}

/**
 * Generate a stable instance ID (5 alphanumeric characters)
 * Uses crypto.getRandomValues for better randomness
 */
export function generateInstanceId(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    const array = new Uint8Array(5);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => chars[byte % chars.length]).join("");
}

/**
 * Order array key for a template
 * Stored as: {templateId}._order
 */
export function getOrderKey(templateId: string): string {
    return `${templateId}._order`;
}

/**
 * Parse an order array from stored content
 */
export function parseOrderArray(content: string): string[] {
    try {
        const data = JSON.parse(content);
        if (Array.isArray(data)) {
            return data.filter((id): id is string => typeof id === "string");
        }
        if (data.type === "order" && Array.isArray(data.value)) {
            return (data.value as unknown[]).filter((id): id is string => typeof id === "string");
        }
    } catch {
        // Invalid JSON
    }
    return [];
}

/**
 * Serialize an order array for storage
 */
export function serializeOrderArray(instanceIds: string[]): string {
    return JSON.stringify({ type: "order", value: instanceIds });
}

/**
 * Parsed storage key components
 */
export interface ParsedStorageKey {
    elementId: string;
    groupId: string | null;
}

/**
 * Parse a storage key into groupId and elementId components.
 * Storage keys have format: "elementId" or "groupId:elementId"
 */
export function parseStorageKey(key: string): ParsedStorageKey {
    const colonIndex = key.indexOf(":");
    if (colonIndex !== -1) {
        return { groupId: key.slice(0, colonIndex), elementId: key.slice(colonIndex + 1) };
    }
    return { groupId: null, elementId: key };
}

/**
 * Element attributes that define what the element is (src, href, target)
 */
export const ELEMENT_ATTRIBUTES = ["src", "href", "target"] as const;
export type ElementAttribute = (typeof ELEMENT_ATTRIBUTES)[number];

/**
 * Reserved attributes that should be shown but not editable
 */
export const RESERVED_ATTRIBUTES = ["class", "id", "style"] as const;
export type ReservedAttribute = (typeof RESERVED_ATTRIBUTES)[number];

/**
 * Known SEO attribute names
 */
export const SEO_ATTRIBUTES = ["alt", "title", "rel"] as const;
export type SeoAttribute = (typeof SEO_ATTRIBUTES)[number];

/**
 * Known accessibility attribute names
 */
export const ACCESSIBILITY_ATTRIBUTES = [
    "aria-label",
    "aria-describedby",
    "role",
    "tabindex",
] as const;
export type AccessibilityAttribute = (typeof ACCESSIBILITY_ATTRIBUTES)[number];

/**
 * All known attribute names (SEO + Accessibility)
 */
export const KNOWN_ATTRIBUTES = [...SEO_ATTRIBUTES, ...ACCESSIBILITY_ATTRIBUTES] as const;
export type KnownAttribute = (typeof KNOWN_ATTRIBUTES)[number];

/**
 * Attribute field configuration for modals
 */
export type AttributePriority = "primary" | "secondary" | "not-applicable";

export interface AttributeFieldConfig {
    name: string;
    label: string;
    priority: Record<EditableType, AttributePriority>;
    placeholder?: string;
    tips: Record<EditableType, string>;
}
