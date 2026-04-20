/**
 * Href element editing tests
 *
 * Covers the non-content href editable: selection, toolbar controls, modal
 * editing, and inner-HTML preservation across apply cycles. Also covers the
 * scanner's warnings for invalid usage (multiple data-scms-* on one element,
 * data-scms-href on a non-anchor).
 */

import { test, expect, beforeAll, beforeEach } from "vitest";
import {
    initializeSDK,
    waitForCondition,
    waitForSelector,
    clickToolbarButton,
    setupTestHelpers,
} from "~/@browser-support/sdk-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";
import type { LinkEditorModal } from "~/src/components/link-editor-modal.js";

beforeAll(async () => {
    setupTestHelpers();
    await initializeSDK();
});

beforeEach(async () => {
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));
});

function getToolbar(): Toolbar | null {
    return document.querySelector("scms-toolbar") as Toolbar | null;
}

function getHrefElement(): HTMLAnchorElement {
    return document.querySelector('[data-scms-href="test-href"]') as HTMLAnchorElement;
}

function getHrefEditorModal(): LinkEditorModal | null {
    return document.querySelector("scms-link-editor-modal") as LinkEditorModal | null;
}

test("href element is registered as editable", () => {
    const href = getHrefElement();
    expect(href.classList.contains("streamlined-editable")).toBe(true);
});

test("clicking href element selects it with type 'href'", async () => {
    const href = getHrefElement();
    const toolbar = getToolbar();

    href.click();
    await waitForCondition(() => href.classList.contains("streamlined-editing"));

    expect(toolbar?.activeElementType).toBe("href");
});

test("href element has no 'Click to edit' placeholder even if empty inside", () => {
    const href = getHrefElement();
    // An href-type element should never carry streamlined-empty (that would show
    // the placeholder inside developer-authored markup).
    expect(href.classList.contains("streamlined-empty")).toBe(false);
});

test("toolbar shows Edit Link and Go to Link buttons for href element", async () => {
    const href = getHrefElement();
    const toolbar = getToolbar();

    href.click();
    await waitForCondition(() => href.classList.contains("streamlined-editing"));

    await new Promise((r) => setTimeout(r, 50));
    const buttons = toolbar!.shadowRoot!.querySelectorAll("button");
    const labels = Array.from(buttons).map((b) => b.textContent?.trim() ?? "");

    expect(labels.some((l) => l.includes("Edit Link"))).toBe(true);
    expect(labels.some((l) => l.includes("Go to Link"))).toBe(true);
});

test("toolbar does NOT show View Source for href element", async () => {
    const href = getHrefElement();
    const toolbar = getToolbar();

    href.click();
    await waitForCondition(() => href.classList.contains("streamlined-editing"));

    await new Promise((r) => setTimeout(r, 50));
    const buttons = toolbar!.shadowRoot!.querySelectorAll("button");
    const hasViewSource = Array.from(buttons).some((b) =>
        b.textContent?.trim().includes("View Source"),
    );
    expect(hasViewSource).toBe(false);
});

test("editing href via modal updates href and target but preserves inner HTML", async () => {
    const href = getHrefElement();
    const originalInnerHTML = href.innerHTML;

    href.click();
    await waitForCondition(() => href.classList.contains("streamlined-editing"));

    const clicked = await clickToolbarButton("Edit Link");
    expect(clicked).toBe(true);

    await waitForSelector("scms-link-editor-modal");
    const modal = getHrefEditorModal()!;
    const shadowRoot = modal.shadowRoot!;
    await new Promise((r) => setTimeout(r, 100));

    const urlInput = shadowRoot.querySelector('input[type="url"]') as HTMLInputElement;
    urlInput.value = "https://example.com/updated";
    urlInput.dispatchEvent(new Event("input", { bubbles: true }));

    const targetSelect = shadowRoot.querySelector("select") as HTMLSelectElement;
    targetSelect.value = "_blank";
    targetSelect.dispatchEvent(new Event("change", { bubbles: true }));

    await new Promise((r) => setTimeout(r, 50));

    const applyBtn = Array.from(shadowRoot.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Apply",
    ) as HTMLButtonElement;
    applyBtn.click();

    await waitForCondition(() => getHrefEditorModal() === null);

    // Attributes changed
    expect(href.getAttribute("href")).toBe("https://example.com/updated");
    expect(href.target).toBe("_blank");
    // Inner HTML intact (icon + span still present)
    expect(href.innerHTML).toBe(originalInnerHTML);
    expect(href.querySelector('[data-testid="href-icon"]')).not.toBeNull();
    expect(href.querySelector('[data-testid="href-label"]')).not.toBeNull();
});

test("href with both data-scms-href and data-scms-text skips href and registers text", () => {
    // Scanner warns and registers only the first matching type (text, since it's
    // earlier in the priority list). The href attribute is ignored.
    const element = document.querySelector(
        '[data-scms-href="test-href-conflict"]',
    ) as HTMLAnchorElement;
    expect(element).not.toBeNull();
    // Still gets the editable class because data-scms-text registered it.
    expect(element.classList.contains("streamlined-editable")).toBe(true);
});

test("data-scms-href on a non-anchor element is skipped", () => {
    const bad = document.querySelector('[data-scms-href="test-href-nonanchor"]') as HTMLElement;
    expect(bad).not.toBeNull();
    // Not registered, so no editable class.
    expect(bad.classList.contains("streamlined-editable")).toBe(false);
});
