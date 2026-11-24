/**
 * Switching back to viewer while author mode is still loading
 *
 * Entering author mode waits for saved content. If the editor switches back
 * to viewer before it arrives, their last choice must win.
 *
 * Regression test for: https://github.com/streamlinedcms/client-sdk/issues/107
 */

import { test, expect, beforeAll } from "vitest";
import { setContent } from "~/@browser-support/test-helpers.js";
import {
    runLoader,
    initLazyWithStoredKey,
    holdContentFetches,
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
});

test("the mode chosen last wins over a slow switch to author", async () => {
    const hold = holdContentFetches();
    const toolbar = document.querySelector("scms-toolbar") as Toolbar;

    toolbar.dispatchEvent(new CustomEvent("mode-change", { detail: { mode: "author" } }));
    await waitForCondition(() => hold.isWaiting());
    toolbar.dispatchEvent(new CustomEvent("mode-change", { detail: { mode: "viewer" } }));

    hold.release();
    await new Promise((r) => setTimeout(r, 300));

    const element = document.querySelector('[data-scms-text="saved-attr-viewer-text"]')!;
    expect(element.classList.contains("streamlined-editable")).toBe(false);
    expect(
        (getController() as unknown as { state: { currentMode: string } }).state.currentMode,
    ).toBe("viewer");
});
