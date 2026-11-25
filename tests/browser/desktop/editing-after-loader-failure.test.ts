/**
 * Editing waits for the page to show saved content
 *
 * The editor records saved content but doesn't apply it; the loader does. If
 * the loader's fetch failed and the editor's succeeds, the page shows its
 * built-in content, and an edit would save that over the saved version. So
 * editing must stay off, with a warning to reload, until a page load shows
 * saved content.
 *
 * Regression tests for: https://github.com/streamlinedcms/client-sdk/issues/167
 */

import { test, expect, beforeAll } from "vitest";
import { setContent, getContent } from "~/@browser-support/test-helpers.js";
import {
    runLoader,
    initLazyWithStoredKey,
    failContentFetches,
    getController,
    waitForSelector,
    waitForCondition,
    setupTestHelpers,
    generateTestAppId,
} from "~/@browser-support/sdk-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";

const savedText = JSON.stringify({ type: "text", value: "Saved text" });

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

function expectEditingOffWithWarning(): void {
    expect(getController()!.editingEnabled).toBe(false);
    expect(getToolbar().warning).toMatch(/couldn't load its saved content/);
    expect(saveButton()).toBeNull();
}

beforeAll(async () => {
    setupTestHelpers();
    appId = generateTestAppId();
    await setContent(appId, "load-failure-text", savedText);

    // Only the loader's fetch fails; the editor's succeeds
    const fail = failContentFetches("network");
    await runLoader(appId);
    fail.stop();

    await initLazyWithStoredKey(appId, "author");
    await waitForSelector("scms-toolbar");
});

test("in author mode, editing stays off with a warning to reload", async () => {
    await waitForCondition(() => getToolbar().warning !== null);
    expectEditingOffWithWarning();

    const element = document.querySelector('[data-scms-text="load-failure-text"]')!;
    expect(element.textContent).toBe("Built-in text");
});

test("switching to viewer and back keeps editing off", async () => {
    await setMode("viewer");
    await setMode("author");
    await waitForCondition(() => getToolbar().warning !== null);
    // Let a refetch finish, which mustn't turn editing on either
    await new Promise((r) => setTimeout(r, 300));
    expectEditingOffWithWarning();
});

test("the saved content is unchanged", async () => {
    expect(await getContent(appId, "load-failure-text")).toBe(savedText);
});
