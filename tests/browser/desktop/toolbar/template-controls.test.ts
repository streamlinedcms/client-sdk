/**
 * Browser tests for toolbar template controls.
 * Tests enter editing mode and interact with the toolbar.
 */

import { test, expect, beforeAll, afterAll } from "vitest";
import { setContent } from "../support/test-helpers.js";
import {
    initializeSDK,
    waitForCondition,
    clickToolbarButton,
    setupTestHelpers,
    
} from "../support/sdk-helpers.js";

beforeAll(async () => {
    setupTestHelpers();

    // Set up team with 3 members for move/reorder tests
    await setContent("test-app", "team.abc12.name", JSON.stringify({ type: "text", value: "Alice" }));
    await setContent("test-app", "team.def34.name", JSON.stringify({ type: "text", value: "Bob" }));
    await setContent("test-app", "team.ghi56.name", JSON.stringify({ type: "text", value: "Carol" }));
    await setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34", "ghi56"] }),
    );

    await initializeSDK();
});


test("toolbar shows template controls when editing element inside template", async () => {
    // Click on a template element
    const teamMembers = document.querySelectorAll('[data-scms-template="team"] .team-member');
    const firstName = teamMembers[0].querySelector('[data-scms-text="name"]') as HTMLElement;
    firstName.click();

    await waitForCondition(() => firstName.getAttribute("contenteditable") === "true");

    // Template controls should be visible in toolbar
    const toolbar = document.querySelector("scms-toolbar");
    const shadowRoot = toolbar?.shadowRoot;

    const moveUpButton = shadowRoot?.querySelector("button[title='Move up']");
    const moveDownButton = shadowRoot?.querySelector("button[title='Move down']");
    const addButton = shadowRoot?.querySelector("button[title='Add item']");
    const deleteButton = shadowRoot?.querySelector("button[title='Delete item']");

    expect(moveUpButton).not.toBeNull();
    expect(moveDownButton).not.toBeNull();
    expect(addButton).not.toBeNull();
    expect(deleteButton).not.toBeNull();
});

test("toolbar template controls are hidden when editing non-template element", async () => {
    // Click on a non-template element
    const testTitle = document.querySelector('[data-scms-html="test-title"]') as HTMLElement;
    testTitle.click();

    await waitForCondition(() => testTitle.getAttribute("contenteditable") === "true");

    // Template controls should NOT be visible in toolbar
    const toolbar = document.querySelector("scms-toolbar");
    const shadowRoot = toolbar?.shadowRoot;

    const moveUpButton = shadowRoot?.querySelector("button[title='Move up']");
    expect(moveUpButton).toBeNull();
});

test("toolbar move up button is disabled for first instance", async () => {
    // Click on first instance
    const teamMembers = document.querySelectorAll('[data-scms-template="team"] .team-member');
    const firstName = teamMembers[0].querySelector('[data-scms-text="name"]') as HTMLElement;
    firstName.click();

    await waitForCondition(() => firstName.getAttribute("contenteditable") === "true");

    // Move up button should be disabled
    const toolbar = document.querySelector("scms-toolbar");
    const moveUpButton = toolbar?.shadowRoot?.querySelector(
        "button[title='Move up']",
    ) as HTMLButtonElement;
    expect(moveUpButton.disabled).toBe(true);
});

test("toolbar move down button is disabled for last instance", async () => {
    // Click on last instance
    const teamMembers = document.querySelectorAll('[data-scms-template="team"] .team-member');
    const lastName = teamMembers[teamMembers.length - 1].querySelector('[data-scms-text="name"]') as HTMLElement;
    lastName.click();

    await waitForCondition(() => lastName.getAttribute("contenteditable") === "true");

    // Move down button should be disabled
    const toolbar = document.querySelector("scms-toolbar");
    const moveDownButton = toolbar?.shadowRoot?.querySelector(
        "button[title='Move down']",
    ) as HTMLButtonElement;
    expect(moveDownButton.disabled).toBe(true);
});

test("toolbar move up button reorders instance", async () => {
    let teamMembers = document.querySelectorAll('[data-scms-template="team"] .team-member');

    // Click on second instance to select it
    const secondName = teamMembers[1].querySelector('[data-scms-text="name"]') as HTMLElement;
    secondName.click();

    await waitForCondition(() => secondName.getAttribute("contenteditable") === "true");

    // Click move up button in toolbar
    const toolbar = document.querySelector("scms-toolbar");
    const moveUpButton = toolbar?.shadowRoot?.querySelector("button[title='Move up']") as HTMLElement;
    moveUpButton.click();

    await new Promise((r) => setTimeout(r, 100));

    // Order should now have second item first
    teamMembers = document.querySelectorAll('[data-scms-template="team"] .team-member');
    // The element that was second should now be first
    expect(teamMembers[0].querySelector('[data-scms-text="name"]')?.textContent).toBe("Bob");
});

test("toolbar move down button reorders instance", async () => {
    let teamMembers = document.querySelectorAll('[data-scms-template="team"] .team-member');

    // Click on first instance to select it (which is now Bob after previous test)
    const firstName = teamMembers[0].querySelector('[data-scms-text="name"]') as HTMLElement;
    firstName.click();

    await waitForCondition(() => firstName.getAttribute("contenteditable") === "true");

    // Click move down button in toolbar
    const toolbar = document.querySelector("scms-toolbar");
    const moveDownButton = toolbar?.shadowRoot?.querySelector(
        "button[title='Move down']",
    ) as HTMLElement;
    moveDownButton.click();

    await new Promise((r) => setTimeout(r, 100));

    // Bob should now be second again
    teamMembers = document.querySelectorAll('[data-scms-template="team"] .team-member');
    expect(teamMembers[1].querySelector('[data-scms-text="name"]')?.textContent).toBe("Bob");
});

test("toolbar add button creates new instance", async () => {
    const teamContainer = document.querySelector('[data-scms-template="team"]');
    const initialCount = teamContainer?.querySelectorAll(".team-member").length ?? 0;

    // Click on an instance to select it
    const teamMembers = teamContainer?.querySelectorAll(".team-member");
    const firstName = teamMembers?.[0].querySelector('[data-scms-text="name"]') as HTMLElement;
    firstName.click();

    await waitForCondition(() => firstName.getAttribute("contenteditable") === "true");

    // Click add button in toolbar
    const toolbar = document.querySelector("scms-toolbar");
    const addButton = toolbar?.shadowRoot?.querySelector("button[title='Add item']") as HTMLElement;
    addButton.click();

    await waitForCondition(
        () => teamContainer?.querySelectorAll(".team-member").length === initialCount + 1,
    );

    // Now should have one more instance
    expect(teamContainer?.querySelectorAll(".team-member").length).toBe(initialCount + 1);
});

test("toolbar delete button removes current instance", async () => {
    const teamContainer = document.querySelector('[data-scms-template="team"]');
    const initialCount = teamContainer?.querySelectorAll(".team-member").length ?? 0;

    // Click on last instance to select it
    let teamMembers = teamContainer?.querySelectorAll(".team-member");
    const lastName = teamMembers?.[teamMembers.length - 1].querySelector('[data-scms-text="name"]') as HTMLElement;
    lastName.click();

    await waitForCondition(() => lastName.getAttribute("contenteditable") === "true");

    // Click delete button in toolbar
    const toolbar = document.querySelector("scms-toolbar");
    const deleteButton = toolbar?.shadowRoot?.querySelector(
        "button[title='Delete item']",
    ) as HTMLElement;
    deleteButton.click();

    await waitForCondition(
        () => teamContainer?.querySelectorAll(".team-member").length === initialCount - 1,
    );

    // Should have one fewer instance
    expect(teamContainer?.querySelectorAll(".team-member").length).toBe(initialCount - 1);
});

test("reorder is saved and persists after save", async () => {
    let teamMembers = document.querySelectorAll('[data-scms-template="team"] .team-member');
    const firstMemberName = teamMembers[0].querySelector('[data-scms-text="name"]')?.textContent;

    // Click on second instance and move up
    const secondName = teamMembers[1].querySelector('[data-scms-text="name"]') as HTMLElement;
    secondName.click();
    await waitForCondition(() => secondName.getAttribute("contenteditable") === "true");

    const toolbar = document.querySelector("scms-toolbar");
    const moveUpButton = toolbar?.shadowRoot?.querySelector("button[title='Move up']") as HTMLElement;
    moveUpButton.click();

    await new Promise((r) => setTimeout(r, 100));

    // Verify new order
    teamMembers = document.querySelectorAll('[data-scms-template="team"] .team-member');
    const newFirstName = teamMembers[0].querySelector('[data-scms-text="name"]')?.textContent;

    // First name should have changed (second is now first)
    expect(newFirstName).not.toBe(firstMemberName);

    // Save changes (helper waits for Lit re-render)
    await clickToolbarButton("Save");

    // Wait for save to complete
    await new Promise((r) => setTimeout(r, 500));

    // Order should still be the new order
    teamMembers = document.querySelectorAll('[data-scms-template="team"] .team-member');
    expect(teamMembers[0].querySelector('[data-scms-text="name"]')?.textContent).toBe(newFirstName);
});
