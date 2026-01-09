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
    const testTitle = page.locator('[data-scms-html="test-title"]');
    const isVisible = await testTitle.isVisible();
    expect(isVisible).toBe(true);
});

test("editable elements have visual indicators on hover", async () => {
    await page.goto(testUrl);

    // Wait for SDK to initialize
    await page.waitForSelector(".streamlined-editable");

    const testTitle = page.locator('[data-scms-html="test-title"]');

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

    const testTitle = page.locator('[data-scms-html="test-title"]');

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

    const testTitle = page.locator('[data-scms-html="test-title"]');

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
    await page.waitForFunction(
        () => {
            const title = document.querySelector('[data-scms-html="test-title"]');
            return title && !title.classList.contains("streamlined-editing");
        },
        { timeout: 3000 },
    );

    // Verify content persists after reload
    await page.reload();
    await page.waitForSelector("scms-toolbar");

    const reloadedTitle = page.locator('[data-scms-html="test-title"]');
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
    server.setContent(
        "test-app",
        "test-link",
        JSON.stringify({
            type: "link",
            href: "https://parsed-link.com",
            target: "_blank",
            value: "Parsed Link Text",
        }),
    );

    await page.goto(testUrl);
    await page.waitForSelector(".streamlined-editable");

    const link = page.locator('[data-scms-link="test-link"]');

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
    server.setContent(
        "test-app",
        "test-title",
        JSON.stringify({
            type: "html",
            value: "<strong>Bold Title</strong>",
        }),
    );

    await page.goto(testUrl);
    await page.waitForSelector(".streamlined-editable");

    const title = page.locator('[data-scms-html="test-title"]');
    const innerHTML = await title.innerHTML();

    expect(innerHTML).toBe("<strong>Bold Title</strong>");
    expect(innerHTML).not.toContain("type");
});

test("typed text content is parsed correctly", async () => {
    server.clearContent();
    server.setContent(
        "test-app",
        "test-paragraph",
        JSON.stringify({
            type: "text",
            value: "Plain text content",
        }),
    );

    await page.goto(testUrl);
    await page.waitForSelector(".streamlined-editable");

    const paragraph = page.locator('[data-scms-html="test-paragraph"]');
    const textContent = await paragraph.textContent();

    expect(textContent).toBe("Plain text content");
    expect(textContent).not.toContain("{");
});

test("JSON without type field uses element's declared type", async () => {
    server.clearContent();
    // Link format: JSON with href/target/value but NO type field
    server.setContent(
        "test-app",
        "test-link",
        JSON.stringify({
            href: "https://old-format-link.com",
            target: "_blank",
            value: "Old Format Link",
        }),
    );

    await page.goto(testUrl);
    await page.waitForSelector(".streamlined-editable");

    const link = page.locator('[data-scms-link="test-link"]');

    // This should NOT show raw JSON - the link should be parsed
    const linkText = await link.textContent();
    expect(linkText).toBe("Old Format Link");
    expect(linkText).not.toContain("{");

    const href = await link.getAttribute("href");
    expect(href).toBe("https://old-format-link.com");
});

// Template tests

test("template with single instance shows default content", async () => {
    server.clearContent();

    await page.goto(testUrl);
    await page.waitForSelector(".streamlined-editable");

    // Template should have one instance with default content
    const teamContainer = page.locator('[data-scms-template="team"]');
    const teamMembers = teamContainer.locator(".team-member");

    expect(await teamMembers.count()).toBe(1);

    const name = teamMembers.first().locator('[data-scms-text="name"]');
    expect(await name.textContent()).toBe("Default Name");
});

test("template clones instances based on stored content", async () => {
    server.clearContent();
    // Set content for 3 team member instances using stable IDs
    server.setContent(
        "test-app",
        "team.abc12.name",
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    server.setContent(
        "test-app",
        "team.abc12.role",
        JSON.stringify({ type: "text", value: "CEO" }),
    );
    server.setContent(
        "test-app",
        "team.def34.name",
        JSON.stringify({ type: "text", value: "Bob" }),
    );
    server.setContent(
        "test-app",
        "team.def34.role",
        JSON.stringify({ type: "text", value: "CTO" }),
    );
    server.setContent(
        "test-app",
        "team.ghi56.name",
        JSON.stringify({ type: "text", value: "Carol" }),
    );
    server.setContent(
        "test-app",
        "team.ghi56.role",
        JSON.stringify({ type: "text", value: "Designer" }),
    );
    server.setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34", "ghi56"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector(".streamlined-editable");

    const teamContainer = page.locator('[data-scms-template="team"]');
    const teamMembers = teamContainer.locator(".team-member");

    // Should have 3 instances
    expect(await teamMembers.count()).toBe(3);

    // Verify content of each instance
    expect(await teamMembers.nth(0).locator('[data-scms-text="name"]').textContent()).toBe("Alice");
    expect(await teamMembers.nth(0).locator('[data-scms-text="role"]').textContent()).toBe("CEO");
    expect(await teamMembers.nth(1).locator('[data-scms-text="name"]').textContent()).toBe("Bob");
    expect(await teamMembers.nth(1).locator('[data-scms-text="role"]').textContent()).toBe("CTO");
    expect(await teamMembers.nth(2).locator('[data-scms-text="name"]').textContent()).toBe("Carol");
    expect(await teamMembers.nth(2).locator('[data-scms-text="role"]').textContent()).toBe(
        "Designer",
    );
});

test("template instances have correct data-scms-instance attributes", async () => {
    server.clearContent();
    server.setContent(
        "test-app",
        "team.abc12.name",
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    server.setContent(
        "test-app",
        "team.def34.name",
        JSON.stringify({ type: "text", value: "Bob" }),
    );
    server.setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector(".streamlined-editable");

    const teamContainer = page.locator('[data-scms-template="team"]');
    const teamMembers = teamContainer.locator(".team-member");

    // Each instance should have data-scms-instance attribute with stable ID
    expect(await teamMembers.nth(0).getAttribute("data-scms-instance")).toBe("abc12");
    expect(await teamMembers.nth(1).getAttribute("data-scms-instance")).toBe("def34");
});

test("template inside group uses grouped storage keys", async () => {
    server.clearContent();
    // Template inside sidebar group - storage format: groupId:templateId.instanceId.elementId
    server.setContent(
        "test-app",
        "sidebar:testimonials.abc12.quote",
        JSON.stringify({ type: "text", value: "Great product!" }),
    );
    server.setContent(
        "test-app",
        "sidebar:testimonials.abc12.author",
        JSON.stringify({ type: "text", value: "John Doe" }),
    );
    server.setContent(
        "test-app",
        "sidebar:testimonials.def34.quote",
        JSON.stringify({ type: "text", value: "Love it!" }),
    );
    server.setContent(
        "test-app",
        "sidebar:testimonials.def34.author",
        JSON.stringify({ type: "text", value: "Jane Smith" }),
    );
    server.setContent(
        "test-app",
        "sidebar:testimonials._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector(".streamlined-editable");

    const testimonialContainer = page.locator('[data-scms-template="testimonials"]');
    const testimonials = testimonialContainer.locator(".testimonial");

    // Should have 2 instances
    expect(await testimonials.count()).toBe(2);

    // Verify content
    expect(await testimonials.nth(0).locator('[data-scms-text="quote"]').textContent()).toBe(
        "Great product!",
    );
    expect(await testimonials.nth(0).locator('[data-scms-text="author"]').textContent()).toBe(
        "John Doe",
    );
    expect(await testimonials.nth(1).locator('[data-scms-text="quote"]').textContent()).toBe(
        "Love it!",
    );
    expect(await testimonials.nth(1).locator('[data-scms-text="author"]').textContent()).toBe(
        "Jane Smith",
    );
});

test("editing template instance element saves with correct key", async () => {
    server.clearContent();
    server.setContent(
        "test-app",
        "team.abc12.name",
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    server.setContent(
        "test-app",
        "team.def34.name",
        JSON.stringify({ type: "text", value: "Bob" }),
    );
    server.setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    // Edit the second team member's name
    const teamMembers = page.locator('[data-scms-template="team"] .team-member');
    const secondName = teamMembers.nth(1).locator('[data-scms-text="name"]');

    await secondName.click();
    await secondName.fill("Bobby");

    // Save
    const saveButton = page.locator("scms-toolbar").locator("button:has-text('Save')");
    await saveButton.click();

    // Wait for save to complete
    await page.waitForFunction(
        () => {
            const name = document
                .querySelectorAll('[data-scms-template="team"] .team-member')[1]
                ?.querySelector('[data-scms-text="name"]');
            return name && !name.classList.contains("streamlined-editing");
        },
        { timeout: 3000 },
    );

    // Reload and verify content persisted with correct key (team.def34.name)
    await page.reload();
    await page.waitForSelector(".streamlined-editable");

    const reloadedMembers = page.locator('[data-scms-template="team"] .team-member');
    expect(await reloadedMembers.nth(0).locator('[data-scms-text="name"]').textContent()).toBe(
        "Alice",
    );
    expect(await reloadedMembers.nth(1).locator('[data-scms-text="name"]').textContent()).toBe(
        "Bobby",
    );
});

// Multi-instance template tests (all children recognized as instances)

test("all template children are recognized as instances when no API data", async () => {
    server.clearContent();

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    // The features template has 3 children in the HTML
    const featuresContainer = page.locator('[data-scms-template="features"]');
    const featureItems = featuresContainer.locator(".feature-item");

    // All 3 children should be recognized as instances
    expect(await featureItems.count()).toBe(3);

    // Each should have an instance ID assigned
    for (let i = 0; i < 3; i++) {
        const instanceId = await featureItems.nth(i).getAttribute("data-scms-instance");
        expect(instanceId).toMatch(/^[a-z0-9]{5}$/);
    }

    // Original content should be preserved
    expect(await featureItems.nth(0).locator('[data-scms-text="feature"]').textContent()).toBe(
        "Feature One",
    );
    expect(await featureItems.nth(1).locator('[data-scms-text="feature"]').textContent()).toBe(
        "Feature Two",
    );
    expect(await featureItems.nth(2).locator('[data-scms-text="feature"]').textContent()).toBe(
        "Feature Three",
    );
});

test("template structure mismatch is detected and marked", async () => {
    server.clearContent();

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    // The mismatched template has children with different structures
    const mismatchedContainer = page.locator('[data-scms-template="mismatched"]');
    const items = mismatchedContainer.locator(".item");

    // Both items should exist
    expect(await items.count()).toBe(2);

    // First item should NOT have mismatch marker (it's the template definition)
    expect(await items.nth(0).getAttribute("data-scms-structure-mismatch")).toBeNull();

    // Second item SHOULD have mismatch marker (different structure)
    expect(await items.nth(1).getAttribute("data-scms-structure-mismatch")).toBe("true");
});

test("API data replaces DOM children with cloned instances", async () => {
    // Set up API data with 2 instances (different from the 3 in HTML)
    server.clearContent();
    server.setContent(
        "test-app",
        "features.inst1.feature",
        JSON.stringify({ type: "text", value: "API Feature A" }),
    );
    server.setContent(
        "test-app",
        "features.inst2.feature",
        JSON.stringify({ type: "text", value: "API Feature B" }),
    );
    server.setContent("test-app", "features._order", JSON.stringify(["inst1", "inst2"]));

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const featuresContainer = page.locator('[data-scms-template="features"]');
    const featureItems = featuresContainer.locator(".feature-item");

    // Should have 2 instances (from API), not 3 (from HTML)
    expect(await featureItems.count()).toBe(2);

    // Content should be from API
    expect(await featureItems.nth(0).locator('[data-scms-text="feature"]').textContent()).toBe(
        "API Feature A",
    );
    expect(await featureItems.nth(1).locator('[data-scms-text="feature"]').textContent()).toBe(
        "API Feature B",
    );
});

// Group inside template tests (shared content across instances)

test("group inside template shares content across all instances", async () => {
    server.clearContent();
    // Set up 3 product instances using stable IDs
    server.setContent(
        "test-app",
        "products.abc12.product-name",
        JSON.stringify({ type: "text", value: "Widget A" }),
    );
    server.setContent(
        "test-app",
        "products.def34.product-name",
        JSON.stringify({ type: "text", value: "Widget B" }),
    );
    server.setContent(
        "test-app",
        "products.ghi56.product-name",
        JSON.stringify({ type: "text", value: "Widget C" }),
    );
    server.setContent(
        "test-app",
        "products._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34", "ghi56"] }),
    );
    // Shared company info (no template instance, just group:element)
    server.setContent(
        "test-app",
        "company:name",
        JSON.stringify({ type: "text", value: "Acme Corp" }),
    );
    server.setContent(
        "test-app",
        "company:tagline",
        JSON.stringify({ type: "text", value: "Quality Products" }),
    );

    await page.goto(testUrl);
    await page.waitForSelector(".streamlined-editable");

    const products = page.locator('[data-scms-template="products"] .product-card');

    // Should have 3 product instances
    expect(await products.count()).toBe(3);

    // Each product has unique name
    expect(await products.nth(0).locator('[data-scms-text="product-name"]').textContent()).toBe(
        "Widget A",
    );
    expect(await products.nth(1).locator('[data-scms-text="product-name"]').textContent()).toBe(
        "Widget B",
    );
    expect(await products.nth(2).locator('[data-scms-text="product-name"]').textContent()).toBe(
        "Widget C",
    );

    // All products share the same company info
    for (let i = 0; i < 3; i++) {
        const companyName = await products
            .nth(i)
            .locator('[data-scms-group="company"] [data-scms-text="name"]')
            .textContent();
        const tagline = await products
            .nth(i)
            .locator('[data-scms-group="company"] [data-scms-text="tagline"]')
            .textContent();
        expect(companyName).toBe("Acme Corp");
        expect(tagline).toBe("Quality Products");
    }
});

test("editing group element inside template updates all instances in real-time", async () => {
    server.clearContent();
    // Set up 2 product instances using stable IDs
    server.setContent(
        "test-app",
        "products.abc12.product-name",
        JSON.stringify({ type: "text", value: "Product 1" }),
    );
    server.setContent(
        "test-app",
        "products.def34.product-name",
        JSON.stringify({ type: "text", value: "Product 2" }),
    );
    server.setContent(
        "test-app",
        "products._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34"] }),
    );
    // Shared company name
    server.setContent(
        "test-app",
        "company:name",
        JSON.stringify({ type: "text", value: "Old Company" }),
    );

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const products = page.locator('[data-scms-template="products"] .product-card');
    expect(await products.count()).toBe(2);

    // Click on company name in first product
    const firstCompanyName = products
        .nth(0)
        .locator('[data-scms-group="company"] [data-scms-text="name"]');
    const secondCompanyName = products
        .nth(1)
        .locator('[data-scms-group="company"] [data-scms-text="name"]');

    await firstCompanyName.click();

    // Verify first element is in editing mode
    const firstClass = await firstCompanyName.getAttribute("class");
    expect(firstClass).toContain("streamlined-editing");

    // Verify second element shows sibling styling
    const secondClass = await secondCompanyName.getAttribute("class");
    expect(secondClass).toContain("streamlined-editing-sibling");

    // Type new content in first element
    await firstCompanyName.fill("New Company Name");

    // Both elements should show the new content immediately (real-time sync)
    expect(await firstCompanyName.textContent()).toBe("New Company Name");
    expect(await secondCompanyName.textContent()).toBe("New Company Name");
});

test("saving shared group element persists with correct key format", async () => {
    server.clearContent();
    server.setContent(
        "test-app",
        "products.abc12.product-name",
        JSON.stringify({ type: "text", value: "Product 1" }),
    );
    server.setContent(
        "test-app",
        "products.def34.product-name",
        JSON.stringify({ type: "text", value: "Product 2" }),
    );
    server.setContent(
        "test-app",
        "products._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34"] }),
    );
    server.setContent(
        "test-app",
        "company:name",
        JSON.stringify({ type: "text", value: "Original" }),
    );

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const products = page.locator('[data-scms-template="products"] .product-card');
    const firstCompanyName = products
        .nth(0)
        .locator('[data-scms-group="company"] [data-scms-text="name"]');

    await firstCompanyName.click();
    await firstCompanyName.fill("Updated Company");

    // Save
    const saveButton = page.locator("scms-toolbar").locator("button:has-text('Save')");
    await saveButton.click();

    // Wait for save to complete
    await page.waitForFunction(
        () => {
            const el = document.querySelector(
                '[data-scms-template="products"] .product-card [data-scms-group="company"] [data-scms-text="name"]',
            );
            return el && !el.classList.contains("streamlined-editing");
        },
        { timeout: 3000 },
    );

    // Reload and verify content persisted
    await page.reload();
    await page.waitForSelector(".streamlined-editable");

    const reloadedProducts = page.locator('[data-scms-template="products"] .product-card');

    // Both instances should show the updated company name
    expect(
        await reloadedProducts
            .nth(0)
            .locator('[data-scms-group="company"] [data-scms-text="name"]')
            .textContent(),
    ).toBe("Updated Company");
    expect(
        await reloadedProducts
            .nth(1)
            .locator('[data-scms-group="company"] [data-scms-text="name"]')
            .textContent(),
    ).toBe("Updated Company");
});

test("inline group attribute on same element scopes content correctly", async () => {
    server.clearContent();
    // Content stored with inline group key: groupId:elementId
    server.setContent(
        "test-app",
        "company-name:name",
        JSON.stringify({ type: "text", value: "Acme Corporation" }),
    );

    await page.goto(testUrl);
    await page.waitForSelector(".streamlined-editable");

    // Element has both data-scms-group="company-name" and data-scms-text="name" on same element
    const inlineGroupElement = page.locator(
        '[data-scms-group="company-name"][data-scms-text="name"]',
    );
    expect(await inlineGroupElement.textContent()).toBe("Acme Corporation");
});

// Template instance add/remove tests

test("add button appears in author mode for templates", async () => {
    server.clearContent();

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    // Add button should be visible in author mode
    const addButton = page.locator('[data-scms-template="team"] .scms-template-add');
    expect(await addButton.isVisible()).toBe(true);
    expect(await addButton.textContent()).toContain("Add item");
});

test("clicking add button creates new template instance", async () => {
    server.clearContent();
    server.setContent(
        "test-app",
        "team.abc12.name",
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    server.setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["abc12"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const teamContainer = page.locator('[data-scms-template="team"]');
    const teamMembers = teamContainer.locator(".team-member");

    // Initially 1 instance
    expect(await teamMembers.count()).toBe(1);

    // Click add button
    const addButton = teamContainer.locator(".scms-template-add");
    await addButton.click();

    // Now should have 2 instances
    expect(await teamMembers.count()).toBe(2);

    // New instance should have a stable ID (5 alphanumeric characters)
    const instanceId = await teamMembers.nth(1).getAttribute("data-scms-instance");
    expect(instanceId).toMatch(/^[a-z0-9]{5}$/);

    // New instance should have empty content (clean template)
    const newName = teamMembers.nth(1).locator('[data-scms-text="name"]');
    expect(await newName.textContent()).toBe("");
});

test("new instance elements are editable", async () => {
    server.clearContent();

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const teamContainer = page.locator('[data-scms-template="team"]');

    // Add a new instance
    await teamContainer.locator(".scms-template-add").click();

    const teamMembers = teamContainer.locator(".team-member");
    expect(await teamMembers.count()).toBe(2);

    // Click on name in new instance to edit
    const newName = teamMembers.nth(1).locator('[data-scms-text="name"]');
    await newName.click();

    // Should be editable
    const isEditable = await newName.getAttribute("contenteditable");
    expect(isEditable).toBe("true");

    // Type new content
    await newName.fill("New Team Member");
    expect(await newName.textContent()).toBe("New Team Member");
});

test("new instance edits are saved and persist after reload", async () => {
    server.clearContent();
    server.setContent(
        "test-app",
        "team.abc12.name",
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    server.setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["abc12"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const teamContainer = page.locator('[data-scms-template="team"]');
    let teamMembers = teamContainer.locator(".team-member");

    // Initially 1 instance
    expect(await teamMembers.count()).toBe(1);

    // Add a new instance
    await teamContainer.locator(".scms-template-add").click();
    teamMembers = teamContainer.locator(".team-member");
    expect(await teamMembers.count()).toBe(2);

    // Edit the new instance's name
    const newName = teamMembers.nth(1).locator('[data-scms-text="name"]');
    await newName.click();
    await newName.fill("New Team Member");

    // Also edit the role
    const newRole = teamMembers.nth(1).locator('[data-scms-text="role"]');
    await newRole.click();
    await newRole.fill("New Role");

    // Save
    const saveButton = page.locator("scms-toolbar").locator("button:has-text('Save')");
    await saveButton.click();

    // Wait for save to complete
    await page.waitForFunction(
        () => {
            const el = document
                .querySelectorAll('[data-scms-template="team"] .team-member')[1]
                ?.querySelector('[data-scms-text="role"]');
            return el && !el.classList.contains("streamlined-editing");
        },
        { timeout: 3000 },
    );

    // Reload and verify new instance content persisted
    await page.reload();
    await page.waitForSelector(".streamlined-editable");

    const reloadedMembers = page.locator('[data-scms-template="team"] .team-member');

    // Should still have 2 instances
    expect(await reloadedMembers.count()).toBe(2);

    // Original instance should be unchanged
    expect(await reloadedMembers.nth(0).locator('[data-scms-text="name"]').textContent()).toBe(
        "Alice",
    );

    // New instance content should have persisted
    expect(await reloadedMembers.nth(1).locator('[data-scms-text="name"]').textContent()).toBe(
        "New Team Member",
    );
    expect(await reloadedMembers.nth(1).locator('[data-scms-text="role"]').textContent()).toBe(
        "New Role",
    );
});

test("delete button appears on instance hover", async () => {
    server.clearContent();
    server.setContent(
        "test-app",
        "team.abc12.name",
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    server.setContent(
        "test-app",
        "team.def34.name",
        JSON.stringify({ type: "text", value: "Bob" }),
    );
    server.setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const teamMembers = page.locator('[data-scms-template="team"] .team-member');
    expect(await teamMembers.count()).toBe(2);

    // Hover over second instance
    await teamMembers.nth(1).hover();

    // Delete button should become visible
    const deleteButton = teamMembers.nth(1).locator(".scms-instance-delete");
    await page.waitForFunction(
        () => {
            const btn = document
                .querySelectorAll('[data-scms-template="team"] .team-member')[1]
                ?.querySelector(".scms-instance-delete");
            return btn && window.getComputedStyle(btn).opacity === "1";
        },
        { timeout: 2000 },
    );

    expect(await deleteButton.isVisible()).toBe(true);
});

test("clicking delete button removes instance", async () => {
    server.clearContent();
    // Use stable instance IDs in content keys
    server.setContent(
        "test-app",
        "team.abc12.name",
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    server.setContent(
        "test-app",
        "team.def34.name",
        JSON.stringify({ type: "text", value: "Bob" }),
    );
    server.setContent(
        "test-app",
        "team.ghi56.name",
        JSON.stringify({ type: "text", value: "Carol" }),
    );
    // Order array determines display order
    server.setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34", "ghi56"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const teamContainer = page.locator('[data-scms-template="team"]');
    let teamMembers = teamContainer.locator(".team-member");
    expect(await teamMembers.count()).toBe(3);

    // Hover and click delete on second instance (Bob)
    await teamMembers.nth(1).hover();
    const deleteButton = teamMembers.nth(1).locator(".scms-instance-delete");
    await deleteButton.click();

    // Should now have 2 instances
    teamMembers = teamContainer.locator(".team-member");
    expect(await teamMembers.count()).toBe(2);

    // Remaining should be Alice and Carol
    expect(await teamMembers.nth(0).locator('[data-scms-text="name"]').textContent()).toBe("Alice");
    expect(await teamMembers.nth(1).locator('[data-scms-text="name"]').textContent()).toBe("Carol");

    // Instance IDs should remain unchanged (no renumbering with stable IDs)
    expect(await teamMembers.nth(0).getAttribute("data-scms-instance")).toBe("abc12");
    expect(await teamMembers.nth(1).getAttribute("data-scms-instance")).toBe("ghi56");
});

test("cannot delete last instance", async () => {
    server.clearContent();
    server.setContent(
        "test-app",
        "team.abc12.name",
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    server.setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["abc12"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const teamMembers = page.locator('[data-scms-template="team"] .team-member');
    expect(await teamMembers.count()).toBe(1);

    // Delete button should not exist for single instance (or not be visible)
    const deleteButton = teamMembers.first().locator(".scms-instance-delete");
    const count = await deleteButton.count();

    // Either no button exists, or if it does exist it shouldn't allow deletion
    if (count > 0) {
        await teamMembers.first().hover();
        // Even if we try to click, instance should remain
        await deleteButton.click().catch(() => {});
        expect(await teamMembers.count()).toBe(1);
    }
});

// Toolbar template controls tests

test("toolbar shows template controls when editing element inside template", async () => {
    server.clearContent();
    server.setContent(
        "test-app",
        "team.abc12.name",
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    server.setContent(
        "test-app",
        "team.def34.name",
        JSON.stringify({ type: "text", value: "Bob" }),
    );
    server.setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    // Click on a template element
    const teamMembers = page.locator('[data-scms-template="team"] .team-member');
    const firstName = teamMembers.nth(0).locator('[data-scms-text="name"]');
    await firstName.click();

    // Template controls should be visible in toolbar
    const moveUpButton = page.locator("scms-toolbar").locator("button[title='Move up']");
    const moveDownButton = page.locator("scms-toolbar").locator("button[title='Move down']");
    const addButton = page.locator("scms-toolbar").locator("button[title='Add item']");
    const deleteButton = page.locator("scms-toolbar").locator("button[title='Delete item']");

    expect(await moveUpButton.isVisible()).toBe(true);
    expect(await moveDownButton.isVisible()).toBe(true);
    expect(await addButton.isVisible()).toBe(true);
    expect(await deleteButton.isVisible()).toBe(true);
});

test("toolbar template controls are hidden when editing non-template element", async () => {
    server.clearContent();

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    // Click on a non-template element (test-title is not in a template)
    const testTitle = page.locator('[data-scms-html="test-title"]');
    await testTitle.click();

    // Template controls should NOT be visible in toolbar
    const moveUpButton = page.locator("scms-toolbar").locator("button[title='Move up']");
    expect(await moveUpButton.count()).toBe(0);
});

test("toolbar move up button reorders instance", async () => {
    server.clearContent();
    server.setContent(
        "test-app",
        "team.abc12.name",
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    server.setContent(
        "test-app",
        "team.def34.name",
        JSON.stringify({ type: "text", value: "Bob" }),
    );
    server.setContent(
        "test-app",
        "team.ghi56.name",
        JSON.stringify({ type: "text", value: "Carol" }),
    );
    server.setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34", "ghi56"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const teamMembers = page.locator('[data-scms-template="team"] .team-member');

    // Verify initial order
    expect(await teamMembers.nth(0).locator('[data-scms-text="name"]').textContent()).toBe("Alice");
    expect(await teamMembers.nth(1).locator('[data-scms-text="name"]').textContent()).toBe("Bob");
    expect(await teamMembers.nth(2).locator('[data-scms-text="name"]').textContent()).toBe("Carol");

    // Click on second instance to select it
    const secondName = teamMembers.nth(1).locator('[data-scms-text="name"]');
    await secondName.click();

    // Click move up button in toolbar
    const moveUpButton = page.locator("scms-toolbar").locator("button[title='Move up']");
    await moveUpButton.click();

    // Order should now be Bob, Alice, Carol
    expect(await teamMembers.nth(0).locator('[data-scms-text="name"]').textContent()).toBe("Bob");
    expect(await teamMembers.nth(1).locator('[data-scms-text="name"]').textContent()).toBe("Alice");
    expect(await teamMembers.nth(2).locator('[data-scms-text="name"]').textContent()).toBe("Carol");
});

test("toolbar move down button reorders instance", async () => {
    server.clearContent();
    server.setContent(
        "test-app",
        "team.abc12.name",
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    server.setContent(
        "test-app",
        "team.def34.name",
        JSON.stringify({ type: "text", value: "Bob" }),
    );
    server.setContent(
        "test-app",
        "team.ghi56.name",
        JSON.stringify({ type: "text", value: "Carol" }),
    );
    server.setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34", "ghi56"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const teamMembers = page.locator('[data-scms-template="team"] .team-member');

    // Click on first instance to select it
    const firstName = teamMembers.nth(0).locator('[data-scms-text="name"]');
    await firstName.click();

    // Click move down button in toolbar
    const moveDownButton = page.locator("scms-toolbar").locator("button[title='Move down']");
    await moveDownButton.click();

    // Order should now be Bob, Alice, Carol
    expect(await teamMembers.nth(0).locator('[data-scms-text="name"]').textContent()).toBe("Bob");
    expect(await teamMembers.nth(1).locator('[data-scms-text="name"]').textContent()).toBe("Alice");
    expect(await teamMembers.nth(2).locator('[data-scms-text="name"]').textContent()).toBe("Carol");
});

test("toolbar move up button is disabled for first instance", async () => {
    server.clearContent();
    server.setContent(
        "test-app",
        "team.abc12.name",
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    server.setContent(
        "test-app",
        "team.def34.name",
        JSON.stringify({ type: "text", value: "Bob" }),
    );
    server.setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    // Click on first instance
    const teamMembers = page.locator('[data-scms-template="team"] .team-member');
    const firstName = teamMembers.nth(0).locator('[data-scms-text="name"]');
    await firstName.click();

    // Move up button should be disabled
    const moveUpButton = page.locator("scms-toolbar").locator("button[title='Move up']");
    const isDisabled = await moveUpButton.isDisabled();
    expect(isDisabled).toBe(true);
});

test("toolbar move down button is disabled for last instance", async () => {
    server.clearContent();
    server.setContent(
        "test-app",
        "team.abc12.name",
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    server.setContent(
        "test-app",
        "team.def34.name",
        JSON.stringify({ type: "text", value: "Bob" }),
    );
    server.setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    // Click on last instance
    const teamMembers = page.locator('[data-scms-template="team"] .team-member');
    const lastName = teamMembers.nth(1).locator('[data-scms-text="name"]');
    await lastName.click();

    // Move down button should be disabled
    const moveDownButton = page.locator("scms-toolbar").locator("button[title='Move down']");
    const isDisabled = await moveDownButton.isDisabled();
    expect(isDisabled).toBe(true);
});

test("toolbar add button creates new instance", async () => {
    server.clearContent();
    server.setContent(
        "test-app",
        "team.abc12.name",
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    server.setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["abc12"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const teamContainer = page.locator('[data-scms-template="team"]');
    let teamMembers = teamContainer.locator(".team-member");

    // Initially 1 instance
    expect(await teamMembers.count()).toBe(1);

    // Click on the instance to select it
    const firstName = teamMembers.nth(0).locator('[data-scms-text="name"]');
    await firstName.click();

    // Click add button in toolbar
    const addButton = page.locator("scms-toolbar").locator("button[title='Add item']");
    await addButton.click();

    // Now should have 2 instances
    teamMembers = teamContainer.locator(".team-member");
    expect(await teamMembers.count()).toBe(2);
});

test("toolbar delete button removes current instance", async () => {
    server.clearContent();
    server.setContent(
        "test-app",
        "team.abc12.name",
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    server.setContent(
        "test-app",
        "team.def34.name",
        JSON.stringify({ type: "text", value: "Bob" }),
    );
    server.setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const teamContainer = page.locator('[data-scms-template="team"]');
    let teamMembers = teamContainer.locator(".team-member");

    // Initially 2 instances
    expect(await teamMembers.count()).toBe(2);

    // Click on second instance to select it
    const secondName = teamMembers.nth(1).locator('[data-scms-text="name"]');
    await secondName.click();

    // Click delete button in toolbar
    const deleteButton = page.locator("scms-toolbar").locator("button[title='Delete item']");
    await deleteButton.click();

    // Now should have 1 instance
    teamMembers = teamContainer.locator(".team-member");
    expect(await teamMembers.count()).toBe(1);

    // Remaining should be Alice
    expect(await teamMembers.nth(0).locator('[data-scms-text="name"]').textContent()).toBe("Alice");
});

test("toolbar delete button is disabled for single instance", async () => {
    server.clearContent();
    server.setContent(
        "test-app",
        "team.abc12.name",
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    server.setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["abc12"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    // Click on the only instance
    const teamMembers = page.locator('[data-scms-template="team"] .team-member');
    const firstName = teamMembers.nth(0).locator('[data-scms-text="name"]');
    await firstName.click();

    // Delete button should be disabled
    const deleteButton = page.locator("scms-toolbar").locator("button[title='Delete item']");
    const isDisabled = await deleteButton.isDisabled();
    expect(isDisabled).toBe(true);
});

test("reorder is saved and persists after reload", async () => {
    server.clearContent();
    server.setContent(
        "test-app",
        "team.abc12.name",
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    server.setContent(
        "test-app",
        "team.def34.name",
        JSON.stringify({ type: "text", value: "Bob" }),
    );
    server.setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const teamMembers = page.locator('[data-scms-template="team"] .team-member');

    // Verify initial order
    expect(await teamMembers.nth(0).locator('[data-scms-text="name"]').textContent()).toBe("Alice");
    expect(await teamMembers.nth(1).locator('[data-scms-text="name"]').textContent()).toBe("Bob");

    // Click on second instance and move up
    const secondName = teamMembers.nth(1).locator('[data-scms-text="name"]');
    await secondName.click();
    const moveUpButton = page.locator("scms-toolbar").locator("button[title='Move up']");
    await moveUpButton.click();

    // Verify new order
    expect(await teamMembers.nth(0).locator('[data-scms-text="name"]').textContent()).toBe("Bob");
    expect(await teamMembers.nth(1).locator('[data-scms-text="name"]').textContent()).toBe("Alice");

    // Save changes
    const saveButton = page.locator("scms-toolbar").locator("button:has-text('Save')");
    await saveButton.click();

    // Wait for save to complete
    await page.waitForFunction(
        () => {
            const toolbar = document.querySelector("scms-toolbar");
            return toolbar && !toolbar.hasAttribute("saving");
        },
        { timeout: 3000 },
    );

    // Reload and verify order persisted
    await page.reload();
    await page.waitForSelector(".streamlined-editable");

    const reloadedMembers = page.locator('[data-scms-template="team"] .team-member');
    expect(await reloadedMembers.nth(0).locator('[data-scms-text="name"]').textContent()).toBe(
        "Bob",
    );
    expect(await reloadedMembers.nth(1).locator('[data-scms-text="name"]').textContent()).toBe(
        "Alice",
    );
});

// Drag-and-drop reordering tests

test("drag handle appears on instance hover when multiple instances exist", async () => {
    server.clearContent();
    server.setContent(
        "test-app",
        "team.abc12.name",
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    server.setContent(
        "test-app",
        "team.def34.name",
        JSON.stringify({ type: "text", value: "Bob" }),
    );
    server.setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const teamMembers = page.locator('[data-scms-template="team"] .team-member');

    // Hover over first instance
    await teamMembers.nth(0).hover();

    // Drag handle should become visible
    const dragHandle = teamMembers.nth(0).locator(".scms-instance-drag-handle");
    await page.waitForFunction(
        () => {
            const handle = document.querySelector(
                '[data-scms-template="team"] .team-member .scms-instance-drag-handle',
            );
            return handle && window.getComputedStyle(handle).opacity === "1";
        },
        { timeout: 2000 },
    );

    expect(await dragHandle.isVisible()).toBe(true);
});

test("drag handle does not appear for single instance", async () => {
    server.clearContent();
    server.setContent(
        "test-app",
        "team.abc12.name",
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    server.setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["abc12"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const teamMembers = page.locator('[data-scms-template="team"] .team-member');

    // Hover over the only instance
    await teamMembers.nth(0).hover();

    // Drag handle should not exist
    const dragHandle = teamMembers.nth(0).locator(".scms-instance-drag-handle");
    expect(await dragHandle.count()).toBe(0);
});

test("drag and drop reorders instances", async () => {
    server.clearContent();
    server.setContent(
        "test-app",
        "team.abc12.name",
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    server.setContent(
        "test-app",
        "team.def34.name",
        JSON.stringify({ type: "text", value: "Bob" }),
    );
    server.setContent(
        "test-app",
        "team.ghi56.name",
        JSON.stringify({ type: "text", value: "Carol" }),
    );
    server.setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34", "ghi56"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const teamMembers = page.locator('[data-scms-template="team"] .team-member');

    // Verify initial order
    expect(await teamMembers.nth(0).locator('[data-scms-text="name"]').textContent()).toBe("Alice");
    expect(await teamMembers.nth(1).locator('[data-scms-text="name"]').textContent()).toBe("Bob");
    expect(await teamMembers.nth(2).locator('[data-scms-text="name"]').textContent()).toBe("Carol");

    // Get the drag handle of the third instance (Carol)
    const thirdDragHandle = teamMembers.nth(2).locator(".scms-instance-drag-handle");
    const firstInstance = teamMembers.nth(0);

    // Drag Carol to the first position
    await thirdDragHandle.dragTo(firstInstance, { targetPosition: { x: 50, y: 10 } });

    // Wait for reorder to complete
    await page.waitForTimeout(200);

    // Order should now be Carol, Alice, Bob
    expect(await teamMembers.nth(0).locator('[data-scms-text="name"]').textContent()).toBe("Carol");
    expect(await teamMembers.nth(1).locator('[data-scms-text="name"]').textContent()).toBe("Alice");
    expect(await teamMembers.nth(2).locator('[data-scms-text="name"]').textContent()).toBe("Bob");
});

test("toolbar hides Sign Out and Admin buttons when mock auth is enabled", async () => {
    server.clearContent();

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    // The test page uses data-mock-auth="true", so Sign Out and Admin should be hidden
    const toolbar = page.locator("scms-toolbar");

    // Sign Out button should not exist
    const signOutButton = toolbar.locator("button:has-text('Sign Out')");
    expect(await signOutButton.count()).toBe(0);

    // Admin link should not exist
    const adminLink = toolbar.locator("a:has-text('Admin')");
    expect(await adminLink.count()).toBe(0);
});

test("invalid API key is cleared on page load and shows sign-in link", async () => {
    server.clearContent();

    const expiredApiKey = "expired-test-key";

    // Mark this API key as invalid (server will return 401)
    server.setInvalidApiKey(expiredApiKey);

    // Set up localStorage with the expired key before navigating
    // We need to navigate first to set localStorage on the correct origin
    const authTestUrl = `${testUrl}/auth-test.html`;
    await page.goto(authTestUrl);

    // Set the expired API key in localStorage using the SDK's storage format
    await page.evaluate((key) => {
        // scms_auth stores { key, appId }
        localStorage.setItem("scms_auth", JSON.stringify({ key, appId: "test-app" }));
        // scms_mode stores { mode, appId }
        localStorage.setItem("scms_mode", JSON.stringify({ mode: "author", appId: "test-app" }));
    }, expiredApiKey);

    // Reload the page - SDK should validate the key and clear it
    await page.reload();

    // Wait for SDK to initialize - should show sign-in link, not toolbar
    await page.waitForSelector("scms-sign-in-link");

    // Toolbar should NOT be present
    const toolbar = page.locator("scms-toolbar");
    expect(await toolbar.count()).toBe(0);

    // Sign-in link should be visible
    const signInLink = page.locator("scms-sign-in-link");
    expect(await signInLink.isVisible()).toBe(true);

    // localStorage should have the auth key cleared
    const storedAuth = await page.evaluate(() => localStorage.getItem("scms_auth"));
    expect(storedAuth).toBeNull();

    // Clean up
    server.clearInvalidApiKeys();
});

test("drag and drop marks changes as unsaved", async () => {
    server.clearContent();
    server.setContent(
        "test-app",
        "team.abc12.name",
        JSON.stringify({ type: "text", value: "Alice" }),
    );
    server.setContent(
        "test-app",
        "team.def34.name",
        JSON.stringify({ type: "text", value: "Bob" }),
    );
    server.setContent(
        "test-app",
        "team._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const teamMembers = page.locator('[data-scms-template="team"] .team-member');

    // Save button should not be visible initially
    let saveButton = page.locator("scms-toolbar").locator("button:has-text('Save')");
    expect(await saveButton.count()).toBe(0);

    // Drag second instance to first position
    const secondDragHandle = teamMembers.nth(1).locator(".scms-instance-drag-handle");
    const firstInstance = teamMembers.nth(0);
    await secondDragHandle.dragTo(firstInstance, { targetPosition: { x: 50, y: 10 } });

    // Wait for reorder
    await page.waitForTimeout(200);

    // Save button should now be visible
    saveButton = page.locator("scms-toolbar").locator("button:has-text('Save')");
    expect(await saveButton.isVisible()).toBe(true);
});

// Template where instance element IS the editable element (e.g., <li data-scms-text="item">)

test("template instance that is also the editable element gets proper instance ID", async () => {
    server.clearContent();

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    // The checklist template has <li data-scms-text="item"> where the <li> is both instance and editable
    const checklistContainer = page.locator('[data-scms-template="checklist"]');
    const items = checklistContainer.locator("li");

    // All 3 items should be recognized
    expect(await items.count()).toBe(3);

    // Each <li> should have a data-scms-instance attribute assigned
    for (let i = 0; i < 3; i++) {
        const instanceId = await items.nth(i).getAttribute("data-scms-instance");
        expect(instanceId).toMatch(/^[a-z0-9]{5}$/);
    }
});

test("template instance that is also the editable element is editable", async () => {
    server.clearContent();

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const checklistContainer = page.locator('[data-scms-template="checklist"]');
    const items = checklistContainer.locator("li");

    // Each <li> should have the streamlined-editable class
    for (let i = 0; i < 3; i++) {
        const className = await items.nth(i).getAttribute("class");
        expect(className).toContain("streamlined-editable");
    }
});

test("clicking template instance that is also editable starts editing", async () => {
    server.clearContent();

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const checklistContainer = page.locator('[data-scms-template="checklist"]');
    const firstItem = checklistContainer.locator("li").first();

    // Click to start editing
    await firstItem.click();

    // Should be contenteditable
    const isEditable = await firstItem.getAttribute("contenteditable");
    expect(isEditable).toBe("true");

    // Should have editing class
    const className = await firstItem.getAttribute("class");
    expect(className).toContain("streamlined-editing");
});

test("template instance=editable loads content from API", async () => {
    server.clearContent();
    // Set content for checklist items where instance element IS the editable element
    server.setContent(
        "test-app",
        "checklist.abc12.item",
        JSON.stringify({ type: "text", value: "Buy groceries" }),
    );
    server.setContent(
        "test-app",
        "checklist.def34.item",
        JSON.stringify({ type: "text", value: "Walk the dog" }),
    );
    server.setContent(
        "test-app",
        "checklist._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector(".streamlined-editable");

    const checklistContainer = page.locator('[data-scms-template="checklist"]');
    const items = checklistContainer.locator("li");

    // Should have 2 instances from API (not 3 from HTML)
    expect(await items.count()).toBe(2);

    // Content should match API data (use innerText to avoid delete button's ×)
    expect(await items.nth(0).innerText()).toContain("Buy groceries");
    expect(await items.nth(1).innerText()).toContain("Walk the dog");
});

test("adding new instance works when instance=editable", async () => {
    server.clearContent();
    server.setContent(
        "test-app",
        "checklist.abc12.item",
        JSON.stringify({ type: "text", value: "First task" }),
    );
    server.setContent(
        "test-app",
        "checklist._order",
        JSON.stringify({ type: "order", value: ["abc12"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const checklistContainer = page.locator('[data-scms-template="checklist"]');
    let items = checklistContainer.locator("li");

    // Initially 1 instance
    expect(await items.count()).toBe(1);

    // Click add button
    const addButton = checklistContainer.locator(".scms-template-add");
    await addButton.click();

    // Should now have 2 instances
    items = checklistContainer.locator("li");
    expect(await items.count()).toBe(2);

    // New instance should have instance ID
    const newInstanceId = await items.nth(1).getAttribute("data-scms-instance");
    expect(newInstanceId).toMatch(/^[a-z0-9]{5}$/);

    // New instance should be editable
    const className = await items.nth(1).getAttribute("class");
    expect(className).toContain("streamlined-editable");
});

test("editing and saving instance=editable element works", async () => {
    server.clearContent();
    server.setContent(
        "test-app",
        "checklist.abc12.item",
        JSON.stringify({ type: "text", value: "Original task" }),
    );
    server.setContent(
        "test-app",
        "checklist._order",
        JSON.stringify({ type: "order", value: ["abc12"] }),
    );

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const checklistContainer = page.locator('[data-scms-template="checklist"]');
    const firstItem = checklistContainer.locator("li").first();

    // Click to edit
    await firstItem.click();

    // Edit content
    await firstItem.fill("Updated task");

    // Save
    const saveButton = page.locator("scms-toolbar").locator("button:has-text('Save')");
    await saveButton.click();

    // Wait for save to complete
    await page.waitForFunction(
        () => {
            const item = document.querySelector('[data-scms-template="checklist"] li');
            return item && !item.classList.contains("streamlined-editing");
        },
        { timeout: 3000 },
    );

    // Reload and verify
    await page.reload();
    await page.waitForSelector(".streamlined-editable");

    const reloadedItem = page.locator('[data-scms-template="checklist"] li').first();
    expect(await reloadedItem.textContent()).toBe("Updated task");
});

// Bug fix: HTML-derived template items should be saved when order changes

test("adding new instance saves existing HTML-derived items", async () => {
    // This test verifies the fix for the bug where existing template items
    // derived from HTML (not from API) were not being saved when a new item
    // was added and saved. The order would reference 4 items but only the
    // new item's content would be saved, leaving the original 3 empty.
    server.clearContent();

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    // The features template has 3 children in the HTML with default content
    const featuresContainer = page.locator('[data-scms-template="features"]');
    let featureItems = featuresContainer.locator(".feature-item");

    // Verify initial state: 3 HTML-derived items
    expect(await featureItems.count()).toBe(3);
    expect(await featureItems.nth(0).locator('[data-scms-text="feature"]').textContent()).toBe(
        "Feature One",
    );
    expect(await featureItems.nth(1).locator('[data-scms-text="feature"]').textContent()).toBe(
        "Feature Two",
    );
    expect(await featureItems.nth(2).locator('[data-scms-text="feature"]').textContent()).toBe(
        "Feature Three",
    );

    // Add a new instance
    const addButton = featuresContainer.locator(".scms-template-add");
    await addButton.click();

    // Should now have 4 items
    featureItems = featuresContainer.locator(".feature-item");
    expect(await featureItems.count()).toBe(4);

    // Edit the new item
    const newFeature = featureItems.nth(3).locator('[data-scms-text="feature"]');
    await newFeature.click();
    await newFeature.fill("Feature Four");

    // Save
    const saveButton = page.locator("scms-toolbar").locator("button:has-text('Save')");
    await saveButton.click();

    // Wait for save to complete
    await page.waitForFunction(
        () => {
            const feature = document
                .querySelectorAll('[data-scms-template="features"] .feature-item')[3]
                ?.querySelector('[data-scms-text="feature"]');
            return feature && !feature.classList.contains("streamlined-editing");
        },
        { timeout: 3000 },
    );

    // Reload and verify ALL 4 items persist (not just the new one)
    await page.reload();
    await page.waitForSelector(".streamlined-editable");

    const reloadedFeatures = page.locator('[data-scms-template="features"] .feature-item');

    // Should have 4 items
    expect(await reloadedFeatures.count()).toBe(4);

    // All 4 items should have their content (the 3 original HTML-derived + 1 new)
    expect(await reloadedFeatures.nth(0).locator('[data-scms-text="feature"]').textContent()).toBe(
        "Feature One",
    );
    expect(await reloadedFeatures.nth(1).locator('[data-scms-text="feature"]').textContent()).toBe(
        "Feature Two",
    );
    expect(await reloadedFeatures.nth(2).locator('[data-scms-text="feature"]').textContent()).toBe(
        "Feature Three",
    );
    expect(await reloadedFeatures.nth(3).locator('[data-scms-text="feature"]').textContent()).toBe(
        "Feature Four",
    );
});
