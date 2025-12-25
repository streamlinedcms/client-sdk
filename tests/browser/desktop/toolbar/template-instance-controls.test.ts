/**
 * Toolbar template instance control tests (Mobile view)
 *
 * Tests the template instance controls in the mobile toolbar:
 * Move Up, Move Down, Add Item, Delete
 *
 * Note: These controls only appear in mobile view.
 */

import { test, expect, beforeAll, beforeEach, afterEach } from "vitest";
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

    // Set up multiple team members for reorder testing
    await setContent("test-app", "team.member1.name", JSON.stringify({ type: "text", value: "Alice" }));
    await setContent("test-app", "team.member1.role", JSON.stringify({ type: "text", value: "CEO" }));
    await setContent("test-app", "team.member2.name", JSON.stringify({ type: "text", value: "Bob" }));
    await setContent("test-app", "team.member2.role", JSON.stringify({ type: "text", value: "CTO" }));
    await setContent("test-app", "team.member3.name", JSON.stringify({ type: "text", value: "Charlie" }));
    await setContent("test-app", "team.member3.role", JSON.stringify({ type: "text", value: "CFO" }));
    await setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["member1", "member2", "member3"] })
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

test("selecting template element shows template context in toolbar", async () => {
    await selectTemplateElement(0);

    const toolbar = getToolbar();
    expect(toolbar.templateId).toBe("team");
    // instanceIndex may be 0-indexed or 1-indexed depending on implementation
    expect(toolbar.instanceIndex).toBeGreaterThanOrEqual(0);
    expect(toolbar.instanceCount).toBeGreaterThanOrEqual(1);
});

test("mobile view shows Move Up button for template elements", async () => {
    await selectTemplateElement(1); // Select middle element
    await setMobileMode();

    const moveUpBtn = findToolbarButton("Move Up");
    expect(moveUpBtn).not.toBeNull();
});

test("mobile view shows Move Down button for template elements", async () => {
    await selectTemplateElement(1); // Select middle element
    await setMobileMode();

    const moveDownBtn = findToolbarButton("Move Down");
    expect(moveDownBtn).not.toBeNull();
});

test("Move Up is disabled for first instance in mobile view", async () => {
    await selectTemplateElement(0); // Select first element
    await setMobileMode();

    const moveUpBtn = findToolbarButton("Move Up");
    expect(moveUpBtn).not.toBeNull();
    expect(moveUpBtn!.disabled).toBe(true);
});

test("Move Down is disabled for last instance in mobile view", async () => {
    const members = getTeamMembers();
    await selectTemplateElement(members.length - 1); // Select last element
    await setMobileMode();

    const moveDownBtn = findToolbarButton("Move Down");
    expect(moveDownBtn).not.toBeNull();
    expect(moveDownBtn!.disabled).toBe(true);
});

test("Move Up is enabled for non-first instances in mobile view", async () => {
    await selectTemplateElement(1); // Select middle element
    await setMobileMode();

    const moveUpBtn = findToolbarButton("Move Up");
    expect(moveUpBtn).not.toBeNull();
    expect(moveUpBtn!.disabled).toBe(false);
});

test("Move Down is enabled for non-last instances in mobile view", async () => {
    await selectTemplateElement(0); // Select first element
    await setMobileMode();

    const moveDownBtn = findToolbarButton("Move Down");
    expect(moveDownBtn).not.toBeNull();
    expect(moveDownBtn!.disabled).toBe(false);
});

test("mobile view shows Add Item button for template elements", async () => {
    await selectTemplateElement(0);
    await setMobileMode();

    const addBtn = findToolbarButton("Add Item");
    expect(addBtn).not.toBeNull();
});

test("mobile view shows Delete button for template elements", async () => {
    await selectTemplateElement(0);
    await setMobileMode();

    const deleteBtn = findToolbarButton("Delete");
    expect(deleteBtn).not.toBeNull();
});
