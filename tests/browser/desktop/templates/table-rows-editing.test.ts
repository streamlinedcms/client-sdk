/**
 * Table-row templates in the editor
 *
 * An editor must be able to add a row to a template whose items are table
 * rows and save it, and rows matching the template must not be flagged as
 * having a different structure.
 *
 * Regression test for: https://github.com/streamlinedcms/client-sdk/issues/106
 */

import { test, expect, beforeAll } from "vitest";
import { getContent } from "~/@browser-support/test-helpers.js";
import {
    initializeSDK,
    waitForCondition,
    clickToolbarButton,
    setElementContent,
    setupTestHelpers,
    generateTestAppId,
} from "~/@browser-support/sdk-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";

const TEMPLATE_ID = "table-rows";

let appId: string;

function getToolbar(): Toolbar {
    return document.querySelector("scms-toolbar") as Toolbar;
}

function getRows(templateId: string): HTMLTableRowElement[] {
    return Array.from(
        document.querySelectorAll<HTMLTableRowElement>(`[data-scms-template="${templateId}"] > tr`),
    );
}

beforeAll(async () => {
    setupTestHelpers();
    appId = generateTestAppId();
    await initializeSDK({ appId });
});

test("Add item adds a table row with the template's cells", async () => {
    expect(getRows(TEMPLATE_ID)).toHaveLength(1);

    const addButton = document.querySelector(
        `[data-scms-template="${TEMPLATE_ID}"] .scms-template-add`,
    ) as HTMLElement;
    addButton.click();
    await waitForCondition(() => getRows(TEMPLATE_ID).length === 2);

    const added = getRows(TEMPLATE_ID)[1];
    expect(added.getAttribute("data-scms-instance")).toBeTruthy();
    expect(
        Array.from(added.querySelectorAll("td")).map((cell) => cell.getAttribute("data-scms-text")),
    ).toEqual(["name", "role"]);
});

test("an added row's edits are saved under its own ID", async () => {
    const added = getRows(TEMPLATE_ID)[1];
    const instanceId = added.getAttribute("data-scms-instance")!;
    const nameCell = added.querySelector('[data-scms-text="name"]') as HTMLElement;

    nameCell.click();
    await waitForCondition(() => nameCell.classList.contains("streamlined-editing"));
    setElementContent(nameCell, "Added Name");
    await new Promise((r) => setTimeout(r, 100));

    expect(await clickToolbarButton("Save")).toBe(true);
    await waitForCondition(() => !getToolbar().hasChanges, 5000);

    const stored = JSON.parse((await getContent(appId, `${TEMPLATE_ID}.${instanceId}.name`))!);
    expect(stored.value).toBe("Added Name");
    const order = JSON.parse((await getContent(appId, `${TEMPLATE_ID}._order`))!);
    expect(order.value).toHaveLength(2);
    expect(order.value[1]).toBe(instanceId);
});

test("only a row whose cells differ from the template is flagged as mismatched", () => {
    const rows = getRows("table-rows-mismatch");
    expect(rows.map((row) => row.hasAttribute("data-scms-structure-mismatch"))).toEqual([
        false,
        false,
        true,
    ]);
});

test("undoing a row's deletion brings the row back", async () => {
    const rows = getRows(TEMPLATE_ID);
    const last = rows[rows.length - 1];
    const instanceId = last.getAttribute("data-scms-instance");
    (last.querySelector(".scms-instance-delete") as HTMLElement).click();
    await waitForCondition(() => getRows(TEMPLATE_ID).length === rows.length - 1);

    const undoButton = Array.from(getToolbar().shadowRoot?.querySelectorAll("button") ?? []).find(
        (button) => button.getAttribute("aria-label") === "Undo",
    );
    undoButton!.click();
    await waitForCondition(() => getRows(TEMPLATE_ID).length === rows.length);

    const restored = getRows(TEMPLATE_ID)[rows.length - 1];
    expect(restored.getAttribute("data-scms-instance")).toBe(instanceId);
    expect(
        Array.from(restored.querySelectorAll("td")).map((cell) =>
            cell.getAttribute("data-scms-text"),
        ),
    ).toEqual(["name", "role"]);
});
