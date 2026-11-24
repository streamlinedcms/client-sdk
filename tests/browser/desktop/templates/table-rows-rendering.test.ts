/**
 * Table-row templates on page load (visitor path)
 *
 * A template whose items are table rows must show its saved rows, not an
 * empty table. Runs the loader only, without the editor, so the editor
 * can't mask a loader that drops the rows.
 *
 * Regression test for: https://github.com/streamlinedcms/client-sdk/issues/106
 */

import { test, expect, beforeAll } from "vitest";
import { setContent } from "~/@browser-support/test-helpers.js";
import { runLoader, setupTestHelpers, generateTestAppId } from "~/@browser-support/sdk-helpers.js";

const TEMPLATE_ID = "table-rows-rendering";

beforeAll(async () => {
    setupTestHelpers();
    const appId = generateTestAppId();

    await setContent(
        appId,
        `${TEMPLATE_ID}.row1.name`,
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    await setContent(
        appId,
        `${TEMPLATE_ID}.row1.role`,
        JSON.stringify({ type: "text", value: "CEO" }),
    );
    await setContent(
        appId,
        `${TEMPLATE_ID}.row2.name`,
        JSON.stringify({ type: "text", value: "Bob" }),
    );
    await setContent(
        appId,
        `${TEMPLATE_ID}.row2.role`,
        JSON.stringify({ type: "text", value: "CTO" }),
    );
    await setContent(
        appId,
        `${TEMPLATE_ID}.row3.name`,
        JSON.stringify({ type: "text", value: "Carol" }),
    );
    await setContent(
        appId,
        `${TEMPLATE_ID}.row3.role`,
        JSON.stringify({ type: "text", value: "Designer" }),
    );
    await setContent(
        appId,
        `${TEMPLATE_ID}._order`,
        JSON.stringify({ type: "order", value: ["row1", "row2", "row3"] }),
    );

    await runLoader(appId);
});

test("visitors see the saved rows, in order, as table rows", () => {
    const tbody = document.querySelector(`[data-scms-template="${TEMPLATE_ID}"]`)!;
    const rows = Array.from(tbody.children);

    expect(rows.map((row) => row.tagName)).toEqual(["TR", "TR", "TR"]);
    expect(rows.map((row) => row.getAttribute("data-scms-instance"))).toEqual([
        "row1",
        "row2",
        "row3",
    ]);
    expect(
        rows.map((row) => Array.from(row.querySelectorAll("td")).map((cell) => cell.textContent)),
    ).toEqual([
        ["Alice", "CEO"],
        ["Bob", "CTO"],
        ["Carol", "Designer"],
    ]);
});
