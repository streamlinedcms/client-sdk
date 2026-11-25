/**
 * Shared helpers for browser tests.
 * These utilities are used across multiple test files.
 */

import { vi } from "vitest";
import { initLazy } from "../../../src/lazy/index.js";
import { AuthBridge } from "../../../src/lazy/auth-bridge.js";
import { KeyStorage, type EditorMode } from "../../../src/key-storage.js";
import { initTestHelpers } from "./test-helpers.js";
import type { EditorController } from "../../../src/lazy/index.js";
import type { AppPermissions } from "../../../src/types.js";

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
    const random = Math.random().toString(36).slice(2, 8);
    return `test-app-${Date.now()}-${counter}-${random}`;
}

/**
 * Run the loader script to fetch content and populate DOM.
 * Returns a promise that resolves when the loader completes.
 * Call it on its own to see the page as a visitor gets it, without the editor.
 * @param options.contentTimeoutMs - How long the loader waits for content
 */
export async function runLoader(
    appId: string,
    options: { contentTimeoutMs?: number } = {},
): Promise<void> {
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
    if (options.contentTimeoutMs !== undefined) {
        script.dataset.contentTimeout = String(options.contentTimeoutMs);
    }

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
 * Edit the content of an element in a Tiptap-aware way.
 * If the formatting toolbar has Tiptap attached to the element,
 * uses Tiptap's API. Otherwise falls back to setting innerHTML directly.
 */
export function setElementContent(element: HTMLElement, newContent: string): void {
    const toolbar = document.querySelector("scms-formatting-toolbar") as HTMLElement | null;
    const target =
        toolbar && (toolbar as unknown as { targetElement: HTMLElement | null }).targetElement;

    if (target === element) {
        // Tiptap is managing this element — use its API
        const setContent = (toolbar as unknown as { setContent: (html: string) => void })
            .setContent;
        setContent.call(toolbar, newContent);
    } else {
        // No Tiptap — set innerHTML directly
        element.innerHTML = newContent;
        element.dispatchEvent(new Event("input", { bubbles: true }));
    }
}

/**
 * Setup function to be called in beforeAll
 */
export function setupTestHelpers(): void {
    initTestHelpers(__SDK_API_URL__.replace("/v1", ""));
}

const FULL_PERMISSIONS: AppPermissions = {
    contentRead: true,
    contentWrite: true,
    mediaRead: true,
    mediaUpload: true,
    mediaEditOwn: true,
    mediaEditOthers: true,
    mediaDeleteOwn: true,
    mediaDeleteOthers: true,
    manageMembers: false,
    manageBilling: false,
    manageSettings: false,
    denyAppGui: false,
    changeRequestValue: false,
    changeRequestEstimate: false,
    changeRequestMessage: false,
};

/**
 * Start the editor with real (non-mock) auth: with a stored API key and a
 * remembered mode, as a returning user, or signed out when mode is null.
 * Mock auth always starts in author mode, so it can't cover these paths.
 * The auth bridge is stubbed to accept the key and any programmatic sign-in.
 * Run the loader first. Returns initLazy's promise, which settles once auth
 * setup has finished.
 */
export function initLazyWithStoredKey(
    appId: string,
    mode: EditorMode | null,
): Promise<EditorController> {
    vi.spyOn(AuthBridge.prototype, "init").mockImplementation(() => {});
    vi.spyOn(AuthBridge.prototype, "authenticate").mockResolvedValue({
        valid: true,
        permissions: FULL_PERMISSIONS,
    });
    vi.spyOn(AuthBridge.prototype, "signIn").mockResolvedValue({
        valid: true,
        permissions: FULL_PERMISSIONS,
        key: "test-signin-key",
    });

    if (mode) {
        const keyStorage = new KeyStorage(appId);
        keyStorage.storeKey("test-stored-key");
        keyStorage.storeMode(mode);
    }

    return initLazy({
        apiUrl: __SDK_API_URL__,
        appUrl: "http://unused-in-tests",
        appId,
        logLevel: __SDK_LOG_LEVEL__,
    }).then((c) => {
        controller = c;
        return c;
    });
}

/**
 * Wait until the editor has received saved content, then let it finish
 * handling the response.
 */
export async function waitForSavedContent(): Promise<void> {
    const c = controller as unknown as { savedContentFetched: boolean };
    await waitForCondition(() => c.savedContentFetched);
    await new Promise((r) => setTimeout(r, 0));
}

/**
 * Hold the editor's saved-content fetches (GET .../content) until released,
 * to test what happens while one is in flight. Install after the loader runs.
 */
export function holdContentFetches(): {
    /** Whether a held fetch is waiting */
    isWaiting: () => boolean;
    /** Let held fetches through, and stop holding new ones */
    release: () => void;
} {
    const realFetch = window.fetch.bind(window);
    let held = true;
    const waiting: Array<() => void> = [];

    vi.spyOn(window, "fetch").mockImplementation(async (input, init) => {
        const url =
            typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const method = init?.method ?? (input instanceof Request ? input.method : "GET");
        if (held && method === "GET" && /\/apps\/[^/]+\/content$/.test(new URL(url).pathname)) {
            await new Promise<void>((resolve) => waiting.push(resolve));
        }
        return realFetch(input, init);
    });

    return {
        isWaiting: () => waiting.length > 0,
        release: () => {
            held = false;
            waiting.splice(0).forEach((resolve) => resolve());
        },
    };
}

/**
 * Make the editor's saved-content fetches (GET .../content) fail until
 * stopped, either with a server error or with no response at all. Install
 * after the loader runs, or before it to fail the loader's fetch too.
 */
export function failContentFetches(kind: "server" | "network"): {
    /** How many fetches have failed so far */
    failures: () => number;
    /** Let later fetches through */
    stop: () => void;
} {
    const realFetch = window.fetch.bind(window);
    let failing = true;
    let failures = 0;

    vi.spyOn(window, "fetch").mockImplementation(async (input, init) => {
        const url =
            typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const method = init?.method ?? (input instanceof Request ? input.method : "GET");
        if (failing && method === "GET" && /\/apps\/[^/]+\/content$/.test(new URL(url).pathname)) {
            failures++;
            if (kind === "network") {
                throw new TypeError("Failed to fetch");
            }
            return new Response("Internal Server Error", { status: 500 });
        }
        return realFetch(input, init);
    });

    return {
        failures: () => failures,
        stop: () => {
            failing = false;
        },
    };
}

/**
 * Answer saved-content fetches (GET .../content), the loader's included,
 * with the given response until stopped. "hang" never answers, until the
 * request is aborted.
 */
export function respondToContentFetches(response: (() => Response) | "hang"): {
    /** Let later fetches through */
    stop: () => void;
} {
    const realFetch = window.fetch.bind(window);
    let responding = true;

    vi.spyOn(window, "fetch").mockImplementation(async (input, init) => {
        const url =
            typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const method = init?.method ?? (input instanceof Request ? input.method : "GET");
        if (
            responding &&
            method === "GET" &&
            /\/apps\/[^/]+\/content$/.test(new URL(url).pathname)
        ) {
            if (response === "hang") {
                return new Promise<Response>((_, reject) => {
                    init?.signal?.addEventListener("abort", () =>
                        reject(new DOMException("Aborted", "AbortError")),
                    );
                });
            }
            return response();
        }
        return realFetch(input, init);
    });

    return {
        stop: () => {
            responding = false;
        },
    };
}

/**
 * Shorten the waits between retries of a failed saved-content fetch, so tests
 * don't wait seconds for them. Call before entering author mode.
 */
export function setSavedContentRetryDelays(delays: number[]): void {
    (controller as unknown as { savedContentRetryDelays: number[] }).savedContentRetryDelays =
        delays;
}
