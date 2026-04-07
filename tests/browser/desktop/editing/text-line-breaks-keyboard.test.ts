/**
 * Text line break tests using real keyboard events
 *
 * These tests use Vitest's userEvent (backed by Playwright) to simulate
 * actual keypresses in contenteditable text elements. This reveals the
 * real DOM structures the browser produces, which may differ from
 * manually constructed innerHTML.
 */

import { test, expect, beforeAll, afterEach } from "vitest";
import { userEvent } from "@vitest/browser/context";
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

function getElement(): HTMLElement {
    return document.querySelector('[data-scms-text="kb-test"]') as HTMLElement;
}

/** Select all content within a contenteditable element */
function selectAll(el: HTMLElement): void {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
}

/** Log the DOM structure for debugging */
function dumpDOM(el: HTMLElement, label: string): void {
    console.log(`[${label}] innerHTML: ${JSON.stringify(el.innerHTML)}`);
    console.log(`[${label}] childNodes: ${el.childNodes.length}`);
    for (let i = 0; i < el.childNodes.length; i++) {
        const n = el.childNodes[i];
        if (n.nodeType === Node.ELEMENT_NODE) {
            console.log(
                `  [${i}] <${(n as Element).tagName.toLowerCase()}> innerHTML=${JSON.stringify((n as Element).innerHTML)}`,
            );
        } else {
            console.log(`  [${i}] text: ${JSON.stringify(n.textContent)}`);
        }
    }
}

beforeAll(async () => {
    setupTestHelpers();
    const { generateTestAppId } = await import("~/@browser-support/sdk-helpers.js");
    appId = generateTestAppId();

    await setContent(appId, "kb-test", JSON.stringify({ type: "text", value: "Initial text" }));

    await initializeSDK({ appId });
});

afterEach(async () => {
    document.body.click();
    await new Promise((r) => setTimeout(r, 200));
    // Reset element to clean state for next test
    const el = getElement();
    el.textContent = "Reset";
    el.dispatchEvent(new Event("input", { bubbles: true }));
});

// ---------------------------------------------------------------------------
// Basic typing
// ---------------------------------------------------------------------------

test("type simple text without Enter", async () => {
    const el = getElement();
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    // Select all and replace
    await selectAll(el);
    await userEvent.keyboard("Hello world");
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "simple text");
    const value = getStoredValue("kb-test");
    console.log(`[simple text] serialized: ${JSON.stringify(value)}`);

    expect(value).toBe("Hello world");
});

// ---------------------------------------------------------------------------
// Single Enter
// ---------------------------------------------------------------------------

test("type text, press Enter, type more text", async () => {
    const el = getElement();
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    await selectAll(el);
    await userEvent.keyboard("Line one");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("Line two");
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "single Enter");
    const value = getStoredValue("kb-test");
    console.log(`[single Enter] serialized: ${JSON.stringify(value)}`);

    expect(value).toBe("Line one\nLine two");
});

// ---------------------------------------------------------------------------
// Multiple Enters
// ---------------------------------------------------------------------------

test("type text, press Enter twice (empty line), type more", async () => {
    const el = getElement();
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    await selectAll(el);
    await userEvent.keyboard("Before");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("After");
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "double Enter");
    const value = getStoredValue("kb-test");
    console.log(`[double Enter] serialized: ${JSON.stringify(value)}`);

    expect(value).toBe("Before\n\nAfter");
});

test("three lines of text with single Enters between", async () => {
    const el = getElement();
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    await selectAll(el);
    await userEvent.keyboard("First");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("Second");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("Third");
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "three lines");
    const value = getStoredValue("kb-test");
    console.log(`[three lines] serialized: ${JSON.stringify(value)}`);

    expect(value).toBe("First\nSecond\nThird");
});

// ---------------------------------------------------------------------------
// Shift+Enter (should produce <br> instead of <div>)
// ---------------------------------------------------------------------------

test("Shift+Enter produces a line break within the same block", async () => {
    const el = getElement();
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    await selectAll(el);
    await userEvent.keyboard("Soft line one");
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    await userEvent.keyboard("Soft line two");
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "Shift+Enter");
    const value = getStoredValue("kb-test");
    console.log(`[Shift+Enter] serialized: ${JSON.stringify(value)}`);

    expect(value).toBe("Soft line one\nSoft line two");
});

// ---------------------------------------------------------------------------
// Mixed Enter and Shift+Enter
// ---------------------------------------------------------------------------

test("mixing Enter and Shift+Enter", async () => {
    const el = getElement();
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    await selectAll(el);
    await userEvent.keyboard("A");
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    await userEvent.keyboard("B");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("C");
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "mixed Enter/Shift+Enter");
    const value = getStoredValue("kb-test");
    console.log(`[mixed Enter/Shift+Enter] serialized: ${JSON.stringify(value)}`);

    expect(value).toBe("A\nB\nC");
});

// ---------------------------------------------------------------------------
// Enter at the beginning (leading empty line)
// ---------------------------------------------------------------------------

test("pressing Enter at the start creates a leading empty line", async () => {
    const el = getElement();
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    await selectAll(el);
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("After empty");
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "leading Enter");
    const value = getStoredValue("kb-test");
    console.log(`[leading Enter] serialized: ${JSON.stringify(value)}`);

    // Could be "\nAfter empty" or "\n\nAfter empty" depending on browser behavior
    // with the initial selection replacement
    console.log(`[leading Enter] expected contains: "After empty" with leading newline(s)`);
    expect(value).toContain("After empty");
    expect(value).toMatch(/^\n/); // should start with at least one newline
});

// ---------------------------------------------------------------------------
// Trailing Enter (cursor at end, press Enter)
// ---------------------------------------------------------------------------

test("pressing Enter at the end creates a trailing empty line", async () => {
    const el = getElement();
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    await selectAll(el);
    await userEvent.keyboard("Content");
    await userEvent.keyboard("{Enter}");
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "trailing Enter");
    const value = getStoredValue("kb-test");
    console.log(`[trailing Enter] serialized: ${JSON.stringify(value)}`);

    expect(value).toMatch(/^Content\n/);
});

// ---------------------------------------------------------------------------
// Many rapid Enters (empty lines)
// ---------------------------------------------------------------------------

test("pressing Enter 5 times creates multiple empty lines", async () => {
    const el = getElement();
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    await selectAll(el);
    await userEvent.keyboard("Top");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("Bottom");
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "5 Enters");
    const value = getStoredValue("kb-test");
    console.log(`[5 Enters] serialized: ${JSON.stringify(value)}`);

    expect(value).toBe("Top\n\n\n\n\nBottom");
});

// ---------------------------------------------------------------------------
// Issue #81 scenario: multi-line text with gaps
// ---------------------------------------------------------------------------

test("issue #81: type paragraph, blank lines, numbered items, blank line, word, blank line, more numbers", async () => {
    const el = getElement();
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    await selectAll(el);
    await userEvent.keyboard("Paragraph text here.");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("1");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("2");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("3");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("Something");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("4");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("5");
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "issue #81");
    const value = getStoredValue("kb-test");
    console.log(`[issue #81] serialized: ${JSON.stringify(value)}`);

    expect(value).toBe("Paragraph text here.\n\n1\n2\n3\n\nSomething\n\n4\n5");
});

// ---------------------------------------------------------------------------
// Round-trip: type → save → re-read serialized value
// ---------------------------------------------------------------------------

test("round-trip: type multi-line, save, verify value survives", async () => {
    const el = getElement();
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    await selectAll(el);
    await userEvent.keyboard("Alpha");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("Bravo");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("Charlie");
    await new Promise((r) => setTimeout(r, 100));

    const beforeSave = getStoredValue("kb-test");
    console.log(`[round-trip] before save: ${JSON.stringify(beforeSave)}`);

    await clickToolbarButton("Save");
    await waitForCondition(() => !getToolbar().hasChanges, 5000);

    const afterSave = getStoredValue("kb-test");
    console.log(`[round-trip] after save: ${JSON.stringify(afterSave)}`);

    expect(afterSave).toBe(beforeSave);
});

// ---------------------------------------------------------------------------
// Round-trip: type → save → deselect → re-select → verify re-read
// ---------------------------------------------------------------------------

test("round-trip: value is consistent after deselect and re-select", async () => {
    const el = getElement();
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    await selectAll(el);
    await userEvent.keyboard("X");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("Y");
    await new Promise((r) => setTimeout(r, 100));

    const firstRead = getStoredValue("kb-test");
    console.log(`[re-select] first read: ${JSON.stringify(firstRead)}`);

    await clickToolbarButton("Save");
    await waitForCondition(() => !getToolbar().hasChanges, 5000);

    // Deselect
    document.body.click();
    await new Promise((r) => setTimeout(r, 200));

    dumpDOM(el, "after deselect");
    console.log(`[re-select] after deselect: ${JSON.stringify(getStoredValue("kb-test"))}`);

    // Re-select
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "after re-select");
    const afterReselect = getStoredValue("kb-test");
    console.log(`[re-select] after re-select: ${JSON.stringify(afterReselect)}`);

    expect(afterReselect).toBe(firstRead);
});

// ---------------------------------------------------------------------------
// Double round-trip: type → save → deselect → re-select → save again
// ---------------------------------------------------------------------------

test("double round-trip: edit, save, re-edit with more lines, save again", async () => {
    const el = getElement();

    // First edit
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));
    await selectAll(el);
    await userEvent.keyboard("First");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("Second");
    await new Promise((r) => setTimeout(r, 100));

    await clickToolbarButton("Save");
    await waitForCondition(() => !getToolbar().hasChanges, 5000);

    const afterFirstSave = getStoredValue("kb-test");
    console.log(`[double round-trip] after first save: ${JSON.stringify(afterFirstSave)}`);

    // Deselect and re-select
    document.body.click();
    await new Promise((r) => setTimeout(r, 200));
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    // Move cursor to end and add more content
    await userEvent.keyboard("{End}");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("Third");
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "double round-trip after 2nd edit");
    const afterSecondEdit = getStoredValue("kb-test");
    console.log(`[double round-trip] after second edit: ${JSON.stringify(afterSecondEdit)}`);

    await clickToolbarButton("Save");
    await waitForCondition(() => !getToolbar().hasChanges, 5000);

    const afterSecondSave = getStoredValue("kb-test");
    console.log(`[double round-trip] after second save: ${JSON.stringify(afterSecondSave)}`);

    expect(afterSecondSave).toBe("First\nSecond\nThird");
});

// ===========================================================================
// RESTORED CONTENT EDITING
// These tests simulate what happens when the user edits content that was
// previously saved and restored (DOM has <br> tags from writeTextWithBreaks).
// ===========================================================================

/**
 * Helper: write content via SDK's restore path, then click to edit.
 * This puts the element in the exact state a real page load would produce:
 * <br> tags from writeTextWithBreaks, then contenteditable=true.
 */
async function restoreAndEdit(storedValue: string): Promise<HTMLElement> {
    const el = getElement();

    // Simulate restore: write via the SDK's own writeTextWithBreaks path
    // by setting currentContent and syncing
    const state = getController() as unknown as {
        state: { currentContent: Map<string, string>; originalContent: Map<string, string> };
        contentManager: { syncAllElementsFromContent: (key: string) => void };
    };
    const json = JSON.stringify({ type: "text", value: storedValue });
    state.state.currentContent.set("kb-test", json);
    state.state.originalContent.set("kb-test", json);
    state.contentManager.syncAllElementsFromContent("kb-test");

    await new Promise((r) => setTimeout(r, 50));
    dumpDOM(el, `restored "${storedValue.replace(/\n/g, "\\n")}"`);

    // Now click to edit
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    return el;
}

// ---------------------------------------------------------------------------
// Press Enter at the end of restored multi-line content
// ---------------------------------------------------------------------------

test("restored: press Enter at end of 2-line content adds a third line", async () => {
    const el = await restoreAndEdit("Line one\nLine two");

    // Move to end
    await userEvent.keyboard("{End}");
    // Ctrl+End to ensure we're at the very end (End might just go to end of last visible line)
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false); // collapse to end
    sel.removeAllRanges();
    sel.addRange(range);

    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("Line three");
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "restored + Enter at end");
    const value = getStoredValue("kb-test");
    console.log(`[restored + Enter at end] serialized: ${JSON.stringify(value)}`);

    expect(value).toBe("Line one\nLine two\nLine three");
});

// ---------------------------------------------------------------------------
// Press Enter in the middle of restored content
// ---------------------------------------------------------------------------

test("restored: press Enter in the middle of a line splits it", async () => {
    const el = await restoreAndEdit("Hello world");

    // Place cursor after "Hello" (position 5)
    const textNode = el.firstChild!;
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.setStart(textNode, 5);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    await userEvent.keyboard("{Enter}");
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "restored + Enter in middle");
    const value = getStoredValue("kb-test");
    console.log(`[restored + Enter in middle] serialized: ${JSON.stringify(value)}`);

    expect(value).toBe("Hello\n world"); // &nbsp; normalized to regular space
});

// ---------------------------------------------------------------------------
// Press Enter between two <br>-separated lines
// ---------------------------------------------------------------------------

test("restored: press Enter between two existing lines inserts empty line", async () => {
    const el = await restoreAndEdit("AAA\nBBB");

    // Place cursor at the start of "BBB" (the text node after <br>)
    // DOM should be: "AAA" <br> "BBB"
    dumpDOM(el, "before cursor placement");
    const nodes = Array.from(el.childNodes);
    // Find the text node containing "BBB"
    let bbbNode: Node | null = null;
    for (const n of nodes) {
        if (n.nodeType === Node.TEXT_NODE && n.textContent?.includes("BBB")) {
            bbbNode = n;
            break;
        }
    }
    console.log(`[between lines] BBB node found: ${!!bbbNode}`);

    if (bbbNode) {
        const sel = window.getSelection()!;
        const range = document.createRange();
        range.setStart(bbbNode, 0); // start of "BBB"
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    await userEvent.keyboard("{Enter}");
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "restored + Enter between lines");
    const value = getStoredValue("kb-test");
    console.log(`[restored + Enter between lines] serialized: ${JSON.stringify(value)}`);

    expect(value).toBe("AAA\n\nBBB"); // <br> before <div> is not double-counted
});

// ---------------------------------------------------------------------------
// Type additional text at the end of a restored line (no Enter)
// ---------------------------------------------------------------------------

test("restored: typing at end of first line appends to it", async () => {
    const el = await restoreAndEdit("First\nSecond");

    // Place cursor at end of "First" (before the <br>)
    const firstTextNode = el.firstChild!;
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.setStart(firstTextNode, firstTextNode.textContent!.length);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    await userEvent.keyboard(" added");
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "restored + type at end of line");
    const value = getStoredValue("kb-test");
    console.log(`[restored + type at end of line] serialized: ${JSON.stringify(value)}`);

    expect(value).toBe("First added\nSecond");
});

// ---------------------------------------------------------------------------
// Full cycle: restore → edit in middle → save → restore → verify
// ---------------------------------------------------------------------------

test("restored: full cycle - restore, add line in middle, save, re-restore, verify", async () => {
    const el = await restoreAndEdit("Top\nBottom");

    // Place cursor at start of "Bottom"
    const nodes = Array.from(el.childNodes);
    let bottomNode: Node | null = null;
    for (const n of nodes) {
        if (n.nodeType === Node.TEXT_NODE && n.textContent?.includes("Bottom")) {
            bottomNode = n;
            break;
        }
    }

    if (bottomNode) {
        const sel = window.getSelection()!;
        const range = document.createRange();
        range.setStart(bottomNode, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    // Press Enter to push Bottom down, then type Middle
    await userEvent.keyboard("{Enter}");
    // The cursor should now be on a new line before "Bottom"
    // We need to go up one line and type
    await userEvent.keyboard("{ArrowUp}");
    await userEvent.keyboard("Middle");
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "full cycle - after middle insert");
    const beforeSave = getStoredValue("kb-test");
    console.log(`[full cycle] before save: ${JSON.stringify(beforeSave)}`);

    // Save
    await clickToolbarButton("Save");
    await waitForCondition(() => !getToolbar().hasChanges, 5000);

    // Deselect
    document.body.click();
    await new Promise((r) => setTimeout(r, 200));

    dumpDOM(el, "full cycle - after save+deselect");
    const afterSave = getStoredValue("kb-test");
    console.log(`[full cycle] after save: ${JSON.stringify(afterSave)}`);

    // Re-click to edit and verify the value reads back the same
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "full cycle - after re-select");
    const afterReselect = getStoredValue("kb-test");
    console.log(`[full cycle] after re-select: ${JSON.stringify(afterReselect)}`);

    expect(afterSave).toBe(afterReselect);
});

// ---------------------------------------------------------------------------
// Restore content with empty lines, then edit within
// ---------------------------------------------------------------------------

test("restored: content with empty lines, press Enter after first line", async () => {
    const el = await restoreAndEdit("Alpha\n\nBravo");

    // DOM should be: "Alpha" <br> <br> "Bravo" (or similar)
    // Place cursor at end of "Alpha"
    const firstTextNode = el.firstChild!;
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.setStart(firstTextNode, firstTextNode.textContent!.length);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("Inserted");
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "restored empty lines + insert");
    const value = getStoredValue("kb-test");
    console.log(`[restored empty lines + insert] serialized: ${JSON.stringify(value)}`);

    expect(value).toBe("Alpha\nInserted\n\nBravo");
});

// ---------------------------------------------------------------------------
// Delete across a <br> boundary (Backspace at start of second line)
// ---------------------------------------------------------------------------

test("restored: Backspace at start of second line joins the lines", async () => {
    const el = await restoreAndEdit("Line A\nLine B");

    // Place cursor at start of "Line B"
    const nodes = Array.from(el.childNodes);
    let lineBNode: Node | null = null;
    for (const n of nodes) {
        if (n.nodeType === Node.TEXT_NODE && n.textContent?.includes("Line B")) {
            lineBNode = n;
            break;
        }
    }

    if (lineBNode) {
        const sel = window.getSelection()!;
        const range = document.createRange();
        range.setStart(lineBNode, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    await userEvent.keyboard("{Backspace}");
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "restored + Backspace join");
    const value = getStoredValue("kb-test");
    console.log(`[restored + Backspace join] serialized: ${JSON.stringify(value)}`);

    expect(value).toBe("Line ALine B");
});

// ---------------------------------------------------------------------------
// Triple round-trip: the exact user scenario
// Type → save → restore → edit within → save → restore → verify
// ---------------------------------------------------------------------------

test("triple round-trip: type 3 lines, save, restore, add 4th, save, restore, verify", async () => {
    const el = getElement();

    // Round 1: type from scratch
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));
    await selectAll(el);
    await userEvent.keyboard("One");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("Two");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("Three");
    await new Promise((r) => setTimeout(r, 100));

    const r1 = getStoredValue("kb-test");
    console.log(`[triple] round 1 typed: ${JSON.stringify(r1)}`);
    dumpDOM(el, "triple r1 typed");

    await clickToolbarButton("Save");
    await waitForCondition(() => !getToolbar().hasChanges, 5000);
    document.body.click();
    await new Promise((r) => setTimeout(r, 200));

    dumpDOM(el, "triple r1 after save+deselect");
    const r1saved = getStoredValue("kb-test");
    console.log(`[triple] round 1 saved: ${JSON.stringify(r1saved)}`);

    // Round 2: click to edit restored content, go to end, add a line
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));
    dumpDOM(el, "triple r2 after click");

    // Move cursor to very end
    const sel2 = window.getSelection()!;
    const range2 = document.createRange();
    range2.selectNodeContents(el);
    range2.collapse(false);
    sel2.removeAllRanges();
    sel2.addRange(range2);

    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("Four");
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "triple r2 after adding Four");
    const r2 = getStoredValue("kb-test");
    console.log(`[triple] round 2 edited: ${JSON.stringify(r2)}`);

    await clickToolbarButton("Save");
    await waitForCondition(() => !getToolbar().hasChanges, 5000);
    document.body.click();
    await new Promise((r) => setTimeout(r, 200));

    dumpDOM(el, "triple r2 after save+deselect");
    const r2saved = getStoredValue("kb-test");
    console.log(`[triple] round 2 saved: ${JSON.stringify(r2saved)}`);

    // Round 3: click to edit again, go to end, add another line
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));
    dumpDOM(el, "triple r3 after click");

    const sel3 = window.getSelection()!;
    const range3 = document.createRange();
    range3.selectNodeContents(el);
    range3.collapse(false);
    sel3.removeAllRanges();
    sel3.addRange(range3);

    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("Five");
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "triple r3 after adding Five");
    const r3 = getStoredValue("kb-test");
    console.log(`[triple] round 3 edited: ${JSON.stringify(r3)}`);

    expect(r3).toBe("One\nTwo\nThree\nFour\nFive");
});

// ---------------------------------------------------------------------------
// Trailing Enter: type text, press Enter at end, save, restore, verify
// ---------------------------------------------------------------------------

test("trailing Enter survives full save → restore → re-read cycle", async () => {
    const el = getElement();
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    await selectAll(el);
    await userEvent.keyboard("Hello");
    await userEvent.keyboard("{Enter}");
    // Don't type anything — just a trailing blank line
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "trailing-cycle: after typing");
    const afterType = getStoredValue("kb-test");
    console.log(`[trailing-cycle] after type: ${JSON.stringify(afterType)}`);
    expect(afterType).toBe("Hello\n");

    // Save
    await clickToolbarButton("Save");
    await waitForCondition(() => !getToolbar().hasChanges, 5000);

    const afterSave = getStoredValue("kb-test");
    console.log(`[trailing-cycle] after save: ${JSON.stringify(afterSave)}`);
    expect(afterSave).toBe("Hello\n");

    // Deselect
    document.body.click();
    await new Promise((r) => setTimeout(r, 200));

    dumpDOM(el, "trailing-cycle: after deselect");
    const afterDeselect = getStoredValue("kb-test");
    console.log(`[trailing-cycle] after deselect: ${JSON.stringify(afterDeselect)}`);

    // Now simulate what a page refresh does: restore from the saved value
    // This goes through writeTextWithBreaks → readTextWithBreaks
    const el2 = await restoreAndEdit(afterDeselect);
    dumpDOM(el2, "trailing-cycle: after restore+edit");
    const afterRestore = getStoredValue("kb-test");
    console.log(`[trailing-cycle] after restore: ${JSON.stringify(afterRestore)}`);

    expect(afterRestore).toBe("Hello\n");
});

test("trailing Enter after multiple lines survives restore", async () => {
    const el = getElement();
    await userEvent.click(el);
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    await selectAll(el);
    await userEvent.keyboard("Line one");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("Line two");
    await userEvent.keyboard("{Enter}");
    // Trailing blank line
    await new Promise((r) => setTimeout(r, 100));

    const afterType = getStoredValue("kb-test");
    console.log(`[trailing-multi] after type: ${JSON.stringify(afterType)}`);
    expect(afterType).toBe("Line one\nLine two\n");

    // Save and restore
    await clickToolbarButton("Save");
    await waitForCondition(() => !getToolbar().hasChanges, 5000);
    document.body.click();
    await new Promise((r) => setTimeout(r, 200));

    const el2 = await restoreAndEdit(getStoredValue("kb-test"));
    dumpDOM(el2, "trailing-multi: after restore+edit");
    const afterRestore = getStoredValue("kb-test");
    console.log(`[trailing-multi] after restore: ${JSON.stringify(afterRestore)}`);

    expect(afterRestore).toBe("Line one\nLine two\n");
});

test("trailing Enter on restored <br> content produces 2 newlines", async () => {
    // Restore content that has a <br> (from a previous save of "Hello\n...")
    // Then press Enter at the end — Chrome produces text<br><div><br></div>
    const el = await restoreAndEdit("Hello");

    // Move cursor to very end
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);

    await userEvent.keyboard("{Enter}");
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "trailing-restored: after Enter");
    const value = getStoredValue("kb-test");
    console.log(`[trailing-restored] serialized: ${JSON.stringify(value)}`);

    expect(value).toBe("Hello\n");
});

test("trailing Enter on restored multi-line <br> content is not lost", async () => {
    // Restore "Line one\nLine two" → DOM: Line one<br>Line two
    // Then press Enter at end → should get "Line one\nLine two\n"
    const el = await restoreAndEdit("Line one\nLine two");

    // Move cursor to very end
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);

    await userEvent.keyboard("{Enter}");
    await new Promise((r) => setTimeout(r, 100));

    dumpDOM(el, "trailing-restored-multi: after Enter");
    const value = getStoredValue("kb-test");
    console.log(`[trailing-restored-multi] serialized: ${JSON.stringify(value)}`);

    expect(value).toBe("Line one\nLine two\n");

    // Save, restore, verify it round-trips
    await clickToolbarButton("Save");
    await waitForCondition(() => !getToolbar().hasChanges, 5000);
    document.body.click();
    await new Promise((r) => setTimeout(r, 200));

    const el2 = await restoreAndEdit(getStoredValue("kb-test"));
    dumpDOM(el2, "trailing-restored-multi: after full round-trip");
    const afterRoundTrip = getStoredValue("kb-test");
    console.log(`[trailing-restored-multi] after round-trip: ${JSON.stringify(afterRoundTrip)}`);

    expect(afterRoundTrip).toBe("Line one\nLine two\n");
});
