/**
 * Mode switching tests
 *
 * Tests the author/viewer mode switching functionality.
 */

import { test, expect, beforeAll, beforeEach } from "vitest";
import {
    initializeSDK,
    waitForCondition,
    setupTestHelpers,
    getController,
} from "~/@browser-support/sdk-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";

beforeAll(async () => {
    setupTestHelpers();
    await initializeSDK();
});

beforeEach(async () => {
    // Deselect any element
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));
});

/**
 * Helper to get the toolbar
 */
function getToolbar(): Toolbar | null {
    return document.querySelector("scms-toolbar") as Toolbar | null;
}

/**
 * Helper to get the mode toggle
 */
function getModeToggle(): Element | null {
    const toolbar = getToolbar();
    return toolbar?.shadowRoot?.querySelector("scms-mode-toggle") || null;
}

test("SDK initializes in author mode with mock auth", async () => {
    const toolbar = getToolbar();
    expect(toolbar?.mode).toBe("author");
});

test("elements are editable in author mode", async () => {
    const element = document.querySelector('[data-scms-html="test-title"]') as HTMLElement;

    // Element should have editable class
    expect(element.classList.contains("streamlined-editable")).toBe(true);
});

test("clicking mode toggle dispatches mode-change event", async () => {
    const toolbar = getToolbar();
    const modeToggle = getModeToggle();

    expect(modeToggle).not.toBeNull();

    let modeChanged = false;
    toolbar?.addEventListener("mode-change", () => {
        modeChanged = true;
    });

    // Find and click the toggle button
    const toggleButton = (modeToggle as HTMLElement)?.shadowRoot?.querySelector("button");
    expect(toggleButton).not.toBeNull();

    toggleButton?.click();
    await new Promise((r) => setTimeout(r, 100));

    expect(modeChanged).toBe(true);
});

test("mode toggle is visible in author mode", async () => {
    const modeToggle = getModeToggle();
    expect(modeToggle).not.toBeNull();

    // Mode toggle should have a button
    const toggleButton = (modeToggle as HTMLElement)?.shadowRoot?.querySelector("button");
    expect(toggleButton).not.toBeNull();
});
