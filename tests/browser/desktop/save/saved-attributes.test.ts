/**
 * Saved attributes survive later saves (editor path)
 *
 * An element saved with attributes, then reloaded and edited (text only),
 * must keep its saved attributes in the next save. Otherwise a text edit
 * silently erases alt, title or custom attributes from the CMS.
 *
 * Regression test for: https://github.com/streamlinedcms/client-sdk/issues/107
 */

import { test, expect, beforeAll } from "vitest";
import { setContent, getContent } from "~/@browser-support/test-helpers.js";
import {
    initializeSDK,
    waitForCondition,
    clickToolbarButton,
    setElementContent,
    setupTestHelpers,
    generateTestAppId,
    getController,
} from "~/@browser-support/sdk-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";

let appId: string;

beforeAll(async () => {
    setupTestHelpers();
    appId = generateTestAppId();

    await setContent(
        appId,
        "saved-attr-edit-text",
        JSON.stringify({
            type: "text",
            value: "Saved edit text",
            attributes: { title: "Saved title", "data-custom": "saved-custom" },
        }),
    );

    await initializeSDK({ appId });
    localStorage.removeItem(getController()!.draftStorageKey);
});

test("loading an element with saved attributes doesn't count as an unsaved change", () => {
    const toolbar = document.querySelector("scms-toolbar") as Toolbar;
    expect(toolbar.hasChanges).toBe(false);
});

test("editing only the text keeps the element's saved attributes in the save", async () => {
    const element = document.querySelector(
        '[data-scms-text="saved-attr-edit-text"]',
    ) as HTMLElement;
    const toolbar = document.querySelector("scms-toolbar") as Toolbar;

    element.click();
    await waitForCondition(() => element.classList.contains("streamlined-editing"));
    setElementContent(element, "Edited text");
    await new Promise((r) => setTimeout(r, 100));

    expect(toolbar.hasChanges).toBe(true);
    expect(await clickToolbarButton("Save")).toBe(true);
    await waitForCondition(() => !toolbar.hasChanges, 5000);

    const stored = JSON.parse((await getContent(appId, "saved-attr-edit-text"))!);
    expect(stored.value).toBe("Edited text");
    expect(stored.attributes).toEqual({ title: "Saved title", "data-custom": "saved-custom" });
});
