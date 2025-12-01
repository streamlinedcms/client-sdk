/**
 * Sync Loader Script
 *
 * This tiny script loads synchronously to:
 * 1. Inject FOUC-hiding styles immediately (before DOM renders)
 * 2. Fetch and display content (critical path)
 * 3. Remove hiding styles once content is visible
 * 4. Inject the ESM bundle for lazy features (auth UI, editing)
 *
 * Customer usage: <script src="streamlined-cms.js" data-app-id="..."></script>
 */

(function () {
    // Find our own script tag to get config (do this first, before any DOM modifications)
    const loaderScript = document.currentScript as HTMLScriptElement;
    if (!loaderScript) return;

    // Parse config from data attributes
    const appId = loaderScript.dataset.appId;
    if (!appId) {
        console.error("[StreamlinedCMS] App ID is required. Add data-app-id to your script tag.");
        return;
    }

    const apiUrl = loaderScript.dataset.apiUrl || "https://streamlined-cms-api-worker-staging.whi.workers.dev";

    // Inject preconnect hint immediately to start TLS handshake early
    const apiOrigin = new URL(apiUrl).origin;
    const preconnect = document.createElement("link");
    preconnect.rel = "preconnect";
    preconnect.href = apiOrigin;
    preconnect.crossOrigin = "anonymous";
    document.head.appendChild(preconnect);

    // Inject hiding styles immediately
    const style = document.createElement("style");
    style.id = "streamlined-cms-hiding";
    style.textContent = "[data-editable]{visibility:hidden}";
    document.head.appendChild(style);

    // Determine ESM bundle URL (same directory as loader)
    const loaderSrc = loaderScript.src;
    const basePath = loaderSrc.substring(0, loaderSrc.lastIndexOf("/") + 1);
    const esmUrl = basePath + "streamlined-cms.esm.js";

    /**
     * Inject the ESM module for lazy features
     */
    function injectEsmModule(): void {
        const moduleScript = document.createElement("script");
        moduleScript.type = "module";
        moduleScript.src = esmUrl;

        // Copy all data attributes from loader to module script
        const attrs = loaderScript.attributes;
        for (let i = 0; i < attrs.length; i++) {
            const attr = attrs[i];
            if (attr.name.startsWith("data-")) {
                moduleScript.setAttribute(attr.name, attr.value);
            }
        }

        // Insert after the loader script
        loaderScript.after(moduleScript);
    }

    /**
     * Scan DOM for editable elements
     */
    function scanEditableElements(): Map<string, HTMLElement> {
        const elements = new Map<string, HTMLElement>();
        document.querySelectorAll<HTMLElement>("[data-editable]").forEach((element) => {
            const elementId = element.getAttribute("data-editable");
            if (elementId) {
                elements.set(elementId, element);
            }
        });
        return elements;
    }

    /**
     * Populate DOM elements with fetched content
     */
    function populateContent(
        elements: Map<string, HTMLElement>,
        contentData: Array<{ elementId: string; content: string }>
    ): void {
        contentData.forEach((item) => {
            const element = elements.get(item.elementId);
            if (element) {
                element.innerHTML = item.content;
            }
        });
    }

    /**
     * Remove hiding styles to reveal content
     */
    function removeHidingStyles(): void {
        style.remove();
    }

    /**
     * Fetch content from API
     * Returns null on any error (page will show default content)
     */
    async function fetchContent(): Promise<Array<{ elementId: string; content: string }> | null> {
        try {
            const url = `${apiUrl}/apps/${appId}/content`;
            const response = await fetch(url);

            if (!response.ok) {
                if (response.status === 404) {
                    // No content yet - that's fine
                    return null;
                }
                if (response.status === 403) {
                    console.warn("[StreamlinedCMS] Domain not whitelisted for this app");
                    return null;
                }
                throw new Error(`Failed to load content: ${response.status}`);
            }

            const data = await response.json() as { elements: Array<{ elementId: string; content: string }> };
            return data.elements;
        } catch (error) {
            console.warn("[StreamlinedCMS] Could not load content:", error);
            return null;
        }
    }

    /**
     * Initialize: fetch content, populate DOM, then load lazy module
     */
    async function initialize(): Promise<void> {
        // Start fetch immediately (can run before DOM is ready)
        const contentPromise = fetchContent();

        // Wait for DOM to be ready
        if (document.readyState === "loading") {
            await new Promise<void>((resolve) => {
                document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
            });
        }

        // Scan DOM and populate with fetched content
        const elements = scanEditableElements();
        const content = await contentPromise;

        if (content && elements.size > 0) {
            populateContent(elements, content);
        }

        // Reveal content
        removeHidingStyles();

        // Now load lazy module for auth/editing features
        injectEsmModule();
    }

    // Start initialization
    initialize();
})();
