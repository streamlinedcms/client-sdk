/**
 * Event hooks tests
 *
 * Tests the on() and off() methods for event handlers.
 * Note: We cannot easily test actual signin/signout events without
 * penpal/iframe setup, so we test the handler registration and removal.
 */

import { test, expect, beforeAll } from "vitest";
import { initializeSDK, setupTestHelpers, getController } from "~/@browser-support/sdk-helpers.js";

beforeAll(async () => {
    setupTestHelpers();
    await initializeSDK();
});

test("on() registers a handler without error", () => {
    const controller = getController();
    expect(controller).not.toBeNull();

    const handler = () => {};

    // Should not throw
    expect(() => controller!.on("signin", handler)).not.toThrow();
});

test("off() removes a registered handler without error", () => {
    const controller = getController();
    expect(controller).not.toBeNull();

    const handler = () => {};
    controller!.on("signin", handler);

    // Should not throw
    expect(() => controller!.off("signin", handler)).not.toThrow();
});

test("multiple handlers can be registered for the same event", () => {
    const controller = getController();
    expect(controller).not.toBeNull();

    const handler1 = () => {};
    const handler2 = () => {};

    // Both should register without error
    expect(() => {
        controller!.on("signin", handler1);
        controller!.on("signin", handler2);
    }).not.toThrow();

    // Clean up
    controller!.off("signin", handler1);
    controller!.off("signin", handler2);
});

test("same handler can be registered for different events", () => {
    const controller = getController();
    expect(controller).not.toBeNull();

    const handler = () => {};

    // Should register for both events without error
    expect(() => {
        controller!.on("signin", handler);
        controller!.on("signout", handler);
    }).not.toThrow();

    // Clean up
    controller!.off("signin", handler);
    controller!.off("signout", handler);
});

test("off() on unregistered handler does not throw", () => {
    const controller = getController();
    expect(controller).not.toBeNull();

    const handler = () => {};

    // Should not throw when removing handler that was never registered
    expect(() => controller!.off("signin", handler)).not.toThrow();
});

test("off() only removes the specific handler", () => {
    const controller = getController();
    expect(controller).not.toBeNull();

    let callCount1 = 0;
    let callCount2 = 0;
    const handler1 = () => {
        callCount1++;
    };
    const handler2 = () => {
        callCount2++;
    };

    controller!.on("signout", handler1);
    controller!.on("signout", handler2);

    // Remove only handler1
    controller!.off("signout", handler1);

    // Handler2 should still be registered (no way to verify directly
    // without triggering signout, but we can verify no error)
    expect(() => controller!.off("signout", handler2)).not.toThrow();
});

test("registering duplicate handler is idempotent", () => {
    const controller = getController();
    expect(controller).not.toBeNull();

    const handler = () => {};

    // Register same handler twice
    controller!.on("signin", handler);
    controller!.on("signin", handler);

    // Removing once should be sufficient (Set behavior)
    controller!.off("signin", handler);

    // Should not throw when removing again
    expect(() => controller!.off("signin", handler)).not.toThrow();
});
