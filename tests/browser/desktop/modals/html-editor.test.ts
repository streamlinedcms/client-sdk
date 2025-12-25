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
    setupTestHelpers,
} from "../support/sdk-helpers.js";
import type { HtmlEditorModal } from "../../../src/components/html-editor-modal.js";

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

    const clicked = await clickToolbarButton("Edit HTML");
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

test("clicking Edit HTML opens the modal", async () => {
    const modal = await openHtmlEditorModal();

    expect(modal).not.toBeNull();
    expect(modal.elementId).toBe("test-title");
});

test("modal shows current HTML content", async () => {
    const element = getHtmlElement();
    const originalContent = element.innerHTML;

    const modal = await openHtmlEditorModal();
    const shadowRoot = modal.shadowRoot!;

    await new Promise((r) => setTimeout(r, 100));

    const textarea = shadowRoot.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.value).toBe(originalContent);
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

test("modal displays the element ID", async () => {
    const modal = await openHtmlEditorModal();
    const shadowRoot = modal.shadowRoot!;

    const elementIdSpan = shadowRoot.querySelector(".font-mono") as HTMLElement;
    expect(elementIdSpan.textContent?.trim()).toBe("test-title");
});
