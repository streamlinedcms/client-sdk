import { test, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { chromium, Browser, Page } from "playwright";
import { TestServer } from "./server.js";

/**
 * Browser tests for inline editing functionality
 * Tests run against a self-hosted test server with controlled HTML fixtures
 */

let browser: Browser;
let page: Page;
let server: TestServer;
let testUrl: string;

beforeAll(async () => {
    // Start test server
    server = new TestServer(3001);
    await server.start();
    testUrl = server.getUrl();

    // Launch browser once for all tests
    browser = await chromium.launch({
        headless: true, // Set to false to see the browser during development
    });
});

afterAll(async () => {
    await browser.close();
    await server.stop();
});

beforeEach(async () => {
    // Create a new page for each test
    page = await browser.newPage();
});

afterEach(async () => {
    await page.close();
});

test("test page loads successfully", async () => {
    await page.goto(testUrl);

    // Check that the page title is correct
    const title = await page.title();
    expect(title).toBe("Streamlined CMS - Test Page");

    // Wait for SDK to initialize and remove hiding styles
    await page.waitForSelector(".streamlined-editable");

    // Verify test elements are visible
    const testTitle = page.locator('[data-editable="test-title"]');
    const isVisible = await testTitle.isVisible();
    expect(isVisible).toBe(true);
});

test("editable elements have visual indicators on hover", async () => {
    await page.goto(testUrl);

    // Wait for SDK to initialize
    await page.waitForSelector(".streamlined-editable");

    const testTitle = page.locator('[data-editable="test-title"]');

    // Hover over element
    await testTitle.hover();

    // Check that the element has the editable class
    const className = await testTitle.getAttribute("class");
    expect(className).toContain("streamlined-editable");
});

test("user can click to edit content", async () => {
    await page.goto(testUrl);

    // Wait for SDK to initialize (toolbar appears with mock auth)
    await page.waitForSelector("scms-toolbar");

    const testTitle = page.locator('[data-editable="test-title"]');

    // Click to start editing
    await testTitle.click();

    // Verify element is now editable
    const isEditable = await testTitle.getAttribute("contenteditable");
    expect(isEditable).toBe("true");

    // Verify editing class is applied
    const className = await testTitle.getAttribute("class");
    expect(className).toContain("streamlined-editing");

    // Verify toolbar shows the active element (badge is visible)
    const toolbar = page.locator("scms-toolbar");
    expect(await toolbar.isVisible()).toBe(true);
});

test("user can edit and save content", async () => {
    await page.goto(testUrl);

    // Wait for SDK to initialize (toolbar appears with mock auth)
    await page.waitForSelector("scms-toolbar");

    const testTitle = page.locator('[data-editable="test-title"]');

    // Click to start editing
    await testTitle.click();

    // Edit the content
    const newContent = "Test Edit - Browser Test";
    await testTitle.fill(newContent);

    // The save button appears in the toolbar shadow DOM when there are changes
    // Access the save button inside the toolbar's shadow DOM
    const saveButton = page.locator("scms-toolbar").locator("button:has-text('Save')");
    await saveButton.click();

    // Wait for save to complete and element to be deselected
    await page.waitForFunction(() => {
        const title = document.querySelector('[data-editable="test-title"]');
        return title && !title.classList.contains("streamlined-editing");
    }, { timeout: 3000 });

    // Verify content persists after reload
    await page.reload();
    await page.waitForSelector("scms-toolbar");

    const reloadedTitle = page.locator('[data-editable="test-title"]');
    const reloadedContent = await reloadedTitle.textContent();
    expect(reloadedContent).toContain(newContent);
});

test("SDK initializes without errors", async () => {
    // Listen for console errors
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
        if (msg.type() === "error") {
            consoleErrors.push(msg.text());
        }
    });

    await page.goto(testUrl);

    // Wait for SDK to initialize
    await page.waitForSelector(".streamlined-editable");

    // Verify no console errors during initialization
    // (logLevel='none' should suppress warnings about missing content)
    expect(consoleErrors.length).toBe(0);
});

test("content loads from API on page load", async () => {
    await page.goto(testUrl);

    // Wait for SDK to initialize
    await page.waitForSelector(".streamlined-editable");

    // Intercept API calls to verify content loading
    const responses: string[] = [];
    page.on("response", (response) => {
        if (response.url().includes("/apps/test-app/content")) {
            responses.push(response.url());
        }
    });

    // Reload to trigger content load
    await page.reload();
    await page.waitForSelector(".streamlined-editable");

    // Verify API was called
    expect(responses.length).toBeGreaterThan(0);
});

test("typed link content is parsed correctly (not shown as raw JSON)", async () => {
    // Pre-populate content with typed link JSON
    server.setContent("test-app", "test-link", JSON.stringify({
        type: "link",
        href: "https://parsed-link.com",
        target: "_blank",
        text: "Parsed Link Text"
    }));

    await page.goto(testUrl);
    await page.waitForSelector(".streamlined-editable");

    const link = page.locator('[data-editable="test-link"]');

    // Verify the link text is the parsed text, NOT the raw JSON
    const linkText = await link.textContent();
    expect(linkText).toBe("Parsed Link Text");
    expect(linkText).not.toContain("{");
    expect(linkText).not.toContain("type");

    // Verify href and target are set correctly
    const href = await link.getAttribute("href");
    const target = await link.getAttribute("target");
    expect(href).toBe("https://parsed-link.com");
    expect(target).toBe("_blank");
});

test("typed html content is parsed correctly", async () => {
    server.clearContent();
    server.setContent("test-app", "test-title", JSON.stringify({
        type: "html",
        value: "<strong>Bold Title</strong>"
    }));

    await page.goto(testUrl);
    await page.waitForSelector(".streamlined-editable");

    const title = page.locator('[data-editable="test-title"]');
    const innerHTML = await title.innerHTML();

    expect(innerHTML).toBe("<strong>Bold Title</strong>");
    expect(innerHTML).not.toContain("type");
});

test("typed text content is parsed correctly", async () => {
    server.clearContent();
    server.setContent("test-app", "test-paragraph", JSON.stringify({
        type: "text",
        value: "Plain text content"
    }));

    await page.goto(testUrl);
    await page.waitForSelector(".streamlined-editable");

    const paragraph = page.locator('[data-editable="test-paragraph"]');
    const textContent = await paragraph.textContent();

    expect(textContent).toBe("Plain text content");
    expect(textContent).not.toContain("{");
});

test("legacy content without type field still works", async () => {
    server.clearContent();
    // Legacy format: plain HTML string, not JSON
    server.setContent("test-app", "test-heading", "<em>Legacy Content</em>");

    await page.goto(testUrl);
    await page.waitForSelector(".streamlined-editable");

    const heading = page.locator('[data-editable="test-heading"]');
    const innerHTML = await heading.innerHTML();

    expect(innerHTML).toBe("<em>Legacy Content</em>");
});

test("legacy link format without type field is parsed correctly", async () => {
    server.clearContent();
    // Old link format: JSON with href/target/text but NO type field
    server.setContent("test-app", "test-link", JSON.stringify({
        href: "https://old-format-link.com",
        target: "_blank",
        text: "Old Format Link"
    }));

    await page.goto(testUrl);
    await page.waitForSelector(".streamlined-editable");

    const link = page.locator('[data-editable="test-link"]');

    // This should NOT show raw JSON - the link should be parsed
    const linkText = await link.textContent();
    expect(linkText).toBe("Old Format Link");
    expect(linkText).not.toContain("{");

    const href = await link.getAttribute("href");
    expect(href).toBe("https://old-format-link.com");
});
