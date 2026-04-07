/**
 * Text element line break tests
 *
 * Comprehensive scenario tests for line breaks in text elements.
 * Covers the full edit → serialize → save → restore → re-edit cycle
 * with all the DOM variations that browsers produce in contenteditable.
 */

import { test, expect, beforeAll, afterEach } from "vitest";
import {
    initializeSDK,
    waitForCondition,
    clickToolbarButton,
    setupTestHelpers,
    getController,
} from "~/@browser-support/sdk-helpers.js";
import { setContent } from "~/@browser-support/test-helpers.js";
import type { Toolbar } from "~/src/components/toolbar.js";

let appId: string;

/**
 * Set the innerHTML of a text element as if the user typed it,
 * then fire an input event so the SDK picks up the change.
 */
function simulateTyping(element: HTMLElement, html: string): void {
    element.innerHTML = html;
    element.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Read the SDK's serialized value for a text element from currentContent.
 * Returns the parsed `value` string (with \n for line breaks).
 */
function getStoredValue(key: string): string {
    const state = (getController() as unknown as { state: { currentContent: Map<string, string> } })
        .state;
    const raw = state.currentContent.get(key);
    if (!raw) throw new Error(`No currentContent for key "${key}"`);
    return (JSON.parse(raw) as { value: string }).value;
}

function getToolbar(): Toolbar {
    return document.querySelector("scms-toolbar") as Toolbar;
}

function getTextElement(): HTMLElement {
    return document.querySelector('[data-scms-text="line-break-test"]') as HTMLElement;
}

beforeAll(async () => {
    setupTestHelpers();
    const { generateTestAppId } = await import("~/@browser-support/sdk-helpers.js");
    appId = generateTestAppId();

    // Pre-populate with multi-line content
    await setContent(
        appId,
        "line-break-test",
        JSON.stringify({ type: "text", value: "Line one\nLine two\nLine three" }),
    );

    await initializeSDK({ appId });
});

afterEach(async () => {
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));
});

// ---------------------------------------------------------------------------
// Initial load
// ---------------------------------------------------------------------------

test("stored \\n renders as <br> on initial load", () => {
    const el = getTextElement();
    const brs = el.querySelectorAll("br");
    expect(brs.length).toBe(2);
    expect(el.textContent).toBe("Line oneLine twoLine three");
});

test("SDK serializes loaded content back to the same \\n format", () => {
    const value = getStoredValue("line-break-test");
    expect(value).toBe("Line one\nLine two\nLine three");
});

// ---------------------------------------------------------------------------
// Chrome-style contenteditable: Enter wraps lines in <div>
// ---------------------------------------------------------------------------

test("Chrome <div> line breaks are serialized as \\n", async () => {
    const el = getTextElement();
    el.click();
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    // Chrome wraps each line after the first in a <div>
    simulateTyping(el, "Alpha<div>Bravo</div><div>Charlie</div>");

    const value = getStoredValue("line-break-test");
    expect(value).toBe("Alpha\nBravo\nCharlie");
});

test("Chrome empty lines (<div><br></div>) serialize as empty \\n", async () => {
    const el = getTextElement();
    el.click();
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    simulateTyping(el, "Before<div><br></div><div>After</div>");

    const value = getStoredValue("line-break-test");
    expect(value).toBe("Before\n\nAfter");
});

test("multiple consecutive empty lines are preserved", async () => {
    const el = getTextElement();
    el.click();
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    simulateTyping(el, "Top<div><br></div><div><br></div><div><br></div><div>Bottom</div>");

    const value = getStoredValue("line-break-test");
    expect(value).toBe("Top\n\n\n\nBottom");
});

// ---------------------------------------------------------------------------
// <br>-style line breaks (Shift+Enter, Firefox, or our own restore)
// ---------------------------------------------------------------------------

test("standalone <br> tags serialize as \\n", async () => {
    const el = getTextElement();
    el.click();
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    simulateTyping(el, "First<br>Second<br>Third");

    const value = getStoredValue("line-break-test");
    expect(value).toBe("First\nSecond\nThird");
});

test("mixed <br> and <div> serialize consistently", async () => {
    const el = getTextElement();
    el.click();
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    // Shift+Enter then Enter in Chrome can produce mixed markup
    simulateTyping(el, "Line A<br>Line B<div>Line C</div><div>Line D</div>");

    const value = getStoredValue("line-break-test");
    expect(value).toBe("Line A\nLine B\nLine C\nLine D");
});

// ---------------------------------------------------------------------------
// Round-trip: edit → save → reload content → verify DOM
// ---------------------------------------------------------------------------

test("full round-trip: edit with divs, save, verify serialized value", async () => {
    const el = getTextElement();
    el.click();
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    // Simulate a realistic editing session
    simulateTyping(
        el,
        "Heading<div><br></div><div>Paragraph one</div><div>Paragraph two</div><div><br></div><div>Footer</div>",
    );

    // Verify serialization
    const serialized = getStoredValue("line-break-test");
    expect(serialized).toBe("Heading\n\nParagraph one\nParagraph two\n\nFooter");

    // Save
    await clickToolbarButton("Save");
    await waitForCondition(() => !getToolbar().hasChanges, 5000);

    // After save, the visual content is still correct (lines are separate)
    expect(el.textContent).toContain("Heading");
    expect(el.textContent).toContain("Paragraph one");
    expect(el.textContent).toContain("Footer");

    // The serialized value should still be intact
    const valueAfterSave = getStoredValue("line-break-test");
    expect(valueAfterSave).toBe("Heading\n\nParagraph one\nParagraph two\n\nFooter");
});

test("round-trip preserves content after re-selecting the element", async () => {
    const el = getTextElement();

    // First, set known content via the SDK save path
    el.click();
    await waitForCondition(() => el.classList.contains("streamlined-editing"));
    simulateTyping(el, "AAA<div>BBB</div><div>CCC</div>");
    await clickToolbarButton("Save");
    await waitForCondition(() => !getToolbar().hasChanges, 5000);

    // Deselect
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));

    // Re-select — content should still be intact
    el.click();
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    // The serialized value should still have the correct line breaks
    const value = getStoredValue("line-break-test");
    expect(value).toBe("AAA\nBBB\nCCC");

    // Visual content should still show all three lines
    expect(el.textContent).toContain("AAA");
    expect(el.textContent).toContain("BBB");
    expect(el.textContent).toContain("CCC");
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test("single line with no breaks serializes cleanly", async () => {
    const el = getTextElement();
    el.click();
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    simulateTyping(el, "Just one line");

    const value = getStoredValue("line-break-test");
    expect(value).toBe("Just one line");
});

test("empty element serializes as empty string", async () => {
    const el = getTextElement();
    el.click();
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    simulateTyping(el, "");

    const value = getStoredValue("line-break-test");
    expect(value).toBe("");
});

test("only empty lines serialize correctly", async () => {
    const el = getTextElement();
    el.click();
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    // User pressed Enter three times with no text
    simulateTyping(el, "<div><br></div><div><br></div><div><br></div>");

    const value = getStoredValue("line-break-test");
    expect(value).toBe("\n\n\n");
});

test("trailing empty line is preserved", async () => {
    const el = getTextElement();
    el.click();
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    simulateTyping(el, "Content<div><br></div>");

    const value = getStoredValue("line-break-test");
    expect(value).toBe("Content\n");
});

test("leading empty line is preserved", async () => {
    const el = getTextElement();
    el.click();
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    // This is unusual but possible if the user deletes text above
    simulateTyping(el, "<br>Content");

    const value = getStoredValue("line-break-test");
    expect(value).toBe("\nContent");
});

test("special characters in text are not corrupted by line break handling", async () => {
    const el = getTextElement();
    el.click();
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    // Set content with special chars using textContent to avoid HTML interpretation
    el.textContent = "";
    el.appendChild(document.createTextNode("Price: $5 & <tax>"));
    el.appendChild(document.createElement("br"));
    el.appendChild(document.createTextNode('She said "hello"'));
    el.dispatchEvent(new Event("input", { bubbles: true }));

    const value = getStoredValue("line-break-test");
    expect(value).toBe('Price: $5 & <tax>\nShe said "hello"');
});

test("nested divs (unusual but possible from paste) are handled", async () => {
    const el = getTextElement();
    el.click();
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    // Pasting from some editors can create nested block elements
    simulateTyping(el, "Outer<div><div>Inner</div></div><div>Last</div>");

    const value = getStoredValue("line-break-test");
    // Both div boundaries should produce line breaks
    expect(value).toBe("Outer\n\nInner\nLast");
});

test("the user scenario from issue #81: multi-line text with gaps", async () => {
    const el = getTextElement();
    el.click();
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    // Reproduce the exact DOM Chrome would create for the issue reporter's input:
    // "This paragraph..." then Enter Enter "1" Enter "2" Enter "3" Enter Enter "Something" Enter Enter "4" Enter "5"
    simulateTyping(
        el,
        [
            "This paragraph can be edited.",
            "<div><br></div>",
            "<div>1</div>",
            "<div>2</div>",
            "<div>3</div>",
            "<div><br></div>",
            "<div>Something</div>",
            "<div><br></div>",
            "<div>4</div>",
            "<div>5</div>",
        ].join(""),
    );

    const value = getStoredValue("line-break-test");
    expect(value).toBe("This paragraph can be edited.\n\n1\n2\n3\n\nSomething\n\n4\n5");

    // Save
    await clickToolbarButton("Save");
    await waitForCondition(() => !getToolbar().hasChanges, 5000);

    // Visual content should still contain all items
    expect(el.textContent).toContain("This paragraph can be edited.");
    expect(el.textContent).toContain("1");
    expect(el.textContent).toContain("Something");
    expect(el.textContent).toContain("5");

    // Deselect, re-select, and verify the serialized value is still correct
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));
    el.click();
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    const valueAfterReload = getStoredValue("line-break-test");
    expect(valueAfterReload).toBe("This paragraph can be edited.\n\n1\n2\n3\n\nSomething\n\n4\n5");
});
