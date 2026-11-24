/**
 * Saved attributes survive a save after switching from viewer to author mode
 *
 * When an editor's remembered mode is "viewer", the page loads without
 * entering author mode. Switching to author from the toolbar must still load
 * saved attributes, or the next save erases them.
 *
 * Starts as a returning user with a stored API key, since mock auth always
 * starts in author mode.
 *
 * Regression test for: https://github.com/streamlinedcms/client-sdk/issues/107
 */

import { test, expect, beforeAll } from "vitest";
import { setContent, getContent } from "~/@browser-support/test-helpers.js";
import {
    runLoader,
    initLazyWithStoredKey,
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
});

test("the page loads in viewer mode", () => {
    const element = document.querySelector('[data-scms-text="saved-attr-viewer-text"]');
    expect(element!.classList.contains("streamlined-editable")).toBe(false);
});

test("after switching to author, editing the text keeps the saved attributes", async () => {
    getToolbar().dispatchEvent(new CustomEvent("mode-change", { detail: { mode: "author" } }));

    const element = document.querySelector(
        '[data-scms-text="saved-attr-viewer-text"]',
    ) as HTMLElement;
    await waitForCondition(() => element.classList.contains("streamlined-editable"));

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
