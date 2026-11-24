/**
 * Switching mode while a sign-in is still loading saved content
 *
 * The toolbar shows during sign-in, so its mode toggle can be used before
 * saved content arrives. That changes the mode, not whether the user is
 * signed in, so the sign-in must still report success and fire "signin".
 *
 * Regression test for a regression found in review of
 * https://github.com/streamlinedcms/client-sdk/pull/158
 */

import { test, expect, beforeAll } from "vitest";
import {
    runLoader,
    initLazyWithStoredKey,
    holdContentFetches,
    waitForSavedContent,
    waitForCondition,
    setupTestHelpers,
    generateTestAppId,
    getController,
} from "~/@browser-support/sdk-helpers.js";

beforeAll(async () => {
    setupTestHelpers();
    const appId = generateTestAppId();

    await runLoader(appId);
    await initLazyWithStoredKey(appId, null);
});

test("a mode switch during sign-in still reports a successful sign-in", async () => {
    const controller = getController()!;
    const events: string[] = [];
    controller.on("signin", () => events.push("signin"));

    const hold = holdContentFetches();
    const result = controller.signIn("editor@example.com", "test-password");
    await waitForCondition(() => hold.isWaiting());
    await waitForCondition(() => document.querySelector("scms-toolbar") !== null);

    document
        .querySelector("scms-toolbar")!
        .dispatchEvent(new CustomEvent("mode-change", { detail: { mode: "viewer" } }));

    hold.release();
    await waitForSavedContent();

    expect(await result).toEqual({ success: true });
    expect(events).toEqual(["signin"]);
});
