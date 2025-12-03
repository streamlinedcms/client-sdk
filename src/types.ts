/**
 * Log level options (matches loganite levels)
 * fatal = silent, error, warn, normal, info, debug, trace
 */
export type LogLevel = 'fatal' | 'error' | 'warn' | 'normal' | 'info' | 'debug' | 'trace';

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
 * Editable element types
 */
export type EditableType = 'text' | 'html' | 'image' | 'link';

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
    type: 'text';
    value: string;
}

export interface HtmlContentData extends BaseContentData {
    type: 'html';
    value: string;
}

export interface ImageContentData extends BaseContentData {
    type: 'image';
    src: string;
}

export interface LinkContentData extends BaseContentData {
    type: 'link';
    href: string;
    target: string;
    text: string;
}

export type ContentData = TextContentData | HtmlContentData | ImageContentData | LinkContentData;

/**
 * Known SEO attribute names
 */
export const SEO_ATTRIBUTES = ['alt', 'title', 'rel'] as const;
export type SeoAttribute = typeof SEO_ATTRIBUTES[number];

/**
 * Known accessibility attribute names
 */
export const ACCESSIBILITY_ATTRIBUTES = ['aria-label', 'aria-describedby', 'role', 'tabindex'] as const;
export type AccessibilityAttribute = typeof ACCESSIBILITY_ATTRIBUTES[number];

/**
 * All known attribute names (SEO + Accessibility)
 */
export const KNOWN_ATTRIBUTES = [...SEO_ATTRIBUTES, ...ACCESSIBILITY_ATTRIBUTES] as const;
export type KnownAttribute = typeof KNOWN_ATTRIBUTES[number];

/**
 * Attribute field configuration for modals
 */
export type AttributePriority = 'primary' | 'secondary' | 'not-applicable';

export interface AttributeFieldConfig {
    name: string;
    label: string;
    priority: Record<EditableType, AttributePriority>;
    placeholder?: string;
    tips: Record<EditableType, string>;
}
