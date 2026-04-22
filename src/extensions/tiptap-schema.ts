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

import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { canSplit } from "@tiptap/pm/transform";

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

/**
 * Overrides Tiptap's default splitBlock command so pressing Enter creates a
 * <p> instead of a <span>. The schema lists spanParagraph first (so bare text
 * loads without <p> wrapping), but ProseMirror's defaultBlockAt picks the
 * first textblock from the parent's content match — which is spanParagraph.
 *
 * This extension replaces splitBlock with a copy of Tiptap's implementation
 * that forces the new node type to "paragraph" when available, falling back
 * to defaultBlockAt otherwise. List item splitting is unaffected (it has its
 * own splitListItem command).
 */
export const ParagraphSplitBlock = Extension.create({
    name: "paragraphSplitBlock",

    addCommands() {
        return {
            splitBlock:
                ({ keepMarks = true } = {}) =>
                ({ tr, state, dispatch, editor }) => {
                    const { selection, doc } = tr;
                    const { $from, $to } = selection;

                    const ensureMarks = () => {
                        const marks =
                            state.storedMarks ||
                            (state.selection.$to.parentOffset && state.selection.$from.marks());
                        if (marks) {
                            const splittable = editor.extensionManager.splittableMarks;
                            const filtered = marks.filter((m) => splittable?.includes(m.type.name));
                            state.tr.ensureMarks(filtered);
                        }
                    };

                    if (selection instanceof NodeSelection && selection.node.isBlock) {
                        if (!$from.parentOffset || !canSplit(doc, $from.pos)) {
                            return false;
                        }
                        if (dispatch) {
                            if (keepMarks) ensureMarks();
                            tr.split($from.pos).scrollIntoView();
                        }
                        return true;
                    }

                    if (!$from.parent.isBlock) return false;

                    const atEnd = $to.parentOffset === $to.parent.content.size;

                    // Pick the new block type: prefer "paragraph" if it's a valid
                    // child of the parent at this position; otherwise fall back to
                    // the parent's default textblock.
                    let deflt = undefined as ReturnType<typeof getDefault>;
                    function getDefault() {
                        if ($from.depth === 0) return undefined;
                        const match = $from.node(-1).contentMatchAt($from.indexAfter(-1));
                        const paragraphType = editor.schema.nodes.paragraph;
                        if (paragraphType && match.matchType(paragraphType)) {
                            return paragraphType;
                        }
                        for (let i = 0; i < match.edgeCount; i += 1) {
                            const { type } = match.edge(i);
                            if (type.isTextblock && !type.hasRequiredAttrs()) {
                                return type;
                            }
                        }
                        return undefined;
                    }
                    deflt = getDefault();

                    let types =
                        atEnd && deflt ? [{ type: deflt, attrs: $from.node().attrs }] : undefined;

                    let can = canSplit(tr.doc, tr.mapping.map($from.pos), 1, types);

                    if (
                        !types &&
                        !can &&
                        canSplit(
                            tr.doc,
                            tr.mapping.map($from.pos),
                            1,
                            deflt ? [{ type: deflt }] : undefined,
                        )
                    ) {
                        can = true;
                        types = deflt ? [{ type: deflt, attrs: $from.node().attrs }] : undefined;
                    }

                    if (dispatch) {
                        if (can) {
                            if (selection instanceof TextSelection) {
                                tr.deleteSelection();
                            }
                            tr.split(tr.mapping.map($from.pos), 1, types);

                            if (
                                deflt &&
                                !atEnd &&
                                !$from.parentOffset &&
                                $from.parent.type !== deflt
                            ) {
                                const first = tr.mapping.map($from.before());
                                const $first = tr.doc.resolve(first);
                                if (
                                    $from
                                        .node(-1)
                                        .canReplaceWith($first.index(), $first.index() + 1, deflt)
                                ) {
                                    tr.setNodeMarkup(tr.mapping.map($from.before()), deflt);
                                }
                            }
                        }

                        if (keepMarks) ensureMarks();
                        tr.scrollIntoView();
                    }

                    return can;
                },
        };
    },
});
