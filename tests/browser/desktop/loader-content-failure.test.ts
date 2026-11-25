/**
 * Content load failures (visitor path)
 *
 * The loader hides editable elements until saved content is applied. When
 * the content can't be loaded or applied (an error, a malformed response, or
 * no response in time), the page must still be revealed with its built-in
 * content, and record that it isn't showing saved content so the editor
 * keeps editing off.
 *
 * Regression tests for: https://github.com/streamlinedcms/client-sdk/issues/168
 */

import { test, expect, beforeAll, afterEach, vi } from "vitest";
import { setContent } from "~/@browser-support/test-helpers.js";
import {
    runLoader,
    respondToContentFetches,
    failContentFetches,
    setupTestHelpers,
    generateTestAppId,
} from "~/@browser-support/sdk-helpers.js";
import { pageShowsSavedContent } from "~/src/content-status.js";

let appId: string;

function text(): HTMLElement {
    return document.querySelector('[data-scms-text="load-failure-text"]') as HTMLElement;
}

function grouped(): HTMLElement {
    return document.querySelector(
        '[data-scms-group="load-failure-group"] [data-scms-text="grouped"]',
    ) as HTMLElement;
}

function expectBuiltInContentShown(): void {
    expect(getComputedStyle(text()).visibility).toBe("visible");
    expect(getComputedStyle(grouped()).visibility).toBe("visible");
    expect(text().textContent).toBe("Built-in text");
    expect(grouped().textContent).toBe("Built-in grouped");
    expect(pageShowsSavedContent()).toBe(false);
}

function json(body: unknown): () => Response {
    return () =>
        new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
}

const savedText = JSON.stringify({ type: "text", value: "Saved text" });

beforeAll(() => {
    setupTestHelpers();
    appId = generateTestAppId();
});

afterEach(() => {
    vi.restoreAllMocks();
});

test.each([
    ["an empty object", {}],
    ["null groups", { elements: {}, groups: null }],
    ["a null element", { elements: { "load-failure-text": null }, groups: {} }],
    ["a null group", { elements: {}, groups: { "load-failure-group": null } }],
    ["a group without elements", { elements: {}, groups: { "load-failure-group": {} } }],
    [
        "one null element among good ones",
        {
            elements: { "load-failure-text": { content: savedText }, other: null },
            groups: {},
        },
    ],
])("a response with %s shows the built-in content", async (_, body) => {
    respondToContentFetches(json(body));
    await runLoader(appId);
    expectBuiltInContentShown();
});

test("a request that never answers shows the built-in content after the timeout", async () => {
    respondToContentFetches("hang");
    await runLoader(appId, { contentTimeoutMs: 200 });
    expectBuiltInContentShown();
});

test.each(["server", "network"] as const)("a %s error shows the built-in content", async (kind) => {
    failContentFetches(kind);
    await runLoader(appId);
    expectBuiltInContentShown();
});

test("an element whose content isn't text is skipped, and the rest is applied", async () => {
    respondToContentFetches(
        json({
            elements: { "load-failure-text": { content: savedText } },
            groups: { "load-failure-group": { elements: { grouped: { content: 123 } } } },
        }),
    );
    await runLoader(appId);

    expect(getComputedStyle(grouped()).visibility).toBe("visible");
    expect(text().textContent).toBe("Saved text");
    expect(grouped().textContent).toBe("Built-in grouped");
    expect(pageShowsSavedContent()).toBe(true);
});

test("well-formed content is applied and recorded as shown", async () => {
    await setContent(appId, "load-failure-text", savedText);
    await runLoader(appId);

    expect(getComputedStyle(text()).visibility).toBe("visible");
    expect(text().textContent).toBe("Saved text");
    expect(pageShowsSavedContent()).toBe(true);
});
