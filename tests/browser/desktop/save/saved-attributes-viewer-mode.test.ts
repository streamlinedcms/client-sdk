/**
 * Saved attributes survive a save after switching from viewer to author mode
 *
 * When an editor's remembered mode is "viewer", the page loads without
 * entering author mode. Switching to author from the toolbar must still load
 * saved attributes, or the next save erases them.
 *
 * Uses a stored API key instead of mock auth (mock auth always starts in
 * author mode), with the auth bridge stubbed to accept it.
 *
 * Regression test for: https://github.com/streamlinedcms/client-sdk/issues/107
 */

import { test, expect, beforeAll, vi } from "vitest";
import { setContent, getContent } from "~/@browser-support/test-helpers.js";
import {
    runLoader,
    waitForSelector,
    waitForCondition,
    clickToolbarButton,
    setElementContent,
    setupTestHelpers,
    generateTestAppId,
} from "~/@browser-support/sdk-helpers.js";
import { initLazy } from "~/src/lazy/index.js";
import { AuthBridge } from "~/src/lazy/auth-bridge.js";
import { KeyStorage } from "~/src/key-storage.js";
import type { AppPermissions } from "~/src/types.js";
import type { Toolbar } from "~/src/components/toolbar.js";

declare const __SDK_API_URL__: string;
declare const __SDK_LOG_LEVEL__: string | false;

const permissions: AppPermissions = {
    contentRead: true,
    contentWrite: true,
    mediaRead: true,
    mediaUpload: true,
    mediaEditOwn: true,
    mediaEditOthers: true,
    mediaDeleteOwn: true,
    mediaDeleteOthers: true,
    manageMembers: false,
    manageBilling: false,
    manageSettings: false,
    denyAppGui: false,
    changeRequestValue: false,
    changeRequestEstimate: false,
    changeRequestMessage: false,
};

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

    vi.spyOn(AuthBridge.prototype, "init").mockImplementation(() => {});
    vi.spyOn(AuthBridge.prototype, "authenticate").mockResolvedValue({
        valid: true,
        permissions,
    });

    const keyStorage = new KeyStorage(appId);
    keyStorage.storeKey("test-viewer-key");
    keyStorage.storeMode("viewer");

    await runLoader(appId);
    await initLazy({
        apiUrl: __SDK_API_URL__,
        appUrl: "http://unused-in-tests",
        appId,
        logLevel: __SDK_LOG_LEVEL__,
    });
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
