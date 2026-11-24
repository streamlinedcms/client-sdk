/**
 * Save waits for saved content
 *
 * A save needs saved content (saved attributes, among other things), or it
 * writes elements without their saved attributes and erases them. So Save
 * must not be offered until the editor has loaded it: not in viewer mode
 * with a restored draft, and not after loading it failed.
 *
 * Regression test for a finding in the review of
 * https://github.com/streamlinedcms/client-sdk/pull/165
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
    setupTestHelpers,
    generateTestAppId,
} from "~/@browser-support/sdk-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";

let appId: string;

function getToolbar(): Toolbar {
    return document.querySelector("scms-toolbar") as Toolbar;
}

function saveButton(): Element | null {
    return getToolbar().shadowRoot?.querySelector('[data-action="save"]') ?? null;
}

async function setMode(mode: "author" | "viewer"): Promise<void> {
    getToolbar().dispatchEvent(new CustomEvent("mode-change", { detail: { mode } }));
    await waitForCondition(() => getToolbar().mode === mode);
}

beforeAll(async () => {
    setupTestHelpers();
    appId = generateTestAppId();

    await setContent(
        appId,
        "saved-attr-viewer-text",
        JSON.stringify({ type: "text", value: "Saved", attributes: { title: "Saved title" } }),
    );
    await runLoader(appId);

    // An unsaved draft from an earlier visit
    localStorage.setItem(
        `scms_draft_${appId}`,
        JSON.stringify({
            content: {
                "saved-attr-viewer-text": JSON.stringify({
                    type: "text",
                    value: "Draft text",
                    attributes: { title: "Saved title" },
                }),
            },
            deleted: [],
        }),
    );

    await initLazyWithStoredKey(appId, "viewer");
    await waitForSelector("scms-toolbar");
    setSavedContentRetryDelays([50, 50, 50]);
});

test("in viewer mode with a restored draft, Save isn't offered before saved content loads", async () => {
    await waitForCondition(() => getToolbar().hasChanges);
    await new Promise((r) => setTimeout(r, 100));
    expect(saveButton()).toBeNull();
});

test("after saved content fails to load, Save isn't offered", async () => {
    const fail = failContentFetches("network");
    await setMode("author");
    await waitForCondition(() => getToolbar().warning !== null);
    await new Promise((r) => setTimeout(r, 100));
    expect(saveButton()).toBeNull();
    fail.stop();
});

test("once saved content loads, Save is offered and saves the draft", async () => {
    await setMode("viewer");
    await setMode("author");
    await waitForCondition(() => saveButton() !== null);

    expect(await clickToolbarButton("Save")).toBe(true);
    await waitForCondition(() => !getToolbar().hasChanges, 5000);

    const stored = JSON.parse((await getContent(appId, "saved-attr-viewer-text"))!);
    expect(stored.value).toBe("Draft text");
    expect(stored.attributes).toEqual({ title: "Saved title" });
});
