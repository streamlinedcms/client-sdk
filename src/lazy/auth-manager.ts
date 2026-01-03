/**
 * AuthManager - Handles authentication UI and flow
 *
 * Responsible for:
 * - Setting up auth UI (sign-in/sign-out links)
 * - Validating API keys
 * - Handling sign-in popup flow
 * - Handling sign-out
 * - Managing custom sign-in triggers
 */

import type { Logger } from "loganite";
import type { EditorState } from "./state.js";
import type { KeyStorage } from "../key-storage.js";
import type { PopupManager } from "../popup-manager.js";
import type { AppPermissions } from "../types.js";

/**
 * Configuration for AuthManager
 */
export interface AuthManagerConfig {
    apiUrl: string;
    appId: string;
}

/**
 * Helpers that AuthManager needs from EditorController
 */
export interface AuthManagerHelpers {
    setMode: (mode: "author" | "viewer") => void;
    enableEditing: () => void;
    disableEditing: () => void;
    fetchSavedContentKeys: () => Promise<boolean>;
    showToolbar: () => void;
    removeToolbar: () => void;
    updateMediaManagerApiKey: () => void;
    hasUnsavedChanges: () => boolean;
}

export class AuthManager {
    // Bound event handlers for proper removal
    private handleSignInClick = (e: Event): void => {
        e.preventDefault();
        this.handleSignIn();
    };

    private handleSignOutClick = (e: Event): void => {
        e.preventDefault();
        this.signOut();
    };

    constructor(
        private state: EditorState,
        private log: Logger,
        private keyStorage: KeyStorage,
        private popupManager: PopupManager,
        private config: AuthManagerConfig,
        private helpers: AuthManagerHelpers,
    ) {}

    /**
     * Set up auth UI based on stored key state
     */
    async setupAuthUI(): Promise<void> {
        const storedKey = this.keyStorage.getStoredKey();

        if (storedKey) {
            // Validate the stored key before trusting it
            const isValid = await this.validateApiKey(storedKey);
            if (!isValid) {
                this.log.info("Stored API key is no longer valid, clearing");
                this.keyStorage.clearStoredKey();
                this.showSignInLink();
                return;
            }

            this.state.apiKey = storedKey;
            this.helpers.updateMediaManagerApiKey();

            // Fetch user permissions
            await this.fetchPermissions(storedKey);

            // Set up all custom triggers as sign-out
            const customTriggers = document.querySelectorAll("[data-scms-signin]");
            customTriggers.forEach((trigger) => {
                this.state.customSignInTriggers.set(trigger, trigger.textContent || "");
                trigger.textContent = "Sign Out";
                trigger.addEventListener("click", this.handleSignOutClick);
            });

            const storedMode = this.keyStorage.getStoredMode();
            const mode = storedMode === "author" ? "author" : "viewer";
            this.helpers.setMode(mode);
            if (mode === "author") {
                const success = await this.helpers.fetchSavedContentKeys();
                if (!success) {
                    this.helpers.disableEditing();
                }
            }
            this.log.debug("Restored auth state", {
                mode: this.state.currentMode,
                triggerCount: customTriggers.length,
            });
        } else {
            this.showSignInLink();
            this.log.debug("No valid API key, showing sign-in link");
        }
    }

    /**
     * Validate an API key by making a request to the keys/@me endpoint
     * Returns true if valid, false if invalid (401/403) or on network error
     */
    async validateApiKey(apiKey: string): Promise<boolean> {
        try {
            const response = await fetch(
                `${this.config.apiUrl}/apps/${this.config.appId}/keys/@me`,
                {
                    headers: { Authorization: `Bearer ${apiKey}` },
                },
            );

            if (response.status === 401 || response.status === 403) {
                return false;
            }

            return response.ok;
        } catch (error) {
            this.log.warn("Failed to validate API key", error);
            // On network error, assume key is still valid to avoid logging user out
            return true;
        }
    }

    /**
     * Fetch user permissions from the members/@me endpoint.
     * Updates state.permissions on success.
     * Returns the permissions object, or null on failure.
     */
    async fetchPermissions(apiKey: string): Promise<AppPermissions | null> {
        try {
            const response = await fetch(
                `${this.config.apiUrl}/apps/${this.config.appId}/members/@me`,
                {
                    headers: { Authorization: `Bearer ${apiKey}` },
                },
            );

            if (!response.ok) {
                this.log.warn("Failed to fetch permissions", { status: response.status });
                return null;
            }

            const data = await response.json();
            const permissions = data.role?.permissions as AppPermissions | undefined;

            if (permissions) {
                this.state.permissions = permissions;
                this.log.debug("Fetched permissions", { permissions });
                return permissions;
            }

            this.log.warn("No permissions in member response", { data });
            return null;
        } catch (error) {
            this.log.warn("Failed to fetch permissions", error);
            return null;
        }
    }

    /**
     * Show sign-in link UI (either custom triggers or default Lit component)
     */
    showSignInLink(): void {
        this.helpers.removeToolbar();

        // Check for custom triggers
        const customTriggers = document.querySelectorAll("[data-scms-signin]");
        if (customTriggers.length > 0) {
            customTriggers.forEach((trigger) => {
                // Store original text if not already stored
                if (!this.state.customSignInTriggers.has(trigger)) {
                    this.state.customSignInTriggers.set(trigger, trigger.textContent || "");
                }
                // Restore original text
                const originalText = this.state.customSignInTriggers.get(trigger);
                if (originalText) {
                    trigger.textContent = originalText;
                }
                trigger.addEventListener("click", this.handleSignInClick);
            });
            return;
        }

        // Use Lit component (fallback when no custom triggers)
        const signInLink = document.createElement("scms-sign-in-link");
        signInLink.id = "scms-signin-link";
        signInLink.addEventListener("sign-in-click", () => {
            this.handleSignIn();
        });
        document.body.appendChild(signInLink);
    }

    /**
     * Handle sign-in flow via popup
     */
    async handleSignIn(): Promise<void> {
        this.log.debug("Opening login popup");

        const key = await this.popupManager.openLoginPopup();
        if (key) {
            this.state.apiKey = key;
            this.helpers.updateMediaManagerApiKey();
            this.keyStorage.storeKey(key);

            // Fetch user permissions
            await this.fetchPermissions(key);

            // Remove default sign-in link if present
            const signInLink = document.getElementById("scms-signin-link");
            if (signInLink) signInLink.remove();

            // Convert all custom triggers to sign-out
            this.state.customSignInTriggers.forEach((_, trigger) => {
                trigger.removeEventListener("click", this.handleSignInClick);
                trigger.textContent = "Sign Out";
                trigger.addEventListener("click", this.handleSignOutClick);
            });

            this.helpers.setMode("author");
            const success = await this.helpers.fetchSavedContentKeys();
            if (!success) {
                this.helpers.disableEditing();
            }

            this.log.info("User authenticated via popup, entering author mode");
        } else {
            this.log.debug("Login popup closed without authentication");
        }
    }

    /**
     * Sign out the user
     */
    signOut(skipConfirmation = false): void {
        if (!skipConfirmation && this.helpers.hasUnsavedChanges()) {
            const confirmed = confirm("You have unsaved changes. Sign out anyway?");
            if (!confirmed) return;
        }

        this.log.info("Signing out");

        this.keyStorage.clearStoredKey();
        this.state.apiKey = null;
        this.state.permissions = null;
        this.helpers.updateMediaManagerApiKey();
        this.state.currentMode = "viewer";

        this.helpers.disableEditing();

        // Convert all custom triggers back to sign-in
        this.state.customSignInTriggers.forEach((originalText, trigger) => {
            trigger.removeEventListener("click", this.handleSignOutClick);
            trigger.textContent = originalText;
            trigger.addEventListener("click", this.handleSignInClick);
        });

        this.helpers.removeToolbar();

        // Only show default sign-in link if no custom triggers
        if (this.state.customSignInTriggers.size === 0) {
            this.showSignInLink();
        }
    }
}
