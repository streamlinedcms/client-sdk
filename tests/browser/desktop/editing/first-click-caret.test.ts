/**
 * First-click caret placement tests
 *
 * Tiptap editors must receive focus and a ProseMirror selection on the
 * FIRST click — users should not have to click twice to get a caret.
 *
 * These tests guard against regression of a bug where attach() created a
 * new Tiptap editor but never called editor.commands.focus() on it, so
 * the caret only appeared on the second click (which hit the reuse
 * branch that does focus the editor).
 */

import { test, expect, beforeAll, beforeEach } from "vitest";
import {
    initializeSDK,
    waitForCondition,
    setupTestHelpers,
} from "~/@browser-support/sdk-helpers.js";
import type { FormattingToolbar } from "~/src/components/rich-text-editor.js";

beforeAll(async () => {
    setupTestHelpers();
    await initializeSDK();
});

beforeEach(async () => {
    document.body.click();
    await new Promise((r) => setTimeout(r, 100));
});

function getFormattingToolbar(): FormattingToolbar | null {
    return document.querySelector("scms-formatting-toolbar") as FormattingToolbar | null;
}

function getParagraph(): HTMLElement {
    return document.querySelector('[data-scms-html="test-paragraph"]') as HTMLElement;
}

function getTitle(): HTMLElement {
    return document.querySelector('[data-scms-html="test-title"]') as HTMLElement;
}

test("first click on an HTML element focuses the Tiptap editor", async () => {
    const el = getTitle();

    el.click();
    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    const toolbar = getFormattingToolbar();
    expect(toolbar).not.toBeNull();
    expect(toolbar!.editor).not.toBeNull();

    // Tiptap's focus command defers view.focus() via requestAnimationFrame,
    // so isFocused flips async. Wait briefly for it to settle.
    await waitForCondition(() => toolbar!.editor!.isFocused === true);

    expect(toolbar!.editor!.isFocused).toBe(true);
    expect(toolbar!.editor!.view.hasFocus()).toBe(true);

    const sel = window.getSelection();
    expect(sel).not.toBeNull();
    expect(sel!.rangeCount).toBeGreaterThan(0);
});

test("first click places the caret at the click coordinates", async () => {
    const el = getParagraph();
    const rect = el.getBoundingClientRect();

    // Aim for a point ~75% across the text horizontally so the resulting
    // selection position is clearly distinguishable from pos 0 and pos end.
    const clickX = Math.round(rect.left + rect.width * 0.75);
    const clickY = Math.round(rect.top + rect.height / 2);

    el.dispatchEvent(
        new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            clientX: clickX,
            clientY: clickY,
        }),
    );

    await waitForCondition(() => el.classList.contains("streamlined-editing"));

    const toolbar = getFormattingToolbar();
    const editor = toolbar!.editor!;
    await waitForCondition(() => editor.isFocused === true);
    expect(editor.isFocused).toBe(true);

    const expected = editor.view.posAtCoords({ left: clickX, top: clickY });
    expect(expected).not.toBeNull();

    const actualFrom = editor.view.state.selection.from;
    // Allow ±1 for boundary ambiguity between adjacent positions.
    expect(Math.abs(actualFrom - expected!.pos)).toBeLessThanOrEqual(1);
});

test("keyboard navigation to next editable still focuses (fallback path)", async () => {
    const first = getTitle();
    const second = getParagraph();

    first.click();
    await waitForCondition(() => first.classList.contains("streamlined-editing"));

    // Tab handler is attached to the editable itself (see editing-manager.ts),
    // so dispatch on the first element — navigateToNextEditable then calls
    // startEditing on `second` WITHOUT click coords, exercising the fallback.
    first.dispatchEvent(
        new KeyboardEvent("keydown", {
            key: "Tab",
            bubbles: true,
            cancelable: true,
        }),
    );

    await waitForCondition(() => second.classList.contains("streamlined-editing"));

    const toolbar = getFormattingToolbar();
    expect(toolbar!.editor).not.toBeNull();
    await waitForCondition(() => toolbar!.editor!.isFocused === true);
    expect(toolbar!.editor!.isFocused).toBe(true);
});
