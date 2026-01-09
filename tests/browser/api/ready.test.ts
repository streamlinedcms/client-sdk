/**
 * ready() API tests
 *
 * Tests the SDK lifecycle ready() method with different stages.
 */

import { test, expect, beforeAll } from "vitest";
import { initializeSDK, setupTestHelpers, getController } from "~/@browser-support/sdk-helpers.js";

beforeAll(async () => {
    setupTestHelpers();
    await initializeSDK();
});

test("ready('loaded') resolves immediately when SDK is initialized", async () => {
    const controller = getController();
    expect(controller).not.toBeNull();

    // Should resolve without error since SDK is already loaded
    await expect(controller!.ready("loaded")).resolves.toBeUndefined();
});

test("ready() defaults to 'loaded' stage", async () => {
    const controller = getController();
    expect(controller).not.toBeNull();

    // Should resolve without error when no stage specified
    await expect(controller!.ready()).resolves.toBeUndefined();
});

test("ready('auth') resolves when authentication is complete", async () => {
    const controller = getController();
    expect(controller).not.toBeNull();

    // Should resolve since auth is complete (mock auth in test setup)
    await expect(controller!.ready("auth")).resolves.toBeUndefined();
});

test("ready('editing') resolves when authenticated", async () => {
    const controller = getController();
    expect(controller).not.toBeNull();

    // Mock auth is enabled in tests, so this should resolve
    await expect(controller!.ready("editing")).resolves.toBeUndefined();
});

test("ready('bridges') resolves when authenticated", async () => {
    const controller = getController();
    expect(controller).not.toBeNull();

    // Mock auth is enabled in tests, so this should resolve
    await expect(controller!.ready("bridges")).resolves.toBeUndefined();
});

test("ready throws on unknown stage", async () => {
    const controller = getController();
    expect(controller).not.toBeNull();

    // @ts-expect-error - testing invalid stage
    await expect(controller!.ready("invalid")).rejects.toThrow("Unknown ready stage: invalid");
});
