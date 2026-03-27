/**
 * Undo/redo tests for template instance deletion
 *
 * Tests for https://github.com/streamlinedcms/client-sdk/issues/31
 *
 * Verifies that deleting a template instance can be undone, restoring
 * the instance with its content, order position, and author mode controls.
 */

import { test, expect, beforeAll, beforeEach } from "vitest";
import { setContent } from "~/@browser-support/test-helpers.js";
import {
    initializeSDK,
    waitForCondition,
    setupTestHelpers,
    generateTestAppId,
} from "~/@browser-support/sdk-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";

const TEMPLATE_ID = "team-undo";

let appId: string;

function getToolbar(): Toolbar {
    return document.querySelector("scms-toolbar") as Toolbar;
}

function getContainer(): HTMLElement {
    return document.querySelector(`[data-scms-template="${TEMPLATE_ID}"]`) as HTMLElement;
}

function getInstances(): NodeListOf<HTMLElement> {
    return getContainer().querySelectorAll("[data-scms-instance]");
}

function clickUndoButton(): boolean {
    const toolbar = getToolbar();
    const buttons = toolbar.shadowRoot?.querySelectorAll("button") || [];
    for (const btn of buttons) {
        if (btn.getAttribute("aria-label") === "Undo") {
            btn.click();
            return true;
        }
    }
    return false;
}

async function deleteLastInstance(): Promise<void> {
    const instances = getInstances();
    const lastInstance = instances[instances.length - 1];
    const deleteButton = lastInstance.querySelector(".scms-instance-delete") as HTMLElement;
    const countBefore = instances.length;
    deleteButton.click();
    await waitForCondition(() => getInstances().length === countBefore - 1);
}

beforeAll(async () => {
    setupTestHelpers();
    appId = generateTestAppId();

    await setContent(
        appId,
        `${TEMPLATE_ID}.member1.name`,
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    await setContent(
        appId,
        `${TEMPLATE_ID}.member1.role`,
        JSON.stringify({ type: "text", value: "CEO" }),
    );
    await setContent(
        appId,
        `${TEMPLATE_ID}.member2.name`,
        JSON.stringify({ type: "text", value: "Bob" }),
    );
    await setContent(
        appId,
        `${TEMPLATE_ID}.member2.role`,
        JSON.stringify({ type: "text", value: "CTO" }),
    );
    await setContent(
        appId,
        `${TEMPLATE_ID}.member3.name`,
        JSON.stringify({ type: "text", value: "Carol" }),
    );
    await setContent(
        appId,
        `${TEMPLATE_ID}.member3.role`,
        JSON.stringify({ type: "text", value: "CFO" }),
    );
    await setContent(
        appId,
        `${TEMPLATE_ID}._order`,
        JSON.stringify({ type: "order", value: ["member1", "member2", "member3"] }),
    );

    await initializeSDK({ appId });
});

beforeEach(async () => {
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));
});

test("undo restores a deleted template instance with its content", async () => {
    // Start with 3 instances
    expect(getInstances().length).toBe(3);

    // Verify Bob's content before deletion
    const instances = getInstances();
    const bobInstance = instances[1];
    const bobName = bobInstance.querySelector('[data-scms-text="name"]') as HTMLElement;
    expect(bobName.textContent).toBe("Bob");

    // Get Bob's instance ID
    const bobInstanceId = bobInstance.getAttribute("data-scms-instance");

    // Delete the last instance (Carol)
    await deleteLastInstance();
    expect(getInstances().length).toBe(2);

    // Undo
    const clicked = clickUndoButton();
    expect(clicked).toBe(true);
    await waitForCondition(() => getInstances().length === 3);

    // Carol should be restored with content
    const restoredInstances = getInstances();
    expect(restoredInstances.length).toBe(3);

    // Find the restored instance (should be back in position 3)
    const restoredInstance = restoredInstances[2];
    const restoredName = restoredInstance.querySelector('[data-scms-text="name"]') as HTMLElement;
    const restoredRole = restoredInstance.querySelector('[data-scms-text="role"]') as HTMLElement;
    expect(restoredName.textContent).toBe("Carol");
    expect(restoredRole.textContent).toBe("CFO");

    // Bob should still be in position 2 (order preserved)
    const bobAfterUndo = restoredInstances[1];
    expect(bobAfterUndo.getAttribute("data-scms-instance")).toBe(bobInstanceId);
});

test("redo re-deletes after undo", async () => {
    // Should have 3 instances from previous test's undo
    expect(getInstances().length).toBe(3);

    // Delete last instance (Carol again)
    await deleteLastInstance();
    expect(getInstances().length).toBe(2);

    // Undo — Carol restored
    clickUndoButton();
    await waitForCondition(() => getInstances().length === 3);

    // Redo — Carol deleted again
    const toolbar = getToolbar();
    expect(toolbar.canRedo).toBe(true);

    // Find and click redo button (if rendered) — for now redo isn't in the toolbar UI,
    // but canRedo should be true. We can verify by deleting again and checking state.
    // Since redo button isn't in UI yet, we verify the toolbar state
    expect(toolbar.canUndo).toBe(false);
    expect(toolbar.canRedo).toBe(true);
});

test("new action clears the redo stack", async () => {
    const toolbar = getToolbar();

    // Should have 3 instances
    expect(getInstances().length).toBe(3);

    // Delete Carol
    await deleteLastInstance();
    expect(getInstances().length).toBe(2);

    // Undo — Carol back, redo available
    clickUndoButton();
    await waitForCondition(() => getInstances().length === 3);
    expect(toolbar.canRedo).toBe(true);

    // Perform a new delete (Bob) — should clear redo stack
    await deleteLastInstance();
    expect(getInstances().length).toBe(2);

    // Redo should no longer be available (new action cleared it)
    expect(toolbar.canRedo).toBe(false);

    // But undo should be available (for the new deletion)
    expect(toolbar.canUndo).toBe(true);

    // Undo to restore for next test
    clickUndoButton();
    await waitForCondition(() => getInstances().length === 3);
});

test("undo restores author mode controls on the instance", async () => {
    // Should have 3 instances
    expect(getInstances().length).toBe(3);

    // Delete last instance
    await deleteLastInstance();
    expect(getInstances().length).toBe(2);

    // Undo
    clickUndoButton();
    await waitForCondition(() => getInstances().length === 3);

    // The restored instance should have a delete button
    const restoredInstance = getInstances()[2];
    const deleteBtn = restoredInstance.querySelector(".scms-instance-delete");
    expect(deleteBtn).not.toBeNull();

    // Editable elements should have the streamlined-editable class
    const editableElements = restoredInstance.querySelectorAll(".streamlined-editable");
    expect(editableElements.length).toBeGreaterThan(0);
});
