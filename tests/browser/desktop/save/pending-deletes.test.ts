/**
 * Pending deletes tests
 *
 * Regression tests for https://github.com/streamlinedcms/client-sdk/issues/76
 *
 * Verifies that only user-driven deletions (template instance removal) are
 * tracked as pending deletes. Elements that exist in savedContentKeys but
 * not in the current page DOM (e.g. elements on other pages) must NOT be
 * treated as pending deletes.
 */

import { test, expect, beforeAll, beforeEach } from "vitest";
import { setContent } from "~/@browser-support/test-helpers.js";
import {
    initializeSDK,
    waitForCondition,
    clickToolbarButton,
    setupTestHelpers,
    generateTestAppId,
    getController,
} from "~/@browser-support/sdk-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";

const TEMPLATE_ID = "team-deletes";

let appId: string;

function getDraftKey(): string {
    return getController()!.draftStorageKey;
}

function getToolbar(): Toolbar {
    return document.querySelector("scms-toolbar") as Toolbar;
}

function getTeamContainer(): HTMLElement {
    return document.querySelector(`[data-scms-template="${TEMPLATE_ID}"]`) as HTMLElement;
}

async function editElement(element: HTMLElement, content: string): Promise<void> {
    element.click();
    await waitForCondition(() => element.classList.contains("streamlined-editing"));
    element.textContent = content;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
}

declare const __SDK_API_URL__: string;

async function fetchServerContent(): Promise<Record<string, unknown>> {
    const response = await fetch(`${__SDK_API_URL__}/apps/${appId}/content`);
    return response.json();
}

beforeAll(async () => {
    setupTestHelpers();
    appId = generateTestAppId();

    // Set up 2 instances on the current page
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
        `${TEMPLATE_ID}._order`,
        JSON.stringify({ type: "order", value: ["member1", "member2"] }),
    );

    // Set up content that belongs to a DIFFERENT page (not in the DOM).
    // These keys exist in the API response but have no corresponding DOM elements.
    await setContent(appId, "other-page-title", JSON.stringify({ type: "html", value: "Other Page" }));
    await setContent(appId, "other-page-bio", JSON.stringify({ type: "html", value: "Bio text" }));

    await initializeSDK({ appId });
});

beforeEach(async () => {
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));
    localStorage.removeItem(getDraftKey());
});

test("elements not in the DOM are not marked as pending deletes in draft", async () => {
    // Edit something to trigger a draft save
    const nameEl = getTeamContainer().querySelector('[data-scms-text="name"]') as HTMLElement;
    await editElement(nameEl, "Alice Modified");

    // Check the draft in localStorage
    const stored = localStorage.getItem(getDraftKey());
    expect(stored).not.toBeNull();

    const draft = JSON.parse(stored!);

    // The deleted array must NOT contain the other-page elements
    expect(draft.deleted).not.toContain("other-page-title");
    expect(draft.deleted).not.toContain("other-page-bio");

    // The deleted array should be empty (no user-driven deletions occurred)
    expect(draft.deleted).toEqual([]);
});

test("saving does not delete elements from other pages", async () => {
    const nameEl = getTeamContainer().querySelector('[data-scms-text="name"]') as HTMLElement;
    const toolbar = getToolbar();

    await editElement(nameEl, "Alice Saved");

    await clickToolbarButton("Save");
    await waitForCondition(() => !toolbar.hasChanges, 5000);

    // Fetch what the server has after save
    const serverContent = await fetchServerContent();
    const elements = serverContent.elements as Record<string, { content: string }>;

    // Other-page elements must still exist on the server
    expect(elements["other-page-title"]).toBeDefined();
    expect(elements["other-page-bio"]).toBeDefined();
});

test("removing a template instance tracks deletes and save removes them from server", async () => {
    const container = getTeamContainer();
    const toolbar = getToolbar();

    // Should have 2 instances
    let instances = container.querySelectorAll("[data-scms-instance]");
    expect(instances.length).toBe(2);

    // Delete the last instance
    const lastInstance = instances[instances.length - 1];
    const deleteButton = lastInstance.querySelector(".scms-instance-delete") as HTMLElement;
    deleteButton.click();

    await waitForCondition(() => container.querySelectorAll("[data-scms-instance]").length === 1);

    // A draft should have been saved with the deleted instance's element keys
    const stored = localStorage.getItem(getDraftKey());
    expect(stored).not.toBeNull();

    const draft = JSON.parse(stored!);
    expect(draft.deleted.length).toBeGreaterThan(0);

    // The deleted keys should be for the removed instance's elements, not other-page content
    for (const key of draft.deleted) {
        expect(key).toMatch(new RegExp(`^${TEMPLATE_ID}\\.`));
    }
    expect(draft.deleted).not.toContain("other-page-title");
    expect(draft.deleted).not.toContain("other-page-bio");

    // Save to delete from server
    await clickToolbarButton("Save");
    await waitForCondition(() => !toolbar.hasChanges, 5000);

    // Verify server no longer has the deleted instance's elements
    const serverContent = await fetchServerContent();
    const elements = serverContent.elements as Record<string, { content: string }>;

    for (const key of draft.deleted) {
        expect(elements[key]).toBeUndefined();
    }

    // Other-page content must still be intact
    expect(elements["other-page-title"]).toBeDefined();
    expect(elements["other-page-bio"]).toBeDefined();
});
