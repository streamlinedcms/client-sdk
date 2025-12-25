/**
 * Link element editing tests
 *
 * Tests the link element selection, text editing, and toolbar behavior.
 */

import { test, expect, beforeAll, beforeEach } from "vitest";
import {
    initializeSDK,
    waitForCondition,
    clickToolbarButton,
    setupTestHelpers,
} from "~/@browser-support/sdk-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";

beforeAll(async () => {
    setupTestHelpers();
    await initializeSDK();
});

beforeEach(async () => {
    // Deselect any selected element
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
 * Helper to get the test link element
 */
function getLinkElement(): HTMLAnchorElement {
    return document.querySelector('[data-scms-link="test-link"]') as HTMLAnchorElement;
}

test("clicking link element selects it", async () => {
    const link = getLinkElement();

    link.click();

    await waitForCondition(() => link.classList.contains("streamlined-editing"));

    expect(link.classList.contains("streamlined-editing")).toBe(true);
});

test("toolbar shows element type for link", async () => {
    const link = getLinkElement();
    const toolbar = getToolbar();

    link.click();
    await waitForCondition(() => link.classList.contains("streamlined-editing"));

    expect(toolbar?.activeElementType).toBe("link");
});

test("link can be selected for editing", async () => {
    const link = getLinkElement();

    link.click();
    await waitForCondition(() => link.classList.contains("streamlined-editing"));

    // Link element should be in editing state
    expect(link.classList.contains("streamlined-editing")).toBe(true);

    // Toolbar should show link controls
    const toolbar = getToolbar();
    expect(toolbar?.activeElementType).toBe("link");
});

test("toolbar shows Edit Link button for link elements", async () => {
    const link = getLinkElement();
    const toolbar = getToolbar();

    link.click();
    await waitForCondition(() => link.classList.contains("streamlined-editing"));

    const shadowRoot = toolbar!.shadowRoot!;
    const buttons = shadowRoot.querySelectorAll("button");

    let hasEditLinkButton = false;
    for (const btn of buttons) {
        if (btn.textContent?.includes("Edit Link")) {
            hasEditLinkButton = true;
            break;
        }
    }

    expect(hasEditLinkButton).toBe(true);
});

test("toolbar shows SEO button for link elements", async () => {
    const link = getLinkElement();
    const toolbar = getToolbar();

    link.click();
    await waitForCondition(() => link.classList.contains("streamlined-editing"));

    const shadowRoot = toolbar!.shadowRoot!;
    const buttons = shadowRoot.querySelectorAll("button");

    let hasSeoButton = false;
    for (const btn of buttons) {
        if (btn.textContent?.includes("SEO")) {
            hasSeoButton = true;
            break;
        }
    }

    expect(hasSeoButton).toBe(true);
});

test("clicking outside deselects link element", async () => {
    const link = getLinkElement();

    link.click();
    await waitForCondition(() => link.classList.contains("streamlined-editing"));

    // Click outside
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));

    expect(link.classList.contains("streamlined-editing")).toBe(false);
});

test("link element gets streamlined-editable class", async () => {
    const link = getLinkElement();

    // Link should have the editable class from SDK initialization
    expect(link.classList.contains("streamlined-editable")).toBe(true);
});

test("link href is preserved when editing text", async () => {
    const link = getLinkElement();
    const originalHref = link.href;

    link.click();
    await waitForCondition(() => link.classList.contains("streamlined-editing"));

    // Edit the text
    link.textContent = "New Link Text";
    link.dispatchEvent(new Event("input", { bubbles: true }));

    // href should be unchanged
    expect(link.href).toBe(originalHref);
});
