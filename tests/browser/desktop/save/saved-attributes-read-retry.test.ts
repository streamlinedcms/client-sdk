/**
 * Saved content that fails to load at first is retried
 *
 * Author mode needs saved content before any edit, or the next save erases
 * an element's saved attributes. A failed fetch (here a server error) often
 * clears up on its own, so it's retried, and editing turns on once it loads.
 *
 * Regression test for: https://github.com/streamlinedcms/client-sdk/issues/159
 */

import { test, expect, beforeAll } from "vitest";
import { setContent, getContent } from "~/@browser-support/test-helpers.js";
import {
    runLoader,
    initLazyWithStoredKey,
    failContentFetches,
    setSavedContentRetryDelays,
    waitForSelector,
    waitForCondition,
    clickToolbarButton,
    setElementContent,
    setupTestHelpers,
    generateTestAppId,
} from "~/@browser-support/sdk-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";

let appId: string;

function getToolbar(): Toolbar {
    return document.querySelector("scms-toolbar") as Toolbar;
}

beforeAll(async () => {
    setupTestHelpers();
    appId = generateTestAppId();

    await setContent(
        appId,
        "saved-attr-viewer-text",
        JSON.stringify({
            type: "text",
            value: "Saved viewer text",
            attributes: { title: "Saved viewer title" },
        }),
    );

    await runLoader(appId);
    await initLazyWithStoredKey(appId, "viewer");
    await waitForSelector("scms-toolbar");
    setSavedContentRetryDelays([200, 200, 200]);
});

test("editing stays off while saved content fails to load, then turns on once it loads", async () => {
    const fail = failContentFetches("server");
    getToolbar().dispatchEvent(new CustomEvent("mode-change", { detail: { mode: "author" } }));

    const element = document.querySelector(
        '[data-scms-text="saved-attr-viewer-text"]',
    ) as HTMLElement;
    await waitForCondition(() => fail.failures() >= 2);
    expect(element.classList.contains("streamlined-editable")).toBe(false);

    fail.stop();
    await waitForCondition(() => element.classList.contains("streamlined-editable"));
    expect(getToolbar().warning).toBeNull();
});

test("after it loads, editing the text keeps the saved attributes", async () => {
    const element = document.querySelector(
        '[data-scms-text="saved-attr-viewer-text"]',
    ) as HTMLElement;

    element.click();
    await waitForCondition(() => element.classList.contains("streamlined-editing"));
    setElementContent(element, "Edited viewer text");
    await new Promise((r) => setTimeout(r, 100));

    expect(await clickToolbarButton("Save")).toBe(true);
    await waitForCondition(() => !getToolbar().hasChanges, 5000);

    const stored = JSON.parse((await getContent(appId, "saved-attr-viewer-text"))!);
    expect(stored.value).toBe("Edited viewer text");
    expect(stored.attributes).toEqual({ title: "Saved viewer title" });
});
