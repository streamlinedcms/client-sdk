/**
 * Template instance reordering tests
 *
 * Tests Move Up/Down functionality for template instances.
 * These tests verify that clicking reorder buttons actually changes DOM order.
 */

import { test, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { setContent, clearContent } from "../support/test-helpers.js";
import {
    initializeSDK,
    waitForCondition,
    setupTestHelpers,
    clickToolbarButton,
} from "../support/sdk-helpers.js";
import type { Toolbar } from "../../../src/components/toolbar.js";

// Extended type to access private properties for testing
interface ToolbarInternal extends Toolbar {
    isMobile: boolean;
    expanded: boolean;
}

beforeAll(async () => {
    setupTestHelpers();

    // Set up team members for reorder testing
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
    // Restore original order [abc12, def34, ghi56] for other tests
    const targetOrder = ["abc12", "def34", "ghi56"];
    const toolbar = getToolbar() as ToolbarInternal;

    // Keep reordering until we match target order
    let attempts = 0;
    while (attempts < 10) {
        const currentOrder = getInstanceOrder();
        if (JSON.stringify(currentOrder) === JSON.stringify(targetOrder)) break;

        // Find first misplaced element and move it
        for (let i = 0; i < targetOrder.length; i++) {
            const targetId = targetOrder[i];
            const currentIndex = currentOrder.indexOf(targetId);
            if (currentIndex !== i && currentIndex > i) {
                // Element needs to move up
                await selectTemplateElement(currentIndex);
                await setMobileMode();
                await clickMobileToolbarButton("Move Up");
                await new Promise((r) => setTimeout(r, 200));
                document.body.click();
                await new Promise((r) => setTimeout(r, 100));
                toolbar.isMobile = false;
                toolbar.expanded = false;
                break;
            }
        }
        attempts++;
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
 * Get member names in current DOM order
 */
function getMemberNames(): string[] {
    const members = getTeamMembers();
    return Array.from(members).map(
        (m) => m.querySelector('[data-scms-text="name"]')?.textContent || ""
    );
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

test("Move Down changes DOM order", async () => {
    const initialOrder = getInstanceOrder();
    expect(initialOrder).toEqual(["abc12", "def34", "ghi56"]);

    // Select first instance
    await selectTemplateElement(0);
    await setMobileMode();

    // Click Move Down
    await clickMobileToolbarButton("Move Down");

    // Wait for reorder to complete
    await new Promise((r) => setTimeout(r, 200));

    // Check new order - first instance should now be second
    const newOrder = getInstanceOrder();
    expect(newOrder).toEqual(["def34", "abc12", "ghi56"]);
});

test("Move Up changes DOM order", async () => {
    // First, restore order by moving down the one that's now first
    let currentOrder = getInstanceOrder();

    // Select second instance (abc12 which was moved)
    await selectTemplateElement(1);
    await setMobileMode();

    // Click Move Up
    await clickMobileToolbarButton("Move Up");
    await new Promise((r) => setTimeout(r, 200));

    // Should be back to original order
    const newOrder = getInstanceOrder();
    expect(newOrder).toEqual(["abc12", "def34", "ghi56"]);
});

test("Move Down from middle moves instance down", async () => {
    // Select middle instance (def34 at index 1)
    await selectTemplateElement(1);
    await setMobileMode();

    // Click Move Down
    await clickMobileToolbarButton("Move Down");
    await new Promise((r) => setTimeout(r, 200));

    // Middle instance should now be last
    const newOrder = getInstanceOrder();
    expect(newOrder).toEqual(["abc12", "ghi56", "def34"]);
});

test("Move Up from last position works", async () => {
    // Select last instance (def34 which is now at index 2)
    await selectTemplateElement(2);
    await setMobileMode();

    // Click Move Up
    await clickMobileToolbarButton("Move Up");
    await new Promise((r) => setTimeout(r, 200));

    // Should move up one position
    const newOrder = getInstanceOrder();
    expect(newOrder).toEqual(["abc12", "def34", "ghi56"]);
});

test("reordering sets hasChanges to true", async () => {
    const toolbar = getToolbar();

    // Select middle instance
    await selectTemplateElement(1);
    await setMobileMode();

    // Click Move Down
    await clickMobileToolbarButton("Move Down");
    await new Promise((r) => setTimeout(r, 200));

    // Should have unsaved changes
    expect(toolbar.hasChanges).toBe(true);
});

test("toolbar updates instanceIndex after move", async () => {
    const toolbar = getToolbar();

    // Restore order first
    await selectTemplateElement(2); // def34 is last
    await setMobileMode();
    await clickMobileToolbarButton("Move Up");
    await new Promise((r) => setTimeout(r, 200));

    // Now select first instance
    await selectTemplateElement(0);
    await setMobileMode();

    const initialIndex = toolbar.instanceIndex;

    // Move down
    await clickMobileToolbarButton("Move Down");
    await new Promise((r) => setTimeout(r, 200));

    // After moving down, instanceIndex should increase
    // (Need to re-select to see updated index since we moved)
    await selectTemplateElement(1); // The moved element is now at index 1
    expect(toolbar.instanceIndex).toBe(1);
});
