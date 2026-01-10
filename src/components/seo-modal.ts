/**
 * SEO Modal Component
 *
 * A modal dialog for editing SEO-related attributes (alt, title, rel).
 * Fields are shown based on relevance to the element type.
 */

import { html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ScmsElement } from "./base.js";
import type { EditableType, ElementAttributes } from "../types.js";

interface FieldConfig {
    name: string;
    label: string;
    type: "text" | "select";
    placeholder?: string;
    options?: { value: string; label: string }[];
    priority: Record<EditableType, "primary" | "secondary" | "not-applicable">;
    tips: Record<EditableType, string>;
}

const SEO_FIELDS: FieldConfig[] = [
    {
        name: "alt",
        label: "Alt Text",
        type: "text",
        placeholder: "Describe the image...",
        priority: {
            image: "primary",
            link: "not-applicable",
            text: "not-applicable",
            html: "not-applicable",
        },
        tips: {
            image: "Describe the image for screen readers and when the image fails to load. Be concise but descriptive.",
            link: "Alt text is typically used for images, not links.",
            text: "Alt text is typically used for images, not text elements.",
            html: "Alt text is typically used for images, not HTML elements.",
        },
    },
    {
        name: "title",
        label: "Title",
        type: "text",
        placeholder: "Tooltip text...",
        priority: {
            image: "secondary",
            link: "secondary",
            text: "secondary",
            html: "secondary",
        },
        tips: {
            image: "Shows as a tooltip on hover. Generally not needed if alt text is good.",
            link: "Shows as a tooltip on hover. Can provide additional context about the link destination.",
            text: "Shows as a tooltip on hover. Rarely needed for text elements.",
            html: "Shows as a tooltip on hover. Rarely needed for HTML elements.",
        },
    },
    {
        name: "rel",
        label: "Link Relationship",
        type: "select",
        options: [
            { value: "", label: "None" },
            { value: "nofollow", label: "nofollow - Don't pass SEO value" },
            { value: "sponsored", label: "sponsored - Paid/sponsored link" },
            { value: "ugc", label: "ugc - User-generated content" },
            { value: "noopener", label: "noopener - Security for new tabs" },
            { value: "noreferrer", label: "noreferrer - Don't send referrer" },
        ],
        priority: {
            image: "not-applicable",
            link: "primary",
            text: "not-applicable",
            html: "not-applicable",
        },
        tips: {
            image: "Link relationship is typically used for anchor elements, not images.",
            link: "Controls how search engines treat this link and security for external links.",
            text: "Link relationship is typically used for anchor elements, not text.",
            html: "Link relationship is typically used for anchor elements, not HTML elements.",
        },
    },
];

@customElement("scms-seo-modal")
export class SeoModal extends ScmsElement {
    @property({ type: String, attribute: "element-id" })
    elementId: string | null = null;

    @property({ type: String, attribute: "element-type" })
    elementType: EditableType = "html";

    @property({ type: Object, attribute: "element-attrs" })
    elementAttrs: ElementAttributes = {};

    @state()
    private editedAttributes: ElementAttributes = {};

    @state()
    private showNotApplicable = false;

    static styles = [
        ...ScmsElement.styles,
        css`
            :host {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 10001;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .backdrop {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
            }

            .modal {
                position: relative;
                width: 90%;
                max-width: 500px;
                max-height: 90vh;
                display: flex;
                flex-direction: column;
            }

            input,
            select {
                font-size: 14px;
            }

            button {
                cursor: pointer;
            }

            .field-tip {
                font-size: 12px;
                color: #6b7280;
                margin-top: 4px;
            }

            .not-applicable-toggle {
                font-size: 13px;
                color: #6b7280;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 4px;
            }

            .not-applicable-toggle:hover {
                color: #374151;
            }

            .not-applicable-section {
                opacity: 0.6;
            }
        `,
    ];

    connectedCallback() {
        super.connectedCallback();
        this.editedAttributes = { ...this.elementAttrs };
        document.body.style.overflow = "hidden";
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.body.style.overflow = "";
    }

    updated(changedProperties: Map<string, unknown>) {
        if (changedProperties.has("elementAttrs")) {
            this.editedAttributes = { ...this.elementAttrs };
        }
    }

    private handleInput(fieldName: string, value: string) {
        if (value) {
            this.editedAttributes = { ...this.editedAttributes, [fieldName]: value };
        } else {
            // Remove empty attributes
            const { [fieldName]: _, ...rest } = this.editedAttributes;
            this.editedAttributes = rest;
        }
    }

    private handleApply() {
        this.dispatchEvent(
            new CustomEvent("apply", {
                detail: { attributes: this.editedAttributes },
                bubbles: true,
                composed: true,
            }),
        );
    }

    private handleCancel() {
        if (this.hasChanges()) {
            const confirmed = confirm("You have unsaved changes. Discard them?");
            if (!confirmed) return;
        }
        this.dispatchEvent(
            new CustomEvent("cancel", {
                bubbles: true,
                composed: true,
            }),
        );
    }

    private hasChanges(): boolean {
        const originalKeys = Object.keys(this.elementAttrs);
        const editedKeys = Object.keys(this.editedAttributes);

        if (originalKeys.length !== editedKeys.length) return true;

        for (const key of editedKeys) {
            if (this.elementAttrs[key] !== this.editedAttributes[key]) return true;
        }
        return false;
    }

    private handleBackdropClick(e: Event) {
        if (e.target === e.currentTarget) {
            this.handleCancel();
        }
    }

    private handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            this.handleCancel();
        } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            this.handleApply();
        }
    }

    private renderField(field: FieldConfig) {
        const priority = field.priority[this.elementType];
        const tip = field.tips[this.elementType];
        const value = this.editedAttributes[field.name] || "";

        return html`
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                    ${field.label}
                    ${priority === "primary"
                        ? html`<span class="text-red-500 ml-1">*</span>`
                        : nothing}
                </label>
                ${field.type === "select"
                    ? html`
                          <select
                              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 bg-white"
                              .value=${value}
                              @change=${(e: Event) =>
                                  this.handleInput(
                                      field.name,
                                      (e.target as HTMLSelectElement).value,
                                  )}
                          >
                              ${field.options?.map(
                                  (opt) => html`<option value=${opt.value}>${opt.label}</option>`,
                              )}
                          </select>
                      `
                    : html`
                          <input
                              type="text"
                              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                              .value=${value}
                              @input=${(e: Event) =>
                                  this.handleInput(
                                      field.name,
                                      (e.target as HTMLInputElement).value,
                                  )}
                              placeholder=${field.placeholder || ""}
                          />
                      `}
                <p class="field-tip">${tip}</p>
            </div>
        `;
    }

    render() {
        const primaryFields = SEO_FIELDS.filter((f) => f.priority[this.elementType] === "primary");
        const secondaryFields = SEO_FIELDS.filter(
            (f) => f.priority[this.elementType] === "secondary",
        );
        const notApplicableFields = SEO_FIELDS.filter(
            (f) => f.priority[this.elementType] === "not-applicable",
        );

        return html`
            <div class="backdrop" @click=${this.handleBackdropClick}></div>
            <div
                class="modal bg-white rounded-lg shadow-2xl overflow-hidden"
                @keydown=${this.handleKeydown}
            >
                <!-- Header -->
                <div class="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-gray-900">SEO Attributes</span>
                        <span
                            class="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded"
                        >
                            ${this.elementId}
                        </span>
                    </div>
                    <button
                        class="text-gray-400 hover:text-gray-600 p-1"
                        @click=${this.handleCancel}
                        aria-label="Close"
                    >
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>

                <!-- Form -->
                <div class="p-4 space-y-4 overflow-y-auto" style="max-height: calc(90vh - 130px)">
                    <!-- Primary fields -->
                    ${primaryFields.map((field) => this.renderField(field))}

                    <!-- Secondary fields -->
                    ${secondaryFields.map((field) => this.renderField(field))}

                    <!-- Not applicable fields (collapsed) -->
                    ${notApplicableFields.length > 0
                        ? html`
                              <div class="pt-2 border-t border-gray-200">
                                  <button
                                      type="button"
                                      class="not-applicable-toggle"
                                      @click=${() =>
                                          (this.showNotApplicable = !this.showNotApplicable)}
                                  >
                                      <svg
                                          class="w-4 h-4 transition-transform ${this
                                              .showNotApplicable
                                              ? "rotate-90"
                                              : ""}"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                      >
                                          <path
                                              stroke-linecap="round"
                                              stroke-linejoin="round"
                                              stroke-width="2"
                                              d="M9 5l7 7-7 7"
                                          />
                                      </svg>
                                      Not typically used for this element type
                                  </button>
                                  ${this.showNotApplicable
                                      ? html`
                                            <div class="not-applicable-section mt-3 space-y-4">
                                                ${notApplicableFields.map((field) =>
                                                    this.renderField(field),
                                                )}
                                            </div>
                                        `
                                      : nothing}
                              </div>
                          `
                        : nothing}
                </div>

                <!-- Footer -->
                <div
                    class="px-4 py-3 border-t border-gray-200 flex items-center justify-between bg-gray-50"
                >
                    <span class="text-xs text-gray-500">
                        <kbd class="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">⌘</kbd>
                        <kbd class="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">Enter</kbd>
                        to apply
                    </span>
                    <div class="flex items-center gap-2">
                        <button
                            class="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
                            @click=${this.handleCancel}
                        >
                            Cancel
                        </button>
                        <button
                            class="px-4 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                            @click=${this.handleApply}
                        >
                            Apply
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "scms-seo-modal": SeoModal;
    }
}
