/**
 * Reloading into author mode with a slow saved-content fetch
 *
 * The toolbar appears right away, but editing must not turn on before saved
 * content arrives. Otherwise an edit made in that moment is saved without the
 * element's saved attributes.
 *
 * Regression test for: https://github.com/streamlinedcms/client-sdk/issues/107
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

let appId: string;

beforeAll(async () => {
    setupTestHelpers();
    appId = generateTestAppId();

    await setContent(
        appId,
        "saved-attr-viewer-text",
        JSON.stringify({ type: "text", value: "Saved", attributes: { title: "Saved title" } }),
    );

    await runLoader(appId);
});

test("the toolbar shows at once, and editing turns on once saved content arrives", async () => {
    const hold = holdContentFetches();
    const initialized = initLazyWithStoredKey(appId, "author");
    const element = document.querySelector('[data-scms-text="saved-attr-viewer-text"]')!;

    await waitForCondition(() => hold.isWaiting());
    await waitForCondition(() => document.querySelector("scms-toolbar") !== null);
    expect(document.getElementById("scms-loading")).toBeNull();
    expect(element.classList.contains("streamlined-editable")).toBe(false);

    hold.release();
    await initialized;
    await waitForCondition(() => element.classList.contains("streamlined-editable"));
});
