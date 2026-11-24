/**
 * Replacing an image with responsive sources in the editor
 *
 * Browsers show an image from srcset, or from a <source> in a <picture>,
 * over src, so replacing the image must drop those for the editor to see
 * the new one.
 *
 * Regression test for: https://github.com/streamlinedcms/client-sdk/issues/110
 */

import { test, expect, beforeAll } from "vitest";
import {
    initializeSDK,
    waitForCondition,
    setupTestHelpers,
    generateTestAppId,
    getController,
} from "~/@browser-support/sdk-helpers.js";

type Controller = {
    state: {
        selectedKey: string | null;
        mediaManagerModal: { fetchImageAsCandidate: () => Promise<null> } | null;
    };
    modalManager: {
        openMediaManager: () => Promise<{ publicUrl: string }>;
        handleChangeImage: () => Promise<void>;
    };
};

async function replaceImage(img: HTMLImageElement, publicUrl: string): Promise<void> {
    const controller = getController() as unknown as Controller;
    // Stub the media manager so choosing an image needs no iframe
    if (controller.state.mediaManagerModal) {
        controller.state.mediaManagerModal.fetchImageAsCandidate = async () => null;
    }
    controller.modalManager.openMediaManager = async () => ({ publicUrl });

    img.click();
    const key = img.getAttribute("data-scms-image");
    await waitForCondition(() => controller.state.selectedKey === key);
    await controller.modalManager.handleChangeImage();
}

beforeAll(async () => {
    setupTestHelpers();
    await initializeSDK({ appId: generateTestAppId() });
});

test("replacing an image drops its srcset and sizes", async () => {
    const img = document.querySelector('[data-scms-image="srcset-edit"]') as HTMLImageElement;
    await replaceImage(img, "https://example.com/replaced.png");

    expect(img.isConnected).toBe(true);
    expect(img.getAttribute("src")).toBe("https://example.com/replaced.png");
    expect(img.hasAttribute("srcset")).toBe(false);
    expect(img.hasAttribute("sizes")).toBe(false);
});

test("replacing an image in a <picture> drops the picture's sources", async () => {
    const img = document.querySelector('[data-scms-image="picture-edit"]') as HTMLImageElement;
    await replaceImage(img, "https://example.com/replaced.png");

    expect(img.getAttribute("src")).toBe("https://example.com/replaced.png");
    expect(img.parentElement!.querySelectorAll("source")).toHaveLength(0);
});
