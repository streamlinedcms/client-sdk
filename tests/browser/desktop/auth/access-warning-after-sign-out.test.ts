/**
 * The access-denied warning after signing out and back in
 *
 * Each sign-in on a site without access must show the warning, not only the
 * first one in a page session; otherwise editing is silently off.
 */

import { test, expect, beforeAll, vi } from "vitest";
import {
    runLoader,
    initLazyWithStoredKey,
    waitForCondition,
    setupTestHelpers,
    generateTestAppId,
    getController,
} from "~/@browser-support/sdk-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";

const DENIED_MESSAGE = "This domain isn't allowed.";

beforeAll(async () => {
    setupTestHelpers();
    const appId = generateTestAppId();

    await runLoader(appId);

    // The API refuses the editor's saved-content fetch
    const realFetch = window.fetch.bind(window);
    vi.spyOn(window, "fetch").mockImplementation(async (input, init) => {
        const url =
            typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (/\/apps\/[^/]+\/content$/.test(new URL(url).pathname)) {
            return new Response(JSON.stringify({ error: DENIED_MESSAGE }), {
                status: 403,
                headers: { "Content-Type": "application/json" },
            });
        }
        return realFetch(input, init);
    });

    await initLazyWithStoredKey(appId, null);
});

async function signInAndGetWarning(): Promise<string | null> {
    await getController()!.signIn("editor@example.com", "test-password");
    const toolbar = document.querySelector("scms-toolbar") as Toolbar;
    await waitForCondition(() => toolbar.warning !== null).catch(() => {});
    return toolbar.warning;
}

test("the warning shows again on a second sign-in after signing out", async () => {
    expect(await signInAndGetWarning()).toBe(DENIED_MESSAGE);

    (
        getController() as unknown as { authManager: { signOut: (skip: boolean) => void } }
    ).authManager.signOut(true);
    await waitForCondition(() => document.querySelector("scms-toolbar") === null);

    expect(await signInAndGetWarning()).toBe(DENIED_MESSAGE);
});
