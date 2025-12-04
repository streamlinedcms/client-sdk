/**
 * Popup manager for cross-origin communication with the main app
 *
 * Handles:
 * - Login popup for user authentication
 * - Media manager popup for file selection
 *
 * Uses PopupConnection for safe penpal lifecycle management.
 */

import { PopupConnection } from "./popup-connection.js";

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
    private loginConnection: PopupConnection<string>;
    private mediaConnection: PopupConnection<MediaFile>;

    constructor(config: PopupConfig) {
        const origin = new URL(config.appUrl).origin;

        this.loginConnection = new PopupConnection<string>({
            url: `${config.appUrl}/login?appId=${encodeURIComponent(config.appId)}`,
            name: "scms-login",
            width: 500,
            height: 600,
            allowedOrigins: [origin],
            timeout: 300000, // 5 minutes for user to complete login
        });

        this.mediaConnection = new PopupConnection<MediaFile>({
            url: `${config.appUrl}/media?appId=${encodeURIComponent(config.appId)}`,
            name: "scms-media",
            width: 800,
            height: 600,
            allowedOrigins: [origin],
            timeout: 600000, // 10 minutes for user to select media
        });
    }

    /**
     * Open login popup and wait for authentication
     * Returns API key on success, null if user closes popup
     */
    async openLoginPopup(): Promise<string | null> {
        return this.loginConnection.open({
            receiveAuthResult: (result: { key: string }) => result.key,
        });
    }

    /**
     * Open media manager popup and wait for selection
     * Returns selected file on success, null if user closes popup or cancels
     */
    async openMediaManager(): Promise<MediaFile | null> {
        return this.mediaConnection.open({
            receiveMediaSelection: (result: { file: MediaFile }) => result.file,
            receiveMediaCancel: () => null,
        });
    }
}
