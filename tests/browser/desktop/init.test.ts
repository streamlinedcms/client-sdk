/**
 * Initialization and basic browser tests.
 * Tests here verify default behavior when no API content is set.
 */

import { test, expect, beforeAll } from "vitest";
import { initializeSDK, setupTestHelpers } from "~/@browser-support/sdk-helpers.js";

beforeAll(async () => {
    setupTestHelpers();
    // No content set - testing default behavior
    await initializeSDK();
});

test("test page loads successfully", async () => {
    // Check that the page title is correct
    expect(document.title).toBe("Streamlined CMS - Browser Test");

    // Verify test elements are visible
    const testTitle = document.querySelector('[data-scms-html="test-title"]');
    expect(testTitle).not.toBeNull();
    expect(testTitle?.classList.contains("streamlined-editable")).toBe(true);
});

test("editable elements have visual indicators", async () => {
    const testTitle = document.querySelector('[data-scms-html="test-title"]') as HTMLElement;

    // Check that the element has the editable class (applied during SDK init)
    expect(testTitle.classList.contains("streamlined-editable")).toBe(true);
});

test("SDK initializes without errors", async () => {
    // SDK was already initialized in beforeAll
    // Verify no errors occurred (would have thrown)
    const testTitle = document.querySelector('[data-scms-html="test-title"]');
    expect(testTitle).not.toBeNull();
});

test("template renders instances with correct structure", async () => {
    // Verify the team template renders correctly (may have API data from other tests)
    const teamContainer = document.querySelector('[data-scms-template="team"]');
    const teamMembers = teamContainer?.querySelectorAll(".team-member");

    // At least one instance should exist
    expect(teamMembers?.length).toBeGreaterThanOrEqual(1);

    // Each instance should have the expected child elements
    const firstMember = teamMembers?.[0];
    expect(firstMember?.querySelector('[data-scms-text="name"]')).not.toBeNull();
    expect(firstMember?.querySelector('[data-scms-text="role"]')).not.toBeNull();
});

test("template instances have proper structure and instance IDs", async () => {
    // The features template should have instances with proper structure
    const featuresContainer = document.querySelector('[data-scms-template="features"]');
    const featureItems = featuresContainer?.querySelectorAll(".feature-item");

    // Should have at least one instance
    expect(featureItems?.length).toBeGreaterThanOrEqual(1);

    // Each instance should have an instance ID assigned
    for (let i = 0; i < (featureItems?.length ?? 0); i++) {
        const instanceId = featureItems?.[i].getAttribute("data-scms-instance");
        expect(instanceId).toMatch(/^[a-z0-9]{5}$/);

        // Each instance should have the expected child elements
        expect(featureItems?.[i].querySelector('[data-scms-text="feature"]')).not.toBeNull();
    }
});
