/**
 * Saved attributes combined with a restored draft
 *
 * Loading saved attributes must not disturb what the editor considers the
 * saved version of an element that has an unsaved draft, and must not undo
 * attribute changes the draft holds.
 *
 * Regression test for: https://github.com/streamlinedcms/client-sdk/issues/107
 */

import { test, expect, beforeAll } from "vitest";
import { setContent, getContent } from "~/@browser-support/test-helpers.js";
import {
    initializeSDK,
    waitForCondition,
    clickToolbarButton,
    setElementContent,
    setupTestHelpers,
    generateTestAppId,
    getController,
} from "~/@browser-support/sdk-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";

let appId: string;

function getToolbar(): Toolbar {
    return document.querySelector("scms-toolbar") as Toolbar;
}

function getContentState(): {
    currentContent: Map<string, string>;
    originalContent: Map<string, string>;
} {
    return (
        getController() as unknown as {
            state: { currentContent: Map<string, string>; originalContent: Map<string, string> };
        }
    ).state;
}

beforeAll(async () => {
    setupTestHelpers();
    appId = generateTestAppId();

    await setContent(
        appId,
        "saved-attr-draft-reset",
        JSON.stringify({
            type: "text",
            value: "Saved reset",
            attributes: { title: "Reset title" },
        }),
    );
    await setContent(
        appId,
        "saved-attr-draft-match",
        JSON.stringify({
            type: "text",
            value: "Saved match",
            attributes: { title: "Match title" },
        }),
    );
    await setContent(
        appId,
        "saved-attr-draft-removed",
        JSON.stringify({
            type: "text",
            value: "Saved removed",
            attributes: { title: "Removed title" },
        }),
    );

    // An unsaved draft from an earlier visit, restored when the editor loads
    localStorage.setItem(
        `scms_draft_${appId}`,
        JSON.stringify({
            content: {
                // Text edited; the draft has no attributes (e.g. written before
                // saved attributes were loaded)
                "saved-attr-draft-reset": JSON.stringify({
                    type: "text",
                    value: "Draft reset",
                }),
                // Same as what's saved, attributes included
                "saved-attr-draft-match": JSON.stringify({
                    type: "text",
                    value: "Saved match",
                    attributes: { title: "Match title" },
                }),
                // The editor removed the title in the attributes dialog
                "saved-attr-draft-removed": JSON.stringify({
                    type: "text",
                    value: "Saved removed",
                }),
            },
            deleted: [],
        }),
    );

    await initializeSDK({ appId });
});

test("Reset on an element with a restored draft goes back to the saved version", async () => {
    const element = document.querySelector(
        '[data-scms-text="saved-attr-draft-reset"]',
    ) as HTMLElement;
    expect(element.textContent).toBe("Draft reset");

    element.click();
    await waitForCondition(() => element.classList.contains("streamlined-editing"));
    const toolbar = getToolbar();
    await waitForCondition(() => !!toolbar.shadowRoot?.querySelector("scms-hold-button"));
    toolbar
        .shadowRoot!.querySelector("scms-hold-button")!
        .dispatchEvent(new CustomEvent("hold-complete"));
    await new Promise((r) => setTimeout(r, 100));

    expect(element.textContent).toBe("Saved reset");
    expect(element.getAttribute("title")).toBe("Reset title");
    const state = getContentState();
    expect(state.currentContent.get("saved-attr-draft-reset")).toBe(
        state.originalContent.get("saved-attr-draft-reset"),
    );

    document.body.click();
    await new Promise((r) => setTimeout(r, 100));
});

test("a restored draft that matches the saved content isn't an unsaved change", () => {
    const state = getContentState();
    expect(state.currentContent.get("saved-attr-draft-match")).toBe(
        state.originalContent.get("saved-attr-draft-match"),
    );
});

test("attributes removed in a draft stay removed after editing and saving", async () => {
    const element = document.querySelector(
        '[data-scms-text="saved-attr-draft-removed"]',
    ) as HTMLElement;

    element.click();
    await waitForCondition(() => element.classList.contains("streamlined-editing"));
    setElementContent(element, "Edited removed");
    await new Promise((r) => setTimeout(r, 100));

    expect(await clickToolbarButton("Save")).toBe(true);
    await waitForCondition(() => !getToolbar().hasChanges, 5000);

    const stored = JSON.parse((await getContent(appId, "saved-attr-draft-removed"))!);
    expect(stored.value).toBe("Edited removed");
    expect(stored.attributes).toBeUndefined();
});
