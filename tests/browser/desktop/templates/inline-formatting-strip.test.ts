/**
 * Tests that stripTemplateContent removes inline formatting elements
 * (e.g. <strong>, <em>) from editable elements inside templates.
 *
 * Regression test for https://github.com/streamlinedcms/client-sdk/issues/73
 */

import { test, expect, beforeAll } from "vitest";
import { setContent } from "~/@browser-support/test-helpers.js";
import {
    initializeSDK,
    waitForCondition,
    setupTestHelpers,
    generateTestAppId,
} from "~/@browser-support/sdk-helpers.js";

beforeAll(async () => {
    setupTestHelpers();
    const appId = generateTestAppId();

    // Start with 1 instance whose editable has rich HTML content
    await setContent(
        appId,
        "team-inline-fmt.inst1.name",
        JSON.stringify({ type: "html", value: "Alice <strong>Smith</strong>" }),
    );
    await setContent(
        appId,
        "team-inline-fmt.inst1.role",
        JSON.stringify({ type: "text", value: "CEO" }),
    );
    await setContent(
        appId,
        "team-inline-fmt._order",
        JSON.stringify({ type: "order", value: ["inst1"] }),
    );

    await initializeSDK({ appId });
});

test("new template instance has no leftover inline formatting in editable elements", async () => {
    const teamContainer = document.querySelector(
        '[data-scms-template="team-inline-fmt"]',
    );
    const initialCount =
        teamContainer?.querySelectorAll(".team-member").length ?? 0;

    // Click add button to create a new instance
    const addButton = teamContainer?.querySelector(
        ".scms-template-add",
    ) as HTMLElement;
    addButton.click();

    await waitForCondition(
        () =>
            teamContainer?.querySelectorAll(".team-member").length ===
            initialCount + 1,
    );

    const teamMembers = teamContainer?.querySelectorAll(".team-member");
    const newInstance = teamMembers?.[teamMembers.length - 1];

    // The html editable should be completely empty — no leftover <strong>, <em>, etc.
    const newName = newInstance?.querySelector('[data-scms-html="name"]');
    expect(newName?.innerHTML).toBe("");

    // The text editable should also be empty
    const newRole = newInstance?.querySelector('[data-scms-text="role"]');
    expect(newRole?.textContent).toBe("");
});

test("new template instance preserves inline formatting in non-editable elements", async () => {
    const teamContainer = document.querySelector(
        '[data-scms-template="team-inline-fmt"]',
    );

    // Get the last instance (added by previous test)
    const teamMembers = teamContainer?.querySelectorAll(".team-member");
    const newInstance = teamMembers?.[teamMembers.length - 1];

    // The non-editable badge should preserve its <strong> tag (text cleared, structure kept)
    const badge = newInstance?.querySelector(".badge");
    expect(badge?.querySelector("strong")).not.toBeNull();
});
