/**
 * Access denied (402/403) when entering author mode
 *
 * The saved-content fetch is where a site without access finds out. Its
 * warning must reach the toolbar, so the editor knows why nothing is
 * editable.
 *
 * Regression test for a regression found in review of
 * https://github.com/streamlinedcms/client-sdk/pull/158
 */

import { test, expect, beforeAll, vi } from "vitest";
import {
    runLoader,
    initLazyWithStoredKey,
    waitForCondition,
    setupTestHelpers,
    generateTestAppId,
} from "~/@browser-support/sdk-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";

const DENIED_MESSAGE = "A paid plan is required to edit on this domain.";

beforeAll(async () => {
    setupTestHelpers();
    const appId = generateTestAppId();

    await runLoader(appId);

    // The API refuses the editor's saved-content fetch
    const realFetch = window.fetch.bind(window);
    vi.spyOn(window, "fetch").mockImplementation(async (input, init) => {
        const url =
            typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (/\/apps\/[^/]+\/content$/.test(new URL(url).pathname)) {
            return new Response(JSON.stringify({ error: DENIED_MESSAGE }), {
                status: 402,
                headers: { "Content-Type": "application/json" },
            });
        }
        return realFetch(input, init);
    });

    await initLazyWithStoredKey(appId, "author");
});

test("the toolbar shows the API's access-denied message, and editing stays off", async () => {
    const toolbar = document.querySelector("scms-toolbar") as Toolbar;
    expect(toolbar).not.toBeNull();
    await waitForCondition(() => toolbar.warning !== null);
    expect(toolbar.warning).toBe(DENIED_MESSAGE);

    const element = document.querySelector('[data-scms-text="saved-attr-viewer-text"]')!;
    expect(element.classList.contains("streamlined-editable")).toBe(false);
});
