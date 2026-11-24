/**
 * Saved attributes survive later saves (editor path)
 *
 * An element saved with attributes, then reloaded and edited (text only),
 * must keep its saved attributes in the next save. Otherwise a text edit
 * silently erases alt, title or custom attributes from the CMS.
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

/**
 * Edit an element's text and save, waiting for the save to finish.
 */
async function editTextAndSave(element: HTMLElement, text: string): Promise<void> {
    element.click();
    await waitForCondition(() => element.classList.contains("streamlined-editing"));
    setElementContent(element, text);
    await new Promise((r) => setTimeout(r, 100));

    expect(getToolbar().hasChanges).toBe(true);
    expect(await clickToolbarButton("Save")).toBe(true);
    await waitForCondition(() => !getToolbar().hasChanges, 5000);

    document.body.click();
    await new Promise((r) => setTimeout(r, 100));
}

beforeAll(async () => {
    setupTestHelpers();
    appId = generateTestAppId();

    await setContent(
        appId,
        "saved-attr-edit-text",
        JSON.stringify({
            type: "text",
            value: "Saved edit text",
            attributes: { title: "Saved title", "data-custom": "saved-custom" },
        }),
    );
    await setContent(
        appId,
        "saved-attr-edit-image",
        JSON.stringify({
            type: "image",
            src: "https://example.com/saved-edit.png",
            attributes: { alt: "Saved edit alt" },
        }),
    );
    await setContent(
        appId,
        "saved-attr-group:grouped",
        JSON.stringify({
            type: "text",
            value: "Saved grouped",
            attributes: { title: "Saved grouped title" },
        }),
    );
    await setContent(
        appId,
        "saved-attr-items.item1.label",
        JSON.stringify({
            type: "text",
            value: "Saved item label",
            attributes: { title: "Saved item title" },
        }),
    );
    await setContent(
        appId,
        "saved-attr-items._order",
        JSON.stringify({ type: "order", value: ["item1"] }),
    );

    await initializeSDK({ appId });
    localStorage.removeItem(getController()!.draftStorageKey);
});

test("loading an element with saved attributes doesn't count as an unsaved change", () => {
    expect(getToolbar().hasChanges).toBe(false);
});

test("editing only the text keeps the element's saved attributes in the save", async () => {
    const element = document.querySelector(
        '[data-scms-text="saved-attr-edit-text"]',
    ) as HTMLElement;

    await editTextAndSave(element, "Edited text");

    const stored = JSON.parse((await getContent(appId, "saved-attr-edit-text"))!);
    expect(stored.value).toBe("Edited text");
    expect(stored.attributes).toEqual({ title: "Saved title", "data-custom": "saved-custom" });
});

test("grouped element: editing the text keeps its saved attributes", async () => {
    const element = document.querySelector(
        '[data-scms-group="saved-attr-group"] [data-scms-text="grouped"]',
    ) as HTMLElement;

    await editTextAndSave(element, "Edited grouped");

    const stored = JSON.parse((await getContent(appId, "saved-attr-group:grouped"))!);
    expect(stored.value).toBe("Edited grouped");
    expect(stored.attributes).toEqual({ title: "Saved grouped title" });
});

test("template item: editing the text keeps its saved attributes", async () => {
    const element = document.querySelector(
        '[data-scms-template="saved-attr-items"] [data-scms-instance="item1"] [data-scms-text="label"]',
    ) as HTMLElement;

    await editTextAndSave(element, "Edited item label");

    const stored = JSON.parse((await getContent(appId, "saved-attr-items.item1.label"))!);
    expect(stored.value).toBe("Edited item label");
    expect(stored.attributes).toEqual({ title: "Saved item title" });
});

test("image: replacing the image updates it in place and keeps its saved alt", async () => {
    const img = document.querySelector(
        '[data-scms-image="saved-attr-edit-image"]',
    ) as HTMLImageElement;
    expect(img.getAttribute("alt")).toBe("Saved edit alt");

    // Stub the media manager so choosing an image needs no iframe
    const controller = getController() as unknown as {
        state: {
            selectedKey: string | null;
            mediaManagerModal: { fetchImageAsCandidate: () => Promise<null> } | null;
        };
        modalManager: {
            openMediaManager: () => Promise<{ publicUrl: string }>;
            handleChangeImage: () => Promise<void>;
        };
    };
    if (controller.state.mediaManagerModal) {
        controller.state.mediaManagerModal.fetchImageAsCandidate = async () => null;
    }
    controller.modalManager.openMediaManager = async () => ({
        publicUrl: "https://example.com/replaced.png",
    });

    img.click();
    await waitForCondition(() => controller.state.selectedKey === "saved-attr-edit-image");
    await controller.modalManager.handleChangeImage();

    // The editor keeps references to the element, so it must not be swapped out
    expect(img.isConnected).toBe(true);
    expect(img.getAttribute("src")).toBe("https://example.com/replaced.png");
    expect(img.getAttribute("alt")).toBe("Saved edit alt");

    expect(await clickToolbarButton("Save")).toBe(true);
    await waitForCondition(() => !getToolbar().hasChanges, 5000);

    const stored = JSON.parse((await getContent(appId, "saved-attr-edit-image"))!);
    expect(stored.src).toBe("https://example.com/replaced.png");
    expect(stored.attributes).toEqual({ alt: "Saved edit alt" });
});
