/**
 * Configuration parsing for StreamlinedCMS
 * Part of critical path - no external dependencies
 */

export interface ViewerConfig {
    apiUrl: string;
    appUrl: string;
    appId: string;
    logLevel?: string;
    mockAuth?: {
        enabled: boolean;
        userId?: string;
    };
}

/**
 * Get configuration from script tag data attributes
 */
export function getConfigFromScriptTag(): ViewerConfig | null {
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
        apiUrl: scriptTag.dataset.apiUrl || "https://streamlined-cms-api-worker-staging.whi.workers.dev",
        appUrl: scriptTag.dataset.appUrl || "https://streamlined-cms-app-gui-staging.whi.workers.dev",
        appId,
        logLevel: scriptTag.dataset.logLevel,
        mockAuth: scriptTag.dataset.mockAuth === "true"
            ? { enabled: true, userId: scriptTag.dataset.mockUserId }
            : undefined,
    };
}
