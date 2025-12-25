/**
 * Save error handling tests
 *
 * Tests the error handling during save operations.
 * Note: 401 errors trigger sign-out, so we test non-auth errors separately.
 */

import { test, expect, beforeAll, beforeEach, afterEach } from "vitest";
import {
    initializeSDK,
    waitForCondition,
    clickToolbarButton,
    setupTestHelpers,
} from "../support/sdk-helpers.js";
import { setNextPatchError, clearNextPatchError } from "../support/test-helpers.js";
import type { Toolbar } from "../../../src/components/toolbar.js";

// Mock window.alert to capture the error message
let lastAlertMessage: string | null = null;

beforeAll(async () => {
    setupTestHelpers();
    window.alert = (message: string) => {
        lastAlertMessage = message;
    };
    await initializeSDK();
});

beforeEach(async () => {
    lastAlertMessage = null;
    // Deselect any element
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));
    // Clear any pending errors
    await clearNextPatchError();
});

afterEach(async () => {
    await clearNextPatchError();
});

/**
 * Helper to get the toolbar
 */
function getToolbar(): Toolbar | null {
    return document.querySelector("scms-toolbar") as Toolbar | null;
}

/**
 * Helper to get the test element
 */
function getTestElement(): HTMLElement {
    return document.querySelector('[data-scms-html="test-title"]') as HTMLElement;
}

/**
 * Helper to edit content - with retry for edge cases
 */
async function editContent(element: HTMLElement, content: string): Promise<void> {
    // Make sure element is editable first
    if (!element.classList.contains("streamlined-editable")) {
        // Element might not be editable if previous test caused sign-out
        // This is expected for 401 test
        throw new Error("Element not editable - previous test may have triggered sign-out");
    }

    element.click();
    await waitForCondition(() => element.classList.contains("streamlined-editing"), 3000);
    element.innerHTML = content;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
}

test("500 error during save shows error alert", async () => {
    const element = getTestElement();
    const toolbar = getToolbar();

    // Make a change
    await editContent(element, "Content that will fail to save - 500");
    expect(toolbar?.hasChanges).toBe(true);

    // Set up the server to return 500 on next PATCH
    await setNextPatchError(500, "Internal Server Error");

    // Try to save
    await clickToolbarButton("Save");

    // Wait for error to be processed
    await new Promise((r) => setTimeout(r, 500));

    // Should have shown an alert
    expect(lastAlertMessage).not.toBeNull();
    expect(lastAlertMessage).toContain("Failed");
});

test("hasChanges remains true after 500 error", async () => {
    const element = getTestElement();
    const toolbar = getToolbar();

    // Make a change
    await editContent(element, "Content that will fail - changes persist");
    expect(toolbar?.hasChanges).toBe(true);

    // Set up the server to return 500 on next PATCH
    await setNextPatchError(500, "Server Error");

    // Try to save
    await clickToolbarButton("Save");

    // Wait for error to be processed
    await new Promise((r) => setTimeout(r, 500));

    // hasChanges should still be true since save failed
    expect(toolbar?.hasChanges).toBe(true);
});

test("content is preserved after 500 error", async () => {
    const element = getTestElement();
    const editedContent = "Preserved content after error - " + Date.now();

    // Make a change
    await editContent(element, editedContent);

    // Set up the server to return 500 on next PATCH
    await setNextPatchError(500, "Server Error");

    // Try to save
    await clickToolbarButton("Save");

    // Wait for error to be processed
    await new Promise((r) => setTimeout(r, 500));

    // Content should still be there
    expect(element.innerHTML).toBe(editedContent);
});

test("can retry save after 500 error", async () => {
    const element = getTestElement();
    const toolbar = getToolbar();
    const editedContent = "Retry save content - " + Date.now();

    // Make a change
    await editContent(element, editedContent);

    // First attempt fails
    await setNextPatchError(500, "Temporary Error");
    await clickToolbarButton("Save");
    await new Promise((r) => setTimeout(r, 500));

    expect(toolbar?.hasChanges).toBe(true);

    // Second attempt should succeed (no error set)
    await clickToolbarButton("Save");
    await waitForCondition(() => !toolbar?.hasChanges, 5000);

    expect(toolbar?.hasChanges).toBe(false);
});

// Note: 401 error test is run last because it triggers sign-out
// which affects subsequent tests in the same file
test("401 error during save shows session expired alert", async () => {
    const element = getTestElement();
    const toolbar = getToolbar();

    // Make a change
    await editContent(element, "Content that will fail to save - 401");
    expect(toolbar?.hasChanges).toBe(true);

    // Set up the server to return 401 on next PATCH
    await setNextPatchError(401, "Unauthorized");

    // Try to save
    await clickToolbarButton("Save");

    // Wait for error to be processed
    await new Promise((r) => setTimeout(r, 500));

    // Should have shown an alert about session expired
    expect(lastAlertMessage).toContain("session");
});
