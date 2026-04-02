/**
 * Rich Text Editor Component
 *
 * A shared WYSIWYG editor built on Tiptap (ProseMirror).
 * Used by both the HTML editor modal and link editor modal.
 * Supports full and compact toolbar modes, plus a raw HTML source toggle.
 */

import { html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { ScmsElement } from "./base.js";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import {
    Bold,
    Italic,
    Underline as UnderlineIcon,
    Strikethrough,
    Code,
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    Quote,
    Link as LinkIcon,
    Minus,
    Undo2,
    Redo2,
    Code2,
} from "lucide-static";

@customElement("scms-rich-text-editor")
export class RichTextEditor extends ScmsElement {
    @property({ type: String })
    content = "";

    @property({ type: Boolean })
    compact = false;

    @state()
    private sourceMode = false;

    @state()
    private sourceContent = "";

    @state()
    private activeFormats: Set<string> = new Set();

    private editor: Editor | null = null;
    private initialHTML = "";

    static styles = [
        ...ScmsElement.styles,
        css`
            .editor-wrapper {
                border: 1px solid #d1d5db;
                border-radius: 0.375rem;
                overflow: hidden;
            }

            .editor-wrapper:focus-within {
                border-color: #9ca3af;
                box-shadow: 0 0 0 1px #9ca3af;
            }

            .ProseMirror {
                outline: none;
                padding: 0.75rem;
                font-size: 14px;
                line-height: 1.6;
            }

            :host([compact]) .ProseMirror {
                min-height: 80px;
                max-height: 200px;
                overflow-y: auto;
            }

            :host(:not([compact])) .ProseMirror {
                min-height: 200px;
                max-height: 50vh;
                overflow-y: auto;
            }

            .ProseMirror p {
                margin: 0.25em 0;
            }

            .ProseMirror h1 {
                font-size: 1.5em;
                font-weight: 700;
                margin: 0.5em 0 0.25em;
            }

            .ProseMirror h2 {
                font-size: 1.25em;
                font-weight: 600;
                margin: 0.5em 0 0.25em;
            }

            .ProseMirror h3 {
                font-size: 1.1em;
                font-weight: 600;
                margin: 0.5em 0 0.25em;
            }

            .ProseMirror ul {
                list-style: disc;
                padding-left: 1.5em;
                margin: 0.25em 0;
            }

            .ProseMirror ol {
                list-style: decimal;
                padding-left: 1.5em;
                margin: 0.25em 0;
            }

            .ProseMirror li {
                margin: 0.1em 0;
            }

            .ProseMirror blockquote {
                border-left: 3px solid #d1d5db;
                padding-left: 1em;
                color: #6b7280;
                margin: 0.5em 0;
            }

            .ProseMirror a {
                color: #2563eb;
                text-decoration: underline;
            }

            .ProseMirror code {
                background: #f3f4f6;
                padding: 0.15em 0.35em;
                border-radius: 0.25em;
                font-size: 0.875em;
                font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
                    monospace;
            }

            .ProseMirror hr {
                border: none;
                border-top: 1px solid #d1d5db;
                margin: 1em 0;
            }

            .ProseMirror p.is-editor-empty:first-child::before {
                content: attr(data-placeholder);
                color: #9ca3af;
                pointer-events: none;
                float: left;
                height: 0;
            }

            .source-textarea {
                font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
                    monospace;
                font-size: 13px;
                line-height: 1.5;
                tab-size: 2;
                padding: 0.75rem;
                width: 100%;
                border: none;
                outline: none;
                resize: none;
            }

            :host([compact]) .source-textarea {
                min-height: 80px;
                max-height: 200px;
            }

            :host(:not([compact])) .source-textarea {
                min-height: 200px;
                max-height: 50vh;
            }

            button {
                cursor: pointer;
            }
        `,
    ];

    firstUpdated() {
        const editorElement = this.shadowRoot!.querySelector("#editor") as HTMLElement;
        if (!editorElement) return;

        this.editor = new Editor({
            element: editorElement,
            extensions: [
                StarterKit.configure({
                    heading: this.compact ? false : { levels: [1, 2, 3] },
                    bulletList: this.compact ? false : undefined,
                    orderedList: this.compact ? false : undefined,
                    blockquote: this.compact ? false : undefined,
                    horizontalRule: this.compact ? false : undefined,
                    strike: this.compact ? false : undefined,
                    code: this.compact ? false : undefined,
                }),
                Link.configure({
                    openOnClick: false,
                    HTMLAttributes: {
                        rel: null,
                        target: null,
                    },
                }),
                Underline,
            ],
            content: this.content,
            onTransaction: () => {
                this.updateActiveFormats();
                this.dispatchEvent(
                    new CustomEvent("content-change", {
                        detail: { content: this.editor!.getHTML() },
                        bubbles: true,
                        composed: true,
                    }),
                );
            },
        });

        this.initialHTML = this.editor.getHTML();
        this.updateActiveFormats();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.editor?.destroy();
        this.editor = null;
    }

    updated(changedProperties: Map<string, unknown>) {
        if (changedProperties.has("content") && this.editor) {
            const currentHTML = this.editor.getHTML();
            if (currentHTML !== this.content) {
                this.editor.commands.setContent(this.content, { emitUpdate: false });
            }
        }
    }

    /**
     * Get the current editor content as HTML
     */
    getHTML(): string {
        if (this.sourceMode) {
            return this.sourceContent;
        }
        return this.editor?.getHTML() || this.content;
    }

    /**
     * Whether the editor content has changed from what was initially loaded.
     * Compares against Tiptap-normalized HTML to avoid false positives from
     * normalization (e.g. "Hello" → "<p>Hello</p>").
     */
    hasChanges(): boolean {
        return this.getHTML() !== this.initialHTML;
    }

    private updateActiveFormats() {
        if (!this.editor) return;

        const formats = new Set<string>();
        if (this.editor.isActive("bold")) formats.add("bold");
        if (this.editor.isActive("italic")) formats.add("italic");
        if (this.editor.isActive("underline")) formats.add("underline");
        if (this.editor.isActive("strike")) formats.add("strike");
        if (this.editor.isActive("code")) formats.add("code");
        if (this.editor.isActive("heading", { level: 1 })) formats.add("h1");
        if (this.editor.isActive("heading", { level: 2 })) formats.add("h2");
        if (this.editor.isActive("heading", { level: 3 })) formats.add("h3");
        if (this.editor.isActive("bulletList")) formats.add("bulletList");
        if (this.editor.isActive("orderedList")) formats.add("orderedList");
        if (this.editor.isActive("blockquote")) formats.add("blockquote");
        if (this.editor.isActive("link")) formats.add("link");

        this.activeFormats = formats;
    }

    private toggleSourceMode() {
        if (this.sourceMode) {
            // Switching back to rich text: apply source content to editor
            if (this.editor) {
                this.editor.commands.setContent(this.sourceContent, { emitUpdate: false });
            }
            this.sourceMode = false;
        } else {
            // Switching to source: capture editor HTML
            this.sourceContent = this.editor?.getHTML() || this.content;
            this.sourceMode = true;
        }
    }

    private handleSourceInput(e: Event) {
        const textarea = e.target as HTMLTextAreaElement;
        this.sourceContent = textarea.value;
        this.dispatchEvent(
            new CustomEvent("content-change", {
                detail: { content: this.sourceContent },
                bubbles: true,
                composed: true,
            }),
        );
    }

    private exec(command: string, options?: Record<string, unknown>) {
        if (!this.editor) return;
        const chain = this.editor.chain().focus();

        switch (command) {
            case "bold":
                chain.toggleBold().run();
                break;
            case "italic":
                chain.toggleItalic().run();
                break;
            case "underline":
                chain.toggleUnderline().run();
                break;
            case "strike":
                chain.toggleStrike().run();
                break;
            case "code":
                chain.toggleCode().run();
                break;
            case "h1":
                chain.toggleHeading({ level: 1 }).run();
                break;
            case "h2":
                chain.toggleHeading({ level: 2 }).run();
                break;
            case "h3":
                chain.toggleHeading({ level: 3 }).run();
                break;
            case "bulletList":
                chain.toggleBulletList().run();
                break;
            case "orderedList":
                chain.toggleOrderedList().run();
                break;
            case "blockquote":
                chain.toggleBlockquote().run();
                break;
            case "horizontalRule":
                chain.setHorizontalRule().run();
                break;
            case "link": {
                if (this.editor.isActive("link")) {
                    chain.unsetLink().run();
                } else {
                    const url = options?.href as string | undefined;
                    const href = url || prompt("Enter URL:");
                    if (href) {
                        chain.setLink({ href }).run();
                    }
                }
                break;
            }
            case "undo":
                chain.undo().run();
                break;
            case "redo":
                chain.redo().run();
                break;
        }
    }

    private renderToolbarButton(
        command: string,
        icon: string,
        title: string,
        options?: Record<string, unknown>,
    ) {
        const isActive = this.activeFormats.has(command);
        return html`
            <button
                type="button"
                class="p-1.5 rounded transition-colors ${isActive
                    ? "bg-gray-200 text-gray-900"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}"
                title=${title}
                @click=${() => this.exec(command, options)}
            >
                <span class="[&>svg]:w-4 [&>svg]:h-4 flex items-center justify-center">
                    ${unsafeSVG(icon)}
                </span>
            </button>
        `;
    }

    private renderSeparator() {
        return html`<span class="w-px h-5 bg-gray-200 mx-0.5"></span>`;
    }

    private renderToolbar() {
        if (this.compact) {
            return html`
                <div
                    class="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50 flex-wrap"
                >
                    <div class="flex items-center gap-0.5">
                        ${this.renderToolbarButton("bold", Bold, "Bold")}
                        ${this.renderToolbarButton("italic", Italic, "Italic")}
                        ${this.renderToolbarButton("underline", UnderlineIcon, "Underline")}
                        ${this.renderSeparator()}
                        ${this.renderToolbarButton("link", LinkIcon, "Link")}
                    </div>
                    <div class="flex-1"></div>
                    ${this.renderSourceToggle()}
                </div>
            `;
        }

        return html`
            <div
                class="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50 flex-wrap"
            >
                <div class="flex items-center gap-0.5">
                    ${this.renderToolbarButton("bold", Bold, "Bold")}
                    ${this.renderToolbarButton("italic", Italic, "Italic")}
                    ${this.renderToolbarButton("underline", UnderlineIcon, "Underline")}
                    ${this.renderToolbarButton("strike", Strikethrough, "Strikethrough")}
                    ${this.renderToolbarButton("code", Code, "Inline Code")}
                    ${this.renderSeparator()}
                    ${this.renderToolbarButton("h1", Heading1, "Heading 1")}
                    ${this.renderToolbarButton("h2", Heading2, "Heading 2")}
                    ${this.renderToolbarButton("h3", Heading3, "Heading 3")}
                    ${this.renderSeparator()}
                    ${this.renderToolbarButton("bulletList", List, "Bullet List")}
                    ${this.renderToolbarButton("orderedList", ListOrdered, "Ordered List")}
                    ${this.renderToolbarButton("blockquote", Quote, "Blockquote")}
                    ${this.renderSeparator()}
                    ${this.renderToolbarButton("link", LinkIcon, "Link")}
                    ${this.renderToolbarButton("horizontalRule", Minus, "Horizontal Rule")}
                    ${this.renderSeparator()}
                    ${this.renderToolbarButton("undo", Undo2, "Undo")}
                    ${this.renderToolbarButton("redo", Redo2, "Redo")}
                </div>
                <div class="flex-1"></div>
                ${this.renderSourceToggle()}
            </div>
        `;
    }

    private renderSourceToggle() {
        return html`
            <button
                type="button"
                class="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors ${this
                    .sourceMode
                    ? "bg-gray-200 text-gray-900"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}"
                title=${this.sourceMode ? "Switch to rich text" : "View HTML source"}
                @click=${this.toggleSourceMode}
            >
                <span class="[&>svg]:w-3.5 [&>svg]:h-3.5 flex items-center">
                    ${unsafeSVG(Code2)}
                </span>
                ${this.sourceMode ? "Rich Text" : "Source"}
            </button>
        `;
    }

    render() {
        return html`
            <div class="editor-wrapper">
                ${this.renderToolbar()}
                <div id="editor" style=${this.sourceMode ? "display:none" : nothing}></div>
                ${this.sourceMode
                    ? html`
                          <textarea
                              class="source-textarea"
                              .value=${this.sourceContent}
                              @input=${this.handleSourceInput}
                              spellcheck="false"
                          ></textarea>
                      `
                    : nothing}
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "scms-rich-text-editor": RichTextEditor;
    }
}
