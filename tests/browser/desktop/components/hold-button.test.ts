/**
 * Hold Button Component tests
 *
 * Tests the hold button that requires holding for a duration before triggering.
 */

import { test, expect, beforeAll, beforeEach } from "vitest";
import {
    initializeSDK,
    waitForCondition,
    setupTestHelpers,
} from "~/@browser-support/sdk-helpers.js";
import type { HoldButton } from "~/src/components/hold-button.js";

beforeAll(async () => {
    setupTestHelpers();
    await initializeSDK();
});

/**
 * Helper to get hold button from toolbar (Reset button uses hold-button)
 */
function getHoldButton(): HoldButton | null {
    const toolbar = document.querySelector("scms-toolbar");
    return toolbar?.shadowRoot?.querySelector("scms-hold-button") as HoldButton | null;
}

/**
 * Helper to select an element to make the Reset button appear
 */
async function selectElement(): Promise<void> {
    const htmlElement = document.querySelector('[data-scms-html="test-title"]') as HTMLElement;
    htmlElement.click();
    await waitForCondition(() => htmlElement.classList.contains("streamlined-editing"));
}

/**
 * Helper to deselect element
 */
async function deselectElement(): Promise<void> {
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));
}

beforeEach(async () => {
    await deselectElement();
});

test("hold button appears when editing element", async () => {
    await selectElement();

    const holdButton = getHoldButton();
    expect(holdButton).not.toBeNull();
    expect(holdButton?.label).toBe("Reset");
});

test("hold button shows label", async () => {
    await selectElement();

    const holdButton = getHoldButton();
    const shadowRoot = holdButton?.shadowRoot;
    const button = shadowRoot?.querySelector("button");
    expect(button?.textContent).toContain("Reset");
});

test("mousedown starts hold progress", async () => {
    await selectElement();

    const holdButton = getHoldButton();
    const shadowRoot = holdButton?.shadowRoot;
    const button = shadowRoot?.querySelector("button") as HTMLButtonElement;

    // Start hold
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    // Wait a bit for progress to start
    await new Promise((r) => setTimeout(r, 100));

    // Progress should be > 0
    const progressBg = shadowRoot?.querySelector(".progress-bg") as HTMLElement;
    const width = parseFloat(progressBg.style.width);
    expect(width).toBeGreaterThan(0);

    // Cancel to prevent the hold from completing
    button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
});

test("mouseup cancels hold", async () => {
    await selectElement();

    const holdButton = getHoldButton();
    const shadowRoot = holdButton?.shadowRoot;
    const button = shadowRoot?.querySelector("button") as HTMLButtonElement;

    // Start hold
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));

    // Cancel with mouseup
    button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));

    // Progress should be reset to 0
    const progressBg = shadowRoot?.querySelector(".progress-bg") as HTMLElement;
    const width = parseFloat(progressBg.style.width);
    expect(width).toBe(0);
});

test("mouseleave cancels hold", async () => {
    await selectElement();

    const holdButton = getHoldButton();
    const shadowRoot = holdButton?.shadowRoot;
    const button = shadowRoot?.querySelector("button") as HTMLButtonElement;

    // Start hold
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));

    // Cancel with mouseleave
    button.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));

    // Progress should be reset to 0
    const progressBg = shadowRoot?.querySelector(".progress-bg") as HTMLElement;
    const width = parseFloat(progressBg.style.width);
    expect(width).toBe(0);
});

test("holding for full duration dispatches hold-complete event", async () => {
    await selectElement();

    const holdButton = getHoldButton();
    const shadowRoot = holdButton?.shadowRoot;
    const button = shadowRoot?.querySelector("button") as HTMLButtonElement;

    // The Reset button has holdDuration of 800ms
    let holdComplete = false;
    holdButton?.addEventListener("hold-complete", () => {
        holdComplete = true;
    });

    // Start hold
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    // Wait for hold duration to complete (800ms + buffer)
    await waitForCondition(() => holdComplete, 1500);

    expect(holdComplete).toBe(true);
});

test("touchstart starts hold progress", async () => {
    await selectElement();

    const holdButton = getHoldButton();
    const shadowRoot = holdButton?.shadowRoot;
    const button = shadowRoot?.querySelector("button") as HTMLButtonElement;

    // Start touch hold
    button.dispatchEvent(new TouchEvent("touchstart", { bubbles: true }));

    // Wait a bit for progress to start
    await new Promise((r) => setTimeout(r, 100));

    // Progress should be > 0
    const progressBg = shadowRoot?.querySelector(".progress-bg") as HTMLElement;
    const width = parseFloat(progressBg.style.width);
    expect(width).toBeGreaterThan(0);

    // Cancel to prevent the hold from completing
    button.dispatchEvent(new TouchEvent("touchend", { bubbles: true }));
});

test("touchend cancels hold", async () => {
    await selectElement();

    const holdButton = getHoldButton();
    const shadowRoot = holdButton?.shadowRoot;
    const button = shadowRoot?.querySelector("button") as HTMLButtonElement;

    // Start touch hold
    button.dispatchEvent(new TouchEvent("touchstart", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));

    // Cancel with touchend
    button.dispatchEvent(new TouchEvent("touchend", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));

    // Progress should be reset to 0
    const progressBg = shadowRoot?.querySelector(".progress-bg") as HTMLElement;
    const width = parseFloat(progressBg.style.width);
    expect(width).toBe(0);
});
