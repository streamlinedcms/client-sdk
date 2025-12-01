/**
 * Main SDK class for StreamlinedCMS
 */

import { Logger } from "loganite";
import { Auth, type EditorMode } from "./auth.js";
import type { StreamlinedCMSConfig, ContentElement } from "./types.js";

export class StreamlinedCMS {
    private config: StreamlinedCMSConfig;
    private log: Logger;
    private configuredLogLevel: string;
    private apiKey: string | null = null;
    private currentMode: EditorMode = "viewer";
    private editableElements: Map<string, HTMLElement> = new Map();
    private editingElement: HTMLElement | null = null;
    private auth: Auth;

    constructor(config: StreamlinedCMSConfig) {
        this.config = config;

        // Normalize log level (false/null become 'fatal', undefined becomes 'error')
        this.configuredLogLevel = config.logLevel || "error";
        if (config.logLevel === false || config.logLevel === null) {
            this.configuredLogLevel = "fatal";
        }

        // Create logger with configured level
        // LOG_LEVEL env/localStorage override is checked at log-time by loganite
        this.log = new Logger("StreamlinedCMS", this.configuredLogLevel);

        // Initialize auth module
        this.auth = new Auth({
            appId: config.appId,
            appUrl: config.appUrl,
        });

        this.log.info("StreamlinedCMS initialized", this.config);

        // Initialize mock auth if enabled
        if (config.mockAuth?.enabled) {
            this.apiKey = "mock-api-key";
            this.log.debug("Mock authentication enabled");
        }
    }

    /**
     * Get current domain for validation
     */
    private getDomain(): string {
        return typeof window !== "undefined" ? window.location.hostname : "localhost";
    }

    /**
     * Initialize the SDK - scan for editable elements and set up editing
     */
    public async init(): Promise<void> {
        this.log.info("Initializing SDK", {
            appId: this.config.appId,
            domain: this.getDomain(),
        });

        // Find all elements with data-editable attribute
        this.scanEditableElements();

        // Load existing content from API
        await this.loadContent();

        // Remove hiding styles now that content is loaded
        this.removeHidingStyles();

        // Set up auth UI (unless mock auth is enabled)
        if (!this.config.mockAuth?.enabled) {
            this.setupAuthUI();
        } else {
            // Mock auth - go straight to author mode
            this.setMode("author");
        }

        this.log.info("SDK initialization complete", {
            editableCount: this.editableElements.size,
            hasApiKey: !!this.apiKey,
            mode: this.currentMode,
        });
    }

    /**
     * Set up authentication UI based on stored state
     */
    private setupAuthUI(): void {
        // Check for valid stored API key
        const storedKey = this.auth.getStoredKey();

        if (storedKey) {
            this.apiKey = storedKey;
            // Check stored mode preference
            const storedMode = this.auth.getStoredMode();
            if (storedMode === "author") {
                this.setMode("author");
            } else {
                // Default to viewer mode, show mode toggle
                this.setMode("viewer");
            }
            this.log.debug("Restored auth state", { mode: this.currentMode });
        } else {
            // No valid key - show sign in link
            this.showSignInLink();
            this.log.debug("No valid API key, showing sign-in link");
        }
    }

    /**
     * Show the sign-in link for unauthenticated users (subtle, in footer area)
     */
    private showSignInLink(): void {
        // Remove any existing mode toggle
        this.removeModeToggle();

        // Check if customer has marked their own sign-in trigger
        const customTrigger = document.querySelector("[data-scms-signin]");
        if (customTrigger) {
            customTrigger.addEventListener("click", (e) => {
                e.preventDefault();
                this.handleSignIn();
            });
            return;
        }

        // Create footer container if it doesn't exist
        let footer = document.getElementById("scms-footer");
        if (!footer) {
            footer = document.createElement("div");
            footer.id = "scms-footer";
            footer.style.cssText = `
                text-align: center;
                padding: 20px;
                margin-top: 40px;
                font-size: 12px;
                color: #6b7280;
            `;
            document.body.appendChild(footer);
        }

        // Clear existing content and add sign-in link
        footer.innerHTML = "";
        const link = document.createElement("a");
        link.id = "scms-signin-link";
        link.href = "#";
        link.textContent = "Sign In";
        link.style.cssText = `
            color: #6b7280;
            text-decoration: none;
        `;
        link.addEventListener("click", (e) => {
            e.preventDefault();
            this.handleSignIn();
        });
        link.addEventListener("mouseenter", () => {
            link.style.textDecoration = "underline";
        });
        link.addEventListener("mouseleave", () => {
            link.style.textDecoration = "none";
        });

        footer.appendChild(link);
    }

    /**
     * Handle sign-in link click - open login popup
     */
    private async handleSignIn(): Promise<void> {
        this.log.debug("Opening login popup");

        const key = await this.auth.openLoginPopup();
        if (key) {
            this.apiKey = key;

            // Remove sign-in link/footer
            const footer = document.getElementById("scms-footer");
            if (footer) footer.remove();

            // User just signed in - go to author mode
            this.setMode("author");
            this.log.info("User authenticated via popup, entering author mode");
        } else {
            this.log.debug("Login popup closed without authentication");
        }
    }

    /**
     * Set the current mode (author or viewer)
     */
    private setMode(mode: EditorMode): void {
        this.currentMode = mode;
        this.auth.storeMode(mode);

        if (mode === "author") {
            this.enableAuthorMode();
        } else {
            this.enableViewerMode();
        }
    }

    /**
     * Toggle between author and viewer modes
     */
    public toggleMode(): void {
        if (this.currentMode === "author") {
            this.setMode("viewer");
        } else {
            this.setMode("author");
        }
    }

    /**
     * Enable author mode - make elements editable
     */
    private enableAuthorMode(): void {
        this.log.debug("Entering author mode");

        // Add editable styling to all elements
        this.editableElements.forEach((element, elementId) => {
            element.classList.add("streamlined-editable");

            // Add click handler if not already added
            if (!element.dataset.scmsClickHandler) {
                element.addEventListener("click", (e) => {
                    if (this.currentMode === "author") {
                        e.preventDefault();
                        this.startEditing(elementId);
                    }
                });
                element.dataset.scmsClickHandler = "true";
            }
        });

        // Inject edit styles
        this.injectEditStyles();

        // Show mode toggle button
        this.showModeToggle();
    }

    /**
     * Enable viewer mode - hide editing UI
     */
    private enableViewerMode(): void {
        this.log.debug("Entering viewer mode");

        // Remove editable styling
        this.editableElements.forEach((element) => {
            element.classList.remove("streamlined-editable", "streamlined-editing");
            element.removeAttribute("contenteditable");
        });

        // Hide save button if visible
        this.hideSaveButton();
        this.editingElement = null;

        // Show mode toggle button
        this.showModeToggle();
    }

    /**
     * Show the mode toggle (fixed position, shows both options)
     */
    private showModeToggle(): void {
        this.removeModeToggle();

        // Outer wrapper for positioning
        const wrapper = document.createElement("div");
        wrapper.id = "scms-mode-toggle";
        wrapper.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 6px;
            z-index: 10000;
            font-size: 12px;
            font-weight: 500;
        `;

        // Toggle container
        const container = document.createElement("div");
        container.style.cssText = `
            display: flex;
            align-items: center;
            gap: 4px;
            background: #e5e7eb;
            padding: 4px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        `;

        const viewerBtn = document.createElement("button");
        viewerBtn.textContent = "Viewer";
        viewerBtn.style.cssText = `
            padding: 6px 12px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            background: ${this.currentMode === "viewer" ? "#3b82f6" : "transparent"};
            color: ${this.currentMode === "viewer" ? "white" : "#6b7280"};
        `;
        viewerBtn.addEventListener("click", () => this.setMode("viewer"));

        const authorBtn = document.createElement("button");
        authorBtn.textContent = "Author";
        authorBtn.style.cssText = `
            padding: 6px 12px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            background: ${this.currentMode === "author" ? "#3b82f6" : "transparent"};
            color: ${this.currentMode === "author" ? "white" : "#6b7280"};
        `;
        authorBtn.addEventListener("click", () => this.setMode("author"));

        container.appendChild(viewerBtn);
        container.appendChild(authorBtn);
        wrapper.appendChild(container);

        // Sign out link below the toggle
        const signOutLink = document.createElement("a");
        signOutLink.href = "#";
        signOutLink.textContent = "Sign Out";
        signOutLink.style.cssText = `
            font-size: 11px;
            color: #9ca3af;
            text-decoration: none;
            padding-left: 4px;
        `;
        signOutLink.addEventListener("click", (e) => {
            e.preventDefault();
            this.signOut();
        });
        signOutLink.addEventListener("mouseenter", () => {
            signOutLink.style.textDecoration = "underline";
        });
        signOutLink.addEventListener("mouseleave", () => {
            signOutLink.style.textDecoration = "none";
        });
        wrapper.appendChild(signOutLink);

        document.body.appendChild(wrapper);
    }

    /**
     * Remove the mode toggle
     */
    private removeModeToggle(): void {
        const existing = document.getElementById("scms-mode-toggle");
        if (existing) existing.remove();
    }

    /**
     * Sign out - clears API key, forces re-authentication
     */
    public signOut(): void {
        this.log.info("Signing out");

        // Clear stored key and mode
        this.auth.clearStoredKey();
        this.apiKey = null;

        // Switch to viewer mode visually
        this.editableElements.forEach((element) => {
            element.classList.remove("streamlined-editable", "streamlined-editing");
            element.removeAttribute("contenteditable");
        });
        this.hideSaveButton();
        this.editingElement = null;

        // Remove mode toggle and show sign-in link
        this.removeModeToggle();
        this.showSignInLink();
    }

    /**
     * Remove hiding styles after content is loaded
     */
    private removeHidingStyles(): void {
        const style = document.getElementById("streamlined-cms-hiding");
        if (style) {
            style.remove();
        }
    }

    /**
     * Scan the DOM for elements with data-editable attribute
     */
    private scanEditableElements(): void {
        const elements = document.querySelectorAll<HTMLElement>("[data-editable]");

        elements.forEach((element) => {
            const elementId = element.getAttribute("data-editable");
            if (elementId) {
                this.editableElements.set(elementId, element);
                this.log.trace("Found editable element", { elementId });
            }
        });
    }

    /**
     * Load existing content from the API
     */
    private async loadContent(): Promise<void> {
        if (this.editableElements.size === 0) {
            this.log.trace("No editable elements to load");
            return;
        }

        try {
            const url = `${this.config.apiUrl}/apps/${this.config.appId}/content`;
            this.log.trace("Loading content from API", { url });

            const response = await fetch(url);

            if (!response.ok) {
                // If 404, no content exists yet - that's okay for new sites
                if (response.status === 404) {
                    this.log.trace("No existing content found (404)");
                    return;
                }
                // If 403, domain not whitelisted
                if (response.status === 403) {
                    this.log.warn("Domain not whitelisted for this app:", this.getDomain());
                    return;
                }
                throw new Error(
                    `Failed to load content: ${response.status} ${response.statusText}`,
                );
            }

            const data = (await response.json()) as { elements: ContentElement[] };
            this.log.debug("Content loaded", { count: data.elements.length });

            // Update DOM with loaded content
            data.elements.forEach((element) => {
                const domElement = this.editableElements.get(element.elementId);
                if (domElement) {
                    domElement.innerHTML = element.content;
                    this.log.trace("Updated element from API", { elementId: element.elementId });
                }
            });
        } catch (error) {
            this.log.warn("Could not load existing content - using defaults", error);
            // Don't throw - allow the SDK to continue with default content
        }
    }

    /**
     * Inject CSS styles for edit mode
     */
    private injectEditStyles(): void {
        if (document.getElementById("streamlined-cms-styles")) {
            return; // Already injected
        }

        const style = document.createElement("style");
        style.id = "streamlined-cms-styles";
        style.textContent = `
      .streamlined-editable {
        outline: 2px dashed transparent;
        outline-offset: 2px;
        transition: outline 0.2s;
        cursor: pointer;
        position: relative;
      }

      .streamlined-editable:hover {
        outline-color: #3b82f6;
      }

      .streamlined-editing {
        outline: 2px solid #3b82f6;
        outline-offset: 2px;
      }

      .streamlined-save-button {
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 24px;
        background: #3b82f6;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 10000;
        transition: background 0.2s;
      }

      .streamlined-save-button:hover {
        background: #2563eb;
      }

      .streamlined-save-button:disabled {
        background: #9ca3af;
        cursor: not-allowed;
      }
    `;
        document.head.appendChild(style);
    }

    /**
     * Start editing a specific element
     */
    private startEditing(elementId: string): void {
        const element = this.editableElements.get(elementId);
        if (!element) {
            this.log.warn("Element not found", { elementId });
            return;
        }

        this.log.trace("Starting edit", { elementId });

        // Stop editing previous element if any
        if (this.editingElement) {
            this.stopEditing();
        }

        // Mark as editing
        this.editingElement = element;
        element.classList.add("streamlined-editing");
        element.setAttribute("contenteditable", "true");
        element.focus();

        // Show save button
        this.showSaveButton(elementId);
    }

    /**
     * Stop editing the current element
     */
    private stopEditing(): void {
        if (!this.editingElement) {
            return;
        }

        this.log.trace("Stopping edit");

        this.editingElement.classList.remove("streamlined-editing");
        this.editingElement.setAttribute("contenteditable", "false");
        this.editingElement = null;

        // Hide save button
        this.hideSaveButton();
    }

    /**
     * Show the save button
     */
    private showSaveButton(elementId: string): void {
        // Remove existing button if any
        this.hideSaveButton();

        const button = document.createElement("button");
        button.id = "streamlined-save-btn";
        button.className = "streamlined-save-button";
        button.textContent = "Save Changes";

        button.addEventListener("click", async () => {
            await this.saveElement(elementId);
        });

        document.body.appendChild(button);
    }

    /**
     * Hide the save button
     */
    private hideSaveButton(): void {
        const button = document.getElementById("streamlined-save-btn");
        if (button) {
            button.remove();
        }
    }

    /**
     * Save the content of an element
     */
    private async saveElement(elementId: string): Promise<void> {
        const element = this.editableElements.get(elementId);
        if (!element) {
            return;
        }

        const content = element.innerHTML;
        this.log.debug("Saving element", { elementId });

        // Disable button during save
        const button = document.getElementById("streamlined-save-btn") as HTMLButtonElement;
        if (button) {
            button.disabled = true;
            button.textContent = "Saving...";
        }

        try {
            const url = `${this.config.apiUrl}/apps/${this.config.appId}/content/${elementId}`;
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };
            if (this.apiKey) {
                headers["Authorization"] = `Bearer ${this.apiKey}`;
            }
            const response = await fetch(url, {
                method: "PUT",
                headers,
                body: JSON.stringify({
                    content,
                }),
            });

            if (!response.ok) {
                throw new Error(`Failed to save: ${response.status} ${response.statusText}`);
            }

            await response.json(); // Consume response body

            // Refresh key expiry on successful save
            this.auth.refreshKeyExpiry();

            this.log.info("Content saved", { elementId });

            // Show success feedback
            if (button) {
                button.textContent = "Saved!";
                setTimeout(() => {
                    this.stopEditing();
                }, 1000);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.log.error("Failed to save content", error);

            // Show error to user
            if (button) {
                button.textContent = "Save Failed - Retry";
                button.disabled = false;
            }

            // Show alert for visibility
            alert(`Failed to save: ${errorMessage}\n\nCheck console for details.`);
        }
    }

    /**
     * Get configured log level (for testing/debugging)
     * Returns the level name in our SDK's terminology (none, error, warn, info, debug)
     */
    public getLogLevel(): string {
        return this.configuredLogLevel;
    }

    /**
     * Clean up SDK resources (auth bridge, event listeners, etc.)
     */
    public destroy(): void {
        this.log.debug("Destroying SDK instance");
        this.auth.destroy();
        this.editableElements.clear();
        this.editingElement = null;
        this.apiKey = null;
    }
}
