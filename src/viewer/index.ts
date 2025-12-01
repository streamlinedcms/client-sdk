/**
 * Viewer entry point - ESM Module
 *
 * This module is loaded AFTER the sync loader has:
 * 1. Fetched and displayed content
 * 2. Removed FOUC hiding styles
 *
 * This module handles lazy features:
 * - Authentication UI
 * - Inline editing
 * - Content saving
 */

import { getConfigFromScriptTag, type ViewerConfig } from "./config.js";

/**
 * Lazy load the auth/UI module
 */
async function loadLazyModule(config: ViewerConfig): Promise<void> {
    try {
        const { initLazy } = await import("../lazy/index.js");
        await initLazy(config);
    } catch (error) {
        console.warn("[StreamlinedCMS] Could not load lazy module:", error);
    }
}

/**
 * Main initialization
 */
function init(): void {
    const config = getConfigFromScriptTag();
    if (!config) {
        return; // Error already logged by getConfigFromScriptTag
    }

    // DOM is already ready (loader waited for DOMContentLoaded before injecting us)
    // Content is already loaded and visible
    // Just load the lazy features
    loadLazyModule(config);
}

// Auto-initialize
init();

// Export config type for lazy module
export type { ViewerConfig } from "./config.js";
