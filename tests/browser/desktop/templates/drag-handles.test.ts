/**
 * Drag handle tests - verifying drag handles appear/hide correctly
 */

import { test, expect, beforeAll, afterAll } from "vitest";
import { setContent } from "../support/test-helpers.js";
import {
    initializeSDK,
    setupTestHelpers,
    
} from "../support/sdk-helpers.js";

beforeAll(async () => {
    setupTestHelpers();

    // Set up team with 2 members for drag handle tests
    await setContent("test-app", "team.drag1.name", JSON.stringify({ type: "text", value: "Alice" }));
    await setContent("test-app", "team.drag2.name", JSON.stringify({ type: "text", value: "Bob" }));
    await setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["drag1", "drag2"] }),
    );

    await initializeSDK();
});


test("drag handle appears on instance hover when multiple instances exist", async () => {
    const teamMembers = document.querySelectorAll('[data-scms-template="team"] .team-member');

    // Should have 2 instances
    expect(teamMembers.length).toBe(2);

    // Drag handle should exist
    const dragHandle = teamMembers[0].querySelector(".scms-instance-drag-handle");
    expect(dragHandle).not.toBeNull();
});

test("drag handle exists for second instance too", async () => {
    const teamMembers = document.querySelectorAll('[data-scms-template="team"] .team-member');

    // Second instance should also have drag handle
    const dragHandle = teamMembers[1].querySelector(".scms-instance-drag-handle");
    expect(dragHandle).not.toBeNull();
});
