/**
 * Attributes Modal tests
 *
 * Tests the custom attributes modal for adding and viewing element attributes.
 */

import { test, expect, beforeAll, beforeEach } from "vitest";
import {
    initializeSDK,
    waitForCondition,
    waitForSelector,
    clickToolbarButton,
    setupTestHelpers,
} from "~/@browser-support/sdk-helpers.js";
import type { AttributesModal } from "~/src/components/attributes-modal.js";

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
 * Helper to get the attributes modal
 */
function getAttributesModal(): AttributesModal | null {
    return document.querySelector("scms-attributes-modal") as AttributesModal | null;
}

/**
 * Helper to open the attributes modal
 */
async function openAttributesModal(): Promise<AttributesModal> {
    const link = getLinkElement();

    link.click();
    await waitForCondition(() => link.classList.contains("streamlined-editing"));

    const clicked = await clickToolbarButton("Attrs");
    expect(clicked).toBe(true);

    await waitForSelector("scms-attributes-modal");

    const modal = getAttributesModal();
    expect(modal).not.toBeNull();
    return modal!;
}

/**
 * Helper to reset state between tests
 */
async function resetState(): Promise<void> {
    const modal = getAttributesModal();
    if (modal) {
        modal.dispatchEvent(new CustomEvent("cancel", { bubbles: true, composed: true }));
        await waitForCondition(() => getAttributesModal() === null);
    }

    const link = getLinkElement();
    if (link?.classList.contains("streamlined-editing")) {
        const clicked = await clickToolbarButton("Cancel");
        if (clicked) {
            await waitForCondition(() => !link.classList.contains("streamlined-editing"));
        }
    }

    await new Promise((r) => setTimeout(r, 50));
}

beforeEach(async () => {
    await resetState();
});

test("clicking Attrs button opens the modal", async () => {
    const modal = await openAttributesModal();

    expect(modal).not.toBeNull();
    expect(modal.elementId).toBe("test-link");
});

test("modal shows attribute sections", async () => {
    const modal = await openAttributesModal();
    const shadowRoot = modal.shadowRoot!;

    await new Promise((r) => setTimeout(r, 100));

    // Should have Add Attribute section
    const addSection = shadowRoot.querySelector(".add-form");
    expect(addSection).not.toBeNull();

    // Should have various attribute sections
    const sections = shadowRoot.querySelectorAll(".attr-section");
    expect(sections.length).toBeGreaterThan(0);
});

test("can add a custom attribute", async () => {
    const modal = await openAttributesModal();
    const shadowRoot = modal.shadowRoot!;

    await new Promise((r) => setTimeout(r, 100));

    // Find the input fields in the add form
    const inputs = shadowRoot.querySelectorAll(".add-form input");
    const nameInput = inputs[0] as HTMLInputElement;
    const valueInput = inputs[1] as HTMLInputElement;

    // Enter attribute name and value
    nameInput.value = "data-custom";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));

    valueInput.value = "test-value";
    valueInput.dispatchEvent(new Event("input", { bubbles: true }));

    // Click Add button
    const addBtn = shadowRoot.querySelector(".add-form button") as HTMLButtonElement;
    addBtn.click();

    await new Promise((r) => setTimeout(r, 100));

    // The attribute should now appear in the custom attributes section
    const customSection = shadowRoot.querySelector(".space-y-2");
    const customRow = customSection?.querySelector(
        '.attribute-row:not(.disabled) input[type="text"]',
    ) as HTMLInputElement | null;

    // Verify the attribute was added (check modal's internal state)
    expect(
        Object.keys(
            (modal as unknown as { editedAttributes: Record<string, string> }).editedAttributes,
        ),
    ).toContain("data-custom");
});

test("shows error for reserved attribute names", async () => {
    const modal = await openAttributesModal();
    const shadowRoot = modal.shadowRoot!;

    await new Promise((r) => setTimeout(r, 100));

    const inputs = shadowRoot.querySelectorAll(".add-form input");
    const nameInput = inputs[0] as HTMLInputElement;

    // Try to add a reserved attribute
    nameInput.value = "class";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));

    const addBtn = shadowRoot.querySelector(".add-form button") as HTMLButtonElement;
    addBtn.click();

    await new Promise((r) => setTimeout(r, 100));

    // Should show an error message
    const errorMsg = shadowRoot.querySelector(".text-red-600");
    expect(errorMsg).not.toBeNull();
    expect(errorMsg?.textContent).toContain("reserved");
});

test("shows error for known attribute names", async () => {
    const modal = await openAttributesModal();
    const shadowRoot = modal.shadowRoot!;

    await new Promise((r) => setTimeout(r, 100));

    const inputs = shadowRoot.querySelectorAll(".add-form input");
    const nameInput = inputs[0] as HTMLInputElement;

    // Try to add a known SEO attribute
    nameInput.value = "alt";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));

    const addBtn = shadowRoot.querySelector(".add-form button") as HTMLButtonElement;
    addBtn.click();

    await new Promise((r) => setTimeout(r, 100));

    // Should show an error message
    const errorMsg = shadowRoot.querySelector(".text-red-600");
    expect(errorMsg).not.toBeNull();
    expect(errorMsg?.textContent).toContain("SEO or Accessibility modal");
});

test("Apply button dispatches apply event", async () => {
    const modal = await openAttributesModal();
    const shadowRoot = modal.shadowRoot!;

    await new Promise((r) => setTimeout(r, 100));

    // Add a custom attribute first
    const inputs = shadowRoot.querySelectorAll(".add-form input");
    const nameInput = inputs[0] as HTMLInputElement;
    const valueInput = inputs[1] as HTMLInputElement;

    nameInput.value = "data-test";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    valueInput.value = "test-value";
    valueInput.dispatchEvent(new Event("input", { bubbles: true }));

    const addBtn = shadowRoot.querySelector(".add-form button") as HTMLButtonElement;
    addBtn.click();

    await new Promise((r) => setTimeout(r, 100));

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
    expect(appliedData!.attributes["data-test"]).toBe("test-value");
});

test("Cancel button closes the modal", async () => {
    const modal = await openAttributesModal();
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
    const modal = await openAttributesModal();
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
    const modal = await openAttributesModal();
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
    const modal = await openAttributesModal();
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
    const modal = await openAttributesModal();
    const shadowRoot = modal.shadowRoot!;

    const elementIdSpan = shadowRoot.querySelector(".font-mono") as HTMLElement;
    expect(elementIdSpan.textContent?.trim()).toBe("test-link");
});
