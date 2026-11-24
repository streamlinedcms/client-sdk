/**
 * Saved content that never loads keeps editing off and says so
 *
 * When every retry of the saved-content fetch fails (here with no response
 * at all), editing must stay off, since a save would erase saved attributes,
 * and the toolbar must tell the editor why.
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
    setSavedContentRetryDelays([50, 50, 50]);
});

test("after every retry fails, editing stays off and the toolbar says why", async () => {
    const fail = failContentFetches("network");
    const toolbar = document.querySelector("scms-toolbar") as Toolbar;
    toolbar.dispatchEvent(new CustomEvent("mode-change", { detail: { mode: "author" } }));

    await waitForCondition(() => toolbar.warning !== null);
    expect(toolbar.warning).toMatch(/couldn't load saved content/i);
    // The first attempt and one retry per delay
    expect(fail.failures()).toBe(4);

    const element = document.querySelector('[data-scms-text="saved-attr-viewer-text"]')!;
    expect(element.classList.contains("streamlined-editable")).toBe(false);
});
