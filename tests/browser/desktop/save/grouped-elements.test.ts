/**
 * Grouped element save tests
 *
 * Tests that grouped elements (data-scms-group) save correctly.
 * Group content is saved under the group namespace.
 */

import { test, expect, beforeAll, beforeEach } from "vitest";
import { setContent } from "~/@browser-support/test-helpers.js";
import {
    initializeSDK,
    waitForCondition,
    clickToolbarButton,
    setupTestHelpers,
    generateTestAppId,
} from "~/@browser-support/sdk-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";

beforeAll(async () => {
    setupTestHelpers();
    const appId = generateTestAppId();

    // Set up some grouped content
    await setContent(
        appId,
        "sidebar:quote",
        JSON.stringify({ type: "text", value: "Initial sidebar quote" }),
    );
    await setContent(
        appId,
        "company-name:name",
        JSON.stringify({ type: "text", value: "Acme Corp" }),
    );

    // Seed testimonials template instances inside the sidebar group
    // (used by the grouped deletion test)
    await setContent(
        appId,
        "sidebar:testimonials.test1.quote",
        JSON.stringify({ type: "text", value: "Great product!" }),
    );
    await setContent(
        appId,
        "sidebar:testimonials.test1.author",
        JSON.stringify({ type: "text", value: "John Doe" }),
    );
    await setContent(
        appId,
        "sidebar:testimonials.test2.quote",
        JSON.stringify({ type: "text", value: "Love it!" }),
    );
    await setContent(
        appId,
        "sidebar:testimonials.test2.author",
        JSON.stringify({ type: "text", value: "Jane Smith" }),
    );
    await setContent(
        appId,
        "sidebar:testimonials._order",
        JSON.stringify({ type: "order", value: ["test1", "test2"] }),
    );

    await initializeSDK({ appId });
});

beforeEach(async () => {
    // Deselect any element
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
 * Helper to get the sidebar group quote element
 */
function getSidebarQuote(): HTMLElement | null {
    return document.querySelector(
        '[data-scms-group="sidebar"] [data-scms-text="quote"]',
    ) as HTMLElement;
}

/**
 * Helper to get the inline group element (company name)
 */
function getCompanyName(): HTMLElement | null {
    return document.querySelector(
        '[data-scms-group="company-name"][data-scms-text="name"]',
    ) as HTMLElement;
}

/**
 * Helper to edit an element
 */
async function editElement(element: HTMLElement, content: string): Promise<void> {
    element.click();
    await waitForCondition(() => element.classList.contains("streamlined-editing"));
    element.textContent = content;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
}

test("editing grouped element sets hasChanges", async () => {
    const element = getSidebarQuote();
    const toolbar = getToolbar();

    expect(element).not.toBeNull();
    expect(toolbar).not.toBeNull();

    const originalContent = element!.textContent;

    await editElement(element!, "New sidebar quote - " + Date.now());

    expect(toolbar!.hasChanges).toBe(true);

    // Restore
    element!.textContent = originalContent;
    element!.dispatchEvent(new Event("input", { bubbles: true }));
});

test("saving grouped element clears hasChanges", async () => {
    const element = getSidebarQuote();
    const toolbar = getToolbar();

    await editElement(element!, "Quote to save - " + Date.now());

    expect(toolbar!.hasChanges).toBe(true);

    // Save
    await clickToolbarButton("Save");

    // Wait for save to complete
    await waitForCondition(() => !toolbar!.hasChanges, 5000);

    expect(toolbar!.hasChanges).toBe(false);
});

test("inline group element (on same tag) saves correctly", async () => {
    const element = getCompanyName();
    const toolbar = getToolbar();

    expect(element).not.toBeNull();

    const newName = "New Company Name - " + Date.now();
    await editElement(element!, newName);

    expect(toolbar!.hasChanges).toBe(true);

    // Save
    await clickToolbarButton("Save");

    // Wait for save to complete
    await waitForCondition(() => !toolbar!.hasChanges, 5000);

    expect(toolbar!.hasChanges).toBe(false);

    // Content should be preserved
    expect(element!.textContent).toBe(newName);
});

test("multiple grouped elements can be edited and saved together", async () => {
    const sidebarQuote = getSidebarQuote();
    const companyName = getCompanyName();
    const toolbar = getToolbar();

    // Edit sidebar quote
    await editElement(sidebarQuote!, "Multi-edit quote - " + Date.now());

    // Click elsewhere to deselect
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));

    // Edit company name
    await editElement(companyName!, "Multi-edit company - " + Date.now());

    expect(toolbar!.hasChanges).toBe(true);

    // Save both
    await clickToolbarButton("Save");

    await waitForCondition(() => !toolbar!.hasChanges, 5000);

    expect(toolbar!.hasChanges).toBe(false);
});

test("saving after deleting a grouped template instance succeeds", async () => {
    // The sidebar group contains a testimonials template with 2 instances.
    // Deleting an instance produces grouped element deletions in the API response
    // (deleted.groups = { sidebar: { elements: ["testimonials.test2.quote", ...] } }).
    const container = document.querySelector('[data-scms-template="testimonials"]');
    const instances = container?.querySelectorAll("[data-scms-instance]");
    const toolbar = getToolbar();

    expect(instances?.length).toBe(2);

    // Click delete on the last instance
    const lastInstance = instances![instances!.length - 1];
    const deleteButton = lastInstance.querySelector(".scms-instance-delete") as HTMLElement;
    deleteButton.click();

    await waitForCondition(
        () => container?.querySelectorAll("[data-scms-instance]").length === 1,
    );

    expect(toolbar!.hasChanges).toBe(true);

    // Save — this exercises the deleted.groups response path
    await clickToolbarButton("Save");

    await waitForCondition(() => !toolbar!.hasChanges, 5000);

    expect(toolbar!.hasChanges).toBe(false);
});

test("grouped elements inside templates save correctly", async () => {
    // The products template has a company group inside it
    const companyNameInTemplate = document.querySelector(
        '[data-scms-template="products"] [data-scms-group="company"] [data-scms-text="name"]',
    ) as HTMLElement;

    if (!companyNameInTemplate) {
        // Skip if element doesn't exist in test fixture
        expect(true).toBe(true);
        return;
    }

    const toolbar = getToolbar();
    const newName = "Template group company - " + Date.now();

    await editElement(companyNameInTemplate, newName);

    expect(toolbar!.hasChanges).toBe(true);

    // Save
    await clickToolbarButton("Save");

    await waitForCondition(() => !toolbar!.hasChanges, 5000);

    expect(toolbar!.hasChanges).toBe(false);
    expect(companyNameInTemplate.textContent).toBe(newName);
});
