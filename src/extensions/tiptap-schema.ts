/**
 * Custom Tiptap Schema Extensions
 *
 * ProseMirror requires block nodes as children of Document, ListItem, and
 * Blockquote. By default, bare inline content gets wrapped in a <p> tag,
 * causing unwanted visual changes when the editor loads.
 *
 * These extensions solve this by defining a "spanParagraph" node that renders
 * as <span> instead of <p>. It is placed first in content expressions so
 * ProseMirror uses it as the default wrapper for bare text. The standard
 * Paragraph node (renders <p>) is preserved for content that already has
 * <p> tags — those parse into "paragraph" and round-trip cleanly.
 *
 * Result:
 *   - "bare text"               → <span>bare text</span>    (no visual change)
 *   - "<p>paragraph</p>"        → <p>paragraph</p>          (preserved)
 *   - "<li>item</li>"           → <li><span>item</span></li>(no visual change)
 *   - "<blockquote>text</bq>"   → <bq><span>text</span></bq>(no visual change)
 */

import { Node, mergeAttributes } from "@tiptap/core";

/**
 * A block node that renders as <span> instead of <p>.
 * Used as the default wrapper for bare inline content, avoiding the visual
 * impact of <p> tags (margins, line breaks). Never parsed from HTML — it
 * is only created by ProseMirror when it needs to wrap bare text.
 */
export const SpanParagraph = Node.create({
    name: "spanParagraph",

    content: "inline*",

    group: "block",

    parseHTML() {
        return [];
    },

    renderHTML({ HTMLAttributes }) {
        return ["span", mergeAttributes(HTMLAttributes), 0];
    },
});

/**
 * Document node that prefers spanParagraph as the default wrapper.
 * By listing spanParagraph first, ProseMirror uses it (instead of <p>)
 * when bare text needs a block wrapper.
 */
export const FlexDocument = Node.create({
    name: "doc",
    topNode: true,
    content: "(spanParagraph | block)+",
});

/**
 * ListItem that uses a span-rendering wrapper for its required first
 * block child, instead of paragraph which renders as <p>.
 */
export const ListParagraph = Node.create({
    name: "listParagraph",

    content: "inline*",

    group: "block",

    parseHTML() {
        return [];
    },

    renderHTML({ HTMLAttributes }) {
        return ["span", mergeAttributes(HTMLAttributes), 0];
    },
});

export const FlexListItem = Node.create({
    name: "listItem",

    content: "(listParagraph | paragraph) block*",

    defining: true,

    parseHTML() {
        return [{ tag: "li" }];
    },

    renderHTML({ HTMLAttributes }) {
        return ["li", mergeAttributes(HTMLAttributes), 0];
    },

    addKeyboardShortcuts() {
        return {
            Enter: () => this.editor.commands.splitListItem(this.name),
            Tab: () => this.editor.commands.sinkListItem(this.name),
            "Shift-Tab": () => this.editor.commands.liftListItem(this.name),
        };
    },
});

/**
 * Blockquote that prefers spanParagraph as the default wrapper,
 * same pattern as FlexDocument.
 */
export const FlexBlockquote = Node.create({
    name: "blockquote",

    content: "(spanParagraph | block)+",

    group: "block",

    defining: true,

    parseHTML() {
        return [{ tag: "blockquote" }];
    },

    renderHTML({ HTMLAttributes }) {
        return ["blockquote", mergeAttributes(HTMLAttributes), 0];
    },
});

/**
 * Inline-only document node for compact/link editing mode.
 * Content is purely inline — no block wrappers at all.
 */
export const InlineDocument = Node.create({
    name: "doc",
    topNode: true,
    content: "inline*",
});
