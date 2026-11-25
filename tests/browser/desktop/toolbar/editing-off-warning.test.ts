/**
 * The editing-off warning stays while editing is off
 *
 * When saved content never loads, editing stays off and the toolbar says
 * why. A later successful API request doesn't turn editing on, so it must not
 * clear that warning, and an access-denied warning must still be able to show
 * over it.
 *
 * Regression test for: https://github.com/streamlinedcms/client-sdk/issues/175
 */

import { test, expect, beforeAll, vi } from "vitest";
import {
    runLoader,
    initLazyWithStoredKey,
    failContentFetches,
    setSavedContentRetryDelays,
    getController,
    waitForSelector,
    waitForCondition,
    setupTestHelpers,
    generateTestAppId,
} from "~/@browser-support/sdk-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";

const DENIED_MESSAGE = "A paid plan is required to edit on this domain.";

let appId: string;
let toolbar: Toolbar;

/** A request through the editor's shared API wrapper, as saves and change requests make */
function apiFetch(path: string): Promise<Response> {
    const controller = getController() as unknown as {
        config: { apiUrl: string };
        apiFetch: (url: string) => Promise<Response>;
    };
    return controller.apiFetch(`${controller.config.apiUrl}/apps/${appId}${path}`);
}

beforeAll(async () => {
    setupTestHelpers();
    appId = generateTestAppId();

    await runLoader(appId);
    await initLazyWithStoredKey(appId, "viewer");
    await waitForSelector("scms-toolbar");
    setSavedContentRetryDelays([50, 50, 50]);

    const fail = failContentFetches("network");
    toolbar = document.querySelector("scms-toolbar") as Toolbar;
    toolbar.dispatchEvent(new CustomEvent("mode-change", { detail: { mode: "author" } }));
    await waitForCondition(() => toolbar.warning !== null);
    fail.stop();
    vi.restoreAllMocks();
});

test("a successful request leaves the editing-off warning in place", async () => {
    expect(toolbar.warning).toMatch(/couldn't load saved content/i);

    const response = await apiFetch("/content");
    expect(response.ok).toBe(true);

    expect(toolbar.warning).toMatch(/couldn't load saved content/i);
});

test("an access-denied warning shows over it, and it returns once access is back", async () => {
    const realFetch = window.fetch.bind(window);
    const denied = vi.spyOn(window, "fetch").mockImplementation(async (input, init) => {
        const url =
            typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (/\/apps\/[^/]+\/content$/.test(new URL(url).pathname)) {
            return new Response(JSON.stringify({ error: DENIED_MESSAGE }), {
                status: 402,
                headers: { "Content-Type": "application/json" },
            });
        }
        return realFetch(input, init);
    });

    await apiFetch("/content");
    expect(toolbar.warning).toBe(DENIED_MESSAGE);

    denied.mockRestore();
    await apiFetch("/content");
    expect(toolbar.warning).toMatch(/couldn't load saved content/i);
});

test("leaving author mode clears it", async () => {
    toolbar.dispatchEvent(new CustomEvent("mode-change", { detail: { mode: "viewer" } }));
    expect(toolbar.warning).toBeNull();
});
