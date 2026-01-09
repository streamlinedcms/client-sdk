/**
 * Template instance reordering tests
 *
 * Tests Move Up/Down functionality for template instances.
 * These tests verify that clicking reorder buttons actually changes DOM order.
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

    // Set up team members for reorder testing
    await setContent(
        appId,
        "team-reorder.abc12.name",
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    await setContent(
        appId,
        "team-reorder.abc12.role",
        JSON.stringify({ type: "text", value: "CEO" }),
    );
    await setContent(
        appId,
        "team-reorder.def34.name",
        JSON.stringify({ type: "text", value: "Bob" }),
    );
    await setContent(
        appId,
        "team-reorder.def34.role",
        JSON.stringify({ type: "text", value: "CTO" }),
    );
    await setContent(
        appId,
        "team-reorder.ghi56.name",
        JSON.stringify({ type: "text", value: "Charlie" }),
    );
    await setContent(
        appId,
        "team-reorder.ghi56.role",
        JSON.stringify({ type: "text", value: "CFO" }),
    );
    await setContent(
        appId,
        "team-reorder._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34", "ghi56"] }),
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
    // Ensure clean state before restoring order
    collapseDrawer();
    await new Promise((r) => setTimeout(r, 200));
    document.body.click();
    await new Promise((r) => setTimeout(r, 200));

    // Restore original order for other tests
    const targetOrder = ["abc12", "def34", "ghi56"];

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
                await expandDrawer();
                await clickToolbarButton("Move Up");
                await new Promise((r) => setTimeout(r, 200));

                // Clean up after move
                collapseDrawer();
                await new Promise((r) => setTimeout(r, 100));
                document.body.click();
                await new Promise((r) => setTimeout(r, 100));
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
    return document.querySelectorAll('[data-scms-template="team-reorder"] .team-member');
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
    const menuBtn = toolbar.shadowRoot?.querySelector(
        'button[aria-label*="menu"]',
    ) as HTMLButtonElement;
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
    const menuBtn = toolbar.shadowRoot?.querySelector(
        'button[aria-label*="menu"]',
    ) as HTMLButtonElement;
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

test("Move Down changes DOM order", async () => {
    const initialOrder = getInstanceOrder();
    expect(initialOrder).toEqual(["abc12", "def34", "ghi56"]);

    // Select first instance
    await selectTemplateElement(0);
    await expandDrawer();

    // Click Move Down
    await clickToolbarButton("Move Down");

    // Wait for reorder to complete
    await new Promise((r) => setTimeout(r, 200));

    // Check new order - first instance should now be second
    const newOrder = getInstanceOrder();
    expect(newOrder).toEqual(["def34", "abc12", "ghi56"]);
});

test("Move Up changes DOM order", async () => {
    // Select second instance (abc12 which was moved)
    await selectTemplateElement(1);
    await expandDrawer();

    // Click Move Up
    await clickToolbarButton("Move Up");
    await new Promise((r) => setTimeout(r, 200));

    // Should be back to original order
    const newOrder = getInstanceOrder();
    expect(newOrder).toEqual(["abc12", "def34", "ghi56"]);
});

test("Move Down from middle moves instance down", async () => {
    // Select middle instance (def34 at index 1)
    await selectTemplateElement(1);
    await expandDrawer();

    // Click Move Down
    await clickToolbarButton("Move Down");
    await new Promise((r) => setTimeout(r, 200));

    // Middle instance should now be last
    const newOrder = getInstanceOrder();
    expect(newOrder).toEqual(["abc12", "ghi56", "def34"]);
});

test("Move Up from last position works", async () => {
    // Select last instance (def34 which is now at index 2)
    await selectTemplateElement(2);
    await expandDrawer();

    // Click Move Up
    await clickToolbarButton("Move Up");
    await new Promise((r) => setTimeout(r, 200));

    // Should move up one position
    const newOrder = getInstanceOrder();
    expect(newOrder).toEqual(["abc12", "def34", "ghi56"]);
});

test("reordering sets hasChanges to true", async () => {
    const toolbar = getToolbar();

    // Select middle instance
    await selectTemplateElement(1);
    await expandDrawer();

    // Click Move Down
    await clickToolbarButton("Move Down");
    await new Promise((r) => setTimeout(r, 200));

    // Should have unsaved changes
    expect(toolbar.hasChanges).toBe(true);
});

test("toolbar updates instanceIndex after move", async () => {
    const toolbar = getToolbar();

    // Restore order first
    await selectTemplateElement(2); // def34 is last
    await expandDrawer();
    await clickToolbarButton("Move Up");
    await new Promise((r) => setTimeout(r, 200));

    // Clean up before next operation
    collapseDrawer();
    await new Promise((r) => setTimeout(r, 100));
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));

    // Now select first instance
    await selectTemplateElement(0);
    await expandDrawer();

    // Move down
    await clickToolbarButton("Move Down");
    await new Promise((r) => setTimeout(r, 200));

    // Clean up before verification
    collapseDrawer();
    await new Promise((r) => setTimeout(r, 100));
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));

    // After moving down, instanceIndex should increase
    // (Need to re-select to see updated index since we moved)
    await selectTemplateElement(1); // The moved element is now at index 1
    expect(toolbar.instanceIndex).toBe(1);
});
