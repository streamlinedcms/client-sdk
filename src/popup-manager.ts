/**
 * Popup manager for cross-origin communication with the main app
 *
 * Handles:
 * - Login popup for user authentication
 * - Media manager popup for file selection
 *
 * Uses penpal for secure cross-origin messaging.
 */

import { WindowMessenger, connect } from "penpal";

const POPUP_CHECK_INTERVAL = 500;

export interface PopupConfig {
    appId: string;
    appUrl: string; // e.g., 'https://app.streamlinedcms.com'
}

export interface UserRef {
    id: string;
    name: string | null;
}

export interface MediaFile {
    fileId: string;
    filename: string;
    extension: string;
    contentType: string;
    size: number;
    uploadedAt: string;
    uploadedBy?: UserRef;
    publicUrl: string;
}

export class PopupManager {
    private config: PopupConfig;

    constructor(config: PopupConfig) {
        this.config = config;
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
     * Open media manager popup and wait for selection
     * Returns selected file on success, null if user closes popup or cancels
     */
    async openMediaManager(): Promise<MediaFile | null> {
        return new Promise((resolve) => {
            const width = 800;
            const height = 600;
            const left = window.screenX + (window.outerWidth - width) / 2;
            const top = window.screenY + (window.outerHeight - height) / 2;

            const popup = window.open(
                `${this.config.appUrl}/media?appId=${encodeURIComponent(this.config.appId)}`,
                "scms-media",
                `width=${width},height=${height},left=${left},top=${top},popup=yes`,
            );

            if (!popup) {
                resolve(null);
                return;
            }

            // Set up penpal to receive selection from popup
            const messenger = new WindowMessenger({
                remoteWindow: popup,
                allowedOrigins: [new URL(this.config.appUrl).origin],
            });

            const connection = connect<Record<string, never>>({
                messenger,
                methods: {
                    // Method the popup calls to send selected file
                    receiveMediaSelection: (result: { file: MediaFile }) => {
                        resolve(result.file);
                        // Delay cleanup to allow method to return to popup
                        setTimeout(cleanup, 0);
                    },
                    // Method the popup calls when user cancels
                    receiveMediaCancel: () => {
                        resolve(null);
                        // Delay cleanup to allow method to return to popup
                        setTimeout(cleanup, 0);
                    },
                },
                timeout: 600000, // 10 minutes for user to select media
            });

            // Poll for popup close (user closed window)
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
}
