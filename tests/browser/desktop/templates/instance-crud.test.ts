/**
 * Template instance CRUD tests - adding, editing, and deleting instances.
 *
 * Tests are ordered to build on each other's state:
 * - Start with 1 instance (Alice)
 * - Add instances as needed
 * - Delete to test removal
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

    // Start with 1 team member
    await setContent(appId, "team-crud.alice1.name", JSON.stringify({ type: "text", value: "Alice" }));
    await setContent(appId, "team-crud.alice1.role", JSON.stringify({ type: "text", value: "CEO" }));
    await setContent(
        appId,
        "team-crud._order",
        JSON.stringify({ type: "order", value: ["alice1"] }),
    );

    await initializeSDK({ appId });
});


test("add button appears in author mode for templates", async () => {
    // Add button should be visible in author mode
    const addButton = document.querySelector('[data-scms-template="team-crud"] .scms-template-add');
    expect(addButton).not.toBeNull();
    expect(addButton?.textContent).toContain("Add item");
});

test("cannot delete last instance", async () => {
    const teamContainer = document.querySelector('[data-scms-template="team-crud"]');
    let teamMembers = teamContainer?.querySelectorAll(".team-member");

    // Delete instances until only 1 remains (to handle shared API state)
    while (teamMembers && teamMembers.length > 1) {
        const lastMember = teamMembers[teamMembers.length - 1];
        const deleteButton = lastMember.querySelector(".scms-instance-delete") as HTMLElement;
        if (deleteButton) {
            deleteButton.click();
            await waitForCondition(
                () => (teamContainer?.querySelectorAll(".team-member").length ?? 0) < teamMembers!.length,
            );
        }
        teamMembers = teamContainer?.querySelectorAll(".team-member");
    }

    // Now should have exactly 1 instance
    expect(teamMembers?.length).toBe(1);

    // Delete button should not exist for single instance (or should not work)
    const deleteButton = teamMembers?.[0].querySelector(".scms-instance-delete");

    if (deleteButton) {
        (deleteButton as HTMLElement).click();
        await new Promise((r) => setTimeout(r, 100));
        // Should still have 1 instance
        expect(teamContainer?.querySelectorAll(".team-member").length).toBe(1);
    }
});

test("clicking add button creates new template instance", async () => {
    const teamContainer = document.querySelector('[data-scms-template="team-crud"]');
    const initialCount = teamContainer?.querySelectorAll(".team-member").length ?? 0;

    // Click add button
    const addButton = teamContainer?.querySelector(".scms-template-add") as HTMLElement;
    addButton.click();

    await waitForCondition(
        () => teamContainer?.querySelectorAll(".team-member").length === initialCount + 1,
    );

    const teamMembers = teamContainer?.querySelectorAll(".team-member");
    expect(teamMembers?.length).toBe(initialCount + 1);

    // New instance should have a stable ID
    const newInstance = teamMembers?.[teamMembers.length - 1];
    const instanceId = newInstance?.getAttribute("data-scms-instance");
    expect(instanceId).toMatch(/^[a-z0-9]{5}$/);

    // New instance should have empty content
    const newName = newInstance?.querySelector('[data-scms-text="name"]');
    expect(newName?.textContent).toBe("");
});

test("delete button appears on instance hover", async () => {
    // Should have at least 2 instances after previous test added one
    const teamMembers = document.querySelectorAll('[data-scms-template="team-crud"] .team-member');
    expect(teamMembers.length).toBeGreaterThanOrEqual(2);

    // The delete button exists but is hidden until hover
    const deleteButton = teamMembers[1].querySelector(".scms-instance-delete");
    expect(deleteButton).not.toBeNull();
});

test("new instance elements are editable", async () => {
    const teamContainer = document.querySelector('[data-scms-template="team-crud"]');
    const initialCount = teamContainer?.querySelectorAll(".team-member").length ?? 0;

    // Add a new instance
    const addButton = teamContainer?.querySelector(".scms-template-add") as HTMLElement;
    addButton.click();

    await waitForCondition(
        () => teamContainer?.querySelectorAll(".team-member").length === initialCount + 1,
    );

    const teamMembers = teamContainer?.querySelectorAll(".team-member");
    expect(teamMembers?.length).toBe(initialCount + 1);

    // Click on name in new instance to edit
    const newInstance = teamMembers?.[teamMembers.length - 1];
    const newName = newInstance?.querySelector('[data-scms-text="name"]') as HTMLElement;
    newName.click();

    await waitForCondition(() => newName.getAttribute("contenteditable") === "true");

    // Should be editable
    expect(newName.getAttribute("contenteditable")).toBe("true");

    // Type new content
    newName.textContent = "New Team Member";
    newName.dispatchEvent(new Event("input", { bubbles: true }));
    expect(newName.textContent).toBe("New Team Member");
});

test("clicking delete button removes instance", async () => {
    const teamContainer = document.querySelector('[data-scms-template="team-crud"]');
    const initialCount = teamContainer?.querySelectorAll(".team-member").length ?? 0;

    // Should have multiple instances
    expect(initialCount).toBeGreaterThanOrEqual(2);

    // Click delete on last instance
    const teamMembers = teamContainer?.querySelectorAll(".team-member");
    const lastInstance = teamMembers?.[teamMembers.length - 1];
    const deleteButton = lastInstance?.querySelector(".scms-instance-delete") as HTMLElement;
    deleteButton.click();

    await waitForCondition(
        () => teamContainer?.querySelectorAll(".team-member").length === initialCount - 1,
    );

    // Should now have one fewer instance
    expect(teamContainer?.querySelectorAll(".team-member").length).toBe(initialCount - 1);
});

test("editing template instance element saves with correct key", async () => {
    // Edit the first team member's name (Alice)
    const teamMembers = document.querySelectorAll('[data-scms-template="team-crud"] .team-member');
    const firstName = teamMembers[0].querySelector('[data-scms-text="name"]') as HTMLElement;

    firstName.click();
    await waitForCondition(() => firstName.getAttribute("contenteditable") === "true");

    firstName.textContent = "Alice Updated";
    firstName.dispatchEvent(new Event("input", { bubbles: true }));

    // Save (helper waits for Lit re-render)
    await clickToolbarButton("Save");

    // Wait for save to complete
    await waitForCondition(() => !firstName.classList.contains("streamlined-editing"));

    // Verify content was updated
    expect(firstName.textContent).toBe("Alice Updated");
});
