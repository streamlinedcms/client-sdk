/**
 * Authentication module for StreamlinedCMS SDK
 *
 * Handles:
 * - SDK bridge iframe for cross-origin communication
 * - Login popup for user authentication
 * - API key storage in localStorage with expiry
 * - Mode preference storage (author/viewer)
 */

import { WindowMessenger, connect, type Connection } from "penpal";

const STORAGE_KEY = "scms_auth";
const MODE_STORAGE_KEY = "scms_mode";
const POPUP_CHECK_INTERVAL = 500;
const KEY_EXPIRY_MS = 60 * 60 * 1000; // 60 minutes

interface StoredAuth {
    key: string;
    appId: string;
    expiresAt: number;
}

export type EditorMode = "author" | "viewer";

interface BridgeMethods {
    [key: string]: Function;
}

export interface AuthConfig {
    appId: string;
    appUrl: string; // e.g., 'https://app.streamlinedcms.com'
}

export class Auth {
    private config: AuthConfig;
    private bridgeIframe: HTMLIFrameElement | null = null;
    private bridgeConnection: Connection<BridgeMethods> | null = null;
    private bridgeReady: Promise<void> | null = null;

    constructor(config: AuthConfig) {
        this.config = config;
    }

    /**
     * Get stored API key from localStorage (checks expiry)
     */
    getStoredKey(): string | null {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) return null;

            const auth: StoredAuth = JSON.parse(stored);

            // Check if key is for this app
            if (auth.appId !== this.config.appId) return null;

            // Check expiry
            if (Date.now() > auth.expiresAt) {
                this.clearStoredKey();
                return null;
            }

            return auth.key;
        } catch {
            return null;
        }
    }

    /**
     * Store API key in localStorage with expiry
     */
    storeKey(key: string): void {
        const auth: StoredAuth = {
            key,
            appId: this.config.appId,
            expiresAt: Date.now() + KEY_EXPIRY_MS,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    }

    /**
     * Refresh the key expiry (call on successful API usage)
     */
    refreshKeyExpiry(): void {
        const key = this.getStoredKey();
        if (key) {
            this.storeKey(key);
        }
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
            if (data.appId !== this.config.appId) return null;

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
                appId: this.config.appId,
                mode,
            }),
        );
    }

    /**
     * Initialize the SDK bridge iframe for cross-origin communication
     */
    async initBridge(): Promise<void> {
        if (this.bridgeReady) return this.bridgeReady;

        this.bridgeReady = new Promise((resolve, reject) => {
            // Create hidden iframe
            this.bridgeIframe = document.createElement("iframe");
            this.bridgeIframe.src = `${this.config.appUrl}/sdk-bridge`;
            this.bridgeIframe.style.display = "none";
            this.bridgeIframe.setAttribute("aria-hidden", "true");
            document.body.appendChild(this.bridgeIframe);

            // Set up penpal connection
            const messenger = new WindowMessenger({
                remoteWindow: this.bridgeIframe.contentWindow!,
                allowedOrigins: [new URL(this.config.appUrl).origin],
            });

            this.bridgeConnection = connect<BridgeMethods>({
                messenger,
                methods: {
                    // Methods the bridge can call on the SDK (currently none)
                },
                timeout: 10000,
            });

            this.bridgeConnection.promise.then(() => resolve()).catch(reject);
        });

        return this.bridgeReady;
    }

    /**
     * Open login popup and wait for authentication
     * Returns API key on success, null if user closes popup
     */
    async openLoginPopup(): Promise<string | null> {
        return new Promise((resolve) => {
            const width = 500;
            const height = 600;
            const left = window.screenX + (window.outerWidth - width) / 2;
            const top = window.screenY + (window.outerHeight - height) / 2;

            const popup = window.open(
                `${this.config.appUrl}/login?appId=${encodeURIComponent(this.config.appId)}`,
                "scms-login",
                `width=${width},height=${height},left=${left},top=${top},popup=yes`,
            );

            if (!popup) {
                resolve(null);
                return;
            }

            // Set up penpal to receive auth result from popup
            const messenger = new WindowMessenger({
                remoteWindow: popup,
                allowedOrigins: [new URL(this.config.appUrl).origin],
            });

            const connection = connect<Record<string, never>>({
                messenger,
                methods: {
                    // Method the popup calls to send auth result
                    receiveAuthResult: (result: { key: string }) => {
                        this.storeKey(result.key);
                        cleanup();
                        resolve(result.key);
                    },
                },
                timeout: 300000, // 5 minutes for user to complete login
            });

            // Poll for popup close (user cancelled)
            const checkClosed = setInterval(() => {
                if (popup.closed) {
                    cleanup();
                    resolve(null);
                }
            }, POPUP_CHECK_INTERVAL);

            const cleanup = () => {
                clearInterval(checkClosed);
                connection.destroy();
            };
        });
    }

    /**
     * Clean up resources
     */
    destroy(): void {
        if (this.bridgeConnection) {
            this.bridgeConnection.destroy();
            this.bridgeConnection = null;
        }
        if (this.bridgeIframe) {
            this.bridgeIframe.remove();
            this.bridgeIframe = null;
        }
        this.bridgeReady = null;
    }
}
