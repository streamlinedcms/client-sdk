/**
 * Signing out while a programmatic sign-in is still loading saved content
 *
 * The sign-in was overtaken, so it must not report success or fire its
 * "signin" event after the "signout" one, and nothing it showed may be
 * left on screen.
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

test("a sign-in overtaken by a sign-out reports failure and leaves nothing behind", async () => {
    const controller = getController()!;
    const events: string[] = [];
    controller.on("signin", () => events.push("signin"));
    controller.on("signout", () => events.push("signout"));

    const hold = holdContentFetches();
    const result = controller.signIn("editor@example.com", "test-password");
    await waitForCondition(() => hold.isWaiting());

    (
        controller as unknown as { authManager: { signOut: (skip: boolean) => void } }
    ).authManager.signOut(true);

    hold.release();
    await waitForSavedContent();

    expect(await result).toMatchObject({ success: false });
    expect(events).toEqual(["signout"]);
    expect(document.querySelector("scms-toolbar")).toBeNull();
    expect(document.getElementById("scms-loading")).toBeNull();
});
