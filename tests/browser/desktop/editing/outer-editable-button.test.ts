/**
 * Outer-editable navigation button tests
 *
 * When a nested editable fills its parent's interior (e.g. data-scms-html as
 * the immediate child of data-scms-href), the outer editable can't be clicked
 * directly. The toolbar exposes a "select outer" button for these cases.
 */

import { test, expect, beforeAll, beforeEach } from "vitest";
import {
    initializeSDK,
    waitForCondition,
    setupTestHelpers,
} from "~/@browser-support/sdk-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";

beforeAll(async () => {
    setupTestHelpers();
    await initializeSDK();
});

beforeEach(async () => {
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));
});

function getToolbar(): Toolbar {
    return document.querySelector("scms-toolbar") as Toolbar;
}

function getWrapperHref(): HTMLAnchorElement {
    return document.querySelector('[data-scms-href="test-href-wrapper"]') as HTMLAnchorElement;
}

function getWrappedHtml(): HTMLElement {
    return document.querySelector('[data-scms-html="test-wrapped-html"]') as HTMLElement;
}

function findButton(text: string): HTMLButtonElement | null {
    const toolbar = getToolbar();
    const buttons = toolbar.shadowRoot!.querySelectorAll("button");
    for (const btn of buttons) {
        const label = btn.getAttribute("aria-label") ?? btn.textContent?.trim() ?? "";
        if (label.includes(text)) return btn as HTMLButtonElement;
    }
    return null;
}

test("outer-select button is hidden when there's no outer editable", async () => {
    // test-link has no editable ancestor
    const link = document.querySelector('[data-scms-link="test-link"]') as HTMLAnchorElement;
    link.click();
    await waitForCondition(() => link.classList.contains("streamlined-editing"));

    await new Promise((r) => setTimeout(r, 50));
    expect(getToolbar().hasOuterEditable).toBe(false);
    expect(findButton("Select outer element")).toBeNull();
});

test("outer-select button is shown when selection has an editable ancestor", async () => {
    const innerHtml = getWrappedHtml();
    innerHtml.click();
    await waitForCondition(() => innerHtml.classList.contains("streamlined-editing"));

    await new Promise((r) => setTimeout(r, 50));
    expect(getToolbar().hasOuterEditable).toBe(true);
    expect(findButton("Select outer element")).not.toBeNull();
});

test("clicking outer-select button selects the editable ancestor", async () => {
    const innerHtml = getWrappedHtml();
    const outerHref = getWrapperHref();

    innerHtml.click();
    await waitForCondition(() => innerHtml.classList.contains("streamlined-editing"));

    await new Promise((r) => setTimeout(r, 50));
    const button = findButton("Select outer element");
    expect(button).not.toBeNull();
    button!.click();

    await waitForCondition(() => outerHref.classList.contains("streamlined-editing"));
    expect(getToolbar().activeElementType).toBe("href");
    // The inner html is no longer the active editing target.
    expect(innerHtml.classList.contains("streamlined-editing")).toBe(false);
});

test("outer-select button is hidden again at the top of the chain", async () => {
    const innerHtml = getWrappedHtml();
    const outerHref = getWrapperHref();

    innerHtml.click();
    await waitForCondition(() => innerHtml.classList.contains("streamlined-editing"));

    await new Promise((r) => setTimeout(r, 50));
    findButton("Select outer element")!.click();
    await waitForCondition(() => outerHref.classList.contains("streamlined-editing"));

    await new Promise((r) => setTimeout(r, 50));
    // href has no editable ancestor, so the button disappears.
    expect(getToolbar().hasOuterEditable).toBe(false);
    expect(findButton("Select outer element")).toBeNull();
});
