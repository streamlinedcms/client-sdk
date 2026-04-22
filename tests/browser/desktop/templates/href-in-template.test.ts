/**
 * Href-in-template tests
 *
 * Regression coverage for the template bug that motivated data-scms-href:
 * a data-scms-link inside a template had its developer-authored inner HTML
 * wiped out during template instance creation. data-scms-href sidesteps this
 * because it has no value field and stripTemplateContent preserves inner
 * markup on href-typed editables.
 */

import { test, expect, beforeAll } from "vitest";
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

    // Seed two instances for the href-cards template.
    await setContent(
        appId,
        "href-cards.card1.cta",
        JSON.stringify({
            type: "href",
            href: "https://example.com/one",
            target: "",
        }),
    );
    await setContent(
        appId,
        "href-cards.card2.cta",
        JSON.stringify({
            type: "href",
            href: "https://example.com/two",
            target: "_blank",
        }),
    );
    await setContent(
        appId,
        "href-cards._order",
        JSON.stringify({ type: "order", value: ["card1", "card2"] }),
    );

    await initializeSDK({ appId });
});

function getCards(): HTMLElement[] {
    const container = document.querySelector('[data-scms-template="href-cards"]');
    return Array.from(container?.querySelectorAll(".href-card") ?? []) as HTMLElement[];
}

test("seeded instances preserve developer-authored inner HTML inside data-scms-href", () => {
    const cards = getCards();
    expect(cards.length).toBe(2);

    for (const card of cards) {
        const anchor = card.querySelector("[data-scms-href]") as HTMLAnchorElement;
        expect(anchor).not.toBeNull();
        // Icon and label survived stripTemplateContent + instance cloning.
        expect(anchor.querySelector('[data-testid="href-tmpl-icon"]')).not.toBeNull();
        expect(anchor.querySelector('[data-testid="href-tmpl-label"]')).not.toBeNull();
        expect(anchor.textContent?.trim()).toContain("Card CTA");
    }
});

test("href and target apply from seeded content", () => {
    const cards = getCards();
    const anchors = cards.map((c) => c.querySelector("[data-scms-href]") as HTMLAnchorElement);

    expect(anchors[0].getAttribute("href")).toBe("https://example.com/one");
    expect(anchors[0].target).toBe("");

    expect(anchors[1].getAttribute("href")).toBe("https://example.com/two");
    expect(anchors[1].target).toBe("_blank");
});

test("new instance from the add button keeps inner HTML", async () => {
    const container = document.querySelector('[data-scms-template="href-cards"]') as HTMLElement;
    const initialCount = container.querySelectorAll(".href-card").length;

    const addButton = container.querySelector(".scms-template-add") as HTMLElement;
    addButton.click();

    await waitForCondition(
        () => container.querySelectorAll(".href-card").length === initialCount + 1,
    );

    const cards = container.querySelectorAll(".href-card");
    const newCard = cards[cards.length - 1];
    const anchor = newCard.querySelector("[data-scms-href]") as HTMLAnchorElement;
    expect(anchor).not.toBeNull();

    // Critical: inner icon + label survived into the newly cloned instance.
    expect(anchor.querySelector('[data-testid="href-tmpl-icon"]')).not.toBeNull();
    expect(anchor.querySelector('[data-testid="href-tmpl-label"]')).not.toBeNull();
});
