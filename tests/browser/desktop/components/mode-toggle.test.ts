/**
 * Mode Toggle Component tests
 */

import { test, expect, beforeAll } from "vitest";
import { initializeSDK, setupTestHelpers } from "~/@browser-support/sdk-helpers.js";

beforeAll(async () => {
    setupTestHelpers();
    await initializeSDK();
});

/**
 * Helper to get mode toggle from toolbar
 */
function getModeToggle(): Element | null {
    const toolbar = document.querySelector("scms-toolbar");
    return toolbar?.shadowRoot?.querySelector("scms-mode-toggle") ?? null;
}

test("mode toggle shows Preview and Editing buttons", async () => {
    const toggle = getModeToggle();
    expect(toggle).not.toBeNull();

    const shadowRoot = toggle?.shadowRoot;
    const buttons = shadowRoot?.querySelectorAll("button");
    expect(buttons?.length).toBe(2);

    const buttonTexts = Array.from(buttons || []).map((b) => b.textContent?.trim());
    expect(buttonTexts).toContain("Preview");
    expect(buttonTexts).toContain("Editing");
});

test("clicking Preview button from author mode dispatches mode-change event", async () => {
    const toggle = getModeToggle();
    const shadowRoot = toggle?.shadowRoot;

    // SDK starts in author mode, clicking Preview should dispatch viewer
    let modeChanged: string | null = null;
    toggle?.addEventListener("mode-change", ((e: CustomEvent) => {
        modeChanged = e.detail.mode;
    }) as EventListener);

    const buttons = shadowRoot?.querySelectorAll("button");
    const previewBtn = Array.from(buttons || []).find((b) => b.textContent?.includes("Preview"));
    previewBtn?.click();

    await new Promise((r) => setTimeout(r, 50));

    expect(modeChanged).toBe("viewer");
});

test("clicking Editing button from viewer mode dispatches mode-change event", async () => {
    const toggle = getModeToggle();
    const shadowRoot = toggle?.shadowRoot;

    // First switch to viewer mode
    const buttons = shadowRoot?.querySelectorAll("button");
    const previewBtn = Array.from(buttons || []).find((b) => b.textContent?.includes("Preview"));
    previewBtn?.click();

    await new Promise((r) => setTimeout(r, 50));

    // Now test switching back to author
    let modeChanged: string | null = null;
    toggle?.addEventListener("mode-change", ((e: CustomEvent) => {
        modeChanged = e.detail.mode;
    }) as EventListener);

    const editingBtn = Array.from(buttons || []).find((b) => b.textContent?.includes("Editing"));
    editingBtn?.click();

    await new Promise((r) => setTimeout(r, 50));

    expect(modeChanged).toBe("author");
});

test("clicking same mode button does not dispatch event", async () => {
    const toggle = getModeToggle();
    const shadowRoot = toggle?.shadowRoot;

    // The SDK starts in author mode, so clicking Editing shouldn't dispatch
    let eventCount = 0;
    toggle?.addEventListener("mode-change", () => {
        eventCount++;
    });

    const buttons = shadowRoot?.querySelectorAll("button");
    const editingBtn = Array.from(buttons || []).find((b) => b.textContent?.includes("Editing"));
    editingBtn?.click();

    await new Promise((r) => setTimeout(r, 50));

    // Should not have dispatched since we're already in author mode
    expect(eventCount).toBe(0);
});
