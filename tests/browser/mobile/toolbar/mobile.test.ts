/**
 * Toolbar mobile view tests
 *
 * Tests the mobile-specific toolbar behavior.
 * Mobile viewport triggers automatic mobile mode detection.
 */

import { test, expect, beforeAll } from "vitest";
import {
    initializeSDK,
    setupTestHelpers,
    waitForCondition,
} from "~/@browser-support/sdk-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";

beforeAll(async () => {
    setupTestHelpers();
    await initializeSDK();
    // Wait for toolbar to detect mobile viewport and re-render
    const toolbar = document.querySelector("scms-toolbar");
    await waitForCondition(() => toolbar?.shadowRoot?.querySelector(".h-14") !== null);
});

/**
 * Helper to get toolbar element
 */
function getToolbar(): Toolbar {
    return document.querySelector("scms-toolbar") as Toolbar;
}

test("toolbar renders mobile view", async () => {
    const toolbar = getToolbar();
    const shadowRoot = toolbar.shadowRoot!;

    // Mobile view has h-14 (56px) primary bar
    const mobileBar = shadowRoot.querySelector(".h-14");
    expect(mobileBar).not.toBeNull();
});

test("mobile view has menu toggle button", async () => {
    const toolbar = getToolbar();
    const shadowRoot = toolbar.shadowRoot!;

    // Find button with aria-label containing "menu"
    const menuBtn = shadowRoot.querySelector('button[aria-label*="menu"]');
    expect(menuBtn).not.toBeNull();
});

test("clicking menu button toggles expanded state", async () => {
    const toolbar = getToolbar();
    const shadowRoot = toolbar.shadowRoot!;

    // Find and click menu button
    const menuBtn = shadowRoot.querySelector('button[aria-label*="menu"]') as HTMLButtonElement;
    expect(menuBtn).not.toBeNull();

    // Initially closed
    expect(menuBtn.getAttribute("aria-label")).toContain("Open");

    // Click to open
    menuBtn.click();
    await new Promise((r) => setTimeout(r, 100));

    // Should now be expanded
    expect(menuBtn.getAttribute("aria-label")).toContain("Close");

    // Click to close
    menuBtn.click();
    await new Promise((r) => setTimeout(r, 100));

    // Should be collapsed
    expect(menuBtn.getAttribute("aria-label")).toContain("Open");
});

test("mobile view shows element badge", async () => {
    const toolbar = getToolbar();
    const shadowRoot = toolbar.shadowRoot!;

    // Element badge should be visible
    const badge = shadowRoot.querySelector("scms-element-badge");
    expect(badge).not.toBeNull();
});
