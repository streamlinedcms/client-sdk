/**
 * Toolbar warning banner tests
 */

import { test, expect, beforeAll } from "vitest";
import { initializeSDK, setupTestHelpers } from "../support/sdk-helpers.js";
import type { Toolbar } from "../../../src/components/toolbar.js";

beforeAll(async () => {
    setupTestHelpers();
    await initializeSDK();
});

/**
 * Helper to get toolbar element
 */
function getToolbar(): Toolbar {
    return document.querySelector("scms-toolbar") as Toolbar;
}

test("warning banner is hidden by default", async () => {
    const toolbar = getToolbar();
    const shadowRoot = toolbar.shadowRoot!;

    // No warning banner should be visible
    const warningBanner = shadowRoot.querySelector(".bg-amber-500");
    expect(warningBanner).toBeNull();
});

test("warning banner appears when warning property is set", async () => {
    const toolbar = getToolbar();

    // Set a warning
    toolbar.warning = "Test warning message";

    await new Promise((r) => setTimeout(r, 100));

    const shadowRoot = toolbar.shadowRoot!;
    const warningBanner = shadowRoot.querySelector(".bg-amber-500");
    expect(warningBanner).not.toBeNull();
    expect(warningBanner?.textContent).toContain("Test warning message");

    // Clean up
    toolbar.warning = null;
    await new Promise((r) => setTimeout(r, 100));
});

test("warning banner has Reload button", async () => {
    const toolbar = getToolbar();

    toolbar.warning = "Domain not whitelisted";

    await new Promise((r) => setTimeout(r, 100));

    const shadowRoot = toolbar.shadowRoot!;
    const reloadBtn = shadowRoot.querySelector(".bg-amber-500 button");
    expect(reloadBtn).not.toBeNull();
    expect(reloadBtn?.textContent).toContain("Reload");

    // Clean up
    toolbar.warning = null;
    await new Promise((r) => setTimeout(r, 100));
});

test("mode toggle is hidden when warning is present", async () => {
    const toolbar = getToolbar();

    // Initially mode toggle should be visible
    let modeToggle = toolbar.shadowRoot?.querySelector("scms-mode-toggle");
    expect(modeToggle).not.toBeNull();

    // Set a warning
    toolbar.warning = "Payment required";

    await new Promise((r) => setTimeout(r, 100));

    // Mode toggle should now be hidden
    modeToggle = toolbar.shadowRoot?.querySelector("scms-mode-toggle");
    expect(modeToggle).toBeNull();

    // Clean up
    toolbar.warning = null;
    await new Promise((r) => setTimeout(r, 100));
});

test("warning banner disappears when warning is cleared", async () => {
    const toolbar = getToolbar();

    // Set warning
    toolbar.warning = "Temporary warning";
    await new Promise((r) => setTimeout(r, 100));

    // Verify it's visible
    let warningBanner = toolbar.shadowRoot?.querySelector(".bg-amber-500");
    expect(warningBanner).not.toBeNull();

    // Clear warning
    toolbar.warning = null;
    await new Promise((r) => setTimeout(r, 100));

    // Should be gone
    warningBanner = toolbar.shadowRoot?.querySelector(".bg-amber-500");
    expect(warningBanner).toBeNull();
});
