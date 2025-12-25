/**
 * Draft persistence tests
 *
 * Tests the localStorage draft save/restore functionality that preserves
 * unsaved changes across page reloads.
 */

import { test, expect, beforeAll, afterEach } from "vitest";
import {
    initializeSDK,
    waitForCondition,
    setupTestHelpers,
    getController,
} from "../support/sdk-helpers.js";
import type { Toolbar } from "../../../src/components/toolbar.js";

const DRAFT_STORAGE_KEY = "scms_draft";

beforeAll(async () => {
    setupTestHelpers();
    // Clear any existing draft before tests
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    await initializeSDK();
});

afterEach(async () => {
    // Reset editing state
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));
    // Clear draft
    localStorage.removeItem(DRAFT_STORAGE_KEY);
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
    return document.querySelector('[data-scms-html="test-title"]') as HTMLElement;
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

test("draft is saved to localStorage when content changes", async () => {
    const element = getHtmlElement();
    const originalContent = element.innerHTML;

    await editContent(element, "Draft test content");

    // Check localStorage has draft
    const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
    expect(stored).not.toBeNull();

    const draft = JSON.parse(stored!);
    expect(draft.content).toBeDefined();
    expect(draft.deleted).toBeDefined();
    expect(Object.keys(draft.content).length).toBeGreaterThan(0);

    // Reset content
    element.innerHTML = originalContent;
    element.dispatchEvent(new Event("input", { bubbles: true }));
});

test("draft contains the edited content", async () => {
    const element = getHtmlElement();
    const originalContent = element.innerHTML;

    await editContent(element, "<strong>Unique draft content</strong>");

    const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
    const draft = JSON.parse(stored!);

    // The draft should contain our edited content
    const hasContent = Object.values(draft.content).some(
        (value) => (value as string).includes("Unique draft content")
    );
    expect(hasContent).toBe(true);

    // Reset
    element.innerHTML = originalContent;
    element.dispatchEvent(new Event("input", { bubbles: true }));
});

test("draft is removed when content matches original", async () => {
    const element = getHtmlElement();
    const originalContent = element.innerHTML;

    // Make a change
    await editContent(element, "Temporary change");

    // Verify draft exists
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).not.toBeNull();

    // Revert to original
    element.innerHTML = originalContent;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));

    // Draft should be removed
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
});

test("toolbar hasChanges reflects unsaved state", async () => {
    const element = getHtmlElement();
    const toolbar = getToolbar();
    const originalContent = element.innerHTML;

    expect(toolbar).not.toBeNull();

    // Initially no changes
    expect(toolbar!.hasChanges).toBe(false);

    // Make a change
    await editContent(element, "Content with changes");

    // hasChanges should be true
    expect(toolbar!.hasChanges).toBe(true);

    // Revert
    element.innerHTML = originalContent;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));

    // hasChanges should be false
    expect(toolbar!.hasChanges).toBe(false);
});

test("draft structure includes content and deleted arrays", async () => {
    const element = getHtmlElement();
    const originalContent = element.innerHTML;

    await editContent(element, "Draft structure test");

    const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
    const draft = JSON.parse(stored!);

    // Validate structure
    expect(typeof draft.content).toBe("object");
    expect(Array.isArray(draft.deleted)).toBe(true);

    // Reset
    element.innerHTML = originalContent;
    element.dispatchEvent(new Event("input", { bubbles: true }));
});

test("multiple edits update the same draft", async () => {
    const element = getHtmlElement();
    const originalContent = element.innerHTML;

    // First edit
    await editContent(element, "First edit");
    const firstDraft = localStorage.getItem(DRAFT_STORAGE_KEY);

    // Second edit
    element.innerHTML = "Second edit";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));

    const secondDraft = localStorage.getItem(DRAFT_STORAGE_KEY);

    // Draft should be updated, not duplicated
    expect(secondDraft).not.toBeNull();
    const draft = JSON.parse(secondDraft!);
    const hasSecondEdit = Object.values(draft.content).some(
        (value) => (value as string).includes("Second edit")
    );
    expect(hasSecondEdit).toBe(true);

    // Reset
    element.innerHTML = originalContent;
    element.dispatchEvent(new Event("input", { bubbles: true }));
});

test("invalid draft JSON in localStorage is handled gracefully", async () => {
    // Store invalid JSON
    localStorage.setItem(DRAFT_STORAGE_KEY, "not valid json");

    // Re-init SDK should not throw
    await expect(initializeSDK()).resolves.not.toThrow();

    // Invalid draft should be removed
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
});

test("malformed draft structure is handled gracefully", async () => {
    // Store valid JSON but wrong structure
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ wrong: "structure" }));

    // Re-init SDK should not throw
    await expect(initializeSDK()).resolves.not.toThrow();

    // Invalid draft should be removed
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
});
