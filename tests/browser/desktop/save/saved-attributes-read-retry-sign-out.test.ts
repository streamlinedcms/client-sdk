/**
 * Signing out while a failed saved-content fetch is retried
 *
 * The editor must stay signed out: retrying stops, and no toolbar or
 * editing comes back.
 *
 * Regression test for: https://github.com/streamlinedcms/client-sdk/issues/159
 */

import { test, expect, beforeAll } from "vitest";
import { setContent } from "~/@browser-support/test-helpers.js";
import {
    runLoader,
    initLazyWithStoredKey,
    failContentFetches,
    setSavedContentRetryDelays,
    waitForSelector,
    waitForCondition,
    setupTestHelpers,
    generateTestAppId,
    getController,
} from "~/@browser-support/sdk-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";

beforeAll(async () => {
    setupTestHelpers();
    const appId = generateTestAppId();

    await setContent(
        appId,
        "saved-attr-viewer-text",
        JSON.stringify({ type: "text", value: "Saved", attributes: { title: "Saved title" } }),
    );

    await runLoader(appId);
    await initLazyWithStoredKey(appId, "viewer");
    await waitForSelector("scms-toolbar");
    setSavedContentRetryDelays([200, 200, 200]);
});

test("signing out stops the retries and leaves the editor signed out", async () => {
    const fail = failContentFetches("server");
    const toolbar = document.querySelector("scms-toolbar") as Toolbar;

    toolbar.dispatchEvent(new CustomEvent("mode-change", { detail: { mode: "author" } }));
    await waitForCondition(() => fail.failures() === 1);
    (
        getController() as unknown as { authManager: { signOut: (skip: boolean) => void } }
    ).authManager.signOut(true);

    // Longer than every retry would take
    await new Promise((r) => setTimeout(r, 1000));
    expect(fail.failures()).toBe(1);
    expect(document.querySelector("scms-toolbar")).toBeNull();
    const element = document.querySelector('[data-scms-text="saved-attr-viewer-text"]')!;
    expect(element.classList.contains("streamlined-editable")).toBe(false);
});
