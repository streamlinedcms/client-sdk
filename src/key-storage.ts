/**
 * API key and mode preference storage
 *
 * Handles localStorage persistence for:
 * - API keys (server is source of truth for expiry)
 * - Editor mode preference (author/viewer)
 *
 * Storage keys are scoped by appId to allow multiple apps on the same domain.
 * Legacy unscoped keys are checked as fallback for backwards compatibility.
 */

const LEGACY_STORAGE_KEY = "scms_auth";
const LEGACY_MODE_STORAGE_KEY = "scms_mode";

interface StoredAuth {
    key: string;
    appId: string;
}

export type EditorMode = "author" | "viewer";

export class KeyStorage {
    private appId: string;
    private storageKey: string;
    private modeStorageKey: string;

    constructor(appId: string) {
        this.appId = appId;
        this.storageKey = `scms_auth_${appId}`;
        this.modeStorageKey = `scms_mode_${appId}`;
    }

    /**
     * Get stored API key from localStorage
     * Server is the source of truth for key expiry
     */
    getStoredKey(): string | null {
        // Try app-scoped key first
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const auth: StoredAuth = JSON.parse(stored);
                if (auth.appId === this.appId) {
                    return auth.key;
                }
            }
        } catch {
            // Fall through to legacy check
        }

        // Fallback to legacy unscoped key
        try {
            const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
            if (!stored) return null;

            const auth: StoredAuth = JSON.parse(stored);
            if (auth.appId !== this.appId) return null;

            return auth.key;
        } catch {
            return null;
        }
    }

    /**
     * Store API key in localStorage
     */
    storeKey(key: string): void {
        const auth: StoredAuth = {
            key,
            appId: this.appId,
        };
        localStorage.setItem(this.storageKey, JSON.stringify(auth));
    }

    /**
     * Clear stored API key
     */
    clearStoredKey(): void {
        localStorage.removeItem(this.storageKey);
        // Also clear legacy key if it matches this app
        try {
            const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
            if (stored) {
                const auth: StoredAuth = JSON.parse(stored);
                if (auth.appId === this.appId) {
                    localStorage.removeItem(LEGACY_STORAGE_KEY);
                }
            }
        } catch {
            // Ignore errors
        }
    }

    /**
     * Get stored editor mode preference
     */
    getStoredMode(): EditorMode | null {
        // Try app-scoped key first
        try {
            const stored = localStorage.getItem(this.modeStorageKey);
            if (stored) {
                const data = JSON.parse(stored);
                if (data.appId === this.appId) {
                    return data.mode as EditorMode;
                }
            }
        } catch {
            // Fall through to legacy check
        }

        // Fallback to legacy unscoped key
        try {
            const stored = localStorage.getItem(LEGACY_MODE_STORAGE_KEY);
            if (!stored) return null;

            const data = JSON.parse(stored);
            if (data.appId !== this.appId) return null;

            return data.mode as EditorMode;
        } catch {
            return null;
        }
    }

    /**
     * Store editor mode preference
     */
    storeMode(mode: EditorMode): void {
        localStorage.setItem(
            this.modeStorageKey,
            JSON.stringify({
                appId: this.appId,
                mode,
            }),
        );
    }
}
