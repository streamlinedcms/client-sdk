/**
 * Toolbar element selection tests
 *
 * Tests toolbar behavior when selecting different element types.
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

test("toolbar shows activeElement when element is selected", async () => {
    const toolbar = getToolbar();
    const element = document.querySelector('[data-scms-html="test-title"]') as HTMLElement;

    element.click();
    await waitForCondition(() => element.classList.contains("streamlined-editing"));

    expect(toolbar?.activeElement).toBe("test-title");
});

test("toolbar clears activeElement when clicking outside", async () => {
    const toolbar = getToolbar();
    const element = document.querySelector('[data-scms-html="test-title"]') as HTMLElement;

    element.click();
    await waitForCondition(() => element.classList.contains("streamlined-editing"));
    expect(toolbar?.activeElement).toBe("test-title");

    document.body.click();
    await new Promise((r) => setTimeout(r, 100));

    expect(toolbar?.activeElement).toBeNull();
});

test("selecting different elements updates toolbar", async () => {
    const toolbar = getToolbar();
    const htmlElement = document.querySelector('[data-scms-html="test-title"]') as HTMLElement;
    const linkElement = document.querySelector('[data-scms-link="test-link"]') as HTMLElement;

    // Select HTML element
    htmlElement.click();
    await waitForCondition(() => htmlElement.classList.contains("streamlined-editing"));
    expect(toolbar?.activeElementType).toBe("html");

    // Click outside first
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));

    // Select link element
    linkElement.click();
    await waitForCondition(() => linkElement.classList.contains("streamlined-editing"));
    expect(toolbar?.activeElementType).toBe("link");
});

test("toolbar element badge shows element ID", async () => {
    const toolbar = getToolbar();
    const element = document.querySelector('[data-scms-html="test-title"]') as HTMLElement;

    element.click();
    await waitForCondition(() => element.classList.contains("streamlined-editing"));

    const shadowRoot = toolbar!.shadowRoot!;
    const badge = shadowRoot.querySelector("scms-element-badge");
    expect(badge).not.toBeNull();
});

test("mode is set to author when SDK initializes with mock auth", async () => {
    const toolbar = getToolbar();
    expect(toolbar?.mode).toBe("author");
});

test("mode toggle exists in toolbar", async () => {
    const toolbar = getToolbar();
    const shadowRoot = toolbar!.shadowRoot!;

    const modeToggle = shadowRoot.querySelector("scms-mode-toggle");
    expect(modeToggle).not.toBeNull();
});

test("template context shows when editing template element", async () => {
    const toolbar = getToolbar();

    // Get a template element (name field in team template)
    const templateElement = document.querySelector(
        '[data-scms-template="team"] [data-scms-text="name"]',
    ) as HTMLElement;

    templateElement.click();
    await waitForCondition(() => templateElement.classList.contains("streamlined-editing"));

    // Template context should be set
    expect(toolbar?.templateId).toBe("team");
    expect(toolbar?.instanceId).not.toBeNull();
});

test("template context is cleared when clicking outside", async () => {
    const toolbar = getToolbar();

    const templateElement = document.querySelector(
        '[data-scms-template="team"] [data-scms-text="name"]',
    ) as HTMLElement;

    templateElement.click();
    await waitForCondition(() => templateElement.classList.contains("streamlined-editing"));
    expect(toolbar?.templateId).toBe("team");

    document.body.click();
    await new Promise((r) => setTimeout(r, 100));

    expect(toolbar?.templateId).toBeNull();
});
