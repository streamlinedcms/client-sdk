/**
 * Toolbar template instance control tests (Mobile view)
 *
 * Tests the template instance controls in the mobile toolbar:
 * Move Up, Move Down, Add Item, Delete
 *
 * These controls appear in the mobile expanded drawer.
 */

import { test, expect, beforeAll, beforeEach, afterEach } from "vitest";
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

    // Set up multiple team members for reorder testing
    await setContent(appId, "team.member1.name", JSON.stringify({ type: "text", value: "Alice" }));
    await setContent(appId, "team.member1.role", JSON.stringify({ type: "text", value: "CEO" }));
    await setContent(appId, "team.member2.name", JSON.stringify({ type: "text", value: "Bob" }));
    await setContent(appId, "team.member2.role", JSON.stringify({ type: "text", value: "CTO" }));
    await setContent(
        appId,
        "team.member3.name",
        JSON.stringify({ type: "text", value: "Charlie" }),
    );
    await setContent(appId, "team.member3.role", JSON.stringify({ type: "text", value: "CFO" }));
    await setContent(
        appId,
        "team._order",
        JSON.stringify({ type: "order", value: ["member1", "member2", "member3"] }),
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
 * Helper to select a template element
 */
async function selectTemplateElement(index: number): Promise<void> {
    const members = getTeamMembers();
    const nameElement = members[index]?.querySelector('[data-scms-text="name"]') as HTMLElement;

    // Check if element is already selected/editing
    const alreadyActive =
        nameElement.classList.contains("streamlined-selected") ||
        nameElement.classList.contains("streamlined-editing");

    if (alreadyActive) {
        // Already active, just verify toolbar has template context
        const toolbar = getToolbar();
        await waitForCondition(() => toolbar.templateId !== null);
        return;
    }

    nameElement.click();
    // Mobile uses two-step interaction: first tap selects, second tap edits
    // For template controls, we only need selection (not editing)
    await waitForCondition(
        () =>
            nameElement.classList.contains("streamlined-selected") ||
            nameElement.classList.contains("streamlined-editing"),
    );
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

test("selecting template element shows template context in toolbar", async () => {
    await selectTemplateElement(0);

    const toolbar = getToolbar();
    expect(toolbar.templateId).toBe("team");
    expect(toolbar.instanceIndex).toBeGreaterThanOrEqual(0);
    expect(toolbar.instanceCount).toBeGreaterThanOrEqual(1);
});

test("expanded drawer shows Move Up button for template elements", async () => {
    await selectTemplateElement(1); // Select middle element
    await expandDrawer();

    const moveUpBtn = findToolbarButton("Move Up");
    expect(moveUpBtn).not.toBeNull();
});

test("expanded drawer shows Move Down button for template elements", async () => {
    await selectTemplateElement(1); // Select middle element
    await expandDrawer();

    const moveDownBtn = findToolbarButton("Move Down");
    expect(moveDownBtn).not.toBeNull();
});

test("Move Up is disabled for first instance", async () => {
    await selectTemplateElement(0); // Select first element
    await expandDrawer();

    const moveUpBtn = findToolbarButton("Move Up");
    expect(moveUpBtn).not.toBeNull();
    expect(moveUpBtn!.disabled).toBe(true);
});

test("Move Down is disabled for last instance", async () => {
    const members = getTeamMembers();
    await selectTemplateElement(members.length - 1); // Select last element
    await expandDrawer();

    const moveDownBtn = findToolbarButton("Move Down");
    expect(moveDownBtn).not.toBeNull();
    expect(moveDownBtn!.disabled).toBe(true);
});

test("Move Up is enabled for non-first instances", async () => {
    await selectTemplateElement(1); // Select middle element
    await expandDrawer();

    const moveUpBtn = findToolbarButton("Move Up");
    expect(moveUpBtn).not.toBeNull();
    expect(moveUpBtn!.disabled).toBe(false);
});

test("Move Down is enabled for non-last instances", async () => {
    await selectTemplateElement(0); // Select first element
    await expandDrawer();

    const moveDownBtn = findToolbarButton("Move Down");
    expect(moveDownBtn).not.toBeNull();
    expect(moveDownBtn!.disabled).toBe(false);
});

test("expanded drawer shows Add Item button for template elements", async () => {
    await selectTemplateElement(0);
    await expandDrawer();

    const addBtn = findToolbarButton("Add Item");
    expect(addBtn).not.toBeNull();
});

test("expanded drawer shows Delete button for template elements", async () => {
    await selectTemplateElement(0);
    await expandDrawer();

    const deleteBtn = findToolbarButton("Delete");
    expect(deleteBtn).not.toBeNull();
});
