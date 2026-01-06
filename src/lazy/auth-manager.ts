/**
 * AuthManager - Handles authentication UI and flow
 *
 * Responsible for:
 * - Setting up auth UI (sign-in/sign-out links)
 * - Validating API keys via auth bridge
 * - Handling sign-in popup flow
 * - Handling sign-out
 * - Managing custom sign-in triggers
 */

import type { Logger } from "loganite";
import type { EditorState } from "./state.js";
import type { KeyStorage } from "../key-storage.js";
import type { PopupManager } from "../popup-manager.js";
import type { AuthBridge } from "./auth-bridge.js";

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
    hasUnsavedChanges: () => boolean;
    setToolbarWarning: (message: string | null) => void;
    removeLoadingIndicator: () => void;
    emitSignIn: () => void;
    emitSignOut: () => void;
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
        private authBridge: AuthBridge,
        private helpers: AuthManagerHelpers,
    ) {}

    /**
     * Set up auth UI based on stored key state
     */
    async setupAuthUI(): Promise<void> {
        const storedKey = this.keyStorage.getStoredKey();

        if (storedKey) {
            // Validate the stored key via auth bridge
            const result = await this.authBridge.authenticate(storedKey);

            if (!result.valid) {
                // Handle different error types
                if (this.isConnectionError(result.error)) {
                    this.log.warn("Auth bridge connection error", { error: result.error });
                    this.helpers.setToolbarWarning(
                        "Authentication service unavailable. Refresh the page or contact your website administrator.",
                    );
                    // Don't clear the key on connection errors - might be temporary
                    this.showSignInLink();
                    return;
                }

                if (result.error === "Origin not allowed") {
                    this.log.warn("Domain not allowed", { error: result.error });
                    const domain = window.location.hostname;
                    this.helpers.setToolbarWarning(
                        `Domain "${domain}" is not whitelisted. Add it in Admin → Settings.`,
                    );
                    this.showSignInLink();
                    return;
                }

                // Invalid API key - clear it and show sign-in
                this.log.info("Stored API key is no longer valid, clearing");
                this.keyStorage.clearStoredKey();
                this.showSignInLink();
                return;
            }

            this.state.apiKey = storedKey;
            this.state.permissions = result.permissions;

            this.log.debug("Authentication successful", { permissions: result.permissions });

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
     * Check if an error is a connection-related error
     */
    private isConnectionError(error: string): boolean {
        const connectionErrors = [
            "Auth bridge connection failed",
            "Auth bridge not connected",
            "Authentication request failed",
            "Could not determine parent origin",
        ];
        return connectionErrors.some((e) => error.includes(e));
    }

    /**
     * Refetch permissions via auth bridge.
     * Used after a 403 error to check if permissions have changed.
     */
    async refetchPermissions(): Promise<void> {
        if (!this.state.apiKey) return;

        const result = await this.authBridge.authenticate(this.state.apiKey);
        if (result.valid) {
            this.state.permissions = result.permissions;
            this.log.debug("Refetched permissions", { permissions: result.permissions });
        } else {
            this.log.warn("Failed to refetch permissions", { error: result.error });
        }
    }

    /**
     * Show sign-in link UI (either custom triggers or default Lit component)
     */
    showSignInLink(): void {
        this.helpers.removeLoadingIndicator();
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
            // Validate via auth bridge and get permissions
            const result = await this.authBridge.authenticate(key);
            if (!result.valid) {
                this.log.warn("Sign-in failed", { error: result.error });
                // Show appropriate error
                if (this.isConnectionError(result.error)) {
                    this.helpers.setToolbarWarning(
                        "Authentication service unavailable. Refresh the page or contact your website administrator.",
                    );
                } else if (result.error === "Origin not allowed") {
                    const domain = window.location.hostname;
                    this.helpers.setToolbarWarning(
                        `Domain "${domain}" is not whitelisted. Add it in Admin → Settings.`,
                    );
                }
                return;
            }

            this.state.apiKey = key;
            this.state.permissions = result.permissions;
            this.keyStorage.storeKey(key);

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
            this.helpers.emitSignIn();
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

        this.helpers.emitSignOut();
    }
}
