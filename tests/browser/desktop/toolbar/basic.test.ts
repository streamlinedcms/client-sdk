/**
 * Basic toolbar tests
 */

import { test, expect, beforeAll, afterAll } from "vitest";
import {
    initializeSDK,
    setupTestHelpers,
    
} from "../support/sdk-helpers.js";

beforeAll(async () => {
    setupTestHelpers();
    await initializeSDK();
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
