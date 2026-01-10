/**
 * Accessibility Modal Component
 *
 * A modal dialog for editing accessibility-related attributes
 * (aria-label, aria-describedby, role, tabindex).
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

const ACCESSIBILITY_FIELDS: FieldConfig[] = [
    {
        name: "aria-label",
        label: "ARIA Label",
        type: "text",
        placeholder: "Accessible name...",
        priority: {
            image: "primary",
            link: "secondary",
            text: "secondary",
            html: "secondary",
        },
        tips: {
            image: "Provides an accessible name when alt text isn't sufficient or the image has additional meaning.",
            link: "Use when the link text alone doesn't clearly describe the destination. Overrides the visible text for screen readers.",
            text: "Usually not needed since the text content itself is read. Use for additional context.",
            html: "Provides an accessible name for the entire region. Use when content alone isn't descriptive enough.",
        },
    },
    {
        name: "aria-describedby",
        label: "Described By",
        type: "text",
        placeholder: "ID of describing element...",
        priority: {
            image: "secondary",
            link: "secondary",
            text: "not-applicable",
            html: "secondary",
        },
        tips: {
            image: "Reference the ID of another element that provides a longer description of this image.",
            link: "Reference the ID of another element that provides additional context about this link.",
            text: "Rarely needed for text elements since they describe themselves.",
            html: "Reference the ID of another element that provides additional context for this content.",
        },
    },
    {
        name: "role",
        label: "ARIA Role",
        type: "select",
        options: [
            { value: "", label: "Default (inherit from element)" },
            { value: "img", label: "img - Treat as image" },
            { value: "button", label: "button - Interactive button" },
            { value: "link", label: "link - Navigation link" },
            { value: "presentation", label: "presentation - Decorative only" },
            { value: "none", label: "none - Remove from accessibility tree" },
            { value: "heading", label: "heading - Section heading" },
            { value: "region", label: "region - Landmark region" },
        ],
        priority: {
            image: "secondary",
            link: "not-applicable",
            text: "not-applicable",
            html: "secondary",
        },
        tips: {
            image: "Override the default role. Use 'presentation' or 'none' for purely decorative images.",
            link: "Links already have the correct role. Changing it is rarely appropriate.",
            text: "Text elements rarely need a role override.",
            html: "Override the semantic role if the content serves a different purpose than its markup suggests.",
        },
    },
    {
        name: "tabindex",
        label: "Tab Index",
        type: "select",
        options: [
            { value: "", label: "Default" },
            { value: "0", label: "0 - Focusable in normal tab order" },
            { value: "-1", label: "-1 - Focusable but not in tab order" },
        ],
        priority: {
            image: "not-applicable",
            link: "not-applicable",
            text: "not-applicable",
            html: "secondary",
        },
        tips: {
            image: "Images are not typically interactive. Use only if the image has a click handler.",
            link: "Links are already focusable. Changing tabindex is rarely needed.",
            text: "Text elements are not typically interactive.",
            html: "Use to make non-interactive content focusable or to adjust tab order.",
        },
    },
];

@customElement("scms-accessibility-modal")
export class AccessibilityModal extends ScmsElement {
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
        const primaryFields = ACCESSIBILITY_FIELDS.filter(
            (f) => f.priority[this.elementType] === "primary",
        );
        const secondaryFields = ACCESSIBILITY_FIELDS.filter(
            (f) => f.priority[this.elementType] === "secondary",
        );
        const notApplicableFields = ACCESSIBILITY_FIELDS.filter(
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
                        <span class="text-sm font-medium text-gray-900">Accessibility</span>
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
        "scms-accessibility-modal": AccessibilityModal;
    }
}
