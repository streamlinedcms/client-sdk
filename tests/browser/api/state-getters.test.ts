/**
 * State getter tests
 *
 * Tests the public state getters: isAuthenticated, mode, editingEnabled
 */

import { test, expect, beforeAll, beforeEach } from "vitest";
import { initializeSDK, setupTestHelpers, getController } from "~/@browser-support/sdk-helpers.js";

beforeAll(async () => {
    setupTestHelpers();
    await initializeSDK();
});

test("isAuthenticated returns true when authenticated", () => {
    const controller = getController();
    expect(controller).not.toBeNull();

    // Mock auth is enabled in tests
    expect(controller!.isAuthenticated).toBe(true);
});

test("mode returns 'author' when in author mode", () => {
    const controller = getController();
    expect(controller).not.toBeNull();

    // Mock auth starts in author mode
    expect(controller!.mode).toBe("author");
});

test("editingEnabled returns true in author mode with permissions", () => {
    const controller = getController();
    expect(controller).not.toBeNull();

    // Mock auth in author mode has editing enabled
    expect(controller!.editingEnabled).toBe(true);
});

test("appId getter returns the configured app ID", () => {
    const controller = getController();
    expect(controller).not.toBeNull();

    // App ID should be set and non-empty
    expect(controller!.appId).toBeTruthy();
    expect(typeof controller!.appId).toBe("string");
});

test("draftStorageKey getter returns the storage key", () => {
    const controller = getController();
    expect(controller).not.toBeNull();

    // Draft storage key should be scms_draft_{appId}
    expect(controller!.draftStorageKey).toBe(`scms_draft_${controller!.appId}`);
});

test("version getter returns SDK version", () => {
    const controller = getController();
    expect(controller).not.toBeNull();

    // Version should be a semver-like string
    expect(controller!.version).toMatch(/^\d+\.\d+\.\d+/);
});
