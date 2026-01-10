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

    const apiUrl = loaderScript.dataset.apiUrl || __SDK_API_URL__;

    // Inject preconnect hint immediately to start TLS handshake early
    // Use window.location.origin as base to support relative URLs (e.g., "/v1" in tests)
    const apiOrigin = new URL(apiUrl, window.location.origin).origin;
    const preconnect = document.createElement("link");
    preconnect.rel = "preconnect";
    preconnect.href = apiOrigin;
    preconnect.crossOrigin = "anonymous";
    document.head.appendChild(preconnect);

    // Inject hiding styles immediately (append if style already exists)
    const hidingCss =
        "[data-scms-text],[data-scms-html],[data-scms-image],[data-scms-link]{visibility:hidden}";
    let style = document.getElementById("streamlined-cms-hiding") as HTMLStyleElement | null;
    if (style) {
        style.textContent += hidingCss;
    } else {
        style = document.createElement("style");
        style.id = "streamlined-cms-hiding";
        style.textContent = hidingCss;
        document.head.appendChild(style);
    }

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
     * Editable element types
     */
    type EditableType = "text" | "html" | "image" | "link";

    /**
     * Element info including optional group, template context, and type
     */
    interface EditableElementInfo {
        element: HTMLElement;
        groupId: string | null;
        templateId: string | null;
        instanceId: string | null;
        type: EditableType;
    }

    /**
     * Template info for repeating content blocks
     */
    interface TemplateInfo {
        templateId: string;
        container: HTMLElement;
        templateElement: HTMLElement;
        instanceCount: number;
    }

    /**
     * Parsed template key components
     */
    interface ParsedTemplateKey {
        templateId: string;
        instanceId: string;
        elementId: string;
    }

    /**
     * Parse a template element key into its components
     * Format: {templateId}.{instanceId}.{elementId}
     * instanceId is a stable 5-char alphanumeric string
     */
    function parseTemplateKey(key: string): ParsedTemplateKey | null {
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
    function buildTemplateKey(templateId: string, instanceId: string, elementId: string): string {
        return `${templateId}.${instanceId}.${elementId}`;
    }

    /**
     * Strip content from template HTML for cloning new instances.
     * - Removes text content
     * - Strips instance IDs
     * - For editable elements: keeps only reserved attributes (id, class, data-scms-*)
     */
    function stripTemplateContent(html: string): string {
        const div = document.createElement("div");
        div.innerHTML = html;

        // Strip instance IDs (they vary between instances)
        div.querySelectorAll("[data-scms-instance]").forEach((el) =>
            el.removeAttribute("data-scms-instance"),
        );

        // For editable elements, strip all attributes except reserved ones
        // This handles src, href, alt, title, and any custom attributes set via modals
        const editableSelector =
            "[data-scms-text], [data-scms-html], [data-scms-image], [data-scms-link]";
        div.querySelectorAll(editableSelector).forEach((el) => {
            const attributesToRemove: string[] = [];
            for (let i = 0; i < el.attributes.length; i++) {
                const attr = el.attributes[i];
                // Keep: id, class, and data-scms-* attributes (element ID defines structure)
                if (
                    attr.name === "id" ||
                    attr.name === "class" ||
                    attr.name.startsWith("data-scms-")
                ) {
                    continue;
                }
                attributesToRemove.push(attr.name);
            }
            attributesToRemove.forEach((name) => el.removeAttribute(name));
        });

        // Replace all text nodes with empty strings
        const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
        const textNodes: Text[] = [];
        while (walker.nextNode()) {
            textNodes.push(walker.currentNode as Text);
        }
        textNodes.forEach((node) => (node.textContent = ""));

        return div.innerHTML;
    }

    /**
     * Get order key for a template
     */
    function getOrderKey(templateId: string): string {
        return `${templateId}._order`;
    }

    /**
     * Parse order array from stored content
     */
    function parseOrderArray(content: string): string[] {
        try {
            const data = JSON.parse(content) as { type?: string; value?: unknown };
            if (Array.isArray(data)) {
                return data.filter((id): id is string => typeof id === "string");
            }
            if (data.type === "order" && Array.isArray(data.value)) {
                return (data.value as unknown[]).filter(
                    (id): id is string => typeof id === "string",
                );
            }
        } catch {
            // Invalid JSON
        }
        return [];
    }

    /**
     * Storage context for an element - determines how its key is built
     */
    interface StorageContext {
        groupId: string | null;
        templateId: string | null;
        instanceId: string | null;
    }

    /**
     * Get storage context for an element by walking up the DOM.
     *
     * Key rules:
     * - Group inside template: group takes precedence, template ignored → groupId:elementId
     * - Template inside group: both apply → groupId:templateId.instanceId.elementId
     * - Template only: templateId.instanceId.elementId
     * - Group only: groupId:elementId
     * - Neither: elementId
     *
     * The key insight: if we encounter a group BEFORE a template (walking up),
     * we're in "shared group" mode and template context is ignored.
     */
    function getStorageContext(element: HTMLElement): StorageContext {
        let groupId: string | null = null;
        let templateId: string | null = null;
        let instanceId: string | null = null;
        let foundGroupBeforeTemplate = false;

        // Check the element itself for inline group attribute
        const selfGroupId = element.getAttribute("data-scms-group");
        if (selfGroupId) {
            groupId = selfGroupId;
            // Inline group always takes precedence (no template context possible on self)
            foundGroupBeforeTemplate = true;
        }

        // Check the element itself for instance ID (when editable element IS the instance element)
        const selfInstanceId = element.getAttribute("data-scms-instance");
        if (selfInstanceId) {
            instanceId = selfInstanceId;
        }

        let current = element.parentElement;
        while (current) {
            // Check for group
            const gid = current.getAttribute("data-scms-group");
            if (gid && groupId === null) {
                groupId = gid;
                if (templateId === null) {
                    // Found group before any template - we're in shared mode
                    foundGroupBeforeTemplate = true;
                }
            }

            // Only look for template context if we haven't found a group first
            if (!foundGroupBeforeTemplate) {
                // Check for instance marker (set by cloneTemplateInstances)
                const instanceAttr = current.getAttribute("data-scms-instance");
                if (instanceAttr !== null && instanceId === null) {
                    instanceId = instanceAttr;
                }

                // Check for template container
                const tid = current.getAttribute("data-scms-template");
                if (tid && templateId === null) {
                    templateId = tid;
                }
            }

            current = current.parentElement;
        }

        // If we found group before template, clear template context
        if (foundGroupBeforeTemplate) {
            templateId = null;
            instanceId = null;
        }

        return { groupId, templateId, instanceId };
    }

    /**
     * Get group ID for an element (convenience wrapper)
     */
    function getGroupId(element: HTMLElement): string | null {
        return getStorageContext(element).groupId;
    }

    /**
     * Check if an element is inside a nested template (template inside another template)
     * Warn and return true if nested templates are detected
     */
    function isInsideNestedTemplate(element: HTMLElement): boolean {
        let templateCount = 0;
        let current: HTMLElement | null = element;
        while (current) {
            if (current.hasAttribute("data-scms-template")) {
                templateCount++;
                if (templateCount > 1) {
                    console.warn(
                        `[StreamlinedCMS] Nested templates detected. Inner template "${current.getAttribute("data-scms-template")}" will be ignored.`,
                    );
                    return true;
                }
            }
            current = current.parentElement;
        }
        return false;
    }

    /**
     * Scan for template containers and store their definitions
     */
    function scanTemplates(): Map<string, TemplateInfo> {
        const templates = new Map<string, TemplateInfo>();
        document.querySelectorAll<HTMLElement>("[data-scms-template]").forEach((container) => {
            const templateId = container.getAttribute("data-scms-template");
            if (!templateId) return;

            // Check for nested templates
            if (isInsideNestedTemplate(container)) return;

            // Warn if templateId contains a dot
            if (templateId.includes(".")) {
                console.warn(
                    `[StreamlinedCMS] Template ID "${templateId}" contains a dot. Dots are reserved for template instance separators.`,
                );
            }

            // Get the first child element as the template definition
            const templateElement = container.firstElementChild as HTMLElement | null;
            if (!templateElement) {
                console.warn(
                    `[StreamlinedCMS] Template "${templateId}" has no child elements to use as template.`,
                );
                return;
            }

            // Store clean template HTML (content stripped) for cloning new instances
            const cleanHtml = stripTemplateContent(templateElement.outerHTML);
            container.setAttribute("data-scms-template-html", cleanHtml);

            templates.set(templateId, {
                templateId,
                container,
                templateElement,
                instanceCount: 1, // Initially just the template definition
            });
        });
        return templates;
    }

    /**
     * Get editable info from element by checking data-scms-{type} attributes
     */
    function getEditableInfo(element: HTMLElement): { id: string; type: EditableType } | null {
        const types: EditableType[] = ["text", "html", "image", "link"];
        for (const type of types) {
            const id = element.getAttribute(`data-scms-${type}`);
            if (id) return { id, type };
        }
        return null;
    }

    /**
     * Warn if an element ID contains a dot (reserved for templates)
     */
    function warnIfDotInElementId(elementId: string): void {
        if (elementId.includes(".")) {
            console.warn(
                `[StreamlinedCMS] Element ID "${elementId}" contains a dot. Dots are reserved for template instance separators.`,
            );
        }
    }

    /**
     * Build storage key from context and element ID
     */
    function buildStorageKey(context: StorageContext, elementId: string): string {
        let key: string;
        if (context.templateId !== null && context.instanceId !== null) {
            // Template element: {templateId}.{instanceId}.{elementId}
            // If also grouped (template inside group): {groupId}:{templateId}.{instanceId}.{elementId}
            const templateKey = buildTemplateKey(context.templateId, context.instanceId, elementId);
            key = context.groupId ? `${context.groupId}:${templateKey}` : templateKey;
        } else {
            // Non-template element (or group inside template - template ignored)
            // groupId:elementId or just elementId
            key = context.groupId ? `${context.groupId}:${elementId}` : elementId;
        }
        return key;
    }

    /**
     * Scan DOM for editable elements, including group and template info.
     * Returns a map where multiple elements can share the same key (for groups inside templates).
     */
    function scanEditableElements(): Map<string, EditableElementInfo[]> {
        const elements = new Map<string, EditableElementInfo[]>();
        const selector = "[data-scms-text], [data-scms-html], [data-scms-image], [data-scms-link]";
        document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
            const info = getEditableInfo(element);
            if (info) {
                // Warn about dots in element IDs
                warnIfDotInElementId(info.id);

                const context = getStorageContext(element);
                const key = buildStorageKey(context, info.id);

                const elementInfo: EditableElementInfo = {
                    element,
                    groupId: context.groupId,
                    templateId: context.templateId,
                    instanceId: context.instanceId,
                    type: info.type,
                };

                // Multiple elements can share the same key (groups inside templates)
                const existing = elements.get(key);
                if (existing) {
                    existing.push(elementInfo);
                } else {
                    elements.set(key, [elementInfo]);
                }
            }
        });
        return elements;
    }

    /**
     * Get ordered list of instance IDs for a template from content data.
     * Looks for {templateId}._order key, falls back to discovering IDs from element keys.
     */
    function getTemplateInstanceIds(
        data: ContentResponse,
        templateId: string,
        groupId?: string,
    ): string[] {
        // First, try to get order from the _order key
        const orderKey = getOrderKey(templateId);

        // Check in appropriate location (grouped or ungrouped)
        let orderContent: string | undefined;
        if (groupId) {
            orderContent = data.groups[groupId]?.elements[orderKey]?.content;
        } else {
            orderContent = data.elements[orderKey]?.content;
        }

        if (orderContent) {
            const order = parseOrderArray(orderContent);
            if (order.length > 0) {
                return order;
            }
        }

        // Fallback: discover instance IDs from element keys
        const discoveredIds = new Set<string>();

        const checkKey = (elementId: string): void => {
            const parsed = parseTemplateKey(elementId);
            if (parsed && parsed.templateId === templateId) {
                discoveredIds.add(parsed.instanceId);
            }
        };

        if (groupId) {
            const group = data.groups[groupId];
            if (group) {
                Object.keys(group.elements).forEach(checkKey);
            }
        } else {
            Object.keys(data.elements).forEach(checkKey);
            // Also check all groups for templates inside them
            Object.values(data.groups).forEach((group) => {
                Object.keys(group.elements).forEach(checkKey);
            });
        }

        // Convert to array (order not guaranteed without _order key)
        return Array.from(discoveredIds);
    }

    /**
     * Clone template instances based on content data.
     * Only processes templates that have API data - leaves DOM as-is otherwise.
     * The lazy module handles initialization of templates without API data.
     */
    function cloneTemplateInstances(
        templates: Map<string, TemplateInfo>,
        data: ContentResponse,
    ): void {
        templates.forEach((templateInfo) => {
            const { templateId, container, templateElement } = templateInfo;

            // Check if this template is inside a group
            const groupId = getGroupId(container);

            // Get ordered list of instance IDs from API
            const instanceIds = getTemplateInstanceIds(data, templateId, groupId ?? undefined);

            // No API data - leave DOM as-is, lazy module will handle initialization
            if (instanceIds.length === 0) {
                return;
            }

            // Get clean template HTML for cloning
            const cleanTemplateHtml = container.getAttribute("data-scms-template-html");

            // Get all existing children
            const existingChildren = Array.from(container.children).filter(
                (child) => child instanceof HTMLElement,
            ) as HTMLElement[];

            // API has instance data - clone from clean template
            // First, remove all existing children
            existingChildren.forEach((child) => child.remove());

            // Clone from clean template for each API instance ID
            for (let i = 0; i < instanceIds.length; i++) {
                const tempDiv = document.createElement("div");
                tempDiv.innerHTML = cleanTemplateHtml || templateElement.outerHTML;
                const clone = tempDiv.firstElementChild as HTMLElement;
                if (!clone) continue;

                clone.setAttribute("data-scms-instance", instanceIds[i]);
                clone.removeAttribute("data-scms-template");
                container.appendChild(clone);
            }

            templateInfo.instanceCount = instanceIds.length;
        });
    }

    /**
     * Apply content to a single DOM element.
     * Returns the element (may be a new element if image was replaced).
     */
    function applyContentToElement(
        element: HTMLElement,
        type: EditableType,
        content: string,
    ): HTMLElement {
        try {
            const data = JSON.parse(content) as { type?: string };

            if (data.type === "text") {
                element.textContent = (data as { type: "text"; value: string }).value;
                return element;
            } else if (data.type === "html") {
                element.innerHTML = (data as { type: "html"; value: string }).value;
                return element;
            } else if (data.type === "image" && element instanceof HTMLImageElement) {
                const src = (data as { type: "image"; src: string }).src;
                const newImg = document.createElement("img");
                for (let i = 0; i < element.attributes.length; i++) {
                    const attr = element.attributes[i];
                    newImg.setAttribute(attr.name, attr.value);
                }
                newImg.src = src;
                element.replaceWith(newImg);
                return newImg;
            } else if (data.type === "link" && element instanceof HTMLAnchorElement) {
                const linkData = data as {
                    type: "link";
                    href: string;
                    target: string;
                    value: string;
                };
                element.href = linkData.href;
                element.target = linkData.target;
                element.innerHTML = linkData.value;
                return element;
            } else if (data.type) {
                // Unknown type with type field - don't process
                return element;
            }

            // No type field in JSON - use element's declared type
            if (type === "link" && element instanceof HTMLAnchorElement) {
                const linkData = data as { href?: string; target?: string; value?: string };
                if (linkData.href !== undefined) {
                    element.href = linkData.href;
                    element.target = linkData.target || "";
                    element.innerHTML = linkData.value || "";
                }
            } else if (type === "image" && element instanceof HTMLImageElement) {
                const imageData = data as { src?: string };
                if (imageData.src !== undefined) {
                    const newImg = document.createElement("img");
                    for (let i = 0; i < element.attributes.length; i++) {
                        const attr = element.attributes[i];
                        newImg.setAttribute(attr.name, attr.value);
                    }
                    newImg.src = imageData.src;
                    element.replaceWith(newImg);
                    return newImg;
                }
            } else if (type === "text") {
                const textData = data as { value?: string };
                if (textData.value !== undefined) {
                    element.textContent = textData.value;
                }
            } else if (type === "html") {
                const htmlData = data as { value?: string };
                if (htmlData.value !== undefined) {
                    element.innerHTML = htmlData.value;
                }
            }
        } catch {
            // Not JSON - ignore, content should always be JSON
        }
        return element;
    }

    /**
     * Update all elements for a key with content
     */
    function updateElements(
        elements: Map<string, EditableElementInfo[]>,
        key: string,
        content: string,
    ): void {
        const infos = elements.get(key);
        if (!infos) return;

        for (let i = 0; i < infos.length; i++) {
            const info = infos[i];
            const newElement = applyContentToElement(info.element, info.type, content);
            if (newElement !== info.element) {
                // Element was replaced (image), update the reference
                info.element = newElement;
            }
        }
    }

    /**
     * Populate DOM elements with fetched content (handles grouped response)
     * Response uses key-value format: { elements: { [elementId]: { content } }, groups: { [groupId]: { elements: { [elementId]: { content } } } } }
     */
    function populateContent(
        elements: Map<string, EditableElementInfo[]>,
        data: {
            elements: Record<string, { content: string }>;
            groups: Record<string, { elements: Record<string, { content: string }> }>;
        },
    ): void {
        // Populate ungrouped elements
        Object.entries(data.elements).forEach(([elementId, element]) => {
            updateElements(elements, elementId, element.content);
        });

        // Populate grouped elements
        Object.entries(data.groups).forEach(([groupId, group]) => {
            Object.entries(group.elements).forEach(([elementId, element]) => {
                // Use composite key: groupId:elementId
                updateElements(elements, `${groupId}:${elementId}`, element.content);
            });
        });
    }

    /**
     * Remove hiding styles to reveal content
     */
    function removeHidingStyles(): void {
        style?.remove();
    }

    /**
     * Content response type (key-value format)
     */
    interface ContentResponse {
        elements: Record<string, { content: string }>;
        groups: Record<string, { elements: Record<string, { content: string }> }>;
    }

    /**
     * Fetch content from API
     * Returns null on any error (page will show default content)
     */
    async function fetchContent(): Promise<ContentResponse | null> {
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
                if (response.status === 402) {
                    // Free plan - custom domains require upgrade
                    try {
                        const data = (await response.json()) as {
                            error?: string;
                            upgradeUrl?: string;
                        };
                        console.warn(
                            `[StreamlinedCMS] ${data.error || "Upgrade required"}`,
                            data.upgradeUrl ? `\nUpgrade at: ${data.upgradeUrl}` : "",
                        );
                    } catch {
                        console.warn(
                            "[StreamlinedCMS] Upgrade required to access from this domain",
                        );
                    }
                    return null;
                }
                throw new Error(`Failed to load content: ${response.status}`);
            }

            return (await response.json()) as ContentResponse;
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

        // Get fetched content
        const content = await contentPromise;

        // Scan for templates and clone instances based on content data
        // This must happen BEFORE scanning editable elements so clones are included
        const templates = scanTemplates();
        if (content && templates.size > 0) {
            cloneTemplateInstances(templates, content);
        }

        // Now scan DOM for editable elements (includes cloned template instances)
        const elements = scanEditableElements();

        if (content && elements.size > 0) {
            populateContent(elements, content);
        }

        // Reveal content
        removeHidingStyles();

        // Now load lazy module for auth/editing features
        // (skip if data-skip-esm is set, for testing with source imports)
        if (!loaderScript.dataset.skipEsm) {
            injectEsmModule();
        }

        // Dispatch event to signal loader is complete (useful for tests)
        document.dispatchEvent(new CustomEvent("streamlined-cms:loader-complete"));
    }

    // Start initialization
    initialize();
})();
