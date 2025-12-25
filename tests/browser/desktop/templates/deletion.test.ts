/**
 * Template instance deletion tests
 *
 * Tests the deletion of template instances via toolbar controls.
 */

import { test, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { setContent } from "../support/test-helpers.js";
import {
    initializeSDK,
    waitForCondition,
    setupTestHelpers,
} from "../support/sdk-helpers.js";
import type { Toolbar } from "../../../src/components/toolbar.js";

// Extended type to access private properties for testing
interface ToolbarInternal extends Toolbar {
    isMobile: boolean;
    expanded: boolean;
}

beforeAll(async () => {
    setupTestHelpers();

    // Set up team members - need at least 2 for delete to be allowed
    await setContent("test-app", "team.abc12.name", JSON.stringify({ type: "text", value: "Alice" }));
    await setContent("test-app", "team.abc12.role", JSON.stringify({ type: "text", value: "CEO" }));
    await setContent("test-app", "team.def34.name", JSON.stringify({ type: "text", value: "Bob" }));
    await setContent("test-app", "team.def34.role", JSON.stringify({ type: "text", value: "CTO" }));
    await setContent("test-app", "team.ghi56.name", JSON.stringify({ type: "text", value: "Charlie" }));
    await setContent("test-app", "team.ghi56.role", JSON.stringify({ type: "text", value: "CFO" }));
    await setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34", "ghi56"] })
    );

    await initializeSDK();
});

beforeEach(async () => {
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));
});

afterEach(async () => {
    // Reset to desktop mode
    const toolbar = getToolbar() as ToolbarInternal;
    toolbar.isMobile = false;
    toolbar.expanded = false;
    await new Promise((r) => setTimeout(r, 100));
});

afterAll(async () => {
    // Restore instances for other tests that depend on team having multiple members
    // Add instances until we have at least 3
    const toolbar = getToolbar() as ToolbarInternal;
    while (getTeamMembers().length < 3) {
        const members = getTeamMembers();
        if (members.length === 0) break;
        const nameElement = members[0]?.querySelector('[data-scms-text="name"]') as HTMLElement;
        if (!nameElement) break;
        nameElement.click();
        await waitForCondition(() => nameElement.classList.contains("streamlined-editing"));
        toolbar.isMobile = true;
        toolbar.expanded = true;
        await new Promise((r) => setTimeout(r, 100));
        const addBtn = findToolbarButton("Add Item");
        if (addBtn) {
            addBtn.click();
            await new Promise((r) => setTimeout(r, 300));
        }
        document.body.click();
        await new Promise((r) => setTimeout(r, 100));
        toolbar.isMobile = false;
        toolbar.expanded = false;
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
    return document.querySelectorAll('[data-scms-template="team"] .team-member');
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
    await waitForCondition(() => nameElement.classList.contains("streamlined-editing"));
}

/**
 * Helper to set mobile mode and expand drawer
 */
async function setMobileMode(): Promise<void> {
    const toolbar = getToolbar() as ToolbarInternal;
    toolbar.isMobile = true;
    toolbar.expanded = true;
    await new Promise((r) => setTimeout(r, 100));
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
async function clickMobileToolbarButton(text: string): Promise<void> {
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
    await setMobileMode();

    // Click Delete
    await clickMobileToolbarButton("Delete");

    // Wait for deletion to complete
    await new Promise((r) => setTimeout(r, 300));

    // Should have one fewer instance
    expect(getTeamMembers().length).toBe(initialCount - 1);
});

test("Delete removes correct instance", async () => {
    const initialOrder = getInstanceOrder();

    // Select first instance (abc12)
    await selectTemplateElement(0);
    await setMobileMode();

    // Click Delete
    await clickMobileToolbarButton("Delete");
    await new Promise((r) => setTimeout(r, 300));

    // The first instance should be gone
    const newOrder = getInstanceOrder();
    expect(newOrder).not.toContain("abc12");
});

test("Delete sets hasChanges to true", async () => {
    const toolbar = getToolbar();

    // If only 1 instance left, add one first
    if (getTeamMembers().length <= 1) {
        // Need to add instance - select and use Add Item
        await selectTemplateElement(0);
        await setMobileMode();
        await clickMobileToolbarButton("Add Item");
        await new Promise((r) => setTimeout(r, 300));
    }

    // Select an instance
    await selectTemplateElement(0);
    await setMobileMode();

    // Click Delete
    await clickMobileToolbarButton("Delete");
    await new Promise((r) => setTimeout(r, 300));

    // Should have unsaved changes
    expect(toolbar.hasChanges).toBe(true);
});

test("cannot delete last remaining instance", async () => {
    // Delete instances until only one remains
    while (getTeamMembers().length > 1) {
        await selectTemplateElement(0);
        await setMobileMode();
        await clickMobileToolbarButton("Delete");
        await new Promise((r) => setTimeout(r, 300));
        document.body.click();
        await new Promise((r) => setTimeout(r, 100));
    }

    // Now try to delete the last one
    const lastCount = getTeamMembers().length;
    expect(lastCount).toBe(1);

    await selectTemplateElement(0);
    await setMobileMode();

    // Click Delete - should not remove the last instance
    await clickMobileToolbarButton("Delete");
    await new Promise((r) => setTimeout(r, 300));

    // Still should have 1 instance
    expect(getTeamMembers().length).toBe(1);
});
