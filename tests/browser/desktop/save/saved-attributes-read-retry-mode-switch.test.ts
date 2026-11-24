/**
 * Switching back to viewer while a failed saved-content fetch is retried
 *
 * The editor's last choice of mode wins: retrying stops, editing stays off,
 * and no warning appears. Switching to author again loads saved content.
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

test("switching to viewer stops the retries, and switching back loads saved content", async () => {
    const fail = failContentFetches("server");
    const toolbar = document.querySelector("scms-toolbar") as Toolbar;
    const element = document.querySelector('[data-scms-text="saved-attr-viewer-text"]')!;

    toolbar.dispatchEvent(new CustomEvent("mode-change", { detail: { mode: "author" } }));
    await waitForCondition(() => fail.failures() === 1);
    toolbar.dispatchEvent(new CustomEvent("mode-change", { detail: { mode: "viewer" } }));

    // Longer than every retry would take
    await new Promise((r) => setTimeout(r, 1000));
    expect(fail.failures()).toBe(1);
    expect(toolbar.warning).toBeNull();
    expect(element.classList.contains("streamlined-editable")).toBe(false);
    expect(
        (getController() as unknown as { state: { currentMode: string } }).state.currentMode,
    ).toBe("viewer");

    fail.stop();
    toolbar.dispatchEvent(new CustomEvent("mode-change", { detail: { mode: "author" } }));
    await waitForCondition(() => element.classList.contains("streamlined-editable"));
});
