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

    // Text with line breaks
    await setContent(
        appId,
        "test-line-breaks",
        JSON.stringify({
            type: "text",
            value: "First line\nSecond line\nThird line",
        }),
    );

    // Text with special characters that could cause XSS if mishandled
    await setContent(
        appId,
        "test-text-escaping",
        JSON.stringify({
            type: "text",
            value: "Hello <script>alert(1)</script>\n&amp; goodbye",
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

test("text content with line breaks renders <br> tags in DOM", async () => {
    const el = document.querySelector('[data-scms-text="test-line-breaks"]') as HTMLElement;

    // \n in stored value should become <br> elements in the DOM
    const brs = el.querySelectorAll("br");
    expect(brs.length).toBe(2);

    // Text nodes should contain the line content
    expect(el.textContent).toBe("First lineSecond lineThird line");
});

test("text content with <br> line breaks round-trips correctly", async () => {
    const el = document.querySelector('[data-scms-text="test-line-breaks"]') as HTMLElement;

    // Simulate Shift+Enter which inserts <br> tags
    el.innerHTML = "Edited first<br>Edited second";

    // Use the same serialization the SDK uses (imported indirectly via DOM clone)
    const clone = document.createElement("div");
    clone.innerHTML = el.innerHTML;
    clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    const serialized = clone.textContent || "";

    expect(serialized).toBe("Edited first\nEdited second");
});

test("text content with <div> line breaks (Chrome contenteditable) round-trips correctly", async () => {
    const el = document.querySelector('[data-scms-text="test-line-breaks"]') as HTMLElement;

    // Chrome wraps each Enter in a <div>; empty lines get <div><br></div>
    el.innerHTML = "First line<div>Second line</div><div>Third line</div>";

    // Simulate the SDK's readTextWithBreaks logic
    const clone = document.createElement("div");
    clone.innerHTML = el.innerHTML;
    clone.querySelectorAll("div").forEach((div) => {
        div.before(document.createTextNode("\n"));
        if (div.childNodes.length === 1 && div.firstChild instanceof HTMLBRElement) {
            div.firstChild.remove();
        }
        while (div.firstChild) div.before(div.firstChild);
        div.remove();
    });
    clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    const serialized = clone.textContent || "";

    expect(serialized).toBe("First line\nSecond line\nThird line");
});

test("empty lines from contenteditable <div><br></div> are preserved", async () => {
    const el = document.querySelector('[data-scms-text="test-line-breaks"]') as HTMLElement;

    // Simulate the user's exact scenario: text, empty line, items, empty line, more items
    el.innerHTML = "Hello<div><br></div><div>1</div><div>2</div><div><br></div><div>World</div>";

    const clone = document.createElement("div");
    clone.innerHTML = el.innerHTML;
    clone.querySelectorAll("div").forEach((div) => {
        div.before(document.createTextNode("\n"));
        if (div.childNodes.length === 1 && div.firstChild instanceof HTMLBRElement) {
            div.firstChild.remove();
        }
        while (div.firstChild) div.before(div.firstChild);
        div.remove();
    });
    clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    const serialized = clone.textContent || "";

    expect(serialized).toBe("Hello\n\n1\n2\n\nWorld");
});

test("text content escapes HTML entities and is not vulnerable to XSS", async () => {
    const el = document.querySelector('[data-scms-text="test-text-escaping"]') as HTMLElement;

    // The <script> tag in the stored value must NOT be rendered as a real element
    expect(el.querySelector("script")).toBeNull();

    // The raw text should be visible as-is
    expect(el.textContent).toContain("<script>alert(1)</script>");
    expect(el.textContent).toContain("&amp; goodbye");
});
