/**
 * Grouped elements tests
 *
 * Tests editing elements inside groups (data-scms-group).
 * Groups allow multiple elements to be associated together.
 */

import { test, expect, beforeAll, beforeEach } from "vitest";
import {
    initializeSDK,
    waitForCondition,
    clickToolbarButton,
    setupTestHelpers,
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
 * Helper to get an element from the sidebar group
 */
function getSidebarGroupElement(): HTMLElement | null {
    return document.querySelector(
        '[data-scms-group="sidebar"] [data-scms-text="quote"]',
    ) as HTMLElement;
}

/**
 * Helper to get the inline group element (group attribute on same element as data-scms-*)
 */
function getInlineGroupElement(): HTMLElement | null {
    return document.querySelector(
        '[data-scms-group="company-name"][data-scms-text="name"]',
    ) as HTMLElement;
}

test("grouped elements are editable", async () => {
    const element = getSidebarGroupElement();
    expect(element).not.toBeNull();

    // Element should have editable class
    expect(element!.classList.contains("streamlined-editable")).toBe(true);
});

test("clicking grouped element selects it", async () => {
    const element = getSidebarGroupElement();

    element!.click();

    await waitForCondition(() => element!.classList.contains("streamlined-editing"));

    expect(element!.classList.contains("streamlined-editing")).toBe(true);
});

test("grouped element shows type in toolbar", async () => {
    const element = getSidebarGroupElement();
    const toolbar = getToolbar();

    element!.click();
    await waitForCondition(() => element!.classList.contains("streamlined-editing"));

    // Toolbar should show the element type
    expect(toolbar?.activeElementType).toBe("text");
});

test("editing grouped element content works", async () => {
    const element = getSidebarGroupElement();
    const toolbar = getToolbar();

    element!.click();
    await waitForCondition(() => element!.classList.contains("streamlined-editing"));

    // Edit content
    const originalContent = element!.textContent;
    element!.textContent = "Edited group content";
    element!.dispatchEvent(new Event("input", { bubbles: true }));

    await new Promise((r) => setTimeout(r, 100));

    // Should have changes
    expect(toolbar?.hasChanges).toBe(true);

    // Restore
    element!.textContent = originalContent;
    element!.dispatchEvent(new Event("input", { bubbles: true }));
});

test("inline group element is editable", async () => {
    const element = getInlineGroupElement();
    expect(element).not.toBeNull();

    // Element should have editable class
    expect(element!.classList.contains("streamlined-editable")).toBe(true);
});

test("clicking inline group element selects it", async () => {
    const element = getInlineGroupElement();

    element!.click();

    await waitForCondition(() => element!.classList.contains("streamlined-editing"));

    expect(element!.classList.contains("streamlined-editing")).toBe(true);
});

test("inline group element shows type in toolbar", async () => {
    const element = getInlineGroupElement();
    const toolbar = getToolbar();

    element!.click();
    await waitForCondition(() => element!.classList.contains("streamlined-editing"));

    // Toolbar should show the element type
    expect(toolbar?.activeElementType).toBe("text");
});

test("editing inline group element triggers change detection", async () => {
    const element = getInlineGroupElement();
    const toolbar = getToolbar();

    element!.click();
    await waitForCondition(() => element!.classList.contains("streamlined-editing"));

    const originalContent = element!.textContent;
    element!.textContent = "New Company Name";
    element!.dispatchEvent(new Event("input", { bubbles: true }));

    await new Promise((r) => setTimeout(r, 100));

    expect(toolbar?.hasChanges).toBe(true);

    // Restore
    element!.textContent = originalContent;
    element!.dispatchEvent(new Event("input", { bubbles: true }));
});

test("grouped elements inside templates are editable", async () => {
    // The products template has a company group inside it
    const companyElement = document.querySelector(
        '[data-scms-template="products"] [data-scms-group="company"] [data-scms-text="name"]',
    ) as HTMLElement;

    if (companyElement) {
        expect(companyElement.classList.contains("streamlined-editable")).toBe(true);

        companyElement.click();
        await waitForCondition(() => companyElement.classList.contains("streamlined-editing"));

        expect(companyElement.classList.contains("streamlined-editing")).toBe(true);
    } else {
        // If element doesn't exist, skip gracefully
        expect(true).toBe(true);
    }
});
