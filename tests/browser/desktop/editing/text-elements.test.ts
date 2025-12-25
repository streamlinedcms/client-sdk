/**
 * Text element editing tests
 *
 * Tests the text element selection, editing, and toolbar behavior.
 * Text elements are simpler than HTML elements (no formatting).
 */

import { test, expect, beforeAll, beforeEach } from "vitest";
import {
    initializeSDK,
    waitForCondition,
    setupTestHelpers,
} from "../support/sdk-helpers.js";
import type { Toolbar } from "../../../src/components/toolbar.js";

beforeAll(async () => {
    setupTestHelpers();
    await initializeSDK();
});

beforeEach(async () => {
    // Deselect any selected element
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
 * Helper to get a text element from template
 */
function getTextElement(): HTMLElement {
    // Get the first name element from team template
    return document.querySelector('[data-scms-text="name"]') as HTMLElement;
}

test("clicking text element selects it", async () => {
    const element = getTextElement();

    element.click();

    await waitForCondition(() => element.classList.contains("streamlined-editing"));

    expect(element.classList.contains("streamlined-editing")).toBe(true);
});

test("toolbar shows element type for text", async () => {
    const element = getTextElement();
    const toolbar = getToolbar();

    element.click();
    await waitForCondition(() => element.classList.contains("streamlined-editing"));

    expect(toolbar?.activeElementType).toBe("text");
});

test("text element is contenteditable when selected", async () => {
    const element = getTextElement();

    element.click();
    await waitForCondition(() => element.classList.contains("streamlined-editing"));

    expect(element.getAttribute("contenteditable")).toBe("true");
});

test("editing text element triggers change detection", async () => {
    const element = getTextElement();
    const toolbar = getToolbar();
    const originalText = element.textContent;

    element.click();
    await waitForCondition(() => element.classList.contains("streamlined-editing"));

    // Edit the text
    element.textContent = "Edited Text Content";
    element.dispatchEvent(new Event("input", { bubbles: true }));

    await new Promise((r) => setTimeout(r, 100));

    // Should have unsaved changes
    expect(toolbar?.hasChanges).toBe(true);

    // Restore original
    element.textContent = originalText;
    element.dispatchEvent(new Event("input", { bubbles: true }));
});

test("clicking outside deselects text element", async () => {
    const element = getTextElement();

    element.click();
    await waitForCondition(() => element.classList.contains("streamlined-editing"));

    // Click outside
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));

    expect(element.classList.contains("streamlined-editing")).toBe(false);
});

test("toolbar shows Attrs button for text elements", async () => {
    const element = getTextElement();
    const toolbar = getToolbar();

    element.click();
    await waitForCondition(() => element.classList.contains("streamlined-editing"));

    const shadowRoot = toolbar!.shadowRoot!;
    const buttons = shadowRoot.querySelectorAll("button");

    let hasAttrsButton = false;
    for (const btn of buttons) {
        if (btn.textContent?.includes("Attrs")) {
            hasAttrsButton = true;
            break;
        }
    }

    expect(hasAttrsButton).toBe(true);
});

test("toolbar shows Reset button for text elements", async () => {
    const element = getTextElement();
    const toolbar = getToolbar();

    element.click();
    await waitForCondition(() => element.classList.contains("streamlined-editing"));

    const shadowRoot = toolbar!.shadowRoot!;

    // Reset button is a hold-button component
    const holdButton = shadowRoot.querySelector("scms-hold-button");
    expect(holdButton).not.toBeNull();
});

test("text elements do not show Edit HTML button", async () => {
    const element = getTextElement();
    const toolbar = getToolbar();

    element.click();
    await waitForCondition(() => element.classList.contains("streamlined-editing"));

    const shadowRoot = toolbar!.shadowRoot!;
    const buttons = shadowRoot.querySelectorAll("button");

    let hasEditHtmlButton = false;
    for (const btn of buttons) {
        if (btn.textContent?.includes("Edit HTML")) {
            hasEditHtmlButton = true;
            break;
        }
    }

    // Text elements should NOT have Edit HTML button
    expect(hasEditHtmlButton).toBe(false);
});
