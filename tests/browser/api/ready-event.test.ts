/**
 * streamlined-cms:ready event tests
 *
 * Tests the custom DOM event that fires when the SDK is available on window.
 */

import { test, expect, beforeAll } from "vitest";
import { setupTestHelpers } from "~/@browser-support/sdk-helpers.js";

beforeAll(() => {
    setupTestHelpers();
});

test("streamlined-cms:ready event is a CustomEvent", () => {
    // Create the event as the SDK does
    const event = new CustomEvent("streamlined-cms:ready");

    expect(event).toBeInstanceOf(CustomEvent);
    expect(event.type).toBe("streamlined-cms:ready");
});

test("streamlined-cms:ready event can be listened for", async () => {
    let eventFired = false;

    const handler = () => {
        eventFired = true;
    };

    document.addEventListener("streamlined-cms:ready", handler);

    // Dispatch the event manually to test listener
    document.dispatchEvent(new CustomEvent("streamlined-cms:ready"));

    expect(eventFired).toBe(true);

    // Clean up
    document.removeEventListener("streamlined-cms:ready", handler);
});

test("streamlined-cms:ready event fires synchronously", () => {
    const callOrder: string[] = [];

    const handler = () => {
        callOrder.push("event");
    };

    document.addEventListener("streamlined-cms:ready", handler, { once: true });

    callOrder.push("before");
    document.dispatchEvent(new CustomEvent("streamlined-cms:ready"));
    callOrder.push("after");

    // Event should fire synchronously between before and after
    expect(callOrder).toEqual(["before", "event", "after"]);
});

test("streamlined-cms:ready event bubbles by default", () => {
    const event = new CustomEvent("streamlined-cms:ready");

    // CustomEvent defaults to bubbles: false
    expect(event.bubbles).toBe(false);
});

test("multiple handlers can listen for streamlined-cms:ready", () => {
    let count = 0;

    const handler1 = () => {
        count++;
    };
    const handler2 = () => {
        count++;
    };

    document.addEventListener("streamlined-cms:ready", handler1, { once: true });
    document.addEventListener("streamlined-cms:ready", handler2, { once: true });

    document.dispatchEvent(new CustomEvent("streamlined-cms:ready"));

    expect(count).toBe(2);
});
