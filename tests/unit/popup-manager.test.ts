import { test, expect, describe, vi, afterEach } from "vitest";
import { PopupManager } from "../../src/popup-manager.js";

describe("PopupManager", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test("opens the login popup with the app ID and the auth handshake marker", async () => {
        // A blocked popup resolves at once, so no real window is needed
        const open = vi.spyOn(window, "open").mockReturnValue(null);
        const manager = new PopupManager({ appId: "app 1", appUrl: "https://app.example.com" });

        await expect(manager.openLoginPopup()).resolves.toBeNull();

        const url = new URL(open.mock.calls[0][0] as string);
        expect(url.origin + url.pathname).toBe("https://app.example.com/login");
        expect(url.searchParams.get("appId")).toBe("app 1");
        expect(url.searchParams.get("flow")).toBe("popup-auth");
    });
});
