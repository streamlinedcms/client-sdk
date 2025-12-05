/**
 * Toolbar Component
 *
 * A full-width bottom toolbar for editing mode.
 * - Desktop: shows all actions inline
 * - Mobile: collapses secondary actions into expandable drawer
 *
 * Primary actions (always visible): Save, Reset
 * Secondary actions (collapsible on mobile): Mode toggle, Edit HTML, Sign Out
 */

import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { tailwindSheet } from "./styles.js";
import type { EditorMode } from "./mode-toggle.js";
import "./mode-toggle.js";
import "./element-badge.js";
import "./hold-button.js";

export type { EditorMode };

@customElement("scms-toolbar")
export class Toolbar extends LitElement {
    @property({ type: String })
    mode: EditorMode = "viewer";

    @property({ type: String, attribute: "active-element" })
    activeElement: string | null = null;

    @property({ type: String, attribute: "active-element-type" })
    activeElementType: string | null = null;

    @property({ type: Boolean, attribute: "has-changes" })
    hasChanges = false;

    @property({ type: Boolean })
    saving = false;

    @property({ type: String, attribute: "app-url" })
    appUrl: string | null = null;

    @property({ type: String, attribute: "app-id" })
    appId: string | null = null;

    // Template context - set when editing an element inside a template
    @property({ type: String, attribute: "template-id" })
    templateId: string | null = null;

    @property({ type: String, attribute: "instance-id" })
    instanceId: string | null = null;

    @property({ type: Number, attribute: "instance-index" })
    instanceIndex: number | null = null;

    @property({ type: Number, attribute: "instance-count" })
    instanceCount: number | null = null;

    @state()
    private expanded = false;

    @state()
    private isMobile = false;

    @state()
    private collapsedSections: Set<string> = new Set();

    private resizeObserver: ResizeObserver | null = null;

    private static readonly STORAGE_KEY = "scms-toolbar-collapsed-sections";

    static styles = [
        tailwindSheet,
        css`
            :host {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                z-index: 2147483646;
                font-family:
                    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial,
                    sans-serif;
            }

            button {
                cursor: pointer;
            }

            /* Mobile drawer button overrides */
            .mobile-actions {
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
            }

            .mobile-actions button,
            .mobile-actions scms-hold-button {
                width: 100%;
            }

            .mobile-actions button {
                padding: 0.5rem 0.75rem;
                font-size: 0.875rem;
                justify-content: space-between;
            }
        `,
    ];

    connectedCallback() {
        super.connectedCallback();
        this.checkMobile();
        this.loadCollapsedSections();
        this.resizeObserver = new ResizeObserver(() => this.checkMobile());
        this.resizeObserver.observe(document.body);
    }

    private loadCollapsedSections() {
        try {
            const stored = sessionStorage.getItem(Toolbar.STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    this.collapsedSections = new Set(parsed);
                }
            }
        } catch {
            // Ignore storage errors
        }
    }

    private saveCollapsedSections() {
        try {
            sessionStorage.setItem(
                Toolbar.STORAGE_KEY,
                JSON.stringify([...this.collapsedSections])
            );
        } catch {
            // Ignore storage errors
        }
    }

    private isSectionCollapsed(section: string): boolean {
        // If user has explicitly set a preference, use it
        if (this.collapsedSections.has(section)) {
            return true;
        }
        // Check if user explicitly expanded it (stored as "!section")
        if (this.collapsedSections.has(`!${section}`)) {
            return false;
        }
        // Default states: element and template open, others closed
        return section !== "element" && section !== "template";
    }

    private toggleSection(section: string) {
        const isCurrentlyCollapsed = this.isSectionCollapsed(section);
        const newCollapsed = new Set(this.collapsedSections);

        // Clear both states for this section
        newCollapsed.delete(section);
        newCollapsed.delete(`!${section}`);

        if (isCurrentlyCollapsed) {
            // User is expanding - store explicit "expanded" marker
            newCollapsed.add(`!${section}`);
        } else {
            // User is collapsing - store the section name
            newCollapsed.add(section);
        }

        this.collapsedSections = newCollapsed;
        this.saveCollapsedSections();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.resizeObserver?.disconnect();
    }

    private checkMobile() {
        this.isMobile = window.innerWidth < 640;
        if (!this.isMobile) {
            this.expanded = false;
        }
    }

    private toggleExpanded() {
        this.expanded = !this.expanded;
    }

    private handleModeChange(newMode: EditorMode) {
        if (newMode !== this.mode) {
            this.mode = newMode;
            this.dispatchEvent(
                new CustomEvent("mode-change", {
                    detail: { mode: newMode },
                    bubbles: true,
                    composed: true,
                }),
            );
        }
    }

    private handleSave() {
        this.dispatchEvent(
            new CustomEvent("save", {
                bubbles: true,
                composed: true,
            }),
        );
    }

    private handleReset() {
        this.dispatchEvent(
            new CustomEvent("reset", {
                bubbles: true,
                composed: true,
            }),
        );
    }

    private handleEditHtml() {
        this.dispatchEvent(
            new CustomEvent("edit-html", {
                bubbles: true,
                composed: true,
            }),
        );
    }

    private handleSignOut() {
        this.dispatchEvent(
            new CustomEvent("sign-out", {
                bubbles: true,
                composed: true,
            }),
        );
    }

    private handleChangeImage() {
        this.dispatchEvent(
            new CustomEvent("change-image", {
                bubbles: true,
                composed: true,
            }),
        );
    }

    private handleEditLink() {
        this.dispatchEvent(
            new CustomEvent("edit-link", {
                bubbles: true,
                composed: true,
            }),
        );
    }

    private handleGoToLink() {
        this.dispatchEvent(
            new CustomEvent("go-to-link", {
                bubbles: true,
                composed: true,
            }),
        );
    }

    private handleEditSeo() {
        this.dispatchEvent(
            new CustomEvent("edit-seo", {
                bubbles: true,
                composed: true,
            }),
        );
    }

    private handleEditAccessibility() {
        this.dispatchEvent(
            new CustomEvent("edit-accessibility", {
                bubbles: true,
                composed: true,
            }),
        );
    }

    private handleEditAttributes() {
        this.dispatchEvent(
            new CustomEvent("edit-attributes", {
                bubbles: true,
                composed: true,
            }),
        );
    }

    private handleAddInstance() {
        this.dispatchEvent(
            new CustomEvent("add-instance", {
                bubbles: true,
                composed: true,
            }),
        );
    }

    private handleDeleteInstance() {
        this.dispatchEvent(
            new CustomEvent("delete-instance", {
                bubbles: true,
                composed: true,
            }),
        );
    }

    private handleMoveInstanceUp() {
        this.dispatchEvent(
            new CustomEvent("move-instance-up", {
                bubbles: true,
                composed: true,
            }),
        );
    }

    private handleMoveInstanceDown() {
        this.dispatchEvent(
            new CustomEvent("move-instance-down", {
                bubbles: true,
                composed: true,
            }),
        );
    }

    private renderModeToggle() {
        return html`
            <scms-mode-toggle
                .mode=${this.mode}
                @mode-change=${(e: CustomEvent<{ mode: EditorMode }>) =>
                    this.handleModeChange(e.detail.mode)}
            ></scms-mode-toggle>
        `;
    }

    private renderEditHtmlButton() {
        // Show for html and text types (not for image or link)
        if (
            !this.activeElement ||
            this.activeElementType === "image" ||
            this.activeElementType === "link"
        )
            return nothing;
        return html`
            <button
                class="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                @click=${this.handleEditHtml}
            >
                Edit HTML
            </button>
        `;
    }

    private renderChangeImageButton() {
        if (!this.activeElement || this.activeElementType !== "image") return nothing;
        return html`
            <button
                class="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                @click=${this.handleChangeImage}
            >
                Change Image
            </button>
        `;
    }

    private renderEditLinkButton() {
        if (!this.activeElement || this.activeElementType !== "link") return nothing;
        return html`
            <button
                class="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                @click=${this.handleEditLink}
            >
                Edit Link
            </button>
        `;
    }

    private renderGoToLinkButton() {
        if (!this.activeElement || this.activeElementType !== "link") return nothing;
        return html`
            <button
                class="px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-300 rounded-md hover:bg-blue-50 transition-colors inline-flex items-center gap-1"
                @click=${this.handleGoToLink}
            >
                Go to Link
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                </svg>
            </button>
        `;
    }

    private renderResetButton() {
        if (!this.activeElement) return nothing;
        return html`
            <scms-hold-button
                label="Reset"
                hold-duration="800"
                @hold-complete=${this.handleReset}
            ></scms-hold-button>
        `;
    }

    private renderSeoButton() {
        if (!this.activeElement) return nothing;
        return html`
            <button
                class="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                @click=${this.handleEditSeo}
            >
                SEO
            </button>
        `;
    }

    private renderAccessibilityButton() {
        if (!this.activeElement) return nothing;
        return html`
            <button
                class="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                @click=${this.handleEditAccessibility}
            >
                A11y
            </button>
        `;
    }

    private renderAttributesButton() {
        if (!this.activeElement) return nothing;
        return html`
            <button
                class="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                @click=${this.handleEditAttributes}
            >
                Attrs
            </button>
        `;
    }

    private renderTemplateControls() {
        if (!this.templateId) return nothing;

        const canMoveUp = this.instanceIndex !== null && this.instanceIndex > 0;
        const canMoveDown =
            this.instanceIndex !== null &&
            this.instanceCount !== null &&
            this.instanceIndex < this.instanceCount - 1;
        const canDelete = this.instanceCount !== null && this.instanceCount > 1;

        const enabledClass =
            "px-2 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors";
        const disabledClass =
            "px-2 py-1.5 text-xs font-medium text-gray-300 border border-gray-200 rounded-md cursor-not-allowed";

        return html`
            <div class="flex items-center gap-1 ml-2 pl-2 border-l border-gray-200">
                <button
                    class=${canMoveUp ? enabledClass : disabledClass}
                    ?disabled=${!canMoveUp}
                    @click=${this.handleMoveInstanceUp}
                    title="Move up"
                >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M5 15l7-7 7 7"
                        />
                    </svg>
                </button>
                <button
                    class=${canMoveDown ? enabledClass : disabledClass}
                    ?disabled=${!canMoveDown}
                    @click=${this.handleMoveInstanceDown}
                    title="Move down"
                >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M19 9l-7 7-7-7"
                        />
                    </svg>
                </button>
                <button
                    class="px-2 py-1.5 text-xs font-medium text-green-600 hover:text-green-800 border border-green-300 rounded-md hover:bg-green-50 transition-colors"
                    @click=${this.handleAddInstance}
                    title="Add item"
                >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 4v16m8-8H4"
                        />
                    </svg>
                </button>
                <button
                    class=${canDelete
                        ? "px-2 py-1.5 text-xs font-medium text-red-600 hover:text-red-800 border border-red-300 rounded-md hover:bg-red-50 transition-colors"
                        : disabledClass}
                    ?disabled=${!canDelete}
                    @click=${this.handleDeleteInstance}
                    title="Delete item"
                >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                    </svg>
                </button>
            </div>
        `;
    }

    private renderSignOutButton() {
        return html`
            <button
                class="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
                @click=${this.handleSignOut}
            >
                Sign Out
            </button>
        `;
    }

    private renderAdminLink() {
        if (!this.appUrl || !this.appId) return nothing;
        const adminUrl = `${this.appUrl}/apps/${encodeURIComponent(this.appId)}`;
        return html`
            <a
                href=${adminUrl}
                target="_blank"
                class="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors inline-flex items-center gap-1"
            >
                Admin
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                </svg>
            </a>
        `;
    }

    private renderSaveButton() {
        if (!this.hasChanges) return nothing;

        const saveClasses = this.saving
            ? "px-4 py-1.5 text-xs font-medium rounded-md transition-colors bg-red-400 text-white cursor-not-allowed"
            : "px-4 py-1.5 text-xs font-medium rounded-md transition-colors bg-red-600 text-white hover:bg-red-700";

        return html`
            <button class=${saveClasses} ?disabled=${this.saving} @click=${this.handleSave}>
                ${this.saving ? "Saving..." : "Save"}
            </button>
        `;
    }

    private renderActiveElement() {
        return html`<scms-element-badge
            element-id=${this.activeElement || ""}
        ></scms-element-badge>`;
    }

    private renderDesktop() {
        return html`
            <div class="h-12 bg-white border-t border-gray-200 shadow-lg">
                <div class="h-full max-w-screen-xl mx-auto px-4 flex items-center justify-between">
                    <!-- Left: Mode toggle -->
                    <div class="flex items-center gap-3">${this.renderModeToggle()}</div>

                    <!-- Center: Reset + Active element + Element-specific buttons + Template controls -->
                    <div class="flex items-center gap-3">
                        ${this.renderResetButton()} ${this.renderActiveElement()}
                        ${this.renderEditHtmlButton()} ${this.renderChangeImageButton()}
                        ${this.renderEditLinkButton()} ${this.renderGoToLinkButton()}
                        ${this.renderSeoButton()} ${this.renderAccessibilityButton()}
                        ${this.renderAttributesButton()} ${this.renderTemplateControls()}
                    </div>

                    <!-- Right: Save + Sign Out + Admin (separated) -->
                    <div class="flex items-center">
                        ${this.renderSaveButton()}
                        <div class="ml-6 pl-6 border-l border-gray-200 flex items-center">
                            ${this.renderSignOutButton()}
                            <span class="mx-2 text-gray-300">|</span>
                            ${this.renderAdminLink()}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    private renderMobileSectionHeader(title: string, sectionId: string) {
        const isCollapsed = this.isSectionCollapsed(sectionId);
        return html`
            <button
                class="w-full flex items-center justify-between text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 py-1 -my-1 hover:text-gray-700 transition-colors"
                @click=${() => this.toggleSection(sectionId)}
                aria-expanded=${!isCollapsed}
            >
                <span>${title}</span>
                <svg
                    class="w-4 h-4 transition-transform duration-200 ${isCollapsed ? "" : "rotate-180"}"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 9l-7 7-7-7"
                    />
                </svg>
            </button>
        `;
    }

    private renderMobileElementSection() {
        const isCollapsed = this.isSectionCollapsed("element");

        // Type-specific content
        const renderContent = () => {
            if (this.activeElementType === "link") {
                return html`
                    <div class="flex gap-2">
                        <button
                            class="flex-1 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-white transition-colors"
                            @click=${this.handleEditLink}
                        >
                            Edit Link
                        </button>
                        <button
                            class="flex-1 px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 border border-blue-300 rounded-md hover:bg-blue-50 transition-colors inline-flex items-center justify-center gap-1"
                            @click=${this.handleGoToLink}
                        >
                            Go to Link
                            <svg
                                class="w-3 h-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                />
                            </svg>
                        </button>
                    </div>
                `;
            }

            if (this.activeElementType === "image") {
                return html`
                    <button
                        class="w-full px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-white transition-colors"
                        @click=${this.handleChangeImage}
                    >
                        Change Image
                    </button>
                `;
            }

            // Text/HTML types
            return html`
                <button
                    class="w-full px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-white transition-colors"
                    @click=${this.handleEditHtml}
                >
                    Edit HTML
                </button>
            `;
        };

        return html`
            <div
                class="mobile-section mb-4 pb-4 border-b border-gray-200 bg-gray-50 -mx-4 px-4 py-3"
            >
                ${this.renderMobileSectionHeader("Element", "element")}
                ${isCollapsed ? nothing : renderContent()}
            </div>
        `;
    }

    private renderMobileMetadataSection() {
        const isCollapsed = this.isSectionCollapsed("metadata");

        return html`
            <div class="mobile-section mb-4 pb-4 border-b border-gray-200">
                ${this.renderMobileSectionHeader("Metadata", "metadata")}
                ${isCollapsed
                    ? nothing
                    : html`
                          <div class="flex flex-col gap-2">
                              <button
                                  class="w-full px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-left"
                                  @click=${this.handleEditSeo}
                              >
                                  SEO (Search Engine Optimization)
                              </button>
                              <button
                                  class="w-full px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-left"
                                  @click=${this.handleEditAccessibility}
                              >
                                  Accessibility
                              </button>
                              <button
                                  class="w-full px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-left"
                                  @click=${this.handleEditAttributes}
                              >
                                  Attributes
                              </button>
                          </div>
                      `}
            </div>
        `;
    }

    private renderMobileActionsSection() {
        const isCollapsed = this.isSectionCollapsed("actions");

        return html`
            <div class="mobile-section mb-4 pb-4 border-b border-gray-200">
                ${this.renderMobileSectionHeader("Actions", "actions")}
                ${isCollapsed
                    ? nothing
                    : html`
                          <scms-hold-button
                              label="Hold to reset element"
                              hold-duration="800"
                              @hold-complete=${this.handleReset}
                              class="w-full"
                          ></scms-hold-button>
                      `}
            </div>
        `;
    }

    private renderMobileTemplateSection() {
        if (!this.templateId) return nothing;

        const isCollapsed = this.isSectionCollapsed("template");
        const canMoveUp = this.instanceIndex !== null && this.instanceIndex > 0;
        const canMoveDown =
            this.instanceIndex !== null &&
            this.instanceCount !== null &&
            this.instanceIndex < this.instanceCount - 1;
        const canDelete = this.instanceCount !== null && this.instanceCount > 1;

        const enabledClass =
            "flex-1 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors inline-flex items-center justify-center";
        const disabledClass =
            "flex-1 px-3 py-2 text-sm font-medium text-gray-300 border border-gray-200 rounded-md cursor-not-allowed inline-flex items-center justify-center";

        return html`
            <div class="mobile-section mb-4 pb-4 border-b border-gray-200">
                ${this.renderMobileSectionHeader("Template Item", "template")}
                ${isCollapsed
                    ? nothing
                    : html`
                          <div class="flex flex-col gap-2">
                              <!-- Reorder buttons -->
                              <div class="flex gap-2">
                                  <button
                                      class=${canMoveUp ? enabledClass : disabledClass}
                                      ?disabled=${!canMoveUp}
                                      @click=${this.handleMoveInstanceUp}
                                  >
                                      <svg
                                          class="w-4 h-4 mr-1"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                      >
                                          <path
                                              stroke-linecap="round"
                                              stroke-linejoin="round"
                                              stroke-width="2"
                                              d="M5 15l7-7 7 7"
                                          />
                                      </svg>
                                      Move Up
                                  </button>
                                  <button
                                      class=${canMoveDown ? enabledClass : disabledClass}
                                      ?disabled=${!canMoveDown}
                                      @click=${this.handleMoveInstanceDown}
                                  >
                                      <svg
                                          class="w-4 h-4 mr-1"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                      >
                                          <path
                                              stroke-linecap="round"
                                              stroke-linejoin="round"
                                              stroke-width="2"
                                              d="M19 9l-7 7-7-7"
                                          />
                                      </svg>
                                      Move Down
                                  </button>
                              </div>
                              <!-- Add/Delete buttons -->
                              <div class="flex gap-2">
                                  <button
                                      class="flex-1 px-3 py-2 text-sm font-medium text-green-600 hover:text-green-800 border border-green-300 rounded-md hover:bg-green-50 transition-colors inline-flex items-center justify-center"
                                      @click=${this.handleAddInstance}
                                  >
                                      <svg
                                          class="w-4 h-4 mr-1"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                      >
                                          <path
                                              stroke-linecap="round"
                                              stroke-linejoin="round"
                                              stroke-width="2"
                                              d="M12 4v16m8-8H4"
                                          />
                                      </svg>
                                      Add Item
                                  </button>
                                  <button
                                      class=${canDelete
                                          ? "flex-1 px-3 py-2 text-sm font-medium text-red-600 hover:text-red-800 border border-red-300 rounded-md hover:bg-red-50 transition-colors inline-flex items-center justify-center"
                                          : disabledClass}
                                      ?disabled=${!canDelete}
                                      @click=${this.handleDeleteInstance}
                                  >
                                      <svg
                                          class="w-4 h-4 mr-1"
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
                                      Delete
                                  </button>
                              </div>
                          </div>
                      `}
            </div>
        `;
    }

    private renderMobileSettingsSection() {
        return html`
            <div class="mobile-section">
                <div class="flex items-center justify-between">
                    <button
                        class="px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors"
                        @click=${this.handleSignOut}
                    >
                        Sign Out
                    </button>
                    ${this.renderModeToggle()}
                    ${this.appUrl && this.appId
                        ? html`
                              <a
                                  href="${this.appUrl}/apps/${encodeURIComponent(this.appId)}"
                                  target="_blank"
                                  class="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors inline-flex items-center gap-1"
                              >
                                  Admin
                                  <svg
                                      class="w-3 h-3"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                  >
                                      <path
                                          stroke-linecap="round"
                                          stroke-linejoin="round"
                                          stroke-width="2"
                                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                      />
                                  </svg>
                              </a>
                          `
                        : html`<div></div>`}
                </div>
            </div>
        `;
    }

    private renderMobile() {
        return html`
            <div class="bg-white border-t border-gray-200 shadow-lg">
                <!-- Primary bar (always visible) - minimal: save, element badge, menu -->
                <div class="h-14 px-4 flex items-center justify-between">
                    <!-- Save (left) -->
                    <div class="flex items-center">
                        ${this.hasChanges
                            ? this.renderSaveButton()
                            : html`<div class="w-10"></div>`}
                    </div>

                    <!-- Center: Element badge only -->
                    <div class="flex items-center justify-center">
                        ${this.renderActiveElement()}
                    </div>

                    <!-- Menu toggle (right) - gear icon -->
                    <button
                        class="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                        @click=${this.toggleExpanded}
                        aria-label=${this.expanded ? "Close menu" : "Open menu"}
                    >
                        ${this.expanded
                            ? html`
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
                                          d="M6 18L18 6M6 6l12 12"
                                      />
                                  </svg>
                              `
                            : html`
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
                                          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                                      />
                                      <path
                                          stroke-linecap="round"
                                          stroke-linejoin="round"
                                          stroke-width="2"
                                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                      />
                                  </svg>
                              `}
                    </button>
                </div>

                <!-- Expandable drawer -->
                <div
                    class="${this.expanded ? "overflow-y-auto" : "overflow-hidden"} transition-all duration-200 ease-out"
                    style="max-height: ${this.expanded ? "calc(100vh - 56px - env(safe-area-inset-bottom, 0px))" : "0"}"
                >
                    <div class="px-4 py-3 border-t border-gray-100">
                        <!-- Element section (only when element selected) -->
                        ${this.activeElement ? this.renderMobileElementSection() : nothing}

                        <!-- Template section (only when element is in a template) -->
                        ${this.activeElement ? this.renderMobileTemplateSection() : nothing}

                        <!-- Metadata section (only when element selected) -->
                        ${this.activeElement ? this.renderMobileMetadataSection() : nothing}

                        <!-- Actions section (only when element selected) -->
                        ${this.activeElement ? this.renderMobileActionsSection() : nothing}

                        <!-- Settings section -->
                        ${this.renderMobileSettingsSection()}
                    </div>
                </div>
            </div>
        `;
    }

    render() {
        return this.isMobile ? this.renderMobile() : this.renderDesktop();
    }

    /**
     * Get the toolbar height for body padding calculation
     */
    getHeight(): number {
        if (this.isMobile) {
            return this.expanded ? 14 * 4 + 120 : 14 * 4; // 56px base, ~120px drawer
        }
        return 12 * 4; // 48px
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "scms-toolbar": Toolbar;
    }
}
