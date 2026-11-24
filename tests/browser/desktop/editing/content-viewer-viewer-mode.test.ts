/**
 * The content viewer must not start editing in viewer mode
 *
 * Viewer mode never loads saved content, so an edit started from the
 * content viewer would be saved without the element's saved attributes.
 *
 * Regression test for: https://github.com/streamlinedcms/client-sdk/issues/107
 */

import { test, expect, beforeAll } from "vitest";
import { setContent } from "~/@browser-support/test-helpers.js";
import {
    runLoader,
    initLazyWithStoredKey,
    waitForSelector,
    waitForCondition,
    setupTestHelpers,
    generateTestAppId,
} from "~/@browser-support/sdk-helpers.js";

const KEY = "saved-attr-viewer-text";

beforeAll(async () => {
    setupTestHelpers();
    const appId = generateTestAppId();

    await setContent(
        appId,
        KEY,
        JSON.stringify({ type: "text", value: "Saved", attributes: { title: "Saved title" } }),
    );

    await runLoader(appId);
    await initLazyWithStoredKey(appId, "viewer");
    await waitForSelector("scms-toolbar");
});

test("a badge click in viewer mode doesn't start editing", async () => {
    const element = document.querySelector(`[data-scms-text="${KEY}"]`) as HTMLElement;
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

    expect(element.classList.contains("streamlined-editing")).toBe(false);
    expect(element.isContentEditable).toBe(false);
});
