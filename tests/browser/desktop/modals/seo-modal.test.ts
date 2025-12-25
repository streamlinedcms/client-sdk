/**
 * SEO Modal tests
 *
 * Tests the SEO modal component for editing SEO-related attributes.
 * Uses link elements for testing since rel is a primary field for links.
 */

import { test, expect, beforeAll, beforeEach } from "vitest";
import {
    initializeSDK,
    waitForCondition,
    waitForSelector,
    clickToolbarButton,
    setupTestHelpers,
} from "~/@browser-support/sdk-helpers.js";
import type { SeoModal } from "~/src/components/seo-modal.js";

beforeAll(async () => {
    setupTestHelpers();
    await initializeSDK();
});

/**
 * Helper to get the link element (for testing SEO on links)
 */
function getLinkElement(): HTMLAnchorElement {
    return document.querySelector('[data-scms-link="test-link"]') as HTMLAnchorElement;
}

/**
 * Helper to get an HTML element (for testing SEO on html elements)
 */
function getHtmlElement(): HTMLElement {
    return document.querySelector('[data-scms-html="test-title"]') as HTMLElement;
}

/**
 * Helper to get the SEO modal
 */
function getSeoModal(): SeoModal | null {
    return document.querySelector("scms-seo-modal") as SeoModal | null;
}

/**
 * Helper to open the SEO modal for the link element
 */
async function openSeoModalForLink(): Promise<SeoModal> {
    const link = getLinkElement();

    // Click to select the link
    link.click();

    // Wait for link to be in editing mode
    await waitForCondition(() => link.classList.contains("streamlined-editing"));

    // Click the "SEO" button in toolbar
    const clicked = await clickToolbarButton("SEO");
    expect(clicked).toBe(true);

    // Wait for modal to appear
    await waitForSelector("scms-seo-modal");

    const modal = getSeoModal();
    expect(modal).not.toBeNull();
    return modal!;
}

/**
 * Helper to open the SEO modal for an HTML element
 */
async function openSeoModalForHtml(): Promise<SeoModal> {
    const element = getHtmlElement();

    // Click to select the element
    element.click();

    // Wait for element to be in editing mode
    await waitForCondition(() => element.classList.contains("streamlined-editing"));

    // Click the "SEO" button in toolbar
    const clicked = await clickToolbarButton("SEO");
    expect(clicked).toBe(true);

    // Wait for modal to appear
    await waitForSelector("scms-seo-modal");

    const modal = getSeoModal();
    expect(modal).not.toBeNull();
    return modal!;
}

/**
 * Helper to reset state between tests
 */
async function resetState(): Promise<void> {
    // Close modal properly by dispatching cancel event
    const modal = getSeoModal();
    if (modal) {
        modal.dispatchEvent(new CustomEvent("cancel", { bubbles: true, composed: true }));
        await waitForCondition(() => getSeoModal() === null);
    }

    // Exit editing mode by clicking Cancel on toolbar (if visible)
    const link = getLinkElement();
    if (link?.classList.contains("streamlined-editing")) {
        const clicked = await clickToolbarButton("Cancel");
        if (clicked) {
            await waitForCondition(() => !link.classList.contains("streamlined-editing"));
        }
    }

    const htmlEl = getHtmlElement();
    if (htmlEl?.classList.contains("streamlined-editing")) {
        const clicked = await clickToolbarButton("Cancel");
        if (clicked) {
            await waitForCondition(() => !htmlEl.classList.contains("streamlined-editing"));
        }
    }

    await new Promise((r) => setTimeout(r, 50));
}

beforeEach(async () => {
    await resetState();
});

test("clicking SEO button opens the SEO modal", async () => {
    const modal = await openSeoModalForLink();

    expect(modal).not.toBeNull();
    expect(modal.elementId).toBe("test-link");
    expect(modal.elementType).toBe("link");
});

test("SEO modal shows correct fields for link element", async () => {
    const modal = await openSeoModalForLink();
    const shadowRoot = modal.shadowRoot!;

    await new Promise((r) => setTimeout(r, 100));

    // For links, rel is primary and title is secondary
    // Check that the rel select exists
    const relSelect = shadowRoot.querySelector("select") as HTMLSelectElement;
    expect(relSelect).not.toBeNull();

    // Check that title input exists
    const inputs = shadowRoot.querySelectorAll('input[type="text"]');
    expect(inputs.length).toBeGreaterThan(0);

    // Check for "Not typically used" section (alt is not applicable for links)
    const notApplicableToggle = shadowRoot.querySelector(".not-applicable-toggle");
    expect(notApplicableToggle).not.toBeNull();
});

test("SEO modal shows correct fields for HTML element", async () => {
    const modal = await openSeoModalForHtml();
    const shadowRoot = modal.shadowRoot!;

    await new Promise((r) => setTimeout(r, 100));

    // For HTML elements, title is secondary, alt and rel are not applicable
    // Should have title input
    const inputs = shadowRoot.querySelectorAll('input[type="text"]');
    expect(inputs.length).toBeGreaterThan(0);

    // Should have "Not typically used" section
    const notApplicableToggle = shadowRoot.querySelector(".not-applicable-toggle");
    expect(notApplicableToggle).not.toBeNull();
});

test("can edit rel attribute for link", async () => {
    const modal = await openSeoModalForLink();
    const shadowRoot = modal.shadowRoot!;

    await new Promise((r) => setTimeout(r, 100));

    const relSelect = shadowRoot.querySelector("select") as HTMLSelectElement;

    // Change rel to nofollow
    relSelect.value = "nofollow";
    relSelect.dispatchEvent(new Event("change", { bubbles: true }));

    await waitForCondition(() => relSelect.value === "nofollow");
    expect(relSelect.value).toBe("nofollow");
});

test("can edit title attribute", async () => {
    const modal = await openSeoModalForLink();
    const shadowRoot = modal.shadowRoot!;

    await new Promise((r) => setTimeout(r, 100));

    // Find the title input (first text input)
    const titleInput = shadowRoot.querySelector('input[type="text"]') as HTMLInputElement;

    titleInput.value = "Link tooltip text";
    titleInput.dispatchEvent(new Event("input", { bubbles: true }));

    await waitForCondition(() => titleInput.value === "Link tooltip text");
    expect(titleInput.value).toBe("Link tooltip text");
});

test("Apply button dispatches apply event with edited attributes", async () => {
    const modal = await openSeoModalForLink();
    const shadowRoot = modal.shadowRoot!;

    await new Promise((r) => setTimeout(r, 100));

    // Edit the rel attribute
    const relSelect = shadowRoot.querySelector("select") as HTMLSelectElement;
    relSelect.value = "sponsored";
    relSelect.dispatchEvent(new Event("change", { bubbles: true }));

    // Listen for apply event
    let appliedData: { attributes: Record<string, string> } | null = null;
    modal.addEventListener("apply", ((e: CustomEvent) => {
        appliedData = e.detail;
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

    await waitForCondition(() => appliedData !== null);
    expect(appliedData!.attributes.rel).toBe("sponsored");
});

test("Cancel button closes the modal", async () => {
    const modal = await openSeoModalForLink();
    const shadowRoot = modal.shadowRoot!;

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

    await waitForCondition(() => cancelCalled);
    expect(cancelCalled).toBe(true);
});

test("Escape key cancels the modal", async () => {
    const modal = await openSeoModalForLink();
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
    const modal = await openSeoModalForLink();
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
    const modal = await openSeoModalForLink();
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
    const modal = await openSeoModalForLink();
    const shadowRoot = modal.shadowRoot!;

    const elementIdSpan = shadowRoot.querySelector(".font-mono") as HTMLElement;
    expect(elementIdSpan.textContent?.trim()).toBe("test-link");
});

test("can toggle not-applicable fields section", async () => {
    const modal = await openSeoModalForLink();
    const shadowRoot = modal.shadowRoot!;

    await new Promise((r) => setTimeout(r, 100));

    // Find the toggle button
    const toggleBtn = shadowRoot.querySelector(".not-applicable-toggle") as HTMLButtonElement;
    expect(toggleBtn).not.toBeNull();

    // Initially, not-applicable section should be hidden
    let notApplicableSection = shadowRoot.querySelector(".not-applicable-section");
    expect(notApplicableSection).toBeNull();

    // Click to expand
    toggleBtn.click();
    await new Promise((r) => setTimeout(r, 100));

    // Now the section should be visible
    notApplicableSection = shadowRoot.querySelector(".not-applicable-section");
    expect(notApplicableSection).not.toBeNull();

    // Click again to collapse
    toggleBtn.click();
    await new Promise((r) => setTimeout(r, 100));

    notApplicableSection = shadowRoot.querySelector(".not-applicable-section");
    expect(notApplicableSection).toBeNull();
});
