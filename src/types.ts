/**
 * Configuration options for StreamlinedCMS
 */
export interface StreamlinedCMSConfig {
    /**
     * API endpoint URL (e.g., 'https://api.streamlinedcms.com')
     */
    apiUrl: string;

    /**
     * Application ID (required)
     */
    appId: string;

    /**
     * Enable debug logging
     */
    debug?: boolean;

    /**
     * Mock authentication (for development)
     */
    mockAuth?: {
        enabled: boolean;
        userId?: string;
    };
}

/**
 * Content element data structure
 */
export interface ContentElement {
    appId: string;
    elementId: string;
    content: string;
    updatedAt: string;
    updatedBy?: string;
}

/**
 * API response for saving content
 */
export interface SaveResponse {
    success: boolean;
    element?: ContentElement;
    error?: string;
}
