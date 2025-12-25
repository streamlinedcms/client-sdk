/**
 * Toolbar button tests
 *
 * Tests toolbar buttons for different element types and states.
 * Note: Modal opening is tested in the modal test files.
 */

import { test, expect, beforeAll, beforeEach } from "vitest";
import {
    initializeSDK,
    waitForCondition,
    clickToolbarButton,
    setupTestHelpers,
} from "~/@browser-support/sdk-helpers.js";

beforeAll(async () => {
    setupTestHelpers();
    await initializeSDK();
});

/**
 * Helper to get toolbar shadow root
 */
function getToolbarShadow(): ShadowRoot | null {
    const toolbar = document.querySelector("scms-toolbar");
    return toolbar?.shadowRoot ?? null;
}

/**
 * Helper to get all button texts in toolbar
 */
function getToolbarButtonTexts(): string[] {
    const shadowRoot = getToolbarShadow();
    const buttons = shadowRoot?.querySelectorAll("button") || [];
    return Array.from(buttons).map((btn) => btn.textContent?.trim() || "");
}

/**
 * Helper to reset editing state by clicking outside
 */
async function resetEditingState(): Promise<void> {
    // Click outside to deselect any active element
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));
}

beforeEach(async () => {
    await resetEditingState();
});

// --- HTML element tests ---

test("Edit HTML button appears for html-type elements", async () => {
    const htmlElement = document.querySelector('[data-scms-html="test-title"]') as HTMLElement;
    htmlElement.click();

    await waitForCondition(() => htmlElement.classList.contains("streamlined-editing"));

    const buttonTexts = getToolbarButtonTexts();
    expect(buttonTexts.some((t) => t.includes("Edit HTML"))).toBe(true);
});

test("Edit HTML button does NOT appear for text-type elements", async () => {
    const textElement = document.querySelector('[data-scms-text="name"]') as HTMLElement;
    if (!textElement) {
        // Skip if no text element available
        return;
    }
    textElement.click();

    await waitForCondition(() => textElement.classList.contains("streamlined-editing"));

    const buttonTexts = getToolbarButtonTexts();
    expect(buttonTexts.some((t) => t.includes("Edit HTML"))).toBe(false);
});

// --- Link element tests ---

test("Edit Link and Go to Link buttons appear for link-type elements", async () => {
    const linkElement = document.querySelector('[data-scms-link="test-link"]') as HTMLElement;
    linkElement.click();

    await waitForCondition(() => linkElement.classList.contains("streamlined-editing"));

    const buttonTexts = getToolbarButtonTexts();
    expect(buttonTexts.some((t) => t.includes("Edit Link"))).toBe(true);
    expect(buttonTexts.some((t) => t.includes("Go to Link"))).toBe(true);
});

test("Edit Link button does NOT appear for html-type elements", async () => {
    const htmlElement = document.querySelector('[data-scms-html="test-title"]') as HTMLElement;
    htmlElement.click();

    await waitForCondition(() => htmlElement.classList.contains("streamlined-editing"));

    const buttonTexts = getToolbarButtonTexts();
    expect(buttonTexts.some((t) => t.includes("Edit Link"))).toBe(false);
});

// --- Common buttons for all elements ---

test("SEO, A11y, and Attrs buttons appear when editing", async () => {
    const htmlElement = document.querySelector('[data-scms-html="test-title"]') as HTMLElement;
    htmlElement.click();

    await waitForCondition(() => htmlElement.classList.contains("streamlined-editing"));

    const buttonTexts = getToolbarButtonTexts();
    expect(buttonTexts.some((t) => t.includes("SEO"))).toBe(true);
    expect(buttonTexts.some((t) => t.includes("A11y"))).toBe(true);
    expect(buttonTexts.some((t) => t.includes("Attrs"))).toBe(true);
});

// --- Save button tests ---

test("Save button appears when there are changes", async () => {
    const htmlElement = document.querySelector('[data-scms-html="test-title"]') as HTMLElement;
    htmlElement.click();

    await waitForCondition(() => htmlElement.classList.contains("streamlined-editing"));

    // Make a change
    htmlElement.innerHTML = "Modified content for save test";
    htmlElement.dispatchEvent(new Event("input", { bubbles: true }));

    await new Promise((r) => setTimeout(r, 100));

    const buttonTexts = getToolbarButtonTexts();
    expect(buttonTexts.some((t) => t.includes("Save"))).toBe(true);
});

// --- Cancel/Deselect tests ---

test("clicking outside element deselects it", async () => {
    const htmlElement = document.querySelector('[data-scms-html="test-title"]') as HTMLElement;
    htmlElement.click();

    await waitForCondition(() => htmlElement.classList.contains("streamlined-editing"));

    // Click on body (outside any editable element)
    document.body.click();

    await waitForCondition(() => !htmlElement.classList.contains("streamlined-editing"));

    expect(htmlElement.classList.contains("streamlined-editing")).toBe(false);
});

// --- Element badge tests ---

test("element badge shows correct element ID for html element", async () => {
    const htmlElement = document.querySelector('[data-scms-html="test-title"]') as HTMLElement;
    htmlElement.click();

    await waitForCondition(() => htmlElement.classList.contains("streamlined-editing"));

    const shadowRoot = getToolbarShadow();
    const badge = shadowRoot?.querySelector("scms-element-badge");
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute("element-id")).toBe("test-title");
    expect(badge?.getAttribute("element-type")).toBe("html");
});

test("element badge shows correct type for link element", async () => {
    const linkElement = document.querySelector('[data-scms-link="test-link"]') as HTMLElement;
    linkElement.click();

    await waitForCondition(() => linkElement.classList.contains("streamlined-editing"));

    const shadowRoot = getToolbarShadow();
    const badge = shadowRoot?.querySelector("scms-element-badge");
    expect(badge?.getAttribute("element-id")).toBe("test-link");
    expect(badge?.getAttribute("element-type")).toBe("link");
});

test("element badge shows correct type for text element", async () => {
    const textElement = document.querySelector('[data-scms-text="name"]') as HTMLElement;
    if (!textElement) return;

    textElement.click();

    await waitForCondition(() => textElement.classList.contains("streamlined-editing"));

    const shadowRoot = getToolbarShadow();
    const badge = shadowRoot?.querySelector("scms-element-badge");
    expect(badge?.getAttribute("element-type")).toBe("text");
});

// --- Mode toggle tests ---

test("mode toggle is visible in toolbar", async () => {
    const shadowRoot = getToolbarShadow();
    const modeToggle = shadowRoot?.querySelector("scms-mode-toggle");
    expect(modeToggle).not.toBeNull();
});
