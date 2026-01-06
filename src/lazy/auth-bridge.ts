/**
 * AuthBridge - Handles authentication via a hidden iframe
 *
 * Uses penpal to communicate with the auth bridge iframe on the app GUI domain.
 * This allows authentication from custom domains that can't directly call
 * the /keys/@me and /members/@me API endpoints due to CORS restrictions.
 */

import { WindowMessenger, connect } from "penpal";
import type { Logger } from "loganite";
import type { AppPermissions } from "../types.js";

/** Result from authenticate call */
export type AuthResult =
    | { valid: true; permissions: AppPermissions }
    | { valid: false; error: string };

/** Result from signIn call */
export type SignInResult =
    | { valid: true; permissions: AppPermissions; key: string }
    | { valid: false; error: string };

/** Methods exposed by the auth bridge iframe */
interface AuthBridgeMethods {
    authenticate(apiKey: string): Promise<AuthResult>;
    signIn(email: string, password: string): Promise<SignInResult>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: (...args: any[]) => Promise<any>;
}

/**
 * Configuration for AuthBridge
 */
export interface AuthBridgeConfig {
    appUrl: string;
    appId: string;
}

export class AuthBridge {
    private iframe: HTMLIFrameElement | null = null;
    private authBridge: AuthBridgeMethods | null = null;
    private connectionReady = false;
    private connectionPromise: Promise<void> | null = null;

    constructor(
        private config: AuthBridgeConfig,
        private log: Logger,
    ) {}

    /**
     * Initialize the auth bridge iframe and establish penpal connection.
     * This should be called early in the app lifecycle.
     */
    init(): void {
        if (this.iframe) return; // Already initialized

        const url = `${this.config.appUrl}/embed/auth-bridge?appId=${encodeURIComponent(this.config.appId)}`;
        const origin = new URL(this.config.appUrl).origin;

        // Create hidden iframe
        this.iframe = document.createElement("iframe");
        this.iframe.src = url;
        this.iframe.style.display = "none";
        this.iframe.setAttribute("aria-hidden", "true");
        document.body.appendChild(this.iframe);

        // Store promise so we can wait for connection
        this.connectionPromise = new Promise((resolve, reject) => {
            this.iframe!.addEventListener("load", () => {
                this.establishConnection(origin).then(resolve).catch(reject);
            });
        });

        this.log.debug("Auth bridge iframe created", { url });
    }

    private async establishConnection(origin: string): Promise<void> {
        if (!this.iframe?.contentWindow) {
            throw new Error("Auth bridge iframe not available");
        }

        const messenger = new WindowMessenger({
            remoteWindow: this.iframe.contentWindow,
            allowedOrigins: [origin],
        });

        const connection = connect<AuthBridgeMethods>({
            messenger,
            methods: {}, // No methods exposed from parent
        });

        try {
            this.authBridge = await connection.promise;
            this.connectionReady = true;
            this.log.debug("Auth bridge connection established");
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            this.log.error("Auth bridge connection failed", { error });
            throw new Error(`Auth bridge connection failed: ${error}`);
        }
    }

    /**
     * Wait for the connection to be ready.
     */
    async waitForConnection(): Promise<void> {
        if (this.connectionReady) return;
        if (!this.connectionPromise) {
            throw new Error("Auth bridge not initialized. Call init() first.");
        }
        await this.connectionPromise;
    }

    /**
     * Authenticate with the given API key.
     * Returns permissions on success, or an error message on failure.
     */
    async authenticate(apiKey: string): Promise<AuthResult> {
        await this.waitForConnection();

        if (!this.authBridge) {
            return { valid: false, error: "Auth bridge not connected" };
        }

        try {
            const result = await this.authBridge.authenticate(apiKey);
            if (result.valid) {
                this.log.debug("Authentication successful", { permissions: result.permissions });
            } else {
                this.log.warn("Authentication failed", { error: result.error });
            }
            return result;
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            this.log.error("Authentication error", { error });
            return { valid: false, error: `Authentication request failed: ${error}` };
        }
    }

    /**
     * Sign in with email and password.
     * Returns API key and permissions on success, or an error message on failure.
     * This enables silent authentication without opening a popup.
     */
    async signIn(email: string, password: string): Promise<SignInResult> {
        await this.waitForConnection();

        if (!this.authBridge) {
            return { valid: false, error: "Auth bridge not connected" };
        }

        try {
            const result = await this.authBridge.signIn(email, password);
            if (result.valid) {
                this.log.debug("Sign in successful", { permissions: result.permissions });
            } else {
                this.log.warn("Sign in failed", { error: result.error });
            }
            return result;
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            this.log.error("Sign in error", { error });
            return { valid: false, error: `Sign in request failed: ${error}` };
        }
    }
}
