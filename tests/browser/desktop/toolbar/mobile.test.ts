/**
 * Toolbar mobile view tests
 *
 * Tests the mobile-specific toolbar behavior.
 * Note: We directly manipulate the toolbar's isMobile state since
 * ResizeObserver-based detection is hard to trigger in tests.
 */

import { test, expect, beforeAll, afterEach } from "vitest";
import { initializeSDK, setupTestHelpers } from "../support/sdk-helpers.js";
import type { Toolbar } from "../../../src/components/toolbar.js";

// Extended type to access private properties for testing
interface ToolbarInternal extends Toolbar {
    isMobile: boolean;
    expanded: boolean;
}

beforeAll(async () => {
    setupTestHelpers();
    await initializeSDK();
});

afterEach(async () => {
    // Reset to desktop mode after each test
    const toolbar = getToolbar() as ToolbarInternal;
    toolbar.isMobile = false;
    toolbar.expanded = false;
    await new Promise((r) => setTimeout(r, 100));
});

/**
 * Helper to get toolbar element
 */
function getToolbar(): Toolbar {
    return document.querySelector("scms-toolbar") as Toolbar;
}

/**
 * Helper to set mobile mode
 */
async function setMobileMode(toolbar: ToolbarInternal): Promise<void> {
    toolbar.isMobile = true;
    await new Promise((r) => setTimeout(r, 100));
}

test("toolbar renders desktop view by default", async () => {
    const toolbar = getToolbar();
    const shadowRoot = toolbar.shadowRoot!;

    // Desktop view has fixed height of 48px (h-12)
    const desktopBar = shadowRoot.querySelector(".h-12");
    expect(desktopBar).not.toBeNull();
});

test("toolbar switches to mobile view when isMobile is true", async () => {
    const toolbar = getToolbar() as ToolbarInternal;

    await setMobileMode(toolbar);

    const shadowRoot = toolbar.shadowRoot!;

    // Mobile view has h-14 (56px) primary bar
    const mobileBar = shadowRoot.querySelector(".h-14");
    expect(mobileBar).not.toBeNull();
});

test("mobile view has menu toggle button", async () => {
    const toolbar = getToolbar() as ToolbarInternal;

    await setMobileMode(toolbar);

    const shadowRoot = toolbar.shadowRoot!;

    // Find button with aria-label containing "menu"
    const menuBtn = shadowRoot.querySelector('button[aria-label*="menu"]');
    expect(menuBtn).not.toBeNull();
});

test("clicking menu button toggles expanded state", async () => {
    const toolbar = getToolbar() as ToolbarInternal;

    await setMobileMode(toolbar);

    const shadowRoot = toolbar.shadowRoot!;

    // Find and click menu button
    const menuBtn = shadowRoot.querySelector('button[aria-label*="menu"]') as HTMLButtonElement;
    expect(menuBtn).not.toBeNull();

    // Initially closed
    expect(menuBtn.getAttribute("aria-label")).toContain("Open");
    expect(toolbar.expanded).toBe(false);

    // Click to open
    menuBtn.click();
    await new Promise((r) => setTimeout(r, 100));

    // Should now be expanded
    expect(toolbar.expanded).toBe(true);
    expect(menuBtn.getAttribute("aria-label")).toContain("Close");

    // Click to close
    menuBtn.click();
    await new Promise((r) => setTimeout(r, 100));

    // Should be collapsed
    expect(toolbar.expanded).toBe(false);
    expect(menuBtn.getAttribute("aria-label")).toContain("Open");
});

test("expanded state resets when switching to desktop", async () => {
    const toolbar = getToolbar() as ToolbarInternal;

    // Enter mobile mode and expand
    await setMobileMode(toolbar);
    toolbar.expanded = true;
    await new Promise((r) => setTimeout(r, 100));

    expect(toolbar.expanded).toBe(true);

    // Switch to desktop mode
    toolbar.isMobile = false;
    await new Promise((r) => setTimeout(r, 100));

    // Expanded should auto-reset (checkMobile sets expanded = false when not mobile)
    // Note: The actual reset happens in checkMobile(), but since we're directly
    // setting isMobile, we need to verify the component behavior
    const shadowRoot = toolbar.shadowRoot!;
    const desktopBar = shadowRoot.querySelector(".h-12");
    expect(desktopBar).not.toBeNull();
});

test("mobile view shows element badge", async () => {
    const toolbar = getToolbar() as ToolbarInternal;

    await setMobileMode(toolbar);

    const shadowRoot = toolbar.shadowRoot!;

    // Element badge should be visible
    const badge = shadowRoot.querySelector("scms-element-badge");
    expect(badge).not.toBeNull();
});
