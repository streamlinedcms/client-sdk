/**
 * Lazy-loaded module for auth and UI
 *
 * This module is loaded AFTER the critical path completes (content visible).
 * It contains:
 * - Loganite logger (for detailed logging)
 * - Auth module (API key management, login popup)
 * - Lit web components (sign-in link, mode toggle)
 * - Editing functionality
 */

import { Logger } from "loganite";
import { Auth, type EditorMode } from "../auth.js";
import { getConfigFromScriptTag, type ViewerConfig } from "../viewer/config.js";

// Import Lit components to register them
import "../components/mode-toggle.js";
import "../components/sign-in-link.js";
import type { ModeToggle } from "../components/mode-toggle.js";

class EditorController {
    private config: ViewerConfig;
    private log: Logger;
    private auth: Auth;
    private apiKey: string | null = null;
    private currentMode: EditorMode = "viewer";
    private editableElements: Map<string, HTMLElement> = new Map();
    private editingElement: HTMLElement | null = null;
    private customSignInTrigger: Element | null = null;
    private customSignInOriginalText: string | null = null;

    constructor(config: ViewerConfig) {
        this.config = config;

        // Create logger with configured level
        const logLevel = config.logLevel || "error";
        this.log = new Logger("StreamlinedCMS", logLevel);

        // Initialize auth module
        this.auth = new Auth({
            appId: config.appId,
            appUrl: config.appUrl,
        });
    }

    async init(): Promise<void> {
        this.log.info("Lazy module initializing", {
            appId: this.config.appId,
        });

        // Re-scan editable elements (viewer already populated them)
        this.scanEditableElements();

        // Check for mock auth
        if (this.config.mockAuth?.enabled) {
            this.apiKey = "mock-api-key";
            this.log.debug("Mock authentication enabled");
            this.setMode("author");
            return;
        }

        // Set up auth UI based on stored state
        this.setupAuthUI();

        this.log.info("Lazy module initialized", {
            editableCount: this.editableElements.size,
            hasApiKey: !!this.apiKey,
            mode: this.currentMode,
        });
    }

    private scanEditableElements(): void {
        document.querySelectorAll<HTMLElement>("[data-editable]").forEach((element) => {
            const elementId = element.getAttribute("data-editable");
            if (elementId) {
                this.editableElements.set(elementId, element);
            }
        });
    }

    private setupAuthUI(): void {
        const storedKey = this.auth.getStoredKey();

        if (storedKey) {
            this.apiKey = storedKey;

            // Set up custom trigger as sign-out if present
            const customTrigger = document.querySelector("[data-scms-signin]");
            if (customTrigger) {
                this.customSignInTrigger = customTrigger;
                this.customSignInOriginalText = customTrigger.textContent;
                customTrigger.textContent = "Sign Out";
                customTrigger.addEventListener("click", this.handleSignOutClick);
            }

            const storedMode = this.auth.getStoredMode();
            this.setMode(storedMode === "author" ? "author" : "viewer");
            this.log.debug("Restored auth state", { mode: this.currentMode });
        } else {
            this.showSignInLink();
            this.log.debug("No valid API key, showing sign-in link");
        }
    }

    private showSignInLink(): void {
        this.removeModeToggle();

        // Check for custom trigger
        const customTrigger = document.querySelector("[data-scms-signin]");
        if (customTrigger) {
            this.customSignInTrigger = customTrigger;
            this.customSignInOriginalText = customTrigger.textContent;

            // Restore original text if it was changed
            if (this.customSignInOriginalText) {
                customTrigger.textContent = this.customSignInOriginalText;
            }

            customTrigger.addEventListener("click", this.handleSignInClick);
            return;
        }

        // Use Lit component
        const signInLink = document.createElement("scms-sign-in-link");
        signInLink.id = "scms-signin-link";
        signInLink.addEventListener("sign-in-click", () => {
            this.handleSignIn();
        });
        document.body.appendChild(signInLink);
    }

    private handleSignInClick = (e: Event): void => {
        e.preventDefault();
        this.handleSignIn();
    };

    private handleSignOutClick = (e: Event): void => {
        e.preventDefault();
        this.signOut();
    };

    private async handleSignIn(): Promise<void> {
        this.log.debug("Opening login popup");

        const key = await this.auth.openLoginPopup();
        if (key) {
            this.apiKey = key;

            // Remove default sign-in link if present
            const signInLink = document.getElementById("scms-signin-link");
            if (signInLink) signInLink.remove();

            // Convert custom trigger to sign-out
            if (this.customSignInTrigger) {
                this.customSignInTrigger.removeEventListener("click", this.handleSignInClick);
                this.customSignInTrigger.textContent = "Sign Out";
                this.customSignInTrigger.addEventListener("click", this.handleSignOutClick);
            }

            this.setMode("author");
            this.log.info("User authenticated via popup, entering author mode");
        } else {
            this.log.debug("Login popup closed without authentication");
        }
    }

    private setMode(mode: EditorMode): void {
        this.currentMode = mode;
        this.auth.storeMode(mode);

        if (mode === "author") {
            this.enableAuthorMode();
        } else {
            this.enableViewerMode();
        }
    }

    private enableAuthorMode(): void {
        this.log.debug("Entering author mode");

        this.editableElements.forEach((element, elementId) => {
            element.classList.add("streamlined-editable");

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

        this.injectEditStyles();
        this.showModeToggle();
    }

    private enableViewerMode(): void {
        this.log.debug("Entering viewer mode");

        this.editableElements.forEach((element) => {
            element.classList.remove("streamlined-editable", "streamlined-editing");
            element.removeAttribute("contenteditable");
        });

        this.hideSaveButton();
        this.editingElement = null;
        this.showModeToggle();
    }

    private showModeToggle(): void {
        // Update existing toggle if present, otherwise create new one
        const existing = document.getElementById("scms-mode-toggle") as ModeToggle | null;
        if (existing) {
            existing.mode = this.currentMode;
            return;
        }

        // Create new Lit component
        const toggle = document.createElement("scms-mode-toggle") as ModeToggle;
        toggle.id = "scms-mode-toggle";
        toggle.mode = this.currentMode;

        toggle.addEventListener("mode-change", ((e: CustomEvent<{ mode: EditorMode }>) => {
            this.setMode(e.detail.mode);
        }) as EventListener);

        toggle.addEventListener("sign-out", () => {
            this.signOut();
        });

        document.body.appendChild(toggle);
    }

    private removeModeToggle(): void {
        const existing = document.getElementById("scms-mode-toggle");
        if (existing) existing.remove();
    }

    private signOut(): void {
        this.log.info("Signing out");

        this.auth.clearStoredKey();
        this.apiKey = null;

        this.editableElements.forEach((element) => {
            element.classList.remove("streamlined-editable", "streamlined-editing");
            element.removeAttribute("contenteditable");
        });
        this.hideSaveButton();
        this.editingElement = null;

        // Convert custom trigger back to sign-in
        if (this.customSignInTrigger) {
            this.customSignInTrigger.removeEventListener("click", this.handleSignOutClick);
            if (this.customSignInOriginalText) {
                this.customSignInTrigger.textContent = this.customSignInOriginalText;
            }
            this.customSignInTrigger.addEventListener("click", this.handleSignInClick);
        }

        this.removeModeToggle();

        // Only show default sign-in link if no custom trigger
        if (!this.customSignInTrigger) {
            this.showSignInLink();
        }
    }

    private injectEditStyles(): void {
        if (document.getElementById("streamlined-cms-styles")) {
            return;
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

    private startEditing(elementId: string): void {
        const element = this.editableElements.get(elementId);
        if (!element) {
            this.log.warn("Element not found", { elementId });
            return;
        }

        this.log.trace("Starting edit", { elementId });

        if (this.editingElement) {
            this.stopEditing();
        }

        this.editingElement = element;
        element.classList.add("streamlined-editing");
        element.setAttribute("contenteditable", "true");
        element.focus();

        this.showSaveButton(elementId);
    }

    private stopEditing(): void {
        if (!this.editingElement) {
            return;
        }

        this.log.trace("Stopping edit");

        this.editingElement.classList.remove("streamlined-editing");
        this.editingElement.setAttribute("contenteditable", "false");
        this.editingElement = null;

        this.hideSaveButton();
    }

    private showSaveButton(elementId: string): void {
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

    private hideSaveButton(): void {
        const button = document.getElementById("streamlined-save-btn");
        if (button) {
            button.remove();
        }
    }

    private async saveElement(elementId: string): Promise<void> {
        const element = this.editableElements.get(elementId);
        if (!element) {
            return;
        }

        const content = element.innerHTML;
        this.log.debug("Saving element", { elementId });

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
                body: JSON.stringify({ content }),
            });

            if (!response.ok) {
                throw new Error(`Failed to save: ${response.status} ${response.statusText}`);
            }

            await response.json();

            this.auth.refreshKeyExpiry();

            this.log.info("Content saved", { elementId });

            if (button) {
                button.textContent = "Saved!";
                setTimeout(() => {
                    this.stopEditing();
                }, 1000);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.log.error("Failed to save content", error);

            if (button) {
                button.textContent = "Save Failed - Retry";
                button.disabled = false;
            }

            alert(`Failed to save: ${errorMessage}\n\nCheck console for details.`);
        }
    }
}

/**
 * Initialize the lazy-loaded functionality
 */
export async function initLazy(config: ViewerConfig): Promise<void> {
    const controller = new EditorController(config);
    await controller.init();
}

// Auto-initialize when loaded directly
const config = getConfigFromScriptTag();
if (config) {
    initLazy(config);
}
