/**
 * Group tests - verifying groups inside templates share content correctly
 */

import { test, expect, beforeAll, afterAll } from "vitest";
import { setContent } from "~/@browser-support/test-helpers.js";
import {
    initializeSDK,
    waitForCondition,
    setupTestHelpers,
    generateTestAppId,
} from "~/@browser-support/sdk-helpers.js";

beforeAll(async () => {
    setupTestHelpers();
    const appId = generateTestAppId();

    // Set up 3 product instances with shared company info
    await setContent(
        appId,
        "products.abc12.product-name",
        JSON.stringify({ type: "text", value: "Widget A" }),
    );
    await setContent(
        appId,
        "products.def34.product-name",
        JSON.stringify({ type: "text", value: "Widget B" }),
    );
    await setContent(
        appId,
        "products.ghi56.product-name",
        JSON.stringify({ type: "text", value: "Widget C" }),
    );
    await setContent(
        appId,
        "products._order",
        JSON.stringify({ type: "order", value: ["abc12", "def34", "ghi56"] }),
    );
    // Shared company info (group content)
    await setContent(appId, "company:name", JSON.stringify({ type: "text", value: "Acme Corp" }));
    await setContent(
        appId,
        "company:tagline",
        JSON.stringify({ type: "text", value: "Quality Products" }),
    );

    // Inline group content
    await setContent(
        appId,
        "company-name:name",
        JSON.stringify({ type: "text", value: "Acme Corporation" }),
    );

    await initializeSDK({ appId });
});

test("group inside template shares content across all instances", async () => {
    const products = document.querySelectorAll('[data-scms-template="products"] .product-card');

    // Should have 3 product instances
    expect(products.length).toBe(3);

    // Each product has unique name
    expect(products[0].querySelector('[data-scms-text="product-name"]')?.textContent).toBe(
        "Widget A",
    );
    expect(products[1].querySelector('[data-scms-text="product-name"]')?.textContent).toBe(
        "Widget B",
    );
    expect(products[2].querySelector('[data-scms-text="product-name"]')?.textContent).toBe(
        "Widget C",
    );

    // All products share the same company info
    for (let i = 0; i < 3; i++) {
        const companyName = products[i].querySelector(
            '[data-scms-group="company"] [data-scms-text="name"]',
        )?.textContent;
        const tagline = products[i].querySelector(
            '[data-scms-group="company"] [data-scms-text="tagline"]',
        )?.textContent;
        expect(companyName).toBe("Acme Corp");
        expect(tagline).toBe("Quality Products");
    }
});

test("editing group element inside template updates all instances in real-time", async () => {
    const products = document.querySelectorAll('[data-scms-template="products"] .product-card');
    expect(products.length).toBe(3);

    // Click on company name in first product
    const firstCompanyName = products[0].querySelector(
        '[data-scms-group="company"] [data-scms-text="name"]',
    ) as HTMLElement;
    const secondCompanyName = products[1].querySelector(
        '[data-scms-group="company"] [data-scms-text="name"]',
    ) as HTMLElement;

    firstCompanyName.click();
    await waitForCondition(() => firstCompanyName.getAttribute("contenteditable") === "true");

    // Verify first element is in editing mode
    expect(firstCompanyName.classList.contains("streamlined-editing")).toBe(true);

    // Verify second element shows sibling styling
    expect(secondCompanyName.classList.contains("streamlined-editing-sibling")).toBe(true);

    // Type new content in first element
    firstCompanyName.textContent = "New Company Name";
    firstCompanyName.dispatchEvent(new Event("input", { bubbles: true }));

    // Both elements should show the new content immediately (real-time sync)
    expect(firstCompanyName.textContent).toBe("New Company Name");
    expect(secondCompanyName.textContent).toBe("New Company Name");
});

test("inline group attribute on same element scopes content correctly", async () => {
    // Element has both data-scms-group="company-name" and data-scms-text="name" on same element
    const inlineGroupElement = document.querySelector(
        '[data-scms-group="company-name"][data-scms-text="name"]',
    );
    expect(inlineGroupElement?.textContent).toBe("Acme Corporation");
});
