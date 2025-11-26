/**
 * Auto-initialization for StreamlinedCMS
 * This file handles automatic SDK initialization when loaded via script tag
 */

import { StreamlinedCMS } from "./sdk.js";
import type { StreamlinedCMSConfig } from "./types.js";

/**
 * Inject hiding styles immediately to prevent FOUC
 * This runs as soon as the script loads, even before DOM is ready
 */
function injectHidingStylesEarly(): void {
    if (typeof document === "undefined") {
        return;
    }

    // Check if styles already exist
    if (document.getElementById("streamlined-cms-hiding")) {
        return;
    }

    const style = document.createElement("style");
    style.id = "streamlined-cms-hiding";
    style.textContent = `
    [data-editable] {
      visibility: hidden !important;
    }
  `;

    // Inject into head if it exists, otherwise wait for it
    if (document.head) {
        document.head.appendChild(style);
    } else {
        // Head doesn't exist yet, inject as soon as possible
        const observer = new MutationObserver(() => {
            if (document.head) {
                document.head.appendChild(style);
                observer.disconnect();
            }
        });
        observer.observe(document.documentElement, { childList: true });
    }
}

/**
 * Get configuration from script tag data attributes
 */
function getConfigFromScriptTag(): Partial<StreamlinedCMSConfig> {
    // Find the script tag that loaded this SDK
    const scripts = document.querySelectorAll<HTMLScriptElement>('script[src*="streamlined-cms"]');
    const scriptTag = scripts[scripts.length - 1]; // Get the most recent one

    if (!scriptTag) {
        return {};
    }

    return {
        apiUrl: scriptTag.dataset.apiUrl,
        appId: scriptTag.dataset.appId,
        debug: scriptTag.dataset.debug === "true",
        mockAuth:
            scriptTag.dataset.mockAuth === "true"
                ? {
                      enabled: true,
                      userId: scriptTag.dataset.mockUserId,
                  }
                : undefined,
    };
}

/**
 * Auto-initialize the SDK when DOM is ready
 */
function autoInit(): void {
    const config = getConfigFromScriptTag();

    // Default API URL if not provided
    const apiUrl = config.apiUrl || "https://streamlined-cms-api-worker-staging.whi.workers.dev";

    // App ID is required
    if (!config.appId) {
        console.error("[StreamlinedCMS] App ID is required. Add data-app-id to your script tag.");
        return;
    }

    const sdkConfig: StreamlinedCMSConfig = {
        apiUrl,
        appId: config.appId,
        debug: config.debug || false,
        mockAuth: config.mockAuth,
    };

    // Create SDK instance
    const cms = new StreamlinedCMS(sdkConfig);

    // Make it globally available for debugging
    (window as any).StreamlinedCMS = cms;

    // Initialize when DOM is ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            cms.init().catch((error) => {
                console.error("[StreamlinedCMS] Failed to initialize:", error);
            });
        });
    } else {
        // DOM is already ready
        cms.init().catch((error) => {
            console.error("[StreamlinedCMS] Failed to initialize:", error);
        });
    }
}

// Auto-initialize if not in module context (loaded via script tag)
if (typeof window !== "undefined" && !("__STREAMLINED_CMS_NO_AUTO_INIT__" in window)) {
    // Inject hiding styles immediately to prevent FOUC
    injectHidingStylesEarly();

    // Then proceed with auto-init
    autoInit();
}

export { autoInit };
