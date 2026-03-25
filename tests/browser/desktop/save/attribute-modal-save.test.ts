/**
 * Attribute-only modal save detection tests
 *
 * Verifies that applying changes via SEO, Accessibility, or Attributes modals
 * (without any content edits) correctly updates currentContent, triggers the
 * Save button (hasChanges), and persists to draft localStorage.
 *
 * Regression test for: https://github.com/streamlinedcms/client-sdk/issues/72
 */

import { test, expect, beforeAll, beforeEach } from "vitest";
import {
    initializeSDK,
    waitForCondition,
    waitForSelector,
    clickToolbarButton,
    setupTestHelpers,
    getController,
} from "~/@browser-support/sdk-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";
import type { SeoModal } from "~/src/components/seo-modal.js";
import type { AccessibilityModal } from "~/src/components/accessibility-modal.js";
import type { AttributesModal } from "~/src/components/attributes-modal.js";

function getDraftKey(): string {
    return getController()!.draftStorageKey;
}

beforeAll(async () => {
    setupTestHelpers();
    await initializeSDK();
    localStorage.removeItem(getDraftKey());
});

function getLinkElement(): HTMLAnchorElement {
    return document.querySelector('[data-scms-link="attr-save-link"]') as HTMLAnchorElement;
}

function getHtmlElement(): HTMLElement {
    return document.querySelector('[data-scms-html="attr-save-html"]') as HTMLElement;
}

function getToolbar(): Toolbar | null {
    return document.querySelector("scms-toolbar") as Toolbar | null;
}

function clickApplyButton(modal: HTMLElement): void {
    const shadowRoot = modal.shadowRoot!;
    const buttons = shadowRoot.querySelectorAll("button");
    for (const btn of buttons) {
        if (btn.textContent?.trim() === "Apply") {
            btn.click();
            return;
        }
    }
    throw new Error("Apply button not found in modal");
}

/**
 * Helper to close any open modal and deselect
 */
async function resetState(): Promise<void> {
    for (const tag of ["scms-seo-modal", "scms-accessibility-modal", "scms-attributes-modal"]) {
        const modal = document.querySelector(tag);
        if (modal) {
            modal.dispatchEvent(new CustomEvent("cancel", { bubbles: true, composed: true }));
            await waitForCondition(() => document.querySelector(tag) === null);
        }
    }
    const link = getLinkElement();
    if (link?.classList.contains("streamlined-editing")) {
        await clickToolbarButton("Cancel");
        await waitForCondition(() => !link.classList.contains("streamlined-editing")).catch(() => {});
    }
    const html = getHtmlElement();
    if (html?.classList.contains("streamlined-editing")) {
        await clickToolbarButton("Cancel");
        await waitForCondition(() => !html.classList.contains("streamlined-editing")).catch(() => {});
    }
}

beforeEach(async () => {
    await resetState();
});

// This is the first test — starts from a clean state
test("SEO modal: attribute-only changes trigger hasChanges and persist to draft", async () => {
    const link = getLinkElement();
    const toolbar = getToolbar();

    // Verify clean starting state
    expect(toolbar!.hasChanges).toBe(false);

    // Select and open SEO modal
    link.click();
    await waitForCondition(() => link.classList.contains("streamlined-editing"));
    const clicked = await clickToolbarButton("SEO");
    expect(clicked).toBe(true);
    await waitForSelector("scms-seo-modal");

    const modal = document.querySelector("scms-seo-modal") as SeoModal;
    const shadowRoot = modal.shadowRoot!;

    // Wait for modal to render its select element
    await waitForCondition(() => shadowRoot.querySelector("select") !== null);

    // Change the rel attribute (attribute-only change, no content edit)
    const relSelect = shadowRoot.querySelector("select") as HTMLSelectElement;
    relSelect.value = "nofollow";
    relSelect.dispatchEvent(new Event("change", { bubbles: true }));

    // Click Apply
    clickApplyButton(modal);
    await waitForCondition(() => document.querySelector("scms-seo-modal") === null);

    // Core assertion for issue #72: hasChanges must be true
    await waitForCondition(() => toolbar!.hasChanges === true);

    // Draft must include the SEO attribute change
    await waitForCondition(() => localStorage.getItem(getDraftKey()) !== null);
    const stored = localStorage.getItem(getDraftKey());
    expect(stored).not.toBeNull();
    const draft = JSON.parse(stored!);
    const linkContent = draft.content["attr-save-link"];
    expect(linkContent).toBeDefined();
    expect(linkContent).toContain("nofollow");
});

test("Accessibility modal: attribute-only changes update currentContent and persist to draft", async () => {
    const link = getLinkElement();

    // Select and open Accessibility modal on the link element
    link.click();
    await waitForCondition(() => link.classList.contains("streamlined-editing"));
    const clicked = await clickToolbarButton("Accessibility");
    expect(clicked).toBe(true);
    await waitForSelector("scms-accessibility-modal");

    const modal = document.querySelector("scms-accessibility-modal") as AccessibilityModal;
    const shadowRoot = modal.shadowRoot!;

    // Wait for modal to render its inputs
    await waitForCondition(() => shadowRoot.querySelectorAll('input[type="text"]').length > 0);

    // Set aria-label (text input)
    const inputs = shadowRoot.querySelectorAll('input[type="text"]');
    const ariaLabelInput = inputs[0] as HTMLInputElement;
    ariaLabelInput.value = "Navigate to example";
    ariaLabelInput.dispatchEvent(new Event("input", { bubbles: true }));

    // Click Apply
    clickApplyButton(modal);
    await waitForCondition(() => document.querySelector("scms-accessibility-modal") === null);

    // Draft must include the accessibility attribute change for the link
    await waitForCondition(() => {
        const s = localStorage.getItem(getDraftKey());
        return s !== null && s.includes("aria-label");
    });
    const stored = localStorage.getItem(getDraftKey());
    expect(stored).not.toBeNull();
    const draft = JSON.parse(stored!);
    const linkContent = draft.content["attr-save-link"];
    expect(linkContent).toBeDefined();
    expect(linkContent).toContain("aria-label");
});

test("Attributes modal: attribute-only changes update currentContent and persist to draft", async () => {
    const link = getLinkElement();

    // Select and open Attributes modal
    link.click();
    await waitForCondition(() => link.classList.contains("streamlined-editing"));
    const clicked = await clickToolbarButton("Attributes");
    expect(clicked).toBe(true);
    await waitForSelector("scms-attributes-modal");

    const modal = document.querySelector("scms-attributes-modal") as AttributesModal;
    const shadowRoot = modal.shadowRoot!;

    // Wait for modal to render its form inputs
    await waitForCondition(() => shadowRoot.querySelectorAll(".add-form input").length >= 2);

    // Add a custom attribute
    const inputs = shadowRoot.querySelectorAll(".add-form input");
    const nameInput = inputs[0] as HTMLInputElement;
    const valueInput = inputs[1] as HTMLInputElement;

    nameInput.value = "data-tracking";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    valueInput.value = "cta-link";
    valueInput.dispatchEvent(new Event("input", { bubbles: true }));

    const addBtn = shadowRoot.querySelector(".add-form button") as HTMLButtonElement;
    addBtn.click();

    // Wait for attribute to be added before applying
    await waitForCondition(() => shadowRoot.querySelectorAll(".attribute-row, .attr-item").length > 0);

    // Click Apply
    clickApplyButton(modal);
    await waitForCondition(() => document.querySelector("scms-attributes-modal") === null);

    // Draft must include the custom attribute for the link element
    await waitForCondition(() => {
        const s = localStorage.getItem(getDraftKey());
        return s !== null && s.includes("data-tracking");
    });
    const stored = localStorage.getItem(getDraftKey());
    expect(stored).not.toBeNull();
    const draft = JSON.parse(stored!);
    const linkContent = draft.content["attr-save-link"];
    expect(linkContent).toBeDefined();
    expect(linkContent).toContain("data-tracking");
});
