/**
 * Tests that the "Click to edit" placeholder appears whenever an editable
 * element has no visible content, so the element retains a clickable area.
 *
 * Regression test for https://github.com/streamlinedcms/client-sdk/issues/85
 *
 * Covers all four editable types and exercises the cases where the DOM is
 * not literally `:empty` after deletion: stray <br> from contenteditable,
 * Tiptap's empty <p>/<span> wrappers, etc. The acceptance criterion is the
 * presence of the `streamlined-empty` class (which the placeholder CSS rule
 * keys off) — that's the same signal the user would see in the rendered UI.
 */

import { test, expect, beforeAll, afterEach } from "vitest";
import { userEvent } from "@vitest/browser/context";
import {
    initializeSDK,
    waitForCondition,
    setupTestHelpers,
    generateTestAppId,
} from "~/@browser-support/sdk-helpers.js";

let appId: string;

function getEl(attr: string, id: string): HTMLElement {
    return document.querySelector(`[${attr}="${id}"]`) as HTMLElement;
}

function selectAll(el: HTMLElement): void {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
}

async function deleteAll(el: HTMLElement): Promise<void> {
    selectAll(el);
    await userEvent.keyboard("{Delete}");
    // Tiptap commits via debounced onUpdate; give it a tick.
    await new Promise((r) => setTimeout(r, 100));
}

beforeAll(async () => {
    setupTestHelpers();
    appId = generateTestAppId();
    await initializeSDK({ appId });
});

afterEach(async () => {
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));
});

// ---------------------------------------------------------------------------
// Initial state — non-empty elements should NOT have the empty class
// ---------------------------------------------------------------------------

test("non-empty elements do not have streamlined-empty on init", () => {
    expect(
        getEl("data-scms-text", "placeholder-text").classList.contains("streamlined-empty"),
    ).toBe(false);
    expect(
        getEl("data-scms-html", "placeholder-html").classList.contains("streamlined-empty"),
    ).toBe(false);
    expect(
        getEl("data-scms-link", "placeholder-link").classList.contains("streamlined-empty"),
    ).toBe(false);
    expect(
        getEl("data-scms-html", "placeholder-inline-html").classList.contains("streamlined-empty"),
    ).toBe(false);
});

// ---------------------------------------------------------------------------
// data-scms-text: contenteditable leaves a stray <br>
// ---------------------------------------------------------------------------

test("text element gets streamlined-empty after deleting all characters", async () => {
    const el = getEl("data-scms-text", "placeholder-text");
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    await deleteAll(el);

    expect(el.classList.contains("streamlined-empty")).toBe(true);
});

// ---------------------------------------------------------------------------
// data-scms-html: Tiptap leaves <p></p> / <span><br></span>
// ---------------------------------------------------------------------------

test("block html element gets streamlined-empty after deleting all characters", async () => {
    const el = getEl("data-scms-html", "placeholder-html");
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    await deleteAll(el);

    expect(el.classList.contains("streamlined-empty")).toBe(true);
});

test("inline html element gets streamlined-empty after deleting all characters", async () => {
    const el = getEl("data-scms-html", "placeholder-inline-html");
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    await deleteAll(el);

    expect(el.classList.contains("streamlined-empty")).toBe(true);
});

// ---------------------------------------------------------------------------
// data-scms-link: also Tiptap-backed
// ---------------------------------------------------------------------------

test("link element gets streamlined-empty after deleting all characters", async () => {
    const el = getEl("data-scms-link", "placeholder-link");
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    await deleteAll(el);

    expect(el.classList.contains("streamlined-empty")).toBe(true);
});

// ---------------------------------------------------------------------------
// Re-typing removes the empty class
// ---------------------------------------------------------------------------

test("typing into an empty element clears streamlined-empty", async () => {
    const el = getEl("data-scms-text", "placeholder-text");
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    await deleteAll(el);
    expect(el.classList.contains("streamlined-empty")).toBe(true);

    await userEvent.keyboard("Hello");
    await new Promise((r) => setTimeout(r, 100));

    expect(el.classList.contains("streamlined-empty")).toBe(false);
});

test("typing then re-deleting toggles streamlined-empty back on", async () => {
    const el = getEl("data-scms-html", "placeholder-html");
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    await deleteAll(el);
    expect(el.classList.contains("streamlined-empty")).toBe(true);

    await userEvent.keyboard("More");
    await new Promise((r) => setTimeout(r, 100));
    expect(el.classList.contains("streamlined-empty")).toBe(false);

    await deleteAll(el);
    expect(el.classList.contains("streamlined-empty")).toBe(true);
});
