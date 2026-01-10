/**
 * Basic toolbar tests
 */

import { test, expect, beforeAll, afterAll } from "vitest";
import { initializeSDK, setupTestHelpers } from "~/@browser-support/sdk-helpers.js";

beforeAll(async () => {
    setupTestHelpers();
    await initializeSDK();
});

test("toolbar renders desktop view", async () => {
    const toolbar = document.querySelector("scms-toolbar");
    const shadowRoot = toolbar?.shadowRoot!;

    // Desktop view has fixed height of 48px (h-12)
    const desktopBar = shadowRoot.querySelector(".h-12");
    expect(desktopBar).not.toBeNull();
});

test("toolbar hides Sign Out and Admin buttons when mock auth is enabled", async () => {
    // The test uses mock auth, so Sign Out and Admin should be hidden
    const toolbar = document.querySelector("scms-toolbar");
    const shadowRoot = toolbar?.shadowRoot;

    // Sign Out button should not exist
    const hasSignOut = Array.from(shadowRoot?.querySelectorAll("button") || []).some((btn) =>
        btn.textContent?.includes("Sign Out"),
    );
    expect(hasSignOut).toBe(false);

    // Admin link should not exist
    const hasAdmin = Array.from(shadowRoot?.querySelectorAll("a") || []).some((a) =>
        a.textContent?.includes("Admin"),
    );
    expect(hasAdmin).toBe(false);
});
