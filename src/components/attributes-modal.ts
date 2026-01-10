/**
 * Custom Attributes Modal Component
 *
 * A modal dialog for viewing all attributes and adding custom ones.
 * Known SEO and accessibility attributes are shown but disabled
 * (users should edit those in their respective modals).
 */

import { html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ScmsElement } from "./base.js";
import {
    SEO_ATTRIBUTES,
    ACCESSIBILITY_ATTRIBUTES,
    KNOWN_ATTRIBUTES,
    type ElementAttributes,
} from "../types.js";

// Attributes that cannot be set via the custom attributes modal
// as they could break the editor or page layout
const RESERVED_ATTRIBUTES = ["class", "id", "style"] as const;

interface AttributeEntry {
    name: string;
    value: string;
    isKnown: boolean;
    source: "cms" | "element" | "other";
}

@customElement("scms-attributes-modal")
export class AttributesModal extends ScmsElement {
    @property({ type: String, attribute: "element-id" })
    elementId: string | null = null;

    @property({ type: Object, attribute: "element-attrs" })
    elementAttrs: ElementAttributes = {};

    @property({ type: Object, attribute: "element-defined-attrs" })
    elementDefinedAttrs: ElementAttributes = {};

    @property({ type: Object, attribute: "reserved-attrs" })
    reservedAttrs: ElementAttributes = {};

    @property({ type: Object, attribute: "other-attrs" })
    otherAttrs: ElementAttributes = {};

    @state()
    private editedAttributes: ElementAttributes = {};

    @state()
    private newAttributeName = "";

    @state()
    private newAttributeValue = "";

    @state()
    private addError = "";

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
                max-width: 600px;
                max-height: 90vh;
                display: flex;
                flex-direction: column;
            }

            input {
                font-size: 14px;
            }

            button {
                cursor: pointer;
            }

            .attribute-row {
                display: grid;
                grid-template-columns: 2fr 3fr auto;
                gap: 8px;
                align-items: center;
            }

            @media (max-width: 480px) {
                .attribute-row {
                    grid-template-columns: 1fr auto;
                    margin-top: 18px;
                }

                .attribute-row:first-child {
                    margin-top: 0;
                }

                .attribute-row .attr-key {
                    grid-column: 1 / -1;
                    text-align: left;
                    padding: 0 0 2px 0;
                }
            }

            .attribute-row.disabled {
                opacity: 0.6;
            }

            .attr-key {
                font-size: 13px;
                font-weight: 500;
                font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
                color: #374151;
                padding: 8px 0;
                text-align: right;
            }

            .attr-section {
                margin-bottom: 16px;
                padding-top: 16px;
                border-top: 1px solid #e5e7eb;
            }

            .attr-section:first-of-type {
                padding-top: 0;
                border-top: none;
            }

            .add-form {
                display: grid;
                grid-template-columns: 2fr 3fr auto;
                gap: 8px;
            }

            @media (max-width: 480px) {
                .add-form {
                    grid-template-columns: 1fr;
                }

                .add-form button {
                    justify-self: end;
                }
            }

            .attr-hint {
                font-size: 11px;
                color: #9ca3af;
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

    private isKnownAttribute(name: string): boolean {
        return (KNOWN_ATTRIBUTES as readonly string[]).includes(name);
    }

    private isElementDefinedAttribute(name: string): boolean {
        return name in this.elementDefinedAttrs;
    }

    private isOtherAttribute(name: string): boolean {
        return name in this.otherAttrs;
    }

    private isReservedAttribute(name: string): boolean {
        return (RESERVED_ATTRIBUTES as readonly string[]).includes(name);
    }

    private getAttributeEntries(): AttributeEntry[] {
        const entries: AttributeEntry[] = [];
        const seen = new Set<string>();

        // Add all current CMS-managed attributes
        for (const [name, value] of Object.entries(this.editedAttributes)) {
            entries.push({
                name,
                value,
                isKnown: this.isKnownAttribute(name),
                source: "cms",
            });
            seen.add(name);
        }

        // Add element-defined attributes (src, href, target)
        for (const [name, value] of Object.entries(this.elementDefinedAttrs)) {
            if (!seen.has(name)) {
                entries.push({
                    name,
                    value,
                    isKnown: this.isKnownAttribute(name),
                    source: "element",
                });
                seen.add(name);
            }
        }

        // Add other attributes (dynamic, extensions, etc.)
        for (const [name, value] of Object.entries(this.otherAttrs)) {
            if (!seen.has(name)) {
                entries.push({
                    name,
                    value,
                    isKnown: this.isKnownAttribute(name),
                    source: "other",
                });
                seen.add(name);
            }
        }

        // Add all known attributes that haven't been seen yet (with empty values)
        for (const name of KNOWN_ATTRIBUTES) {
            if (!seen.has(name)) {
                entries.push({
                    name,
                    value: "",
                    isKnown: true,
                    source: "cms",
                });
            }
        }

        // Sort: known attributes first, then custom alphabetically
        entries.sort((a, b) => {
            if (a.isKnown !== b.isKnown) return a.isKnown ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        return entries;
    }

    private handleValueChange(name: string, value: string) {
        if (value) {
            this.editedAttributes = { ...this.editedAttributes, [name]: value };
        } else {
            const { [name]: _, ...rest } = this.editedAttributes;
            this.editedAttributes = rest;
        }
    }

    private handleRemove(name: string) {
        const { [name]: _, ...rest } = this.editedAttributes;
        this.editedAttributes = rest;
    }

    private handleAddAttribute() {
        const name = this.newAttributeName.trim().toLowerCase();
        const value = this.newAttributeValue.trim();

        // Validation
        if (!name) {
            this.addError = "Attribute name is required";
            return;
        }

        if (!/^[a-z][a-z0-9-]*$/.test(name)) {
            this.addError = "Use lowercase letters, numbers, and hyphens (must start with letter)";
            return;
        }

        if (this.isReservedAttribute(name)) {
            this.addError = `"${name}" is a reserved attribute and cannot be modified.`;
            return;
        }

        if (this.isKnownAttribute(name)) {
            this.addError = `"${name}" is a known attribute. Edit it in the SEO or Accessibility modal.`;
            return;
        }

        if (this.isElementDefinedAttribute(name)) {
            this.addError = `"${name}" is defined by the element and cannot be overridden.`;
            return;
        }

        if (this.isOtherAttribute(name)) {
            this.addError = `"${name}" already exists on the element.`;
            return;
        }

        if (name in this.editedAttributes) {
            this.addError = `Attribute "${name}" already exists`;
            return;
        }

        // Add the attribute
        this.editedAttributes = { ...this.editedAttributes, [name]: value };
        this.newAttributeName = "";
        this.newAttributeValue = "";
        this.addError = "";
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

    private isSeoAttribute(name: string): boolean {
        return (SEO_ATTRIBUTES as readonly string[]).includes(name);
    }

    private isAccessibilityAttribute(name: string): boolean {
        return (ACCESSIBILITY_ATTRIBUTES as readonly string[]).includes(name);
    }

    private renderDisabledRow(entry: AttributeEntry) {
        return html`
            <div class="attribute-row disabled">
                <span class="attr-key">${entry.name}</span>
                <input
                    type="text"
                    class="px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-gray-500"
                    .value=${entry.value || ""}
                    disabled
                    placeholder="Not set"
                />
                <div class="w-9"></div>
            </div>
        `;
    }

    render() {
        const entries = this.getAttributeEntries();
        // Editable custom attributes (not known, from CMS)
        const customEntries = entries.filter((e) => !e.isKnown && e.source === "cms");
        // SEO attributes
        const seoEntries = entries.filter((e) => this.isSeoAttribute(e.name));
        // Accessibility attributes
        const a11yEntries = entries.filter((e) => this.isAccessibilityAttribute(e.name));
        // Element-defined attributes (src, href, target)
        const elementDefinedEntries = entries.filter((e) => e.source === "element");
        // Reserved attributes (class, id, style) - read-only
        const reservedEntries: AttributeEntry[] = Object.entries(this.reservedAttrs).map(
            ([name, value]) => ({
                name,
                value,
                isKnown: false,
                source: "other" as const,
            }),
        );
        // Other attributes (dynamic, extensions, etc.)
        const otherEntries = entries.filter((e) => !e.isKnown && e.source === "other");

        return html`
            <div class="backdrop" @click=${this.handleBackdropClick}></div>
            <div
                class="modal bg-white rounded-lg shadow-2xl overflow-hidden"
                @keydown=${this.handleKeydown}
            >
                <!-- Header -->
                <div class="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-gray-900">Custom Attributes</span>
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

                <!-- Content -->
                <div class="p-4 overflow-y-auto" style="max-height: calc(90vh - 130px)">
                    <!-- Add new attribute -->
                    <div class="mb-4 p-3 bg-gray-50 rounded-lg">
                        <div class="text-sm font-medium text-gray-700 mb-2">Add Attribute</div>
                        <div class="add-form">
                            <input
                                type="text"
                                class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                                placeholder="data-custom-name"
                                .value=${this.newAttributeName}
                                @input=${(e: Event) =>
                                    (this.newAttributeName = (e.target as HTMLInputElement).value)}
                                @keydown=${(e: KeyboardEvent) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        this.handleAddAttribute();
                                    }
                                }}
                            />
                            <input
                                type="text"
                                class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                                placeholder="value"
                                .value=${this.newAttributeValue}
                                @input=${(e: Event) =>
                                    (this.newAttributeValue = (e.target as HTMLInputElement).value)}
                                @keydown=${(e: KeyboardEvent) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        this.handleAddAttribute();
                                    }
                                }}
                            />
                            <button
                                class="px-3 py-2 text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 rounded-md transition-colors"
                                @click=${this.handleAddAttribute}
                            >
                                Add
                            </button>
                        </div>
                        ${this.addError
                            ? html`<p class="mt-2 text-sm text-red-600">${this.addError}</p>`
                            : nothing}
                    </div>

                    <!-- Custom attributes list -->
                    ${customEntries.length > 0
                        ? html`
                              <div class="mb-4">
                                  <div class="text-sm font-medium text-gray-700 mb-2">
                                      Custom Attributes
                                  </div>
                                  <div class="space-y-2">
                                      ${customEntries.map(
                                          (entry) => html`
                                              <div class="attribute-row">
                                                  <span class="attr-key">${entry.name}</span>
                                                  <input
                                                      type="text"
                                                      class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                                                      .value=${entry.value}
                                                      @input=${(e: Event) =>
                                                          this.handleValueChange(
                                                              entry.name,
                                                              (e.target as HTMLInputElement).value,
                                                          )}
                                                  />
                                                  <button
                                                      class="p-2 text-gray-400 hover:text-red-600 transition-colors"
                                                      @click=${() => this.handleRemove(entry.name)}
                                                      aria-label="Remove attribute"
                                                  >
                                                      <svg
                                                          class="w-5 h-5"
                                                          fill="none"
                                                          viewBox="0 0 24 24"
                                                          stroke="currentColor"
                                                      >
                                                          <path
                                                              stroke-linecap="round"
                                                              stroke-linejoin="round"
                                                              stroke-width="2"
                                                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                          />
                                                      </svg>
                                                  </button>
                                              </div>
                                          `,
                                      )}
                                  </div>
                              </div>
                          `
                        : nothing}

                    <!-- Element attributes (read-only) -->
                    <div class="attr-section">
                        <div class="text-sm font-medium text-gray-500 mb-1">Element Attributes</div>
                        <p class="attr-hint mb-2">Core attributes that define the element</p>
                        <div class="space-y-2">
                            ${elementDefinedEntries.length > 0
                                ? elementDefinedEntries.map((entry) =>
                                      this.renderDisabledRow(entry),
                                  )
                                : html`<p class="text-sm text-gray-400 italic">None</p>`}
                        </div>
                    </div>

                    <!-- SEO attributes (read-only) -->
                    <div class="attr-section">
                        <div class="text-sm font-medium text-gray-500 mb-1">SEO Attributes</div>
                        <p class="attr-hint mb-2">Use the SEO button to edit these</p>
                        <div class="space-y-2">
                            ${seoEntries.length > 0
                                ? seoEntries.map((entry) => this.renderDisabledRow(entry))
                                : html`<p class="text-sm text-gray-400 italic">None set</p>`}
                        </div>
                    </div>

                    <!-- Accessibility attributes (read-only) -->
                    <div class="attr-section">
                        <div class="text-sm font-medium text-gray-500 mb-1">
                            Accessibility Attributes
                        </div>
                        <p class="attr-hint mb-2">Use the A11y button to edit these</p>
                        <div class="space-y-2">
                            ${a11yEntries.length > 0
                                ? a11yEntries.map((entry) => this.renderDisabledRow(entry))
                                : html`<p class="text-sm text-gray-400 italic">None set</p>`}
                        </div>
                    </div>

                    <!-- Other attributes (read-only) -->
                    <div class="attr-section">
                        <div class="text-sm font-medium text-gray-500 mb-1">Other Attributes</div>
                        <p class="attr-hint mb-2">Additional attributes on this element</p>
                        <div class="space-y-2">
                            ${otherEntries.length > 0
                                ? otherEntries.map((entry) => this.renderDisabledRow(entry))
                                : html`<p class="text-sm text-gray-400 italic">None</p>`}
                        </div>
                    </div>

                    <!-- Reserved attributes (read-only) -->
                    <div class="attr-section">
                        <div class="text-sm font-medium text-gray-500 mb-1">
                            Reserved Attributes
                        </div>
                        <p class="attr-hint mb-2">Cannot be modified (class, id, style)</p>
                        <div class="space-y-2">
                            ${reservedEntries.length > 0
                                ? reservedEntries.map((entry) => this.renderDisabledRow(entry))
                                : html`<p class="text-sm text-gray-400 italic">None</p>`}
                        </div>
                    </div>
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
        "scms-attributes-modal": AttributesModal;
    }
}
