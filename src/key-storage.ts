/**
 * API key and mode preference storage
 *
 * Handles localStorage persistence for:
 * - API keys (server is source of truth for expiry)
 * - Editor mode preference (author/viewer)
 */

const STORAGE_KEY = "scms_auth";
const MODE_STORAGE_KEY = "scms_mode";

interface StoredAuth {
    key: string;
    appId: string;
}

export type EditorMode = "author" | "viewer";

export class KeyStorage {
    private appId: string;

    constructor(appId: string) {
        this.appId = appId;
    }

    /**
     * Get stored API key from localStorage
     * Server is the source of truth for key expiry
     */
    getStoredKey(): string | null {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) return null;

            const auth: StoredAuth = JSON.parse(stored);

            // Check if key is for this app
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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    }

    /**
     * Clear stored API key
     */
    clearStoredKey(): void {
        localStorage.removeItem(STORAGE_KEY);
    }

    /**
     * Get stored editor mode preference
     */
    getStoredMode(): EditorMode | null {
        try {
            const stored = localStorage.getItem(MODE_STORAGE_KEY);
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
            MODE_STORAGE_KEY,
            JSON.stringify({
                appId: this.appId,
                mode,
            }),
        );
    }
}
