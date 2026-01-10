/**
 * KeyStorage tests
 *
 * Tests the localStorage-based key and mode storage.
 * Keys are scoped by appId: scms_auth_${appId}, scms_mode_${appId}
 * Legacy keys (scms_auth, scms_mode) are checked as fallback.
 */

import { test, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { setupTestHelpers } from "~/@browser-support/sdk-helpers.js";
import { KeyStorage } from "~/src/key-storage.js";

const TEST_APP_ID = "test-app";
const AUTH_STORAGE_KEY = `scms_auth_${TEST_APP_ID}`;
const MODE_STORAGE_KEY = `scms_mode_${TEST_APP_ID}`;
const LEGACY_AUTH_KEY = "scms_auth";
const LEGACY_MODE_KEY = "scms_mode";

beforeAll(() => {
    setupTestHelpers();
});

beforeEach(() => {
    // Clear storage before each test
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(MODE_STORAGE_KEY);
    localStorage.removeItem(LEGACY_AUTH_KEY);
    localStorage.removeItem(LEGACY_MODE_KEY);
    // Also clear keys for other test app IDs
    localStorage.removeItem("scms_auth_app-1");
    localStorage.removeItem("scms_auth_app-2");
    localStorage.removeItem("scms_mode_app-1");
    localStorage.removeItem("scms_mode_app-2");
});

afterEach(() => {
    // Clean up after each test
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(MODE_STORAGE_KEY);
    localStorage.removeItem(LEGACY_AUTH_KEY);
    localStorage.removeItem(LEGACY_MODE_KEY);
    localStorage.removeItem("scms_auth_app-1");
    localStorage.removeItem("scms_auth_app-2");
    localStorage.removeItem("scms_mode_app-1");
    localStorage.removeItem("scms_mode_app-2");
});

test("getStoredKey returns null when no key stored", () => {
    const storage = new KeyStorage(TEST_APP_ID);
    expect(storage.getStoredKey()).toBeNull();
});

test("storeKey saves key to localStorage with scoped key", () => {
    const storage = new KeyStorage(TEST_APP_ID);

    storage.storeKey("test-api-key-123");

    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!);
    expect(parsed.key).toBe("test-api-key-123");
    expect(parsed.appId).toBe(TEST_APP_ID);
});

test("getStoredKey retrieves stored key", () => {
    const storage = new KeyStorage(TEST_APP_ID);

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
    const storage = new KeyStorage(TEST_APP_ID);

    storage.storeKey("key-to-clear");
    expect(storage.getStoredKey()).toBe("key-to-clear");

    storage.clearStoredKey();

    expect(storage.getStoredKey()).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
});

test("getStoredKey handles invalid JSON gracefully", () => {
    localStorage.setItem(AUTH_STORAGE_KEY, "not valid json");

    const storage = new KeyStorage(TEST_APP_ID);

    // Should return null, not throw
    expect(storage.getStoredKey()).toBeNull();
});

test("getStoredMode returns null when no mode stored", () => {
    const storage = new KeyStorage(TEST_APP_ID);
    expect(storage.getStoredMode()).toBeNull();
});

test("storeMode saves mode to localStorage with scoped key", () => {
    const storage = new KeyStorage(TEST_APP_ID);

    storage.storeMode("author");

    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!);
    expect(parsed.mode).toBe("author");
    expect(parsed.appId).toBe(TEST_APP_ID);
});

test("getStoredMode retrieves stored mode", () => {
    const storage = new KeyStorage(TEST_APP_ID);

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

    const storage = new KeyStorage(TEST_APP_ID);

    // Should return null, not throw
    expect(storage.getStoredMode()).toBeNull();
});

test("storeMode can switch between modes", () => {
    const storage = new KeyStorage(TEST_APP_ID);

    storage.storeMode("author");
    expect(storage.getStoredMode()).toBe("author");

    storage.storeMode("viewer");
    expect(storage.getStoredMode()).toBe("viewer");

    storage.storeMode("author");
    expect(storage.getStoredMode()).toBe("author");
});

test("key and mode are stored independently", () => {
    const storage = new KeyStorage(TEST_APP_ID);

    storage.storeKey("my-key");
    storage.storeMode("author");

    expect(storage.getStoredKey()).toBe("my-key");
    expect(storage.getStoredMode()).toBe("author");

    storage.clearStoredKey();

    // Mode should still be available
    expect(storage.getStoredKey()).toBeNull();
    expect(storage.getStoredMode()).toBe("author");
});

// Legacy fallback tests

test("getStoredKey falls back to legacy key if scoped key is empty", () => {
    // Store in legacy key with matching appId
    localStorage.setItem(
        LEGACY_AUTH_KEY,
        JSON.stringify({ key: "legacy-key", appId: TEST_APP_ID }),
    );

    const storage = new KeyStorage(TEST_APP_ID);
    expect(storage.getStoredKey()).toBe("legacy-key");
});

test("getStoredKey returns null if legacy key has different appId", () => {
    // Store in legacy key with different appId
    localStorage.setItem(
        LEGACY_AUTH_KEY,
        JSON.stringify({ key: "legacy-key", appId: "other-app" }),
    );

    const storage = new KeyStorage(TEST_APP_ID);
    expect(storage.getStoredKey()).toBeNull();
});

test("getStoredKey prefers scoped key over legacy key", () => {
    // Store in both scoped and legacy keys
    localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ key: "scoped-key", appId: TEST_APP_ID }),
    );
    localStorage.setItem(
        LEGACY_AUTH_KEY,
        JSON.stringify({ key: "legacy-key", appId: TEST_APP_ID }),
    );

    const storage = new KeyStorage(TEST_APP_ID);
    expect(storage.getStoredKey()).toBe("scoped-key");
});

test("getStoredMode falls back to legacy key if scoped key is empty", () => {
    // Store in legacy key with matching appId
    localStorage.setItem(LEGACY_MODE_KEY, JSON.stringify({ mode: "author", appId: TEST_APP_ID }));

    const storage = new KeyStorage(TEST_APP_ID);
    expect(storage.getStoredMode()).toBe("author");
});

test("getStoredMode returns null if legacy key has different appId", () => {
    // Store in legacy key with different appId
    localStorage.setItem(LEGACY_MODE_KEY, JSON.stringify({ mode: "author", appId: "other-app" }));

    const storage = new KeyStorage(TEST_APP_ID);
    expect(storage.getStoredMode()).toBeNull();
});

test("clearStoredKey also clears matching legacy key", () => {
    const storage = new KeyStorage(TEST_APP_ID);

    // Store in both scoped and legacy keys
    storage.storeKey("my-key");
    localStorage.setItem(
        LEGACY_AUTH_KEY,
        JSON.stringify({ key: "legacy-key", appId: TEST_APP_ID }),
    );

    storage.clearStoredKey();

    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_AUTH_KEY)).toBeNull();
});

test("clearStoredKey does not clear legacy key for different appId", () => {
    const storage = new KeyStorage(TEST_APP_ID);

    // Store legacy key for different app
    localStorage.setItem(
        LEGACY_AUTH_KEY,
        JSON.stringify({ key: "other-app-key", appId: "other-app" }),
    );

    storage.storeKey("my-key");
    storage.clearStoredKey();

    // Legacy key for other app should still exist
    expect(localStorage.getItem(LEGACY_AUTH_KEY)).not.toBeNull();
});
