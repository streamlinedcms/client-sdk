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
    await page.waitForFunction(() => {
        const title = document.querySelector('[data-scms-html="test-title"]');
        return title && !title.classList.contains("streamlined-editing");
    }, { timeout: 3000 });

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
    server.setContent("test-app", "test-link", JSON.stringify({
        type: "link",
        href: "https://parsed-link.com",
        target: "_blank",
        text: "Parsed Link Text"
    }));

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
    server.setContent("test-app", "test-title", JSON.stringify({
        type: "html",
        value: "<strong>Bold Title</strong>"
    }));

    await page.goto(testUrl);
    await page.waitForSelector(".streamlined-editable");

    const title = page.locator('[data-scms-html="test-title"]');
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

    const paragraph = page.locator('[data-scms-html="test-paragraph"]');
    const textContent = await paragraph.textContent();

    expect(textContent).toBe("Plain text content");
    expect(textContent).not.toContain("{");
});

test("JSON without type field uses element's declared type", async () => {
    server.clearContent();
    // Old link format: JSON with href/target/text but NO type field
    server.setContent("test-app", "test-link", JSON.stringify({
        href: "https://old-format-link.com",
        target: "_blank",
        text: "Old Format Link"
    }));

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
    server.setContent("test-app", "team.abc12.name", JSON.stringify({ type: "text", value: "Alice" }));
    server.setContent("test-app", "team.abc12.role", JSON.stringify({ type: "text", value: "CEO" }));
    server.setContent("test-app", "team.def34.name", JSON.stringify({ type: "text", value: "Bob" }));
    server.setContent("test-app", "team.def34.role", JSON.stringify({ type: "text", value: "CTO" }));
    server.setContent("test-app", "team.ghi56.name", JSON.stringify({ type: "text", value: "Carol" }));
    server.setContent("test-app", "team.ghi56.role", JSON.stringify({ type: "text", value: "Designer" }));
    server.setContent("test-app", "team._order", JSON.stringify({ type: "order", value: ["abc12", "def34", "ghi56"] }));

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
    expect(await teamMembers.nth(2).locator('[data-scms-text="role"]').textContent()).toBe("Designer");
});

test("template instances have correct data-scms-instance attributes", async () => {
    server.clearContent();
    server.setContent("test-app", "team.abc12.name", JSON.stringify({ type: "text", value: "Alice" }));
    server.setContent("test-app", "team.def34.name", JSON.stringify({ type: "text", value: "Bob" }));
    server.setContent("test-app", "team._order", JSON.stringify({ type: "order", value: ["abc12", "def34"] }));

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
    server.setContent("test-app", "sidebar:testimonials.abc12.quote", JSON.stringify({ type: "text", value: "Great product!" }));
    server.setContent("test-app", "sidebar:testimonials.abc12.author", JSON.stringify({ type: "text", value: "John Doe" }));
    server.setContent("test-app", "sidebar:testimonials.def34.quote", JSON.stringify({ type: "text", value: "Love it!" }));
    server.setContent("test-app", "sidebar:testimonials.def34.author", JSON.stringify({ type: "text", value: "Jane Smith" }));
    server.setContent("test-app", "sidebar:testimonials._order", JSON.stringify({ type: "order", value: ["abc12", "def34"] }));

    await page.goto(testUrl);
    await page.waitForSelector(".streamlined-editable");

    const testimonialContainer = page.locator('[data-scms-template="testimonials"]');
    const testimonials = testimonialContainer.locator(".testimonial");

    // Should have 2 instances
    expect(await testimonials.count()).toBe(2);

    // Verify content
    expect(await testimonials.nth(0).locator('[data-scms-text="quote"]').textContent()).toBe("Great product!");
    expect(await testimonials.nth(0).locator('[data-scms-text="author"]').textContent()).toBe("John Doe");
    expect(await testimonials.nth(1).locator('[data-scms-text="quote"]').textContent()).toBe("Love it!");
    expect(await testimonials.nth(1).locator('[data-scms-text="author"]').textContent()).toBe("Jane Smith");
});

test("editing template instance element saves with correct key", async () => {
    server.clearContent();
    server.setContent("test-app", "team.abc12.name", JSON.stringify({ type: "text", value: "Alice" }));
    server.setContent("test-app", "team.def34.name", JSON.stringify({ type: "text", value: "Bob" }));
    server.setContent("test-app", "team._order", JSON.stringify({ type: "order", value: ["abc12", "def34"] }));

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
    await page.waitForFunction(() => {
        const name = document.querySelectorAll('[data-scms-template="team"] .team-member')[1]?.querySelector('[data-scms-text="name"]');
        return name && !name.classList.contains("streamlined-editing");
    }, { timeout: 3000 });

    // Reload and verify content persisted with correct key (team.def34.name)
    await page.reload();
    await page.waitForSelector(".streamlined-editable");

    const reloadedMembers = page.locator('[data-scms-template="team"] .team-member');
    expect(await reloadedMembers.nth(0).locator('[data-scms-text="name"]').textContent()).toBe("Alice");
    expect(await reloadedMembers.nth(1).locator('[data-scms-text="name"]').textContent()).toBe("Bobby");
});

// Group inside template tests (shared content across instances)

test("group inside template shares content across all instances", async () => {
    server.clearContent();
    // Set up 3 product instances using stable IDs
    server.setContent("test-app", "products.abc12.product-name", JSON.stringify({ type: "text", value: "Widget A" }));
    server.setContent("test-app", "products.def34.product-name", JSON.stringify({ type: "text", value: "Widget B" }));
    server.setContent("test-app", "products.ghi56.product-name", JSON.stringify({ type: "text", value: "Widget C" }));
    server.setContent("test-app", "products._order", JSON.stringify({ type: "order", value: ["abc12", "def34", "ghi56"] }));
    // Shared company info (no template instance, just group:element)
    server.setContent("test-app", "company:name", JSON.stringify({ type: "text", value: "Acme Corp" }));
    server.setContent("test-app", "company:tagline", JSON.stringify({ type: "text", value: "Quality Products" }));

    await page.goto(testUrl);
    await page.waitForSelector(".streamlined-editable");

    const products = page.locator('[data-scms-template="products"] .product-card');

    // Should have 3 product instances
    expect(await products.count()).toBe(3);

    // Each product has unique name
    expect(await products.nth(0).locator('[data-scms-text="product-name"]').textContent()).toBe("Widget A");
    expect(await products.nth(1).locator('[data-scms-text="product-name"]').textContent()).toBe("Widget B");
    expect(await products.nth(2).locator('[data-scms-text="product-name"]').textContent()).toBe("Widget C");

    // All products share the same company info
    for (let i = 0; i < 3; i++) {
        const companyName = await products.nth(i).locator('[data-scms-group="company"] [data-scms-text="name"]').textContent();
        const tagline = await products.nth(i).locator('[data-scms-group="company"] [data-scms-text="tagline"]').textContent();
        expect(companyName).toBe("Acme Corp");
        expect(tagline).toBe("Quality Products");
    }
});

test("editing group element inside template updates all instances in real-time", async () => {
    server.clearContent();
    // Set up 2 product instances using stable IDs
    server.setContent("test-app", "products.abc12.product-name", JSON.stringify({ type: "text", value: "Product 1" }));
    server.setContent("test-app", "products.def34.product-name", JSON.stringify({ type: "text", value: "Product 2" }));
    server.setContent("test-app", "products._order", JSON.stringify({ type: "order", value: ["abc12", "def34"] }));
    // Shared company name
    server.setContent("test-app", "company:name", JSON.stringify({ type: "text", value: "Old Company" }));

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const products = page.locator('[data-scms-template="products"] .product-card');
    expect(await products.count()).toBe(2);

    // Click on company name in first product
    const firstCompanyName = products.nth(0).locator('[data-scms-group="company"] [data-scms-text="name"]');
    const secondCompanyName = products.nth(1).locator('[data-scms-group="company"] [data-scms-text="name"]');

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
    server.setContent("test-app", "products.abc12.product-name", JSON.stringify({ type: "text", value: "Product 1" }));
    server.setContent("test-app", "products.def34.product-name", JSON.stringify({ type: "text", value: "Product 2" }));
    server.setContent("test-app", "products._order", JSON.stringify({ type: "order", value: ["abc12", "def34"] }));
    server.setContent("test-app", "company:name", JSON.stringify({ type: "text", value: "Original" }));

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const products = page.locator('[data-scms-template="products"] .product-card');
    const firstCompanyName = products.nth(0).locator('[data-scms-group="company"] [data-scms-text="name"]');

    await firstCompanyName.click();
    await firstCompanyName.fill("Updated Company");

    // Save
    const saveButton = page.locator("scms-toolbar").locator("button:has-text('Save')");
    await saveButton.click();

    // Wait for save to complete
    await page.waitForFunction(() => {
        const el = document.querySelector('[data-scms-template="products"] .product-card [data-scms-group="company"] [data-scms-text="name"]');
        return el && !el.classList.contains("streamlined-editing");
    }, { timeout: 3000 });

    // Reload and verify content persisted
    await page.reload();
    await page.waitForSelector(".streamlined-editable");

    const reloadedProducts = page.locator('[data-scms-template="products"] .product-card');

    // Both instances should show the updated company name
    expect(await reloadedProducts.nth(0).locator('[data-scms-group="company"] [data-scms-text="name"]').textContent()).toBe("Updated Company");
    expect(await reloadedProducts.nth(1).locator('[data-scms-group="company"] [data-scms-text="name"]').textContent()).toBe("Updated Company");
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
    server.setContent("test-app", "team.abc12.name", JSON.stringify({ type: "text", value: "Alice" }));
    server.setContent("test-app", "team._order", JSON.stringify({ type: "order", value: ["abc12"] }));

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

    // New instance should have default content
    const newName = teamMembers.nth(1).locator('[data-scms-text="name"]');
    expect(await newName.textContent()).toBe("Default Name");
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

test("delete button appears on instance hover", async () => {
    server.clearContent();
    server.setContent("test-app", "team.abc12.name", JSON.stringify({ type: "text", value: "Alice" }));
    server.setContent("test-app", "team.def34.name", JSON.stringify({ type: "text", value: "Bob" }));
    server.setContent("test-app", "team._order", JSON.stringify({ type: "order", value: ["abc12", "def34"] }));

    await page.goto(testUrl);
    await page.waitForSelector("scms-toolbar");

    const teamMembers = page.locator('[data-scms-template="team"] .team-member');
    expect(await teamMembers.count()).toBe(2);

    // Hover over second instance
    await teamMembers.nth(1).hover();

    // Delete button should become visible
    const deleteButton = teamMembers.nth(1).locator(".scms-instance-delete");
    await page.waitForFunction(() => {
        const btn = document.querySelectorAll('[data-scms-template="team"] .team-member')[1]?.querySelector('.scms-instance-delete');
        return btn && window.getComputedStyle(btn).opacity === "1";
    }, { timeout: 2000 });

    expect(await deleteButton.isVisible()).toBe(true);
});

test("clicking delete button removes instance", async () => {
    server.clearContent();
    // Use stable instance IDs in content keys
    server.setContent("test-app", "team.abc12.name", JSON.stringify({ type: "text", value: "Alice" }));
    server.setContent("test-app", "team.def34.name", JSON.stringify({ type: "text", value: "Bob" }));
    server.setContent("test-app", "team.ghi56.name", JSON.stringify({ type: "text", value: "Carol" }));
    // Order array determines display order
    server.setContent("test-app", "team._order", JSON.stringify({ type: "order", value: ["abc12", "def34", "ghi56"] }));

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
    server.setContent("test-app", "team.abc12.name", JSON.stringify({ type: "text", value: "Alice" }));
    server.setContent("test-app", "team._order", JSON.stringify({ type: "order", value: ["abc12"] }));

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
    server.setContent("test-app", "team.abc12.name", JSON.stringify({ type: "text", value: "Alice" }));
    server.setContent("test-app", "team.def34.name", JSON.stringify({ type: "text", value: "Bob" }));
    server.setContent("test-app", "team._order", JSON.stringify({ type: "order", value: ["abc12", "def34"] }));

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
    server.setContent("test-app", "team.abc12.name", JSON.stringify({ type: "text", value: "Alice" }));
    server.setContent("test-app", "team.def34.name", JSON.stringify({ type: "text", value: "Bob" }));
    server.setContent("test-app", "team.ghi56.name", JSON.stringify({ type: "text", value: "Carol" }));
    server.setContent("test-app", "team._order", JSON.stringify({ type: "order", value: ["abc12", "def34", "ghi56"] }));

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
    server.setContent("test-app", "team.abc12.name", JSON.stringify({ type: "text", value: "Alice" }));
    server.setContent("test-app", "team.def34.name", JSON.stringify({ type: "text", value: "Bob" }));
    server.setContent("test-app", "team.ghi56.name", JSON.stringify({ type: "text", value: "Carol" }));
    server.setContent("test-app", "team._order", JSON.stringify({ type: "order", value: ["abc12", "def34", "ghi56"] }));

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
    server.setContent("test-app", "team.abc12.name", JSON.stringify({ type: "text", value: "Alice" }));
    server.setContent("test-app", "team.def34.name", JSON.stringify({ type: "text", value: "Bob" }));
    server.setContent("test-app", "team._order", JSON.stringify({ type: "order", value: ["abc12", "def34"] }));

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
    server.setContent("test-app", "team.abc12.name", JSON.stringify({ type: "text", value: "Alice" }));
    server.setContent("test-app", "team.def34.name", JSON.stringify({ type: "text", value: "Bob" }));
    server.setContent("test-app", "team._order", JSON.stringify({ type: "order", value: ["abc12", "def34"] }));

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
    server.setContent("test-app", "team.abc12.name", JSON.stringify({ type: "text", value: "Alice" }));
    server.setContent("test-app", "team._order", JSON.stringify({ type: "order", value: ["abc12"] }));

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
    server.setContent("test-app", "team.abc12.name", JSON.stringify({ type: "text", value: "Alice" }));
    server.setContent("test-app", "team.def34.name", JSON.stringify({ type: "text", value: "Bob" }));
    server.setContent("test-app", "team._order", JSON.stringify({ type: "order", value: ["abc12", "def34"] }));

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
    server.setContent("test-app", "team.abc12.name", JSON.stringify({ type: "text", value: "Alice" }));
    server.setContent("test-app", "team._order", JSON.stringify({ type: "order", value: ["abc12"] }));

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
    server.setContent("test-app", "team.abc12.name", JSON.stringify({ type: "text", value: "Alice" }));
    server.setContent("test-app", "team.def34.name", JSON.stringify({ type: "text", value: "Bob" }));
    server.setContent("test-app", "team._order", JSON.stringify({ type: "order", value: ["abc12", "def34"] }));

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
    await page.waitForFunction(() => {
        const toolbar = document.querySelector('scms-toolbar');
        return toolbar && !toolbar.hasAttribute('saving');
    }, { timeout: 3000 });

    // Reload and verify order persisted
    await page.reload();
    await page.waitForSelector(".streamlined-editable");

    const reloadedMembers = page.locator('[data-scms-template="team"] .team-member');
    expect(await reloadedMembers.nth(0).locator('[data-scms-text="name"]').textContent()).toBe("Bob");
    expect(await reloadedMembers.nth(1).locator('[data-scms-text="name"]').textContent()).toBe("Alice");
});
