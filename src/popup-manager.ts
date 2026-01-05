/**
 * Popup manager for cross-origin communication with the main app
 *
 * Handles:
 * - Login popup for user authentication
 *
 * Uses PopupConnection for safe penpal lifecycle management.
 *
 * Note: Media manager is now handled by the MediaManagerModal component
 * which uses a persistent iframe instead of a popup.
 */

import { PopupConnection } from "./popup-connection.js";

export interface PopupConfig {
    appId: string;
    appUrl: string; // e.g., 'https://app.streamlinedcms.com'
}

export interface LoginCredentials {
    email?: string;
    password?: string;
}

/** Methods exposed by the login popup via penpal */
interface LoginPopupRemote {
    [index: string]: Function;
    setCredentials(credentials: LoginCredentials): void;
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
    private loginConnection: PopupConnection<string, LoginPopupRemote>;

    constructor(config: PopupConfig) {
        const origin = new URL(config.appUrl).origin;

        this.loginConnection = new PopupConnection<string, LoginPopupRemote>({
            url: `${config.appUrl}/login?appId=${encodeURIComponent(config.appId)}`,
            name: "scms-login",
            width: 500,
            height: 600,
            allowedOrigins: [origin],
            timeout: 300000, // 5 minutes for user to complete login
        });
    }

    /**
     * Open login popup and wait for authentication
     * Returns API key on success, null if user closes popup
     *
     * @param credentials - Optional credentials to prepopulate the login form
     */
    async openLoginPopup(credentials?: LoginCredentials): Promise<string | null> {
        // Set up credential prepopulation if provided
        if (credentials && (credentials.email || credentials.password)) {
            this.loginConnection.setOnConnected((remote) => {
                remote.setCredentials(credentials);
            });
        } else {
            this.loginConnection.setOnConnected(undefined);
        }

        return this.loginConnection.open({
            receiveAuthResult: (result: { key: string }) => result.key,
        });
    }
}
