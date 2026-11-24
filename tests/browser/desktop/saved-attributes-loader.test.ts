/**
 * Saved attributes on page load (visitor path)
 *
 * Verifies that the loader applies the `attributes` part of saved content,
 * so visitors see the alt, title and custom attributes an editor saved.
 * Runs the loader only, without the editor, so the editor can't mask a
 * loader that ignores attributes.
 *
 * Regression test for: https://github.com/streamlinedcms/client-sdk/issues/107
 */

import { test, expect, beforeAll } from "vitest";
import { setContent } from "~/@browser-support/test-helpers.js";
import { runLoader, setupTestHelpers, generateTestAppId } from "~/@browser-support/sdk-helpers.js";

beforeAll(async () => {
    setupTestHelpers();
    const appId = generateTestAppId();

    await setContent(
        appId,
        "saved-attr-image",
        JSON.stringify({
            type: "image",
            src: "https://example.com/saved.png",
            attributes: { alt: "Saved alt", title: "Saved image title" },
        }),
    );
    await setContent(
        appId,
        "saved-attr-text",
        JSON.stringify({
            type: "text",
            value: "Saved text",
            attributes: { title: "Saved text title", "data-custom": "saved-custom" },
        }),
    );
    await setContent(
        appId,
        "saved-attr-html",
        JSON.stringify({
            type: "html",
            value: "<strong>Saved html</strong>",
            attributes: { "aria-label": "Saved html label" },
        }),
    );
    await setContent(
        appId,
        "saved-attr-link",
        JSON.stringify({
            type: "link",
            href: "https://example.com/saved-link",
            target: "",
            value: "Saved link",
            attributes: { rel: "nofollow", title: "Saved link title" },
        }),
    );
    await setContent(
        appId,
        "saved-attr-href",
        JSON.stringify({
            type: "href",
            href: "https://example.com/saved-href",
            target: "",
            attributes: { title: "Saved href title" },
        }),
    );
    await setContent(
        appId,
        "saved-attr-clear",
        JSON.stringify({
            type: "text",
            value: "Saved clear",
            attributes: { title: "" },
        }),
    );
    // No type field: applied by the element's declared type
    await setContent(
        appId,
        "saved-attr-untyped",
        JSON.stringify({
            value: "Saved untyped",
            attributes: { title: "Saved untyped title" },
        }),
    );
    // A name with a space is invalid in the DOM; the attributes dialog rejects
    // it, but the API accepts it
    await setContent(
        appId,
        "saved-attr-invalid",
        JSON.stringify({
            type: "text",
            value: "Saved invalid",
            attributes: { "bad name": "bad", title: "Saved valid title" },
        }),
    );
    await setContent(
        appId,
        "saved-attr-group:grouped",
        JSON.stringify({
            type: "text",
            value: "Saved grouped",
            attributes: { title: "Saved grouped title" },
        }),
    );
    await setContent(
        appId,
        "saved-attr-items.item1.label",
        JSON.stringify({
            type: "text",
            value: "Saved item label",
            attributes: { title: "Saved item title" },
        }),
    );
    await setContent(
        appId,
        "saved-attr-items._order",
        JSON.stringify({ type: "order", value: ["item1"] }),
    );

    await runLoader(appId);
});

test("image: saved alt replaces the page's fallback alt and saved title is added", () => {
    const img = document.querySelector('[data-scms-image="saved-attr-image"]') as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://example.com/saved.png");
    expect(img.getAttribute("alt")).toBe("Saved alt");
    expect(img.getAttribute("title")).toBe("Saved image title");
});

test("text: saved title and custom attribute are applied", () => {
    const el = document.querySelector('[data-scms-text="saved-attr-text"]') as HTMLElement;
    expect(el.textContent).toBe("Saved text");
    expect(el.getAttribute("title")).toBe("Saved text title");
    expect(el.getAttribute("data-custom")).toBe("saved-custom");
});

test("html: saved aria-label is applied", () => {
    const el = document.querySelector('[data-scms-html="saved-attr-html"]') as HTMLElement;
    expect(el.innerHTML).toBe("<strong>Saved html</strong>");
    expect(el.getAttribute("aria-label")).toBe("Saved html label");
});

test("link: saved rel and title are applied", () => {
    const el = document.querySelector('[data-scms-link="saved-attr-link"]') as HTMLAnchorElement;
    expect(el.getAttribute("href")).toBe("https://example.com/saved-link");
    expect(el.getAttribute("rel")).toBe("nofollow");
    expect(el.getAttribute("title")).toBe("Saved link title");
});

test("href: saved title is applied", () => {
    const el = document.querySelector('[data-scms-href="saved-attr-href"]') as HTMLAnchorElement;
    expect(el.getAttribute("href")).toBe("https://example.com/saved-href");
    expect(el.getAttribute("title")).toBe("Saved href title");
});

test("an attribute saved as empty removes the page's own value", () => {
    const el = document.querySelector('[data-scms-text="saved-attr-clear"]') as HTMLElement;
    expect(el.textContent).toBe("Saved clear");
    expect(el.hasAttribute("title")).toBe(false);
});

test("untyped content: saved attributes are applied", () => {
    const el = document.querySelector('[data-scms-text="saved-attr-untyped"]') as HTMLElement;
    expect(el.textContent).toBe("Saved untyped");
    expect(el.getAttribute("title")).toBe("Saved untyped title");
});

test("an invalid attribute name is skipped without losing the content or other attributes", () => {
    const el = document.querySelector('[data-scms-text="saved-attr-invalid"]') as HTMLElement;
    expect(el.textContent).toBe("Saved invalid");
    expect(el.getAttribute("title")).toBe("Saved valid title");
});

test("grouped element: saved attributes are applied", () => {
    const el = document.querySelector(
        '[data-scms-group="saved-attr-group"] [data-scms-text="grouped"]',
    ) as HTMLElement;
    expect(el.textContent).toBe("Saved grouped");
    expect(el.getAttribute("title")).toBe("Saved grouped title");
});

test("template item: saved attributes are applied", () => {
    const el = document.querySelector(
        '[data-scms-template="saved-attr-items"] [data-scms-instance="item1"] [data-scms-text="label"]',
    ) as HTMLElement;
    expect(el.textContent).toBe("Saved item label");
    expect(el.getAttribute("title")).toBe("Saved item title");
});
