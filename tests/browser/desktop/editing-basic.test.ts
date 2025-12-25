/**
 * Basic editing tests - click to edit, edit and save content
 */

import { test, expect, beforeAll } from "vitest";
import {
    initializeSDK,
    waitForCondition,
    clickToolbarButton,
    setupTestHelpers,
} from "~/@browser-support/sdk-helpers.js";

beforeAll(async () => {
    setupTestHelpers();
    // No special content - test with default HTML
    await initializeSDK();
});


test("user can click to edit content", async () => {
    const testTitle = document.querySelector('[data-scms-html="test-title"]') as HTMLElement;

    // Click to start editing (use the element directly, not by text which may vary)
    testTitle.click();

    await waitForCondition(() => testTitle.getAttribute("contenteditable") === "true");

    // Verify element is now editable
    expect(testTitle.getAttribute("contenteditable")).toBe("true");

    // Verify editing class is applied
    expect(testTitle.classList.contains("streamlined-editing")).toBe(true);

    // Verify toolbar is visible
    const toolbar = document.querySelector("scms-toolbar");
    expect(toolbar).not.toBeNull();
});

test("user can edit and save content", async () => {
    const testTitle = document.querySelector('[data-scms-html="test-title"]') as HTMLElement;

    // Element may already be in editing mode from previous test, or we need to click
    if (testTitle.getAttribute("contenteditable") !== "true") {
        testTitle.click();
        await waitForCondition(() => testTitle.classList.contains("streamlined-editing"));
    }

    // Edit the content - use innerHTML for html-type elements
    testTitle.innerHTML = "Test Edit - Browser Test";

    // Trigger input event to notify SDK of changes
    testTitle.dispatchEvent(new Event("input", { bubbles: true }));

    // Click save button (helper waits for Lit re-render)
    await clickToolbarButton("Save");

    // Wait for save to complete
    await waitForCondition(() => !testTitle.classList.contains("streamlined-editing"));

    // Verify content was updated
    expect(testTitle.textContent).toContain("Test Edit - Browser Test");
});
