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
