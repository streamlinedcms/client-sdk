/**
 * Helper functions for browser-based tests to configure the test server.
 * These functions make HTTP calls to the test server's /test/* endpoints,
 * allowing tests running in the browser to set up test data.
 */

let serverUrl: string;

/**
 * Initialize the test helpers with the server URL.
 * Must be called before using other helper functions.
 */
export function initTestHelpers(url: string): void {
    serverUrl = url;
}

/**
 * Set content for a specific element on the test server.
 * @param appId - The app ID
 * @param elementId - The element ID (use "groupId:elementId" for grouped elements)
 * @param content - The content string (can be JSON for typed content)
 */
export async function setContent(appId: string, elementId: string, content: string): Promise<void> {
    const response = await fetch(`${serverUrl}/test/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId, elementId, content }),
    });
    if (!response.ok) {
        throw new Error(`Failed to set content: ${response.statusText}`);
    }
}

/**
 * Clear all stored content on the test server.
 */
export async function clearContent(): Promise<void> {
    const response = await fetch(`${serverUrl}/test/content`, {
        method: "DELETE",
    });
    if (!response.ok) {
        throw new Error(`Failed to clear content: ${response.statusText}`);
    }
}

/**
 * Mark an API key as invalid on the test server.
 * Requests with this API key will receive a 401 response.
 */
export async function setInvalidApiKey(apiKey: string): Promise<void> {
    const response = await fetch(`${serverUrl}/test/invalid-api-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
    });
    if (!response.ok) {
        throw new Error(`Failed to set invalid API key: ${response.statusText}`);
    }
}

/**
 * Clear all invalid API keys on the test server.
 */
export async function clearInvalidApiKeys(): Promise<void> {
    const response = await fetch(`${serverUrl}/test/invalid-api-keys`, {
        method: "DELETE",
    });
    if (!response.ok) {
        throw new Error(`Failed to clear invalid API keys: ${response.statusText}`);
    }
}

/**
 * Error trigger strings that can be embedded in content to simulate server errors.
 * When the test server sees content containing these strings, it returns the corresponding error.
 *
 * Usage:
 *   await editContent(element, `${ERROR_TRIGGERS.SERVER_ERROR} Some content`);
 *   await clickToolbarButton("Save");
 *   // Server will return 500 error
 */
export const ERROR_TRIGGERS = {
    /** Triggers a 500 Internal Server Error */
    SERVER_ERROR: "__TRIGGER_500__",
    /** Triggers a 401 Unauthorized error */
    UNAUTHORIZED: "__TRIGGER_401__",
    /** Triggers a 403 Forbidden error */
    FORBIDDEN: "__TRIGGER_403__",
    /** Triggers a 404 Not Found error */
    NOT_FOUND: "__TRIGGER_404__",
    /** Triggers a 429 Too Many Requests error */
    RATE_LIMITED: "__TRIGGER_429__",
} as const;
