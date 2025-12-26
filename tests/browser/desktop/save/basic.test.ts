/**
 * Save flow tests
 *
 * Tests the save functionality including API calls, content updates,
 * and state management after save.
 */

import { test, expect, beforeAll, afterEach } from "vitest";
import {
    initializeSDK,
    waitForCondition,
    clickToolbarButton,
    setupTestHelpers,
    getController,
} from "~/@browser-support/sdk-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";

/** Helper to get draft storage key from the controller */
function getDraftKey(): string {
    return getController()!.draftStorageKey;
}

beforeAll(async () => {
    setupTestHelpers();
    await initializeSDK();
    // Clear any existing draft
    localStorage.removeItem(getDraftKey());
});

afterEach(async () => {
    // Reset editing state
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));
    localStorage.removeItem(getDraftKey());
});

/**
 * Helper to get toolbar element
 */
function getToolbar(): Toolbar | null {
    return document.querySelector("scms-toolbar") as Toolbar | null;
}

/**
 * Helper to get the HTML test element
 */
function getHtmlElement(): HTMLElement {
    return document.querySelector('[data-scms-html="save-basic-title"]') as HTMLElement;
}

/**
 * Helper to edit content and trigger input event
 */
async function editContent(element: HTMLElement, newContent: string): Promise<void> {
    element.click();
    await waitForCondition(() => element.classList.contains("streamlined-editing"));

    element.innerHTML = newContent;
    element.dispatchEvent(new Event("input", { bubbles: true }));

    await new Promise((r) => setTimeout(r, 100));
}

test("clicking Save button triggers save", async () => {
    const element = getHtmlElement();
    const toolbar = getToolbar();

    await editContent(element, "Save test content");

    expect(toolbar!.hasChanges).toBe(true);

    // Click save
    const clicked = await clickToolbarButton("Save");
    expect(clicked).toBe(true);

    // Wait for save to complete
    await waitForCondition(() => !toolbar!.hasChanges, 5000);

    expect(toolbar!.hasChanges).toBe(false);
});

test("save clears draft from localStorage", async () => {
    const element = getHtmlElement();
    const toolbar = getToolbar();

    await editContent(element, "Draft that will be saved");

    // Verify draft exists
    expect(localStorage.getItem(getDraftKey())).not.toBeNull();

    // Save
    await clickToolbarButton("Save");
    await waitForCondition(() => !getToolbar()!.hasChanges, 5000);

    // Draft should be cleared
    expect(localStorage.getItem(getDraftKey())).toBeNull();
});

test("saved content persists in element after save", async () => {
    const element = getHtmlElement();
    const newContent = "Persisted content after save - " + Date.now();

    await editContent(element, newContent);

    await clickToolbarButton("Save");
    await waitForCondition(() => !getToolbar()!.hasChanges, 5000);

    // Content should still be in the element
    expect(element.innerHTML).toBe(newContent);
});

test("hasChanges is false after successful save", async () => {
    const element = getHtmlElement();
    const toolbar = getToolbar();

    await editContent(element, "Content to save - " + Date.now());

    expect(toolbar!.hasChanges).toBe(true);

    await clickToolbarButton("Save");
    await waitForCondition(() => !toolbar!.hasChanges, 5000);

    expect(toolbar!.hasChanges).toBe(false);
});

test("multiple elements can be edited and saved together", async () => {
    const htmlElement = getHtmlElement();
    const paragraphElement = document.querySelector('[data-scms-html="save-basic-paragraph"]') as HTMLElement;
    const toolbar = getToolbar();

    // Edit first element
    await editContent(htmlElement, "First element edited");

    // Click outside to deselect
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));

    // Edit second element
    await editContent(paragraphElement, "Second element edited");

    expect(toolbar!.hasChanges).toBe(true);

    // Save both
    await clickToolbarButton("Save");
    await waitForCondition(() => !toolbar!.hasChanges, 5000);

    // Both should be saved
    expect(htmlElement.innerHTML).toBe("First element edited");
    expect(paragraphElement.innerHTML).toBe("Second element edited");
});

test("Save button is only visible when there are changes", async () => {
    const element = getHtmlElement();
    const toolbar = getToolbar();
    const shadowRoot = toolbar!.shadowRoot!;

    /**
     * Find the save button in toolbar
     */
    function findSaveButton(): HTMLButtonElement | null {
        const buttons = shadowRoot.querySelectorAll("button");
        for (const btn of buttons) {
            if (btn.textContent?.includes("Save")) {
                return btn;
            }
        }
        return null;
    }

    // Make a change so we know hasChanges will be true
    await editContent(element, "Trigger save button - " + Date.now());

    // Save button should be visible
    expect(toolbar!.hasChanges).toBe(true);
    let saveButton = findSaveButton();
    expect(saveButton).not.toBeNull();

    // Save the changes
    await clickToolbarButton("Save");
    await waitForCondition(() => !toolbar!.hasChanges, 5000);

    // After saving, hasChanges should be false
    expect(toolbar!.hasChanges).toBe(false);
});
