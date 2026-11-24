/**
 * The content viewer must not start editing while editing is off
 *
 * Clicking an element's badge in the content viewer selects it for editing.
 * While author mode is still loading saved content, editing is off; an edit
 * then would be saved without the element's saved attributes.
 *
 * Regression test for a regression found in review of
 * https://github.com/streamlinedcms/client-sdk/pull/158
 */

import { test, expect, beforeAll } from "vitest";
import { setContent } from "~/@browser-support/test-helpers.js";
import {
    runLoader,
    initLazyWithStoredKey,
    holdContentFetches,
    waitForCondition,
    setupTestHelpers,
    generateTestAppId,
} from "~/@browser-support/sdk-helpers.js";

const KEY = "saved-attr-viewer-text";
let appId: string;

/**
 * Open the content viewer and click the element's badge.
 */
async function clickBadge(element: HTMLElement): Promise<void> {
    element.scrollIntoView({ block: "center" });
    document.querySelector("scms-toolbar")!.dispatchEvent(new CustomEvent("content-viewer-toggle"));
    let badge: Element | undefined;
    await waitForCondition(() => {
        badge = Array.from(document.querySelectorAll("scms-content-viewer-badge")).find(
            (b) => (b as unknown as { elementKey: string }).elementKey === KEY,
        );
        return badge !== undefined;
    });
    badge!.dispatchEvent(new CustomEvent("badge-click", { detail: { key: KEY } }));
    await new Promise((r) => setTimeout(r, 100));
}

beforeAll(async () => {
    setupTestHelpers();
    appId = generateTestAppId();

    await setContent(
        appId,
        KEY,
        JSON.stringify({ type: "text", value: "Saved", attributes: { title: "Saved title" } }),
    );

    await runLoader(appId);
});

test("a badge click doesn't start editing while saved content loads, and does after", async () => {
    const hold = holdContentFetches();
    const initialized = initLazyWithStoredKey(appId, "author");
    const element = document.querySelector(`[data-scms-text="${KEY}"]`) as HTMLElement;

    await waitForCondition(() => hold.isWaiting());
    await waitForCondition(() => document.querySelector("scms-toolbar") !== null);

    await clickBadge(element);
    expect(element.classList.contains("streamlined-editing")).toBe(false);
    expect(element.isContentEditable).toBe(false);

    hold.release();
    await initialized;
    await waitForCondition(() => element.classList.contains("streamlined-editable"));

    await clickBadge(element);
    expect(element.classList.contains("streamlined-editing")).toBe(true);
});
