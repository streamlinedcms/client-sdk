/**
 * Link Editor Modal tests
 *
 * Tests the link editor modal component that allows editing link properties.
 */

import { test, expect, beforeAll, beforeEach } from "vitest";
import {
    initializeSDK,
    waitForCondition,
    waitForSelector,
    clickToolbarButton,
    setupTestHelpers,
} from "~/@browser-support/sdk-helpers.js";
import type { LinkEditorModal } from "~/src/components/link-editor-modal.js";

beforeAll(async () => {
    setupTestHelpers();
    await initializeSDK();
});

/**
 * Helper to get the link element
 */
function getLinkElement(): HTMLAnchorElement {
    return document.querySelector('[data-scms-link="test-link"]') as HTMLAnchorElement;
}

/**
 * Helper to get the link editor modal
 */
function getLinkEditorModal(): LinkEditorModal | null {
    return document.querySelector("scms-link-editor-modal") as LinkEditorModal | null;
}

/**
 * Helper to open the link editor modal
 */
async function openLinkEditor(): Promise<LinkEditorModal> {
    const link = getLinkElement();

    // Click to select the link
    link.click();

    // Wait for link to be in editing mode
    await waitForCondition(() => link.classList.contains("streamlined-editing"));

    // Click the "Edit Link" button in toolbar
    const clicked = await clickToolbarButton("Edit Link");
    expect(clicked).toBe(true);

    // Wait for modal to appear
    await waitForSelector("scms-link-editor-modal");

    const modal = getLinkEditorModal();
    expect(modal).not.toBeNull();
    return modal!;
}

/**
 * Helper to reset state between tests.
 * Dispatches cancel event to properly close modal and let controller cleanup.
 */
async function resetState(): Promise<void> {
    // Close modal properly by dispatching cancel event
    // This triggers the controller's cancel handler which clears its reference
    const modal = getLinkEditorModal();
    if (modal) {
        // Dispatch cancel event directly (bypasses confirm dialog)
        modal.dispatchEvent(new CustomEvent("cancel", { bubbles: true, composed: true }));
        await waitForCondition(() => getLinkEditorModal() === null);
    }

    // Exit editing mode by clicking Cancel on toolbar (if visible)
    const link = getLinkElement();
    if (link?.classList.contains("streamlined-editing")) {
        // Click Cancel button on toolbar to properly exit editing mode
        const clicked = await clickToolbarButton("Cancel");
        if (clicked) {
            await waitForCondition(() => !link.classList.contains("streamlined-editing"));
        }
    }

    // Wait for DOM to settle
    await new Promise((r) => setTimeout(r, 50));
}

beforeEach(async () => {
    // Ensure clean state from previous test
    await resetState();
});

test("clicking Edit Link opens the link editor modal", async () => {
    const modal = await openLinkEditor();

    // Modal should be visible
    expect(modal).not.toBeNull();

    // Modal should have correct element ID
    expect(modal.elementId).toBe("test-link");
});

test("link editor modal shows current link values", async () => {
    const modal = await openLinkEditor();

    // Check the modal's linkData property
    // Note: browser normalizes URLs, so https://example.com becomes https://example.com/
    expect(modal.linkData.href).toMatch(/^https:\/\/example\.com\/?$/);
    expect(modal.linkData.target).toBe("");
    expect(modal.linkData.value).toBe("Default Link Text");

    // Also verify the input fields in the shadow DOM
    const shadowRoot = modal.shadowRoot!;

    // Wait for Lit to render
    await new Promise((r) => setTimeout(r, 100));

    const urlInput = shadowRoot.querySelector('input[type="url"]') as HTMLInputElement;
    expect(urlInput.value).toMatch(/^https:\/\/example\.com\/?$/);

    const textarea = shadowRoot.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Default Link Text");

    const targetSelect = shadowRoot.querySelector("select") as HTMLSelectElement;
    expect(targetSelect.value).toBe("");
});

test("can edit link URL in the modal", async () => {
    const modal = await openLinkEditor();
    const shadowRoot = modal.shadowRoot!;

    // Wait for Lit to render
    await new Promise((r) => setTimeout(r, 100));

    const urlInput = shadowRoot.querySelector('input[type="url"]') as HTMLInputElement;

    // Change the URL
    urlInput.value = "https://newurl.com";
    urlInput.dispatchEvent(new Event("input", { bubbles: true }));

    // Verify the change is reflected
    await waitForCondition(() => urlInput.value === "https://newurl.com");
    expect(urlInput.value).toBe("https://newurl.com");
});

test("can edit link text in the modal", async () => {
    const modal = await openLinkEditor();
    const shadowRoot = modal.shadowRoot!;

    await new Promise((r) => setTimeout(r, 100));

    const textarea = shadowRoot.querySelector("textarea") as HTMLTextAreaElement;

    // Change the link text
    textarea.value = "New Link Text";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    await waitForCondition(() => textarea.value === "New Link Text");
    expect(textarea.value).toBe("New Link Text");
});

test("can change link target in the modal", async () => {
    const modal = await openLinkEditor();
    const shadowRoot = modal.shadowRoot!;

    await new Promise((r) => setTimeout(r, 100));

    const targetSelect = shadowRoot.querySelector("select") as HTMLSelectElement;

    // Change to open in new tab
    targetSelect.value = "_blank";
    targetSelect.dispatchEvent(new Event("change", { bubbles: true }));

    await waitForCondition(() => targetSelect.value === "_blank");
    expect(targetSelect.value).toBe("_blank");
});

test("Apply button dispatches apply event with edited data", async () => {
    const modal = await openLinkEditor();
    const shadowRoot = modal.shadowRoot!;

    await new Promise((r) => setTimeout(r, 100));

    // Edit the URL
    const urlInput = shadowRoot.querySelector('input[type="url"]') as HTMLInputElement;
    urlInput.value = "https://applied-url.com";
    urlInput.dispatchEvent(new Event("input", { bubbles: true }));

    // Listen for apply event
    let appliedData: { href: string; target: string; value: string } | null = null;
    modal.addEventListener("apply", ((e: CustomEvent) => {
        appliedData = e.detail.linkData;
    }) as EventListener);

    // Click Apply button
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

    // Verify the event was dispatched with correct data
    await waitForCondition(() => appliedData !== null);
    expect(appliedData!.href).toBe("https://applied-url.com");
});

test("Cancel button closes the modal without saving", async () => {
    const modal = await openLinkEditor();
    const shadowRoot = modal.shadowRoot!;

    // Listen for cancel event
    let cancelCalled = false;
    modal.addEventListener("cancel", () => {
        cancelCalled = true;
    });

    // Find and click Cancel button
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

    // Verify cancel event was dispatched
    await waitForCondition(() => cancelCalled);
    expect(cancelCalled).toBe(true);
});

test("Escape key cancels the modal", async () => {
    const modal = await openLinkEditor();
    const shadowRoot = modal.shadowRoot!;

    // Listen for cancel event
    let cancelCalled = false;
    modal.addEventListener("cancel", () => {
        cancelCalled = true;
    });

    // Dispatch Escape key on the modal
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
    const modal = await openLinkEditor();
    const shadowRoot = modal.shadowRoot!;

    // Listen for apply event
    let applyCalled = false;
    modal.addEventListener("apply", () => {
        applyCalled = true;
    });

    // Dispatch Cmd+Enter on the modal
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
    const modal = await openLinkEditor();
    const shadowRoot = modal.shadowRoot!;

    // Listen for cancel event
    let cancelCalled = false;
    modal.addEventListener("cancel", () => {
        cancelCalled = true;
    });

    // Click the backdrop
    const backdrop = shadowRoot.querySelector(".backdrop") as HTMLElement;
    backdrop.click();

    await waitForCondition(() => cancelCalled);
    expect(cancelCalled).toBe(true);
});

test("modal displays the element ID", async () => {
    const modal = await openLinkEditor();
    const shadowRoot = modal.shadowRoot!;

    // Find the element ID display in the header
    const elementIdSpan = shadowRoot.querySelector(".font-mono") as HTMLElement;
    expect(elementIdSpan.textContent?.trim()).toBe("test-link");
});
