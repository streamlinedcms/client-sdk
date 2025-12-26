/**
 * Instance-editable tests - when the template instance element IS the editable element
 * (e.g., <li data-scms-text="item"> where <li> is both instance and editable)
 */

import { test, expect, beforeAll, afterAll } from "vitest";
import { setContent } from "~/@browser-support/test-helpers.js";
import {
    initializeSDK,
    waitForCondition,
    clickToolbarButton,
    setupTestHelpers,
    generateTestAppId,
} from "~/@browser-support/sdk-helpers.js";

beforeAll(async () => {
    setupTestHelpers();
    const appId = generateTestAppId();

    // Set up checklist with 2 items
    await setContent(
        appId,
        "checklist.task1.item",
        JSON.stringify({ type: "text", value: "Buy groceries" }),
    );
    await setContent(
        appId,
        "checklist.task2.item",
        JSON.stringify({ type: "text", value: "Walk the dog" }),
    );
    await setContent(
        appId,
        "checklist._order",
        JSON.stringify({ type: "order", value: ["task1", "task2"] }),
    );

    // Features template: 3 items from API for the "adding saves existing" test
    await setContent(
        appId,
        "features.feat1.feature",
        JSON.stringify({ type: "text", value: "Feature One" }),
    );
    await setContent(
        appId,
        "features.feat2.feature",
        JSON.stringify({ type: "text", value: "Feature Two" }),
    );
    await setContent(
        appId,
        "features.feat3.feature",
        JSON.stringify({ type: "text", value: "Feature Three" }),
    );
    await setContent(
        appId,
        "features._order",
        JSON.stringify({ type: "order", value: ["feat1", "feat2", "feat3"] }),
    );

    await initializeSDK({ appId });
});


test("template instance that is also the editable element gets proper instance ID", async () => {
    // The checklist template has <li data-scms-text="item"> where the <li> is both instance and editable
    const checklistContainer = document.querySelector('[data-scms-template="checklist"]');
    const items = checklistContainer?.querySelectorAll("li");

    // Should have 2 items from API
    expect(items?.length).toBe(2);

    // Each <li> should have a data-scms-instance attribute assigned
    expect(items?.[0].getAttribute("data-scms-instance")).toBe("task1");
    expect(items?.[1].getAttribute("data-scms-instance")).toBe("task2");
});

test("template instance that is also the editable element is editable", async () => {
    const checklistContainer = document.querySelector('[data-scms-template="checklist"]');
    const items = checklistContainer?.querySelectorAll("li");

    // Each <li> should have the streamlined-editable class
    for (let i = 0; i < (items?.length ?? 0); i++) {
        expect(items?.[i].classList.contains("streamlined-editable")).toBe(true);
    }
});

test("clicking template instance that is also editable starts editing", async () => {
    const checklistContainer = document.querySelector('[data-scms-template="checklist"]');
    const firstItem = checklistContainer?.querySelector("li") as HTMLElement;

    // Click to start editing
    firstItem.click();
    await waitForCondition(() => firstItem.getAttribute("contenteditable") === "true");

    // Should be contenteditable
    expect(firstItem.getAttribute("contenteditable")).toBe("true");

    // Should have editing class
    expect(firstItem.classList.contains("streamlined-editing")).toBe(true);
});

test("template instance=editable loads content from API", async () => {
    const checklistContainer = document.querySelector('[data-scms-template="checklist"]');
    const items = checklistContainer?.querySelectorAll("li");

    // Should have 2 instances from API
    expect(items?.length).toBe(2);

    // Content should match API data (use textContent, may include delete button text)
    expect(items?.[0].textContent).toContain("Buy groceries");
    expect(items?.[1].textContent).toContain("Walk the dog");
});

test("adding new instance works when instance=editable", async () => {
    const checklistContainer = document.querySelector('[data-scms-template="checklist"]');
    const initialCount = checklistContainer?.querySelectorAll("li").length ?? 0;

    // Click add button
    const addButton = checklistContainer?.querySelector(".scms-template-add") as HTMLElement;
    addButton.click();

    await waitForCondition(() => checklistContainer?.querySelectorAll("li").length === initialCount + 1);

    const items = checklistContainer?.querySelectorAll("li");
    expect(items?.length).toBe(initialCount + 1);

    // New instance should have instance ID
    const newItem = items?.[items.length - 1];
    const newInstanceId = newItem?.getAttribute("data-scms-instance");
    expect(newInstanceId).toMatch(/^[a-z0-9]{5}$/);

    // New instance should be editable
    expect(newItem?.classList.contains("streamlined-editable")).toBe(true);
});

test("editing and saving instance=editable element works", async () => {
    const checklistContainer = document.querySelector('[data-scms-template="checklist"]');
    const firstItem = checklistContainer?.querySelector("li") as HTMLElement;

    // Click to edit
    firstItem.click();
    await waitForCondition(() => firstItem.getAttribute("contenteditable") === "true");

    // Edit content
    firstItem.textContent = "Updated task";
    firstItem.dispatchEvent(new Event("input", { bubbles: true }));

    // Save (helper waits for Lit re-render)
    await clickToolbarButton("Save");

    // Wait for save to complete
    await waitForCondition(() => !firstItem.classList.contains("streamlined-editing"));

    // Verify content was updated
    expect(firstItem.textContent).toBe("Updated task");
});

test("adding new instance saves existing HTML-derived items", async () => {
    // The features template has 3 items from API
    const featuresContainer = document.querySelector('[data-scms-template="features"]');
    const initialCount = featuresContainer?.querySelectorAll(".feature-item").length ?? 0;

    // Should have 3 items initially
    expect(initialCount).toBe(3);

    // Add a new instance
    const addButton = featuresContainer?.querySelector(".scms-template-add") as HTMLElement;
    addButton.click();

    await waitForCondition(
        () => featuresContainer?.querySelectorAll(".feature-item").length === initialCount + 1,
    );

    const featureItems = featuresContainer?.querySelectorAll(".feature-item");
    expect(featureItems?.length).toBe(initialCount + 1);

    // Edit the new item
    const newFeature = featureItems?.[featureItems.length - 1].querySelector('[data-scms-text="feature"]') as HTMLElement;
    newFeature.click();
    await waitForCondition(() => newFeature.getAttribute("contenteditable") === "true");

    newFeature.textContent = "Feature Four";
    newFeature.dispatchEvent(new Event("input", { bubbles: true }));

    // Save (helper waits for Lit re-render)
    await clickToolbarButton("Save");

    // Wait for save to complete
    await waitForCondition(() => !newFeature.classList.contains("streamlined-editing"));

    // Verify all items are present
    const finalItems = featuresContainer?.querySelectorAll(".feature-item");
    expect(finalItems?.length).toBe(initialCount + 1);
});
