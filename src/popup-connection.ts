/**
 * PopupConnection - A wrapper for penpal popup connections
 *
 * Handles the lifecycle of a popup window with penpal messaging:
 * - Prevents opening multiple popups of the same type
 * - Ensures cleanup happens exactly once
 * - Polls for popup close to handle manual window closure
 *
 * Usage:
 *   const connection = new PopupConnection<MediaFile>({
 *     url: 'https://app.example.com/media',
 *     name: 'scms-media',
 *     // ...
 *   });
 *
 *   const result = await connection.open({
 *     receiveMediaSelection: (data) => data.file,
 *     receiveMediaCancel: () => null,
 *   });
 */

import { WindowMessenger, connect } from "penpal";

const POPUP_CHECK_INTERVAL = 500;

export interface PopupConnectionConfig {
    /** Full URL to open in the popup */
    url: string;
    /** Window name (used by browser to identify/reuse windows) */
    name: string;
    /** Popup window width */
    width: number;
    /** Popup window height */
    height: number;
    /** Allowed origins for penpal messages */
    allowedOrigins: string[];
    /** Penpal connection timeout in milliseconds */
    timeout: number;
}

/**
 * Method handlers that receive penpal calls and return a result.
 * Each handler should return TResult on success, or null on cancel/close.
 * When a handler returns a value (including null), the popup connection resolves.
 */
export type PopupMethodHandlers<TResult> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [methodName: string]: (...args: any[]) => TResult | null;
};

export class PopupConnection<TResult> {
    private config: PopupConnectionConfig;
    private popup: Window | null = null;
    private cleanedUp = false;
    private checkInterval: number | null = null;
    private connection: { destroy: () => void } | null = null;

    constructor(config: PopupConnectionConfig) {
        this.config = config;
    }

    /**
     * Check if this popup is currently open
     */
    isOpen(): boolean {
        return this.popup !== null && !this.popup.closed;
    }

    /**
     * Focus the existing popup window if open
     */
    focus(): void {
        if (this.isOpen()) {
            this.popup!.focus();
        }
    }

    /**
     * Open the popup and wait for a result.
     *
     * @param methodHandlers - Object mapping penpal method names to handlers.
     *   Each handler receives the method arguments and should return TResult or null.
     *   When any handler returns, the popup connection resolves with that value.
     *
     * @returns Promise that resolves with the result, or null if cancelled/closed
     */
    async open(methodHandlers: PopupMethodHandlers<TResult>): Promise<TResult | null> {
        // Prevent opening multiple popups
        if (this.isOpen()) {
            this.focus();
            return null;
        }

        // Reset state for new connection
        this.cleanedUp = false;

        return new Promise((resolve) => {
            const { url, name, width, height, allowedOrigins, timeout } = this.config;
            const left = window.screenX + (window.outerWidth - width) / 2;
            const top = window.screenY + (window.outerHeight - height) / 2;

            const popup = window.open(
                url,
                name,
                `width=${width},height=${height},left=${left},top=${top},popup=yes`
            );

            if (!popup) {
                resolve(null);
                return;
            }

            this.popup = popup;

            // Set up penpal connection
            const messenger = new WindowMessenger({
                remoteWindow: popup,
                allowedOrigins,
            });

            // Wrap method handlers to resolve the promise when called
            const wrappedMethods: Record<string, (...args: unknown[]) => void> = {};
            for (const [methodName, handler] of Object.entries(methodHandlers)) {
                wrappedMethods[methodName] = (...args: unknown[]) => {
                    const result = handler(...args);
                    // Use setTimeout to allow the method to return to the popup before cleanup
                    setTimeout(() => {
                        this.cleanup();
                        resolve(result);
                    }, 0);
                };
            }

            this.connection = connect<Record<string, never>>({
                messenger,
                methods: wrappedMethods,
                timeout,
            });

            // Poll for popup close (user closed window manually)
            this.checkInterval = window.setInterval(() => {
                if (popup.closed) {
                    this.cleanup();
                    resolve(null);
                }
            }, POPUP_CHECK_INTERVAL);
        });
    }

    /**
     * Clean up resources. Safe to call multiple times.
     */
    private cleanup(): void {
        if (this.cleanedUp) return;
        this.cleanedUp = true;

        if (this.checkInterval !== null) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        if (this.connection) {
            this.connection.destroy();
            this.connection = null;
        }

        this.popup = null;
        this.resolvePromise = null;
    }
}
