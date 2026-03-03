/**
 * Template unsaved fields save tests
 *
 * Regression test for https://github.com/streamlinedcms/client-sdk/issues/70
 *
 * When editing a single field on an existing template instance, all unsaved
 * sibling fields across all instances should also be persisted — not just
 * the one that was modified.
 */

import { test, expect, beforeAll, beforeEach } from "vitest";
import { setContent } from "~/@browser-support/test-helpers.js";
import {
    initializeSDK,
    waitForCondition,
    clickToolbarButton,
    setupTestHelpers,
    generateTestAppId,
} from "~/@browser-support/sdk-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";

const TEMPLATE_ID = "team-save-unsaved";

let appId: string;

beforeAll(async () => {
    setupTestHelpers();
    appId = generateTestAppId();

    // Set up 2 instances: member1 has only "name" saved, member2 has nothing saved.
    // This simulates a template where some fields/instances have been persisted
    // but others still have their HTML-default values and have never been sent to the API.
    await setContent(
        appId,
        `${TEMPLATE_ID}.member1.name`,
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    await setContent(
        appId,
        `${TEMPLATE_ID}._order`,
        JSON.stringify({ type: "order", value: ["member1", "member2"] }),
    );

    await initializeSDK({ appId });
});

beforeEach(async () => {
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));
});

function getToolbar(): Toolbar {
    return document.querySelector("scms-toolbar") as Toolbar;
}

function getNameElement(): HTMLElement {
    return document.querySelector(
        `[data-scms-template="${TEMPLATE_ID}"] [data-scms-text="name"]`,
    ) as HTMLElement;
}

function getRoleElement(): HTMLElement {
    return document.querySelector(
        `[data-scms-template="${TEMPLATE_ID}"] [data-scms-text="role"]`,
    ) as HTMLElement;
}

async function editElement(element: HTMLElement, content: string): Promise<void> {
    element.click();
    await waitForCondition(() => element.classList.contains("streamlined-editing"));
    element.textContent = content;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
}

declare const __SDK_API_URL__: string;

/**
 * Fetch all saved content from the test server for this app
 */
async function fetchServerContent(): Promise<Record<string, unknown>> {
    const response = await fetch(`${__SDK_API_URL__}/apps/${appId}/content`);
    return response.json();
}

test("editing one template field also saves unsaved sibling fields and instances", async () => {
    const nameEl = getNameElement();
    const toolbar = getToolbar();

    // Verify initial state: member1's name is "Alice" (from API).
    // member1's role and all of member2's fields are empty because
    // cloneTemplateInstances() strips content and they were never saved.
    expect(nameEl.textContent).toBe("Alice");

    // Verify both instances exist
    const instances = document.querySelectorAll(
        `[data-scms-template="${TEMPLATE_ID}"] [data-scms-instance]`,
    );
    expect(instances.length).toBe(2);

    // Edit only member1's name field
    await editElement(nameEl, "Alice Updated");
    expect(toolbar.hasChanges).toBe(true);

    // Save
    await clickToolbarButton("Save");
    await waitForCondition(() => !toolbar.hasChanges, 5000);

    // Fetch what was actually saved to the server
    const serverContent = await fetchServerContent();
    const elements = serverContent.elements as Record<string, { content: string }> | undefined;

    // member1's unsaved role field should also be persisted
    const member1RoleKey = `${TEMPLATE_ID}.member1.role`;
    expect(elements?.[member1RoleKey]).toBeDefined();
    expect(elements?.[member1RoleKey]?.content).toBeDefined();

    // member2's fields should also be persisted (entirely unsaved sibling instance)
    const member2NameKey = `${TEMPLATE_ID}.member2.name`;
    const member2RoleKey = `${TEMPLATE_ID}.member2.role`;
    expect(elements?.[member2NameKey]).toBeDefined();
    expect(elements?.[member2NameKey]?.content).toBeDefined();
    expect(elements?.[member2RoleKey]).toBeDefined();
    expect(elements?.[member2RoleKey]?.content).toBeDefined();
});
