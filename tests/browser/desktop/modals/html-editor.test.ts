/**
 * HTML Editor Modal tests
 *
 * Tests the HTML editor modal for editing raw HTML content.
 */

import { test, expect, beforeAll, beforeEach } from "vitest";
import {
    initializeSDK,
    waitForCondition,
    waitForSelector,
    clickToolbarButton,
    setElementContent,
    setupTestHelpers,
} from "~/@browser-support/sdk-helpers.js";
import type { HtmlEditorModal } from "~/src/components/html-editor-modal.js";
import type { FormattingToolbar } from "~/src/components/rich-text-editor.js";

beforeAll(async () => {
    setupTestHelpers();
    await initializeSDK();
});

/**
 * Helper to get an HTML element
 */
function getHtmlElement(): HTMLElement {
    return document.querySelector('[data-scms-html="test-title"]') as HTMLElement;
}

/**
 * Helper to get the HTML editor modal
 */
function getHtmlEditorModal(): HtmlEditorModal | null {
    return document.querySelector("scms-html-editor-modal") as HtmlEditorModal | null;
}

/**
 * Helper to open the HTML editor modal
 */
async function openHtmlEditorModal(): Promise<HtmlEditorModal> {
    const element = getHtmlElement();

    element.click();
    await waitForCondition(() => element.classList.contains("streamlined-editing"));

    const clicked = await clickToolbarButton("View Source");
    expect(clicked).toBe(true);

    await waitForSelector("scms-html-editor-modal");

    const modal = getHtmlEditorModal();
    expect(modal).not.toBeNull();
    return modal!;
}

/**
 * Helper to reset state between tests
 */
async function resetState(): Promise<void> {
    const modal = getHtmlEditorModal();
    if (modal) {
        modal.dispatchEvent(new CustomEvent("cancel", { bubbles: true, composed: true }));
        await waitForCondition(() => getHtmlEditorModal() === null);
    }

    // Click outside to deselect
    document.body.click();
    await new Promise((r) => setTimeout(r, 50));
}

beforeEach(async () => {
    await resetState();
});

test("clicking View Source opens the modal", async () => {
    const modal = await openHtmlEditorModal();

    expect(modal).not.toBeNull();
    expect(modal.elementId).toBe("test-title");
});

test("modal shows current HTML content", async () => {
    const element = getHtmlElement();

    const modal = await openHtmlEditorModal();
    const shadowRoot = modal.shadowRoot!;

    await new Promise((r) => setTimeout(r, 100));

    const textarea = shadowRoot.querySelector("textarea") as HTMLTextAreaElement;
    // The modal shows the element's text content (may differ from innerHTML
    // if Tiptap has normalized the DOM, e.g., wrapping bare text in <p>)
    expect(textarea.value).toContain(element.textContent?.trim() || "");
});

test("can edit HTML content in textarea", async () => {
    const modal = await openHtmlEditorModal();
    const shadowRoot = modal.shadowRoot!;

    await new Promise((r) => setTimeout(r, 100));

    const textarea = shadowRoot.querySelector("textarea") as HTMLTextAreaElement;

    textarea.value = "<strong>New Content</strong>";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    await waitForCondition(() => textarea.value === "<strong>New Content</strong>");
    expect(textarea.value).toBe("<strong>New Content</strong>");
});

test("Apply button dispatches apply event with edited content", async () => {
    const modal = await openHtmlEditorModal();
    const shadowRoot = modal.shadowRoot!;

    await new Promise((r) => setTimeout(r, 100));

    // Edit the content
    const textarea = shadowRoot.querySelector("textarea") as HTMLTextAreaElement;
    textarea.value = "<em>Applied Content</em>";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    let appliedData: { content: string } | null = null;
    modal.addEventListener("apply", ((e: CustomEvent) => {
        appliedData = e.detail;
    }) as EventListener);

    // Click Apply
    const buttons = shadowRoot.querySelectorAll("button");
    let applyBtn: HTMLButtonElement | null = null;
    for (const btn of buttons) {
        if (btn.textContent?.trim() === "Apply") {
            applyBtn = btn;
            break;
        }
    }
    expect(applyBtn).not.toBeNull();
    applyBtn!.click();

    await waitForCondition(() => appliedData !== null);
    expect(appliedData!.content).toBe("<em>Applied Content</em>");
});

test("Cancel button closes the modal", async () => {
    const modal = await openHtmlEditorModal();
    const shadowRoot = modal.shadowRoot!;

    let cancelCalled = false;
    modal.addEventListener("cancel", () => {
        cancelCalled = true;
    });

    const buttons = shadowRoot.querySelectorAll("button");
    let cancelBtn: HTMLButtonElement | null = null;
    for (const btn of buttons) {
        if (btn.textContent?.trim() === "Cancel") {
            cancelBtn = btn;
            break;
        }
    }
    expect(cancelBtn).not.toBeNull();
    cancelBtn!.click();

    await waitForCondition(() => cancelCalled);
    expect(cancelCalled).toBe(true);
});

test("Escape key cancels the modal", async () => {
    const modal = await openHtmlEditorModal();
    const shadowRoot = modal.shadowRoot!;

    let cancelCalled = false;
    modal.addEventListener("cancel", () => {
        cancelCalled = true;
    });

    const modalDiv = shadowRoot.querySelector(".modal") as HTMLElement;
    modalDiv.dispatchEvent(
        new KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
        }),
    );

    await waitForCondition(() => cancelCalled);
    expect(cancelCalled).toBe(true);
});

test("Cmd+Enter applies changes", async () => {
    const modal = await openHtmlEditorModal();
    const shadowRoot = modal.shadowRoot!;

    let applyCalled = false;
    modal.addEventListener("apply", () => {
        applyCalled = true;
    });

    const modalDiv = shadowRoot.querySelector(".modal") as HTMLElement;
    modalDiv.dispatchEvent(
        new KeyboardEvent("keydown", {
            key: "Enter",
            metaKey: true,
            bubbles: true,
        }),
    );

    await waitForCondition(() => applyCalled);
    expect(applyCalled).toBe(true);
});

test("clicking backdrop cancels the modal", async () => {
    const modal = await openHtmlEditorModal();
    const shadowRoot = modal.shadowRoot!;

    let cancelCalled = false;
    modal.addEventListener("cancel", () => {
        cancelCalled = true;
    });

    const backdrop = shadowRoot.querySelector(".backdrop") as HTMLElement;
    backdrop.click();

    await waitForCondition(() => cancelCalled);
    expect(cancelCalled).toBe(true);
});

test("Tiptap to modal sync: inline edits appear in View Source", async () => {
    const element = getHtmlElement();

    // Click element to start editing (Tiptap attaches)
    element.click();
    await waitForCondition(() => element.classList.contains("streamlined-editing"));

    // Edit content via Tiptap
    setElementContent(element, "<p>Edited inline via Tiptap</p>");
    await new Promise((r) => setTimeout(r, 100));

    // Open View Source modal
    const clicked = await clickToolbarButton("View Source");
    expect(clicked).toBe(true);
    await waitForSelector("scms-html-editor-modal");

    const modal = getHtmlEditorModal()!;
    const shadowRoot = modal.shadowRoot!;
    await new Promise((r) => setTimeout(r, 100));

    // Modal textarea should show the Tiptap content
    const textarea = shadowRoot.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.value).toContain("Edited inline via Tiptap");
});

test("modal to Tiptap sync: View Source edits update inline editor", async () => {
    const element = getHtmlElement();

    // Open modal (this clicks element first, attaching Tiptap)
    const modal = await openHtmlEditorModal();
    const shadowRoot = modal.shadowRoot!;
    await new Promise((r) => setTimeout(r, 100));

    // Edit content in the modal textarea
    const textarea = shadowRoot.querySelector("textarea") as HTMLTextAreaElement;
    textarea.value = "<p>Edited in View Source modal</p>";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    // Click Apply
    const buttons = shadowRoot.querySelectorAll("button");
    let applyBtn: HTMLButtonElement | null = null;
    for (const btn of buttons) {
        if (btn.textContent?.trim() === "Apply") {
            applyBtn = btn;
            break;
        }
    }
    expect(applyBtn).not.toBeNull();
    applyBtn!.click();

    // Wait for modal to close and content to sync
    await waitForCondition(() => getHtmlEditorModal() === null);
    await new Promise((r) => setTimeout(r, 100));

    // The formatting toolbar (Tiptap) should reflect the modal's content
    const toolbar = document.querySelector(
        "scms-formatting-toolbar",
    ) as FormattingToolbar | null;
    if (toolbar?.editor) {
        expect(toolbar.getHTML()).toContain("Edited in View Source modal");
    }

    // The element's visible text should also reflect the change
    expect(element.textContent).toContain("Edited in View Source modal");
});
