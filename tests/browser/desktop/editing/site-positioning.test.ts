/**
 * Edit mode keeps the site's positioning
 *
 * Turning on editing must not change the page's layout: an editable element
 * or template item the site positions keeps its positioning. Template items
 * the site leaves unpositioned are positioned only while their controls
 * show, so the controls can sit in the item's corner.
 *
 * Regression test for: https://github.com/streamlinedcms/client-sdk/issues/105
 */

import { test, expect, beforeAll } from "vitest";
import {
    initializeSDK,
    waitForCondition,
    setupTestHelpers,
    generateTestAppId,
} from "~/@browser-support/sdk-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";

function getItems(templateId: string): HTMLElement[] {
    return Array.from(
        document.querySelectorAll<HTMLElement>(
            `[data-scms-template="${templateId}"] > [data-scms-instance]`,
        ),
    );
}

function position(element: Element): string {
    return getComputedStyle(element).position;
}

async function setMode(mode: "author" | "viewer"): Promise<void> {
    const toolbar = document.querySelector("scms-toolbar") as Toolbar;
    toolbar.dispatchEvent(new CustomEvent("mode-change", { detail: { mode } }));
    await waitForCondition(() => toolbar.mode === mode);
}

beforeAll(async () => {
    setupTestHelpers();
    await initializeSDK({ appId: generateTestAppId() });
});

test("an editable element the site positions keeps its positioning", () => {
    const element = document.querySelector('[data-scms-text="positioned-text"]')!;
    expect(element.classList.contains("streamlined-editable")).toBe(true);
    expect(position(element)).toBe("absolute");
});

test("template items the site positions keep their positioning, with controls inside", () => {
    const items = getItems("positioned-items");
    expect(items).toHaveLength(2);
    for (const item of items) {
        expect(position(item)).toBe("absolute");
        expect(item.querySelector(".scms-instance-delete")).not.toBeNull();
    }
});

test("unpositioned template items are positioned only while editing", async () => {
    const items = getItems("unpositioned-items");
    expect(items).toHaveLength(2);
    for (const item of items) {
        expect(item.querySelector(".scms-instance-delete")).not.toBeNull();
        expect(position(item)).toBe("relative");
    }

    await setMode("viewer");
    for (const item of items) {
        expect(item.querySelector(".scms-instance-delete")).toBeNull();
        expect(position(item)).toBe("static");
        expect(item.getAttribute("style") ?? "").toBe("");
    }

    await setMode("author");
    await waitForCondition(() =>
        items.every((item) => item.querySelector(".scms-instance-delete")),
    );
    for (const item of items) {
        expect(position(item)).toBe("relative");
    }
});

test("an item's own inline style survives editing", async () => {
    const items = getItems("styled-items");
    for (const item of items) {
        expect(position(item)).toBe("relative");
    }

    await setMode("viewer");
    for (const item of items) {
        expect(position(item)).toBe("static");
        expect(item.style.color).toBe("red");
        expect(item.style.position).toBe("");
    }
    await setMode("author");
    await waitForCondition(() =>
        items.every((item) => item.querySelector(".scms-instance-delete")),
    );
});

test("items added while editing are positioned for their controls", async () => {
    const container = document.querySelector('[data-scms-template="unpositioned-items"]')!;
    (container.querySelector(".scms-template-add") as HTMLElement).click();
    await waitForCondition(() => getItems("unpositioned-items").length === 3);

    const added = getItems("unpositioned-items")[2];
    expect(added.querySelector(".scms-instance-delete")).not.toBeNull();
    expect(position(added)).toBe("relative");
});

test("deleting down to one item removes its positioning, and adding one restores it", async () => {
    while (getItems("unpositioned-items").length > 1) {
        const items = getItems("unpositioned-items");
        (items[items.length - 1].querySelector(".scms-instance-delete") as HTMLElement).click();
        await waitForCondition(() => getItems("unpositioned-items").length === items.length - 1);
    }
    const [survivor] = getItems("unpositioned-items");
    expect(survivor.querySelector(".scms-instance-delete")).toBeNull();
    expect(position(survivor)).toBe("static");

    const container = document.querySelector('[data-scms-template="unpositioned-items"]')!;
    (container.querySelector(".scms-template-add") as HTMLElement).click();
    await waitForCondition(() => getItems("unpositioned-items").length === 2);
    for (const item of getItems("unpositioned-items")) {
        expect(item.querySelector(".scms-instance-delete")).not.toBeNull();
        expect(position(item)).toBe("relative");
    }
});

test("the mismatch warning sits on its item while editing and is gone in Preview", async () => {
    const [, mismatched] = getItems("mismatched-editable");
    expect(mismatched.hasAttribute("data-scms-structure-mismatch")).toBe(true);
    // The item is itself the editable element, so it gets no inline controls
    expect(mismatched.querySelector(".scms-instance-delete")).toBeNull();
    expect(getComputedStyle(mismatched, "::after").content).not.toBe("none");
    expect(position(mismatched)).toBe("relative");

    await setMode("viewer");
    expect(getComputedStyle(mismatched, "::after").content).toBe("none");
    expect(getComputedStyle(mismatched).outlineStyle).toBe("none");
    expect(position(mismatched)).toBe("static");
    await setMode("author");
});
