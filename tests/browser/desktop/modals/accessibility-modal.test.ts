/**
 * Accessibility Modal tests
 *
 * Tests the accessibility modal component for editing a11y-related attributes.
 */

import { test, expect, beforeAll, beforeEach } from "vitest";
import {
    initializeSDK,
    waitForCondition,
    waitForSelector,
    clickToolbarButton,
    setupTestHelpers,
} from "../support/sdk-helpers.js";
import type { AccessibilityModal } from "../../../src/components/accessibility-modal.js";

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
 * Helper to get an HTML element
 */
function getHtmlElement(): HTMLElement {
    return document.querySelector('[data-scms-html="test-title"]') as HTMLElement;
}

/**
 * Helper to get the accessibility modal
 */
function getAccessibilityModal(): AccessibilityModal | null {
    return document.querySelector("scms-accessibility-modal") as AccessibilityModal | null;
}

/**
 * Helper to open the accessibility modal for the link element
 */
async function openAccessibilityModalForLink(): Promise<AccessibilityModal> {
    const link = getLinkElement();

    link.click();
    await waitForCondition(() => link.classList.contains("streamlined-editing"));

    const clicked = await clickToolbarButton("A11y");
    expect(clicked).toBe(true);

    await waitForSelector("scms-accessibility-modal");

    const modal = getAccessibilityModal();
    expect(modal).not.toBeNull();
    return modal!;
}

/**
 * Helper to open the accessibility modal for an HTML element
 */
async function openAccessibilityModalForHtml(): Promise<AccessibilityModal> {
    const element = getHtmlElement();

    element.click();
    await waitForCondition(() => element.classList.contains("streamlined-editing"));

    const clicked = await clickToolbarButton("A11y");
    expect(clicked).toBe(true);

    await waitForSelector("scms-accessibility-modal");

    const modal = getAccessibilityModal();
    expect(modal).not.toBeNull();
    return modal!;
}

/**
 * Helper to reset state between tests
 */
async function resetState(): Promise<void> {
    const modal = getAccessibilityModal();
    if (modal) {
        modal.dispatchEvent(new CustomEvent("cancel", { bubbles: true, composed: true }));
        await waitForCondition(() => getAccessibilityModal() === null);
    }

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

test("clicking Accessibility button opens the modal", async () => {
    const modal = await openAccessibilityModalForLink();

    expect(modal).not.toBeNull();
    expect(modal.elementId).toBe("test-link");
    expect(modal.elementType).toBe("link");
});

test("accessibility modal shows correct fields for link element", async () => {
    const modal = await openAccessibilityModalForLink();
    const shadowRoot = modal.shadowRoot!;

    await new Promise((r) => setTimeout(r, 100));

    // For links: aria-label (secondary), aria-describedby (secondary)
    // role and tabindex are not-applicable for links
    const inputs = shadowRoot.querySelectorAll('input[type="text"]');
    expect(inputs.length).toBeGreaterThan(0);

    // Should have "Not typically used" section
    const notApplicableToggle = shadowRoot.querySelector(".not-applicable-toggle");
    expect(notApplicableToggle).not.toBeNull();
});

test("accessibility modal shows correct fields for HTML element", async () => {
    const modal = await openAccessibilityModalForHtml();
    const shadowRoot = modal.shadowRoot!;

    await new Promise((r) => setTimeout(r, 100));

    // For HTML elements: aria-label, aria-describedby, role, tabindex are all secondary
    // Only aria-describedby for text is not-applicable
    const inputs = shadowRoot.querySelectorAll('input[type="text"]');
    expect(inputs.length).toBeGreaterThan(0);

    // Should have select for role and tabindex
    const selects = shadowRoot.querySelectorAll("select");
    expect(selects.length).toBeGreaterThanOrEqual(1);
});

test("can edit aria-label attribute", async () => {
    const modal = await openAccessibilityModalForLink();
    const shadowRoot = modal.shadowRoot!;

    await new Promise((r) => setTimeout(r, 100));

    // Find the aria-label input (first text input)
    const ariaLabelInput = shadowRoot.querySelector('input[type="text"]') as HTMLInputElement;

    ariaLabelInput.value = "Click to navigate";
    ariaLabelInput.dispatchEvent(new Event("input", { bubbles: true }));

    await waitForCondition(() => ariaLabelInput.value === "Click to navigate");
    expect(ariaLabelInput.value).toBe("Click to navigate");
});

test("Apply button dispatches apply event with edited attributes", async () => {
    const modal = await openAccessibilityModalForLink();
    const shadowRoot = modal.shadowRoot!;

    await new Promise((r) => setTimeout(r, 100));

    // Edit aria-label
    const ariaLabelInput = shadowRoot.querySelector('input[type="text"]') as HTMLInputElement;
    ariaLabelInput.value = "Navigate to home";
    ariaLabelInput.dispatchEvent(new Event("input", { bubbles: true }));

    let appliedData: { attributes: Record<string, string> } | null = null;
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
    expect(appliedData!.attributes["aria-label"]).toBe("Navigate to home");
});

test("Cancel button closes the modal", async () => {
    const modal = await openAccessibilityModalForLink();
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
    const modal = await openAccessibilityModalForLink();
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
    const modal = await openAccessibilityModalForLink();
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
    const modal = await openAccessibilityModalForLink();
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
    const modal = await openAccessibilityModalForLink();
    const shadowRoot = modal.shadowRoot!;

    const elementIdSpan = shadowRoot.querySelector(".font-mono") as HTMLElement;
    expect(elementIdSpan.textContent?.trim()).toBe("test-link");
});

test("can toggle not-applicable fields section", async () => {
    const modal = await openAccessibilityModalForLink();
    const shadowRoot = modal.shadowRoot!;

    await new Promise((r) => setTimeout(r, 100));

    const toggleBtn = shadowRoot.querySelector(".not-applicable-toggle") as HTMLButtonElement;
    expect(toggleBtn).not.toBeNull();

    // Initially hidden
    let notApplicableSection = shadowRoot.querySelector(".not-applicable-section");
    expect(notApplicableSection).toBeNull();

    // Click to expand
    toggleBtn.click();
    await new Promise((r) => setTimeout(r, 100));

    notApplicableSection = shadowRoot.querySelector(".not-applicable-section");
    expect(notApplicableSection).not.toBeNull();

    // Click to collapse
    toggleBtn.click();
    await new Promise((r) => setTimeout(r, 100));

    notApplicableSection = shadowRoot.querySelector(".not-applicable-section");
    expect(notApplicableSection).toBeNull();
});
