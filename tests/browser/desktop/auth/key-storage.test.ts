/**
 * KeyStorage tests
 *
 * Tests the localStorage-based key and mode storage.
 */

import { test, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { setupTestHelpers } from "~/@browser-support/sdk-helpers.js";
import { KeyStorage } from "~/src/key-storage.js";

const AUTH_STORAGE_KEY = "scms_auth";
const MODE_STORAGE_KEY = "scms_mode";

beforeAll(() => {
    setupTestHelpers();
});

beforeEach(() => {
    // Clear storage before each test
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(MODE_STORAGE_KEY);
});

afterEach(() => {
    // Clean up after each test
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(MODE_STORAGE_KEY);
});

test("getStoredKey returns null when no key stored", () => {
    const storage = new KeyStorage("test-app");
    expect(storage.getStoredKey()).toBeNull();
});

test("storeKey saves key to localStorage", () => {
    const storage = new KeyStorage("test-app");

    storage.storeKey("test-api-key-123");

    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!);
    expect(parsed.key).toBe("test-api-key-123");
    expect(parsed.appId).toBe("test-app");
});

test("getStoredKey retrieves stored key", () => {
    const storage = new KeyStorage("test-app");

    storage.storeKey("my-api-key");

    expect(storage.getStoredKey()).toBe("my-api-key");
});

test("getStoredKey returns null for different appId", () => {
    const storage1 = new KeyStorage("app-1");
    const storage2 = new KeyStorage("app-2");

    storage1.storeKey("key-for-app-1");

    // Storage for different app should return null
    expect(storage2.getStoredKey()).toBeNull();
});

test("clearStoredKey removes key from localStorage", () => {
    const storage = new KeyStorage("test-app");

    storage.storeKey("key-to-clear");
    expect(storage.getStoredKey()).toBe("key-to-clear");

    storage.clearStoredKey();

    expect(storage.getStoredKey()).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
});

test("getStoredKey handles invalid JSON gracefully", () => {
    localStorage.setItem(AUTH_STORAGE_KEY, "not valid json");

    const storage = new KeyStorage("test-app");

    // Should return null, not throw
    expect(storage.getStoredKey()).toBeNull();
});

test("getStoredMode returns null when no mode stored", () => {
    const storage = new KeyStorage("test-app");
    expect(storage.getStoredMode()).toBeNull();
});

test("storeMode saves mode to localStorage", () => {
    const storage = new KeyStorage("test-app");

    storage.storeMode("author");

    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!);
    expect(parsed.mode).toBe("author");
    expect(parsed.appId).toBe("test-app");
});

test("getStoredMode retrieves stored mode", () => {
    const storage = new KeyStorage("test-app");

    storage.storeMode("viewer");

    expect(storage.getStoredMode()).toBe("viewer");
});

test("getStoredMode returns null for different appId", () => {
    const storage1 = new KeyStorage("app-1");
    const storage2 = new KeyStorage("app-2");

    storage1.storeMode("author");

    // Storage for different app should return null
    expect(storage2.getStoredMode()).toBeNull();
});

test("getStoredMode handles invalid JSON gracefully", () => {
    localStorage.setItem(MODE_STORAGE_KEY, "invalid json here");

    const storage = new KeyStorage("test-app");

    // Should return null, not throw
    expect(storage.getStoredMode()).toBeNull();
});

test("storeMode can switch between modes", () => {
    const storage = new KeyStorage("test-app");

    storage.storeMode("author");
    expect(storage.getStoredMode()).toBe("author");

    storage.storeMode("viewer");
    expect(storage.getStoredMode()).toBe("viewer");

    storage.storeMode("author");
    expect(storage.getStoredMode()).toBe("author");
});

test("key and mode are stored independently", () => {
    const storage = new KeyStorage("test-app");

    storage.storeKey("my-key");
    storage.storeMode("author");

    expect(storage.getStoredKey()).toBe("my-key");
    expect(storage.getStoredMode()).toBe("author");

    storage.clearStoredKey();

    // Mode should still be available
    expect(storage.getStoredKey()).toBeNull();
    expect(storage.getStoredMode()).toBe("author");
});
