/**
 * Save error handling tests
 *
 * Tests the error handling during save operations.
 * Note: 401 errors trigger sign-out, so we test non-auth errors separately.
 */

import { test, expect, beforeAll, beforeEach } from "vitest";
import {
    initializeSDK,
    waitForCondition,
    clickToolbarButton,
    setupTestHelpers,
} from "~/@browser-support/sdk-helpers.js";
import { ERROR_TRIGGERS } from "~/@browser-support/test-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";

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
    return document.querySelector('[data-scms-html="save-error-title"]') as HTMLElement;
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

    // Make a change with error trigger in content
    await editContent(element, `${ERROR_TRIGGERS.SERVER_ERROR} Content that will fail to save`);
    expect(toolbar?.hasChanges).toBe(true);

    // Try to save - server will see trigger and return 500
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

    // Make a change with error trigger
    await editContent(
        element,
        `${ERROR_TRIGGERS.SERVER_ERROR} Content that will fail - changes persist`,
    );
    expect(toolbar?.hasChanges).toBe(true);

    // Try to save - server will return 500
    await clickToolbarButton("Save");

    // Wait for error to be processed
    await new Promise((r) => setTimeout(r, 500));

    // hasChanges should still be true since save failed
    expect(toolbar?.hasChanges).toBe(true);
});

test("content is preserved after 500 error", async () => {
    const element = getTestElement();
    const editedContent =
        `${ERROR_TRIGGERS.SERVER_ERROR} Preserved content after error - ` + Date.now();

    // Make a change with error trigger
    await editContent(element, editedContent);

    // Try to save - server will return 500
    await clickToolbarButton("Save");

    // Wait for error to be processed
    await new Promise((r) => setTimeout(r, 500));

    // Content should still be there
    expect(element.innerHTML).toBe(editedContent);
});

test("can retry save after 500 error", async () => {
    const element = getTestElement();
    const toolbar = getToolbar();
    const timestamp = Date.now();

    // Make a change with error trigger - first save will fail
    await editContent(element, `${ERROR_TRIGGERS.SERVER_ERROR} Retry save content - ${timestamp}`);

    await clickToolbarButton("Save");
    await new Promise((r) => setTimeout(r, 500));

    expect(toolbar?.hasChanges).toBe(true);

    // Remove the trigger and retry - second save should succeed
    await editContent(element, `Retry save content - ${timestamp}`);

    await clickToolbarButton("Save");
    await waitForCondition(() => !toolbar?.hasChanges, 5000);

    expect(toolbar?.hasChanges).toBe(false);
});

// Note: 401 error test is run last because it triggers sign-out
// which affects subsequent tests in the same file
test("401 error during save shows session expired alert", async () => {
    const element = getTestElement();
    const toolbar = getToolbar();

    // Make a change with 401 error trigger
    await editContent(element, `${ERROR_TRIGGERS.UNAUTHORIZED} Content that will fail to save`);
    expect(toolbar?.hasChanges).toBe(true);

    // Try to save - server will return 401
    await clickToolbarButton("Save");

    // Wait for error to be processed
    await new Promise((r) => setTimeout(r, 500));

    // Should have shown an alert about session expired
    expect(lastAlertMessage).toContain("session");
});
