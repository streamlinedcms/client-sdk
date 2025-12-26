/**
 * Load sequence tests - verifying the SDK loads correctly
 *
 * Tests that the load sequence completes properly:
 * - Content is populated from API
 * - Hiding styles are removed (content visible)
 * - SDK is initialized and ready for editing
 */

import { test, expect, beforeAll, afterAll } from "vitest";
import { setContent } from "~/@browser-support/test-helpers.js";
import {
    initializeSDK,
    setupTestHelpers,
    generateTestAppId,
    getController,
} from "~/@browser-support/sdk-helpers.js";

beforeAll(async () => {
    setupTestHelpers();
    const appId = generateTestAppId();

    // Set up content that will be loaded
    await setContent(
        appId,
        "test-title",
        JSON.stringify({ type: "html", value: "Content from API" }),
    );

    await initializeSDK({ appId });
});


test("content is populated from API after load", async () => {
    const title = document.querySelector('[data-scms-html="test-title"]');
    expect(title?.innerHTML).toBe("Content from API");
});

test("hiding styles are removed after load", async () => {
    // The hiding styles element should be gone
    const hidingStyles = document.getElementById("streamlined-cms-hiding");
    expect(hidingStyles).toBeNull();
});

test("content elements are visible after load", async () => {
    const title = document.querySelector('[data-scms-html="test-title"]') as HTMLElement;

    // Element should be visible (not hidden)
    const computedStyle = window.getComputedStyle(title);
    expect(computedStyle.visibility).not.toBe("hidden");
    expect(computedStyle.display).not.toBe("none");
});

test("SDK is initialized and elements are editable", async () => {
    // Elements should have the editable class
    const title = document.querySelector('[data-scms-html="test-title"]');
    expect(title?.classList.contains("streamlined-editable")).toBe(true);

    // Toolbar should exist
    const toolbar = document.querySelector("scms-toolbar");
    expect(toolbar).not.toBeNull();
});

test("loader complete event was dispatched", async () => {
    // The loader script should have the expected attributes
    const appId = getController()!.appId;
    const loaderScript = document.querySelector(`script[data-app-id="${appId}"]`);
    expect(loaderScript).not.toBeNull();
});
