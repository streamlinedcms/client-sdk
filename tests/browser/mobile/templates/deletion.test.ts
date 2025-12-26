/**
 * Template instance deletion tests
 *
 * Tests the deletion of template instances via mobile toolbar controls.
 */

import { test, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { setContent } from "~/@browser-support/test-helpers.js";
import {
    initializeSDK,
    waitForCondition,
    setupTestHelpers,
    generateTestAppId,
} from "~/@browser-support/sdk-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";

beforeAll(async () => {
    setupTestHelpers();
    const appId = generateTestAppId();

    // Set up team members - need at least 2 for delete to be allowed
    await setContent(appId, "team-delete.abc12.name", JSON.stringify({ type: "text", value: "Alice" }));
    await setContent(appId, "team-delete.abc12.role", JSON.stringify({ type: "text", value: "CEO" }));
    await setContent(appId, "team-delete.def34.name", JSON.stringify({ type: "text", value: "Bob" }));
    await setContent(appId, "team-delete.def34.role", JSON.stringify({ type: "text", value: "CTO" }));
    await setContent(appId, "team-delete.ghi56.name", JSON.stringify({ type: "text", value: "Charlie" }));
    await setContent(appId, "team-delete.ghi56.role", JSON.stringify({ type: "text", value: "CFO" }));
    await setContent(
        appId,
        "team-delete._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34", "ghi56"] })
    );

    await initializeSDK({ appId });

    // Wait for toolbar to detect mobile viewport and re-render
    const toolbar = document.querySelector("scms-toolbar");
    await waitForCondition(() => toolbar?.shadowRoot?.querySelector(".h-14") !== null);
});

beforeEach(async () => {
    // Small delay to ensure clean state
    await new Promise((r) => setTimeout(r, 50));
});

afterEach(async () => {
    // Collapse drawer first
    collapseDrawer();
    await new Promise((r) => setTimeout(r, 200));

    // Click body to deselect and wait for it to complete
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));
    await waitForCondition(() => {
        const selected = document.querySelector(".streamlined-selected");
        const editing = document.querySelector(".streamlined-editing");
        return selected === null && editing === null;
    });
});

afterAll(async () => {
    // Ensure clean state first
    collapseDrawer();
    await new Promise((r) => setTimeout(r, 200));
    document.body.click();
    await new Promise((r) => setTimeout(r, 200));

    // Restore instances for other tests that depend on team having multiple members
    while (getTeamMembers().length < 3) {
        const members = getTeamMembers();
        if (members.length === 0) break;
        const nameElement = members[0]?.querySelector('[data-scms-text="name"]') as HTMLElement;
        if (!nameElement) break;

        // Mobile: first click selects
        nameElement.click();
        await waitForCondition(() => nameElement.classList.contains("streamlined-selected"));

        await expandDrawer();
        const addBtn = findToolbarButton("Add Item");
        if (addBtn) {
            addBtn.click();
            await new Promise((r) => setTimeout(r, 300));
        }

        // Clean up for next iteration
        collapseDrawer();
        await new Promise((r) => setTimeout(r, 100));
        document.body.click();
        await new Promise((r) => setTimeout(r, 100));
    }
});

/**
 * Helper to get the toolbar
 */
function getToolbar(): Toolbar {
    return document.querySelector("scms-toolbar") as Toolbar;
}

/**
 * Helper to get team members
 */
function getTeamMembers(): NodeListOf<Element> {
    return document.querySelectorAll('[data-scms-template="team-delete"] .team-member');
}

/**
 * Get instance IDs in current DOM order
 */
function getInstanceOrder(): string[] {
    const members = getTeamMembers();
    return Array.from(members).map((m) => m.getAttribute("data-scms-instance") || "");
}

/**
 * Helper to select a template element
 */
async function selectTemplateElement(index: number): Promise<void> {
    const members = getTeamMembers();
    const nameElement = members[index]?.querySelector('[data-scms-text="name"]') as HTMLElement;
    nameElement.click();
    // Mobile uses two-step interaction: first tap selects, second tap edits
    // For template controls, we only need selection (not editing)
    await waitForCondition(() => nameElement.classList.contains("streamlined-selected"));
}

/**
 * Helper to expand the mobile drawer
 */
async function expandDrawer(): Promise<void> {
    const toolbar = getToolbar();
    const menuBtn = toolbar.shadowRoot?.querySelector('button[aria-label*="menu"]') as HTMLButtonElement;
    if (menuBtn && menuBtn.getAttribute("aria-label")?.includes("Open")) {
        menuBtn.click();
        await new Promise((r) => setTimeout(r, 100));
    }
}

/**
 * Helper to collapse the mobile drawer
 */
function collapseDrawer(): void {
    const toolbar = getToolbar();
    const menuBtn = toolbar.shadowRoot?.querySelector('button[aria-label*="menu"]') as HTMLButtonElement;
    if (menuBtn && menuBtn.getAttribute("aria-label")?.includes("Close")) {
        menuBtn.click();
    }
}

/**
 * Helper to find button in toolbar by text
 */
function findToolbarButton(text: string): HTMLButtonElement | null {
    const toolbar = getToolbar();
    const buttons = toolbar.shadowRoot?.querySelectorAll("button") || [];
    for (const btn of buttons) {
        if (btn.textContent?.includes(text)) {
            return btn;
        }
    }
    return null;
}

/**
 * Helper to click a toolbar button by text
 */
async function clickToolbarButton(text: string): Promise<void> {
    const btn = findToolbarButton(text);
    if (!btn) {
        throw new Error(`Button "${text}" not found`);
    }
    btn.click();
    await new Promise((r) => setTimeout(r, 200));
}

test("Delete button removes template instance", async () => {
    const initialCount = getTeamMembers().length;

    // Select middle instance
    await selectTemplateElement(1);
    await expandDrawer();

    // Click Delete
    await clickToolbarButton("Delete");

    // Wait for deletion to complete
    await new Promise((r) => setTimeout(r, 300));

    // Should have one fewer instance
    expect(getTeamMembers().length).toBe(initialCount - 1);
});

test("Delete removes correct instance", async () => {
    const initialOrder = getInstanceOrder();

    // Select first instance (abc12)
    await selectTemplateElement(0);
    await expandDrawer();

    // Click Delete
    await clickToolbarButton("Delete");
    await new Promise((r) => setTimeout(r, 300));

    // The first instance should be gone
    const newOrder = getInstanceOrder();
    expect(newOrder).not.toContain("abc12");
});

test("Delete sets hasChanges to true", async () => {
    const toolbar = getToolbar();

    // If only 1 instance left, add one first
    if (getTeamMembers().length <= 1) {
        await selectTemplateElement(0);
        await expandDrawer();
        await clickToolbarButton("Add Item");

        // Wait for new instance to be fully initialized with click handlers
        await new Promise((r) => setTimeout(r, 500));

        // Collapse and deselect before continuing
        collapseDrawer();
        await new Promise((r) => setTimeout(r, 100));
        document.body.click();
        await new Promise((r) => setTimeout(r, 200));
    }

    // Select an instance
    await selectTemplateElement(0);
    await expandDrawer();

    // Click Delete
    await clickToolbarButton("Delete");
    await new Promise((r) => setTimeout(r, 300));

    // Should have unsaved changes
    expect(toolbar.hasChanges).toBe(true);
});

test("cannot delete last remaining instance", async () => {
    // Delete instances until only one remains
    while (getTeamMembers().length > 1) {
        await selectTemplateElement(0);
        await expandDrawer();
        await clickToolbarButton("Delete");
        await new Promise((r) => setTimeout(r, 300));
        document.body.click();
        await new Promise((r) => setTimeout(r, 100));
    }

    // Now try to delete the last one
    const lastCount = getTeamMembers().length;
    expect(lastCount).toBe(1);

    await selectTemplateElement(0);
    await expandDrawer();

    // Click Delete - should not remove the last instance
    await clickToolbarButton("Delete");
    await new Promise((r) => setTimeout(r, 300));

    // Still should have 1 instance
    expect(getTeamMembers().length).toBe(1);
});
