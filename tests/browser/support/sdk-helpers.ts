/**
 * Shared helpers for browser tests.
 * These utilities are used across multiple test files.
 */

import { initLazy } from "../../../src/lazy/index.js";
import { initTestHelpers } from "./test-helpers.js";
import type { EditorController } from "../../../src/lazy/index.js";

// Declare global variables injected by vitest config
declare const __SDK_API_URL__: string;
declare const __SDK_APP_URL__: string;
declare const __SDK_LOG_LEVEL__: string | false;

let controller: EditorController | null = null;

/**
 * Get the current controller instance
 */
export function getController(): EditorController | null {
    return controller;
}

/**
 * Generate a unique app ID for this test file.
 * Call this before setContent() and pass the same appId to initializeSDK({ appId }).
 */
export function generateTestAppId(): string {
    const counter = initCounter++;
    return `test-app-${Date.now()}-${counter}`;
}

/**
 * Run the loader script to fetch content and populate DOM.
 * Returns a promise that resolves when the loader completes.
 */
async function runLoader(appId: string): Promise<void> {
    const TIMEOUT_MS = 5000;

    // Remove any existing loader script for this appId
    document.querySelectorAll(`script[data-app-id="${appId}"]`).forEach((el) => el.remove());

    // Create promise that resolves when loader dispatches complete event
    const loaderComplete = new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(
                new Error(
                    `runLoader: Timed out after ${TIMEOUT_MS}ms waiting for loader-complete event`,
                ),
            );
        }, TIMEOUT_MS);

        document.addEventListener(
            "streamlined-cms:loader-complete",
            () => {
                clearTimeout(timeoutId);
                resolve();
            },
            { once: true },
        );
    });

    // Inject the loader script
    const script = document.createElement("script");
    script.src = "/dist/streamlined-cms.min.js";
    script.dataset.appId = appId;
    // Use full URL instead of relative (avoids Vite proxy issues with dynamic ports)
    script.dataset.apiUrl = __SDK_API_URL__;
    script.dataset.skipEsm = "true";

    document.head.appendChild(script);

    // Wait for loader to complete
    await loaderComplete;
}

/**
 * Options for initializing the SDK in tests
 */
interface InitializeSDKOptions {
    /** Custom app ID. Defaults to a unique ID per initialization for API isolation. */
    appId?: string;
}

// Counter to generate unique draft keys across multiple initializeSDK calls
let initCounter = 0;

/**
 * Initialize the SDK.
 * Each initialization gets a unique app ID to avoid interference between
 * parallel test files that share the mock server and localStorage.
 * The draft storage key defaults to `scms_draft_${appId}`.
 */
export async function initializeSDK(options?: InitializeSDKOptions): Promise<EditorController> {
    const appId = options?.appId ?? generateTestAppId();

    // Run the loader to fetch content and populate DOM
    await runLoader(appId);

    // Initialize the SDK (draftStorageKey defaults to scms_draft_${appId})
    controller = await initLazy({
        apiUrl: __SDK_API_URL__,
        appUrl: __SDK_APP_URL__,
        appId,
        logLevel: __SDK_LOG_LEVEL__,
        mockAuth: {
            enabled: true,
            userId: "test-user",
        },
    });

    // Wait for SDK to be fully initialized
    await waitForSelector(".streamlined-editable");

    return controller;
}

/**
 * Wait for a selector to appear in the DOM
 */
export async function waitForSelector(selector: string, timeout = 3000): Promise<Element> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const el = document.querySelector(selector);
        if (el) return el;
        await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`Timeout waiting for selector: ${selector}`);
}

/**
 * Wait for a condition to be true
 */
export async function waitForCondition(fn: () => boolean, timeout = 3000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (fn()) return;
        await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("Timeout waiting for condition");
}

/**
 * Click a toolbar button by text content.
 * Waits for Lit to re-render before searching for the button.
 */
export async function clickToolbarButton(text: string): Promise<boolean> {
    // Wait for Lit to process any pending updates
    await new Promise((r) => setTimeout(r, 100));

    const toolbar = document.querySelector("scms-toolbar");
    const buttons = toolbar?.shadowRoot?.querySelectorAll("button") || [];
    for (const btn of buttons) {
        if (btn.textContent?.trim().includes(text)) {
            btn.click();
            return true;
        }
    }
    return false;
}

/**
 * Setup function to be called in beforeAll
 */
export function setupTestHelpers(): void {
    initTestHelpers(__SDK_API_URL__.replace("/v1", ""));
}
