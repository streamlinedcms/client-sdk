/**
 * Formatting Toolbar Component
 *
 * A floating WYSIWYG formatting toolbar powered by Tiptap (ProseMirror).
 * Mounts Tiptap directly on the page element being edited, providing
 * inline rich text formatting with clean HTML output.
 * Positioned fixed at the top of the viewport with a detached/hovering look.
 * Supports full and link toolbar modes, and is draggable.
 *
 * Uses custom schema extensions to prevent HTML normalization on load.
 * See src/extensions/tiptap-schema.ts for details.
 */

import { html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { ScmsElement } from "./base.js";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import {
    SpanParagraph,
    FlexDocument,
    ListParagraph,
    FlexListItem,
    FlexBlockquote,
} from "../extensions/tiptap-schema.js";
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
    ExternalLink,
    Pilcrow,
    Minus,
    Undo2,
    Redo2,
    GripHorizontal,
} from "lucide-static";

@customElement("scms-formatting-toolbar")
export class FormattingToolbar extends ScmsElement {
    @property({ type: Boolean })
    linkMode = false;

    @state()
    private activeFormats: Set<string> = new Set();

    @state()
    private isMobile = false;

    @state()
    private posX = -1;

    @state()
    private posY = 12;

    /** The Tiptap editor for the currently active element. */
    editor: Editor | null = null;

    /** The element currently being edited. */
    targetElement: HTMLElement | null = null;

    /** The HTML at the time the current editor was created, for change detection. */
    private initialHTML = "";

    /** All active editors, keyed by element. Preserved across blur/focus for undo history. */
    editors: Map<HTMLElement, { editor: Editor; initialHTML: string }> = new Map();

    private dragStartX = 0;
    private dragStartY = 0;
    private dragStartPosX = 0;
    private dragStartPosY = 0;

    /** Clamp toolbar position to stay within the visual viewport (handles keyboard open/close). */
    private handleViewportChange = () => {
        this.isMobile = window.innerWidth < 640;

        const vv = window.visualViewport;
        if (!vv) return;

        const toolbar = this.shadowRoot?.querySelector(".toolbar-container") as HTMLElement | null;
        const toolbarHeight = toolbar?.offsetHeight ?? 48;
        const toolbarWidth = toolbar?.offsetWidth ?? 200;

        const visibleTop = vv.offsetTop;
        const visibleBottom = vv.offsetTop + vv.height;
        const visibleRight = vv.offsetLeft + vv.width;

        const maxY = visibleBottom - toolbarHeight;
        const clampedY = Math.max(visibleTop, Math.min(this.posY, maxY));

        let clampedX = this.posX;
        if (!this.isMobile && this.posX !== -1) {
            const maxX = visibleRight - toolbarWidth;
            clampedX = Math.max(vv.offsetLeft, Math.min(this.posX, maxX));
        }

        if (clampedY !== this.posY) this.posY = clampedY;
        if (clampedX !== this.posX) this.posX = clampedX;
    };

    /**
     * Callback fired on each content update. Set by the controller
     * to sync content changes back to the content manager.
     */
    onContentUpdate: (() => void) | null = null;

    static styles = [
        ...ScmsElement.styles,
        css`
            :host {
                position: fixed;
                z-index: 10000;
                display: block;
                pointer-events: none;
            }

            .toolbar-container {
                pointer-events: auto;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                padding: 4px 8px;
                background: white;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                box-shadow:
                    0 4px 6px -1px rgba(0, 0, 0, 0.1),
                    0 2px 4px -2px rgba(0, 0, 0, 0.1);
            }

            .toolbar-buttons {
                display: flex;
                flex-wrap: wrap;
                justify-content: center;
                align-items: center;
                gap: 2px;
            }

            .drag-handle {
                cursor: grab;
                padding: 2px 0;
                color: #9ca3af;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 40px;
                user-select: none;
                -webkit-user-select: none;
                touch-action: none;
            }

            .drag-handle:active {
                cursor: grabbing;
            }

            button {
                cursor: pointer;
            }
        `,
    ];

    /**
     * Attach Tiptap to a page element and show the toolbar.
     * Reuses existing editor for the same element (preserves undo history).
     * Creates a new editor for new elements without destroying others.
     */
    attach(element: HTMLElement, linkMode: boolean): void {
        this.linkMode = linkMode;
        this.isMobile = window.innerWidth < 640;
        this.targetElement = element;

        // Reuse existing editor for this element
        const existing = this.editors.get(element);
        if (existing) {
            this.editor = existing.editor;
            this.initialHTML = existing.initialHTML;
            this.editor.commands.focus();
            this.updateActiveFormats();
            this.style.display = "block";
            return;
        }

        // Create new editor
        this.editor = new Editor({
            element: { mount: element },
            content: element.innerHTML,
            extensions: [
                StarterKit.configure({
                    document: false,
                    listItem: false,
                    blockquote: false,
                    trailingNode: false,
                    link: false,
                    heading: { levels: [1, 2, 3] },
                }),
                FlexDocument,
                SpanParagraph,
                ListParagraph,
                FlexListItem,
                FlexBlockquote,
                Link.configure({
                    openOnClick: false,
                    HTMLAttributes: { rel: null, target: null },
                }),
            ],
            onUpdate: () => {
                this.updateActiveFormats();
                this.onContentUpdate?.();
            },
            onSelectionUpdate: () => {
                this.updateActiveFormats();
            },
        });

        this.initialHTML = this.editor.getHTML();
        this.editors.set(element, { editor: this.editor, initialHTML: this.initialHTML });

        // Center horizontally on first show
        if (this.posX === -1) {
            requestAnimationFrame(() => {
                const toolbar = this.shadowRoot?.querySelector(
                    ".toolbar-container",
                ) as HTMLElement | null;
                if (toolbar) {
                    this.posX = Math.max(
                        12,
                        (window.innerWidth - toolbar.offsetWidth) / 2,
                    );
                }
            });
        }

        this.updateActiveFormats();
        this.style.display = "block";
    }

    /**
     * Whether the current editor's content has changed from when it was loaded.
     */
    hasChanges(): boolean {
        if (!this.editor) return false;
        return this.editor.getHTML() !== this.initialHTML;
    }

    /**
     * Check if a specific element's editor has changes.
     */
    hasChangesFor(element: HTMLElement): boolean {
        const entry = this.editors.get(element);
        if (!entry) return false;
        return entry.editor.getHTML() !== entry.initialHTML;
    }

    /**
     * Destroy the editor for a specific element and restore its HTML.
     */
    detachElement(element: HTMLElement): void {
        const entry = this.editors.get(element);
        if (!entry) return;

        const finalHTML = entry.editor.getHTML();
        entry.editor.destroy();
        this.editors.delete(element);
        element.innerHTML = finalHTML;

        // If this was the active element, clear current state
        if (this.targetElement === element) {
            this.editor = null;
            this.targetElement = null;
            this.activeFormats = new Set();
            this.style.display = "none";
        }
    }

    /**
     * Destroy all editors and clean up.
     */
    detach(): void {
        for (const [element, entry] of this.editors) {
            const finalHTML = entry.editor.getHTML();
            entry.editor.destroy();
            element.innerHTML = finalHTML;
        }
        this.editors.clear();
        this.editor = null;
        this.targetElement = null;
        this.activeFormats = new Set();
        this.style.display = "none";
    }

    /**
     * Get the current content as HTML.
     */
    getHTML(): string {
        return this.editor?.getHTML() || "";
    }

    /**
     * Programmatically set the editor content.
     */
    setContent(htmlContent: string): void {
        if (this.editor) {
            this.editor.commands.setContent(htmlContent, { emitUpdate: true });
        }
    }

    connectedCallback() {
        super.connectedCallback();
        window.visualViewport?.addEventListener("resize", this.handleViewportChange);
        window.visualViewport?.addEventListener("scroll", this.handleViewportChange);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.visualViewport?.removeEventListener("resize", this.handleViewportChange);
        window.visualViewport?.removeEventListener("scroll", this.handleViewportChange);
        this.detach();
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
        if (this.editor.isActive("paragraph")) formats.add("paragraph");
        if (this.editor.isActive("bulletList")) formats.add("bulletList");
        if (this.editor.isActive("orderedList")) formats.add("orderedList");
        if (this.editor.isActive("blockquote")) formats.add("blockquote");
        if (this.editor.isActive("link")) formats.add("link");

        this.activeFormats = formats;
    }

    // --- Drag handling ---

    private handleDragStart(e: PointerEvent) {
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.dragStartPosX = this.posX;
        this.dragStartPosY = this.posY;

        const onMove = (ev: PointerEvent) => {
            const dx = ev.clientX - this.dragStartX;
            const dy = ev.clientY - this.dragStartY;

            const toolbar = this.shadowRoot?.querySelector(
                ".toolbar-container",
            ) as HTMLElement | null;
            const toolbarHeight = toolbar?.offsetHeight ?? 48;
            const toolbarWidth = toolbar?.offsetWidth ?? 200;

            const vv = window.visualViewport;
            const minY = vv?.offsetTop ?? 0;
            const maxY = (vv ? vv.offsetTop + vv.height : window.innerHeight) - toolbarHeight;

            this.posY = Math.max(minY, Math.min(this.dragStartPosY + dy, maxY));

            if (!this.isMobile) {
                const minX = vv?.offsetLeft ?? 0;
                const maxX =
                    (vv ? vv.offsetLeft + vv.width : window.innerWidth) - toolbarWidth;
                this.posX = Math.max(minX, Math.min(this.dragStartPosX + dx, maxX));
            }
        };

        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    }

    // --- Command execution ---

    private exec(command: string) {
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
                if (this.editor.isActive("heading", { level: 1 })) {
                    chain.setNode("spanParagraph").run();
                } else {
                    chain.setHeading({ level: 1 }).run();
                }
                break;
            case "h2":
                if (this.editor.isActive("heading", { level: 2 })) {
                    chain.setNode("spanParagraph").run();
                } else {
                    chain.setHeading({ level: 2 }).run();
                }
                break;
            case "h3":
                if (this.editor.isActive("heading", { level: 3 })) {
                    chain.setNode("spanParagraph").run();
                } else {
                    chain.setHeading({ level: 3 }).run();
                }
                break;
            case "paragraph":
                if (this.editor.isActive("paragraph")) {
                    chain.setNode("spanParagraph").run();
                } else {
                    chain.setNode("paragraph").run();
                }
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
                const currentHref = this.editor.getAttributes("link").href || "";
                const message = currentHref
                    ? "Edit URL (clear to remove link):"
                    : "Enter URL:";
                const href = prompt(message, currentHref);
                if (href === null) {
                    // User cancelled — do nothing
                } else if (href === "") {
                    // Empty input — remove link
                    chain.unsetLink().run();
                } else {
                    // Set or update link
                    chain.setLink({ href }).run();
                }
                break;
            }
            case "goToLink":
                if (this.targetElement instanceof HTMLAnchorElement) {
                    window.open(this.targetElement.href, "_blank");
                }
                return;
            case "undo":
                chain.undo().run();
                break;
            case "redo":
                chain.redo().run();
                break;
        }
    }

    // --- Rendering ---

    private renderButton(command: string, icon: string, title: string) {
        const isActive = this.activeFormats.has(command);
        return html`
            <button
                type="button"
                class="p-1.5 rounded transition-colors ${isActive
                    ? "bg-gray-200 text-gray-900"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}"
                title=${title}
                @mousedown=${(e: Event) => e.preventDefault()}
                @click=${() => this.exec(command)}
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

    private renderDragHandle() {
        return html`
            <div
                class="drag-handle"
                @pointerdown=${this.handleDragStart}
                title="Drag to reposition"
            >
                <span class="[&>svg]:w-4 [&>svg]:h-4">
                    ${unsafeSVG(GripHorizontal)}
                </span>
            </div>
        `;
    }

    render() {
        if (!this.editor) return nothing;

        const mobile = this.isMobile;
        const left = mobile ? "0" : this.posX === -1 ? "50%" : `${this.posX}px`;
        const right = mobile ? "0" : "auto";
        const transform = !mobile && this.posX === -1 ? "translateX(-50%)" : "none";

        return html`
            <div
                class="toolbar-container"
                style="position:fixed; top:${this.posY}px; left:${left}; right:${right}; transform:${transform};"
            >
                ${this.renderDragHandle()}
                <div class="toolbar-buttons">
                    ${this.renderButton("bold", Bold, "Bold")}
                    ${this.renderButton("italic", Italic, "Italic")}
                    ${this.renderButton("underline", UnderlineIcon, "Underline")}
                    ${this.renderButton("strike", Strikethrough, "Strikethrough")}
                    ${this.renderButton("code", Code, "Inline Code")}
                    ${this.renderSeparator()}
                    ${this.renderButton("paragraph", Pilcrow, "Paragraph")}
                    ${this.renderButton("h1", Heading1, "Heading 1")}
                    ${this.renderButton("h2", Heading2, "Heading 2")}
                    ${this.renderButton("h3", Heading3, "Heading 3")}
                    ${this.linkMode
                        ? nothing
                        : html`
                              ${this.renderSeparator()}
                              ${this.renderButton("bulletList", List, "Bullet List")}
                              ${this.renderButton("orderedList", ListOrdered, "Ordered List")}
                              ${this.renderButton("blockquote", Quote, "Blockquote")}
                          `}
                    ${this.linkMode ? nothing : this.renderSeparator()}
                    ${this.linkMode ? nothing : this.renderButton("link", LinkIcon, "Link")}
                    ${this.linkMode ? nothing : this.renderButton("horizontalRule", Minus, "Horizontal Rule")}
                    ${this.linkMode ? this.renderSeparator() : nothing}
                    ${this.linkMode ? this.renderButton("goToLink", ExternalLink, "Go to Link") : nothing}
                    ${this.renderSeparator()}
                    ${this.renderButton("undo", Undo2, "Undo")}
                    ${this.renderButton("redo", Redo2, "Redo")}
                </div>
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "scms-formatting-toolbar": FormattingToolbar;
    }
}
