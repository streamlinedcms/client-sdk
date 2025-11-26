/**
 * Main SDK class for StreamlinedCMS
 */

import type { StreamlinedCMSConfig, ContentElement } from "./types.js";

export class StreamlinedCMS {
    private config: StreamlinedCMSConfig;
    private isAuthenticated: boolean = false;
    private currentUserId: string | null = null;
    private editableElements: Map<string, HTMLElement> = new Map();
    private editingElement: HTMLElement | null = null;

    constructor(config: StreamlinedCMSConfig) {
        this.config = config;
        this.log("StreamlinedCMS initialized", this.config);

        // Initialize mock auth if enabled
        if (config.mockAuth?.enabled) {
            this.isAuthenticated = true;
            this.currentUserId = config.mockAuth.userId || "mock-user-123";
            this.log("Mock authentication enabled", { userId: this.currentUserId });
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
        this.log("Initializing SDK", {
            appId: this.config.appId,
            domain: this.getDomain(),
        });

        // Find all elements with data-editable attribute
        this.scanEditableElements();

        // Load existing content from API
        await this.loadContent();

        // Remove hiding styles now that content is loaded
        this.removeHidingStyles();

        // Set up edit mode if authenticated
        if (this.isAuthenticated) {
            this.enableEditMode();
        }

        this.log("SDK initialization complete", {
            editableCount: this.editableElements.size,
            appId: this.config.appId,
            domain: this.getDomain(),
        });
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
                this.log("Found editable element", { elementId, element });
            }
        });
    }

    /**
     * Load existing content from the API
     */
    private async loadContent(): Promise<void> {
        if (this.editableElements.size === 0) {
            this.log("No editable elements to load");
            return;
        }

        try {
            const url = `${this.config.apiUrl}/apps/${this.config.appId}/content`;
            this.log("Loading content from API", { url });

            const response = await fetch(url);

            if (!response.ok) {
                // If 404, no content exists yet - that's okay for new sites
                if (response.status === 404) {
                    this.log("No existing content found (404) - this is normal for new sites");
                    return;
                }
                // If 403, domain not whitelisted
                if (response.status === 403) {
                    console.warn("Domain not whitelisted for this app:", this.getDomain());
                    return;
                }
                throw new Error(
                    `Failed to load content: ${response.status} ${response.statusText}`,
                );
            }

            const data = (await response.json()) as { elements: ContentElement[] };
            this.log("Content loaded", data);

            // Update DOM with loaded content
            data.elements.forEach((element) => {
                const domElement = this.editableElements.get(element.elementId);
                if (domElement) {
                    domElement.innerHTML = element.content;
                    this.log("Updated element from API", {
                        elementId: element.elementId,
                    });
                }
            });
        } catch (error) {
            console.error("Failed to load content:", error);
            // Don't throw - allow the SDK to continue with default content
        }
    }

    /**
     * Enable edit mode - make elements editable and add visual indicators
     */
    private enableEditMode(): void {
        this.log("Enabling edit mode");

        this.editableElements.forEach((element, elementId) => {
            // Add visual indicator class
            element.classList.add("streamlined-editable");

            // Add click handler to start editing
            element.addEventListener("click", (e) => {
                e.preventDefault();
                this.startEditing(elementId);
            });

            // Add CSS for visual indicator
            this.injectEditStyles();
        });
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
            this.log("Element not found", { elementId });
            return;
        }

        this.log("Starting edit", { elementId });

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

        this.log("Stopping edit");

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
        this.log("Saving element", { elementId, content });

        // Disable button during save
        const button = document.getElementById("streamlined-save-btn") as HTMLButtonElement;
        if (button) {
            button.disabled = true;
            button.textContent = "Saving...";
        }

        try {
            const url = `${this.config.apiUrl}/apps/${this.config.appId}/content/${elementId}`;
            const response = await fetch(url, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    content,
                    updatedBy: this.currentUserId,
                }),
            });

            if (!response.ok) {
                throw new Error(`Failed to save: ${response.status} ${response.statusText}`);
            }

            const data = (await response.json()) as ContentElement;
            this.log("Content saved successfully", data);

            // Show success feedback
            if (button) {
                button.textContent = "Saved!";
                setTimeout(() => {
                    this.stopEditing();
                }, 1000);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error("Failed to save content:", error);

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
     * Log debug messages if debug mode is enabled
     */
    private log(message: string, data?: any): void {
        if (this.config.debug) {
            console.log(`[StreamlinedCMS] ${message}`, data || "");
        }
    }
}
