/**
 * Template rendering tests - verifying templates are cloned and displayed correctly
 *
 * These tests share a single initialization with consistent API content.
 * Tests that verify "default" behavior (no API data) are in init.browser.test.ts.
 */

import { test, expect, beforeAll } from "vitest";
import { setContent } from "~/@browser-support/test-helpers.js";
import {
    initializeSDK,
    setupTestHelpers,
    generateTestAppId,
} from "~/@browser-support/sdk-helpers.js";

beforeAll(async () => {
    setupTestHelpers();

    // Generate unique app ID for test isolation
    const appId = generateTestAppId();

    // Set up content for all templates that will be tested
    // Team template: 3 instances with known IDs
    await setContent(appId, "team-rendering.abc12.name", JSON.stringify({ type: "text", value: "Alice" }));
    await setContent(appId, "team-rendering.abc12.role", JSON.stringify({ type: "text", value: "CEO" }));
    await setContent(appId, "team-rendering.def34.name", JSON.stringify({ type: "text", value: "Bob" }));
    await setContent(appId, "team-rendering.def34.role", JSON.stringify({ type: "text", value: "CTO" }));
    await setContent(appId, "team-rendering.ghi56.name", JSON.stringify({ type: "text", value: "Carol" }));
    await setContent(appId, "team-rendering.ghi56.role", JSON.stringify({ type: "text", value: "Designer" }));
    await setContent(
        appId,
        "team-rendering._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34", "ghi56"] }),
    );

    // Testimonials template (inside sidebar group): 2 instances
    await setContent(
        appId,
        "sidebar:testimonials.test1.quote",
        JSON.stringify({ type: "text", value: "Great product!" }),
    );
    await setContent(
        appId,
        "sidebar:testimonials.test1.author",
        JSON.stringify({ type: "text", value: "John Doe" }),
    );
    await setContent(
        appId,
        "sidebar:testimonials.test2.quote",
        JSON.stringify({ type: "text", value: "Love it!" }),
    );
    await setContent(
        appId,
        "sidebar:testimonials.test2.author",
        JSON.stringify({ type: "text", value: "Jane Smith" }),
    );
    await setContent(
        appId,
        "sidebar:testimonials._order",
        JSON.stringify({ type: "order", value: ["test1", "test2"] }),
    );

    // Features template: 2 instances from API (will replace 3 HTML children)
    await setContent(
        appId,
        "features.feat1.feature",
        JSON.stringify({ type: "text", value: "API Feature A" }),
    );
    await setContent(
        appId,
        "features.feat2.feature",
        JSON.stringify({ type: "text", value: "API Feature B" }),
    );
    await setContent(appId, "features._order", JSON.stringify({ type: "order", value: ["feat1", "feat2"] }));

    // Initialize SDK once for all tests
    await initializeSDK({ appId });
});


test("template clones instances based on stored content", async () => {
    const teamContainer = document.querySelector('[data-scms-template="team-rendering"]');
    const teamMembers = teamContainer?.querySelectorAll(".team-member");

    // Should have 3 instances from API
    expect(teamMembers?.length).toBe(3);

    // Verify content of each instance
    expect(teamMembers?.[0].querySelector('[data-scms-text="name"]')?.textContent).toBe("Alice");
    expect(teamMembers?.[0].querySelector('[data-scms-text="role"]')?.textContent).toBe("CEO");
    expect(teamMembers?.[1].querySelector('[data-scms-text="name"]')?.textContent).toBe("Bob");
    expect(teamMembers?.[1].querySelector('[data-scms-text="role"]')?.textContent).toBe("CTO");
    expect(teamMembers?.[2].querySelector('[data-scms-text="name"]')?.textContent).toBe("Carol");
    expect(teamMembers?.[2].querySelector('[data-scms-text="role"]')?.textContent).toBe("Designer");
});

test("template instances have correct data-scms-instance attributes", async () => {
    const teamContainer = document.querySelector('[data-scms-template="team-rendering"]');
    const teamMembers = teamContainer?.querySelectorAll(".team-member");

    // Each instance should have data-scms-instance attribute with stable ID
    expect(teamMembers?.[0].getAttribute("data-scms-instance")).toBe("abc12");
    expect(teamMembers?.[1].getAttribute("data-scms-instance")).toBe("def34");
    expect(teamMembers?.[2].getAttribute("data-scms-instance")).toBe("ghi56");
});

test("template inside group uses grouped storage keys", async () => {
    const testimonialContainer = document.querySelector('[data-scms-template="testimonials"]');
    const testimonials = testimonialContainer?.querySelectorAll(".testimonial");

    // Should have 2 instances from API
    expect(testimonials?.length).toBe(2);

    // Verify content
    expect(testimonials?.[0].querySelector('[data-scms-text="quote"]')?.textContent).toBe(
        "Great product!",
    );
    expect(testimonials?.[0].querySelector('[data-scms-text="author"]')?.textContent).toBe("John Doe");
    expect(testimonials?.[1].querySelector('[data-scms-text="quote"]')?.textContent).toBe("Love it!");
    expect(testimonials?.[1].querySelector('[data-scms-text="author"]')?.textContent).toBe("Jane Smith");
});

test("template structure mismatch is detected and marked", async () => {
    // The mismatched template has children with different structures (no API data for this one)
    const mismatchedContainer = document.querySelector('[data-scms-template="mismatched"]');
    const items = mismatchedContainer?.querySelectorAll(".item");

    // Both items should exist
    expect(items?.length).toBe(2);

    // First item should NOT have mismatch marker (it's the template definition)
    expect(items?.[0].getAttribute("data-scms-structure-mismatch")).toBeNull();

    // Second item SHOULD have mismatch marker (different structure)
    expect(items?.[1].getAttribute("data-scms-structure-mismatch")).toBe("true");
});

test("API data replaces DOM children with cloned instances", async () => {
    const featuresContainer = document.querySelector('[data-scms-template="features"]');
    const featureItems = featuresContainer?.querySelectorAll(".feature-item");

    // Should have 2 instances (from API), not 3 (from HTML)
    expect(featureItems?.length).toBe(2);

    // Content should be from API
    expect(featureItems?.[0].querySelector('[data-scms-text="feature"]')?.textContent).toBe(
        "API Feature A",
    );
    expect(featureItems?.[1].querySelector('[data-scms-text="feature"]')?.textContent).toBe(
        "API Feature B",
    );
});
