/**
 * Content parsing tests - verifying typed content is displayed correctly
 */

import { test, expect, beforeAll, afterAll } from "vitest";
import { setContent } from "~/@browser-support/test-helpers.js";
import {
    initializeSDK,
    setupTestHelpers,
    generateTestAppId,
} from "~/@browser-support/sdk-helpers.js";

beforeAll(async () => {
    setupTestHelpers();
    const appId = generateTestAppId();

    // Set up typed content for all parsing tests
    // Link with type field
    await setContent(
        appId,
        "test-link-parsing",
        JSON.stringify({
            type: "link",
            href: "https://parsed-link.com",
            target: "_blank",
            value: "Parsed Link Text",
        }),
    );

    // HTML content with type field
    await setContent(
        appId,
        "test-title-parsing",
        JSON.stringify({
            type: "html",
            value: "<strong>Bold Title</strong>",
        }),
    );

    // Text content with type field
    await setContent(
        appId,
        "test-paragraph-parsing",
        JSON.stringify({
            type: "text",
            value: "Plain text content",
        }),
    );

    await initializeSDK({ appId });
});

test("typed link content is parsed correctly (not shown as raw JSON)", async () => {
    const link = document.querySelector(
        '[data-scms-link="test-link-parsing"]',
    ) as HTMLAnchorElement;

    // Verify the link text is the parsed text, NOT the raw JSON
    expect(link.textContent).toBe("Parsed Link Text");
    expect(link.textContent).not.toContain("{");
    expect(link.textContent).not.toContain("type");

    // Verify href and target are set correctly
    expect(link.getAttribute("href")).toBe("https://parsed-link.com");
    expect(link.getAttribute("target")).toBe("_blank");
});

test("typed html content is parsed correctly", async () => {
    const title = document.querySelector('[data-scms-html="test-title-parsing"]');
    expect(title?.innerHTML).toBe("<strong>Bold Title</strong>");
    expect(title?.innerHTML).not.toContain("type");
});

test("typed text content is parsed correctly", async () => {
    const paragraph = document.querySelector('[data-scms-html="test-paragraph-parsing"]');
    expect(paragraph?.textContent).toBe("Plain text content");
    expect(paragraph?.textContent).not.toContain("{");
});

test("link content has proper attributes parsed from type:link format", async () => {
    // Verify the typed link format is fully parsed
    const link = document.querySelector(
        '[data-scms-link="test-link-parsing"]',
    ) as HTMLAnchorElement;

    // href and target should be set from the JSON structure
    expect(link.href).toContain("parsed-link.com");
    expect(link.target).toBe("_blank");

    // The display text should be the value, not any JSON
    expect(link.textContent).toBe("Parsed Link Text");
});
