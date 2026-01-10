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

import { html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { CircleHelp, ChevronUp, ChevronDown, Ellipsis, Layers, Plus, Trash2 } from "lucide-static";
import { ScmsElement } from "./base.js";
import type { EditorMode } from "./mode-toggle.js";
import "./mode-toggle.js";
import "./element-badge.js";
import "./instance-badge.js";
import "./hold-button.js";
import "./dropdown-menu.js";

export type { EditorMode };

@customElement("scms-toolbar")
export class Toolbar extends ScmsElement {
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

    @property({ type: Boolean, attribute: "mock-auth" })
    mockAuth = false;

    @property({ type: String })
    warning: string | null = null;

    @property({ type: Boolean, attribute: "read-only" })
    readOnly = false;

    @property({ type: Boolean, attribute: "deny-app-gui" })
    denyAppGui = false;

    // Template context - set when editing an element inside a template
    @property({ type: String, attribute: "template-id" })
    templateId: string | null = null;

    @property({ type: String, attribute: "instance-id" })
    instanceId: string | null = null;

    @property({ type: Number, attribute: "instance-index" })
    instanceIndex: number | null = null;

    @property({ type: Number, attribute: "instance-count" })
    instanceCount: number | null = null;

    @property({ type: Boolean, attribute: "structure-mismatch" })
    structureMismatch = false;

    @property({ type: Boolean, reflect: true })
    expanded = false;

    @state()
    private isMobile = false;

    @state()
    private collapsedSections: Set<string> = new Set();

    private resizeObserver: ResizeObserver | null = null;

    private static readonly STORAGE_KEY = "scms-toolbar-collapsed-sections";

    static styles = [
        ...ScmsElement.styles,
        css`
            :host {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                z-index: 10000;
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

            /* Drawer pull tab - wrapper for shadow */
            .drawer-tab-wrapper {
                position: absolute;
                left: 25%;
                right: 25%;
                top: -20px;
                height: 21px;
                filter: drop-shadow(0 -4px 6px rgba(0, 0, 0, 0.08));
            }

            /* Drawer pull tab - raised step with angled sides */
            .drawer-tab {
                width: 100%;
                height: 100%;
                background: white;
                clip-path: polygon(8% 0%, 92% 0%, 100% 100%, 0% 100%);
                display: flex;
                align-items: center;
                justify-content: center;
                color: #9ca3af;
                padding: 0;
                border: none;
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
                JSON.stringify([...this.collapsedSections]),
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

    private handleHelp() {
        this.dispatchEvent(
            new CustomEvent("help", {
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
        // Hide toggle when there's a warning (domain not whitelisted, payment required)
        // or when user is in read-only mode (no contentWrite permission)
        if (this.warning || this.readOnly) {
            return null;
        }
        return html`
            <scms-mode-toggle
                .mode=${this.mode}
                @mode-change=${(e: CustomEvent<{ mode: EditorMode }>) =>
                    this.handleModeChange(e.detail.mode)}
            ></scms-mode-toggle>
        `;
    }

    private renderEditHtmlButton() {
        // Show only for html type (not for text, image, or link)
        if (!this.activeElement || this.activeElementType !== "html") return nothing;
        return html`
            <button
                class="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                data-action="edit-html"
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
                data-action="change-image"
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
                data-action="edit-link"
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
                data-action="go-to-link"
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

    private renderStructureMismatchWarning() {
        if (!this.structureMismatch) return nothing;

        return html`
            <div
                class="flex items-center gap-1.5 px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs"
            >
                <svg
                    class="w-4 h-4 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                </svg>
                <span>Structure differs from first item template</span>
            </div>
        `;
    }

    private renderMoreMenu() {
        // Only show when an element is selected
        if (!this.activeElement) return nothing;

        return html`
            <scms-dropdown-menu label="More" .icon=${Ellipsis} direction="up">
                <button @click=${this.handleEditSeo} data-action="seo">SEO</button>
                <button @click=${this.handleEditAccessibility} data-action="accessibility">
                    Accessibility
                </button>
                <button @click=${this.handleEditAttributes} data-action="attributes">
                    Attributes
                </button>
            </scms-dropdown-menu>
        `;
    }

    private renderTemplateMenu() {
        if (!this.templateId) return nothing;

        const canMoveUp = this.instanceIndex !== null && this.instanceIndex > 0;
        const canMoveDown =
            this.instanceIndex !== null &&
            this.instanceCount !== null &&
            this.instanceIndex < this.instanceCount - 1;
        const canDelete = this.instanceCount !== null && this.instanceCount > 1;

        return html`
            <scms-dropdown-menu label="Template" .icon=${Layers} direction="up">
                <button
                    ?disabled=${!canMoveUp}
                    @click=${this.handleMoveInstanceUp}
                    data-action="move-up"
                >
                    <span class="[&>svg]:w-4 [&>svg]:h-4">${unsafeSVG(ChevronUp)}</span>
                    Move Up
                </button>
                <button
                    ?disabled=${!canMoveDown}
                    @click=${this.handleMoveInstanceDown}
                    data-action="move-down"
                >
                    <span class="[&>svg]:w-4 [&>svg]:h-4">${unsafeSVG(ChevronDown)}</span>
                    Move Down
                </button>
                <hr />
                <button
                    @click=${this.handleAddInstance}
                    style="color: #16a34a;"
                    data-action="add-item"
                >
                    <span class="[&>svg]:w-4 [&>svg]:h-4">${unsafeSVG(Plus)}</span>
                    Add Item
                </button>
                <button
                    ?disabled=${!canDelete}
                    @click=${this.handleDeleteInstance}
                    style="color: ${canDelete ? "#dc2626" : ""};"
                    data-action="delete-item"
                >
                    <span class="[&>svg]:w-4 [&>svg]:h-4">${unsafeSVG(Trash2)}</span>
                    Delete
                </button>
            </scms-dropdown-menu>
        `;
    }

    private renderSignOutButton() {
        if (this.mockAuth) return nothing;
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
        if (this.mockAuth) return nothing;
        if (this.denyAppGui) return nothing;
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

    private renderHelpButton() {
        return html`
            <button
                class="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors [&>svg]:w-5 [&>svg]:h-5"
                data-action="help"
                @click=${this.handleHelp}
                title="Help"
                aria-label="Help"
            >
                ${unsafeSVG(CircleHelp)}
            </button>
        `;
    }

    private renderSaveButton() {
        if (!this.hasChanges) return nothing;

        const saveClasses = this.saving
            ? "px-4 py-1.5 text-xs font-medium rounded-md transition-colors bg-red-400 text-white cursor-not-allowed"
            : "px-4 py-1.5 text-xs font-medium rounded-md transition-colors bg-red-600 text-white hover:bg-red-700";

        return html`
            <button
                class=${saveClasses}
                ?disabled=${this.saving}
                data-action="save"
                @click=${this.handleSave}
            >
                ${this.saving ? "Saving..." : "Save"}
            </button>
        `;
    }

    private renderActiveElement() {
        // Show element badge if an element is active
        if (this.activeElement) {
            return html`<scms-element-badge
                element-id=${this.activeElement}
                element-type=${this.activeElementType || ""}
            ></scms-element-badge>`;
        }

        // Show instance badge if only an instance is selected (no element)
        if (this.templateId && this.instanceIndex !== null && this.instanceCount !== null) {
            return html`<scms-instance-badge
                instance-index=${this.instanceIndex}
                instance-count=${this.instanceCount}
            ></scms-instance-badge>`;
        }

        // No element or instance selected
        return html`<span class="text-xs text-gray-400 italic">No element selected</span>`;
    }

    private renderDesktop() {
        return html`
            <div class="h-12 bg-white border-t border-gray-200 shadow-lg">
                <div class="h-full max-w-screen-xl mx-auto px-4 flex items-center justify-between">
                    <!-- Left: Mode toggle -->
                    <div class="flex items-center gap-3">${this.renderModeToggle()}</div>

                    <!-- Center: Reset + Active element + Element-specific buttons + Menus -->
                    <div class="flex items-center gap-3">
                        ${this.renderResetButton()} ${this.renderActiveElement()}
                        ${this.renderEditHtmlButton()} ${this.renderChangeImageButton()}
                        ${this.renderEditLinkButton()} ${this.renderGoToLinkButton()}
                        ${this.renderStructureMismatchWarning()} ${this.renderMoreMenu()}
                        ${this.renderTemplateMenu()}
                    </div>

                    <!-- Right: Save + Sign Out + Admin + Help (separated) -->
                    <div class="flex items-center">
                        ${this.renderSaveButton()}
                        ${this.mockAuth
                            ? nothing
                            : html`<div
                                  class="ml-6 pl-6 border-l border-gray-200 flex items-center"
                              >
                                  ${this.renderSignOutButton()}
                                  ${this.denyAppGui
                                      ? nothing
                                      : html`<span class="mx-2 text-gray-300">|</span>
                                            ${this.renderAdminLink()}`}
                              </div>`}
                        <div class="ml-3">${this.renderHelpButton()}</div>
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
                    class="w-4 h-4 transition-transform duration-200 ${isCollapsed
                        ? ""
                        : "rotate-180"}"
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
                            data-action="edit-link"
                            @click=${this.handleEditLink}
                        >
                            Edit Link
                        </button>
                        <button
                            class="flex-1 px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 border border-blue-300 rounded-md hover:bg-blue-50 transition-colors inline-flex items-center justify-center gap-1"
                            data-action="go-to-link"
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
                        data-action="change-image"
                        @click=${this.handleChangeImage}
                    >
                        Change Image
                    </button>
                `;
            }

            if (this.activeElementType === "html") {
                return html`
                    <button
                        class="w-full px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-white transition-colors"
                        data-action="edit-html"
                        @click=${this.handleEditHtml}
                    >
                        Edit HTML
                    </button>
                `;
            }

            // Text type - no actions, just inline editing
            return nothing;
        };

        // Don't show Element section if there's no content (text type)
        const content = renderContent();
        if (content === nothing) return nothing;

        return html`
            <div
                class="mobile-section mb-4 pb-4 border-b border-gray-200 bg-gray-50 -mx-4 px-4 py-3"
                data-section="element"
            >
                ${this.renderMobileSectionHeader("Element", "element")}
                ${isCollapsed ? nothing : content}
            </div>
        `;
    }

    private renderMobileMetadataSection() {
        const isCollapsed = this.isSectionCollapsed("metadata");

        return html`
            <div class="mobile-section mb-4 pb-4 border-b border-gray-200" data-section="metadata">
                ${this.renderMobileSectionHeader("Metadata", "metadata")}
                ${isCollapsed
                    ? nothing
                    : html`
                          <div class="flex flex-col gap-2">
                              <button
                                  class="w-full px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-left"
                                  @click=${this.handleEditSeo}
                                  data-action="seo"
                              >
                                  SEO (Search Engine Optimization)
                              </button>
                              <button
                                  class="w-full px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-left"
                                  data-action="accessibility"
                                  @click=${this.handleEditAccessibility}
                              >
                                  Accessibility
                              </button>
                              <button
                                  class="w-full px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-left"
                                  data-action="attributes"
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
            <div class="mobile-section mb-4 pb-4 border-b border-gray-200" data-section="actions">
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
            <div class="mobile-section mb-4 pb-4 border-b border-gray-200" data-section="template">
                ${this.renderMobileSectionHeader("Template Item", "template")}
                ${isCollapsed
                    ? nothing
                    : html`
                          <div class="flex flex-col gap-2">
                              ${this.renderStructureMismatchWarning()}
                              <!-- Reorder buttons -->
                              <div class="flex gap-2">
                                  <button
                                      class=${canMoveUp ? enabledClass : disabledClass}
                                      ?disabled=${!canMoveUp}
                                      data-action="move-up"
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
                                      data-action="move-down"
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
                                      data-action="add-item"
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
                                      data-action="delete-item"
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
        // When mockAuth is enabled, only show the mode toggle and help centered
        if (this.mockAuth) {
            return html`
                <div class="mobile-section">
                    <div class="flex items-center justify-center">${this.renderModeToggle()}</div>
                </div>
            `;
        }

        return html`
            <div class="mobile-section">
                <div class="grid grid-cols-3 items-center">
                    <button
                        class="justify-self-start px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors"
                        @click=${this.handleSignOut}
                    >
                        Sign Out
                    </button>
                    <div class="justify-self-center">${this.renderModeToggle()}</div>
                    ${this.appUrl && this.appId && !this.denyAppGui
                        ? html`
                              <a
                                  href="${this.appUrl}/apps/${encodeURIComponent(this.appId)}"
                                  target="_blank"
                                  class="justify-self-end px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors inline-flex items-center gap-1"
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
                        : nothing}
                </div>
            </div>
        `;
    }

    private renderMobile() {
        return html`
            <div
                class="bg-white border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] relative"
            >
                <!-- Drawer pull tab - raised step with angled sides -->
                <div class="drawer-tab-wrapper">
                    <button
                        class="drawer-tab"
                        @click=${this.toggleExpanded}
                        aria-label=${this.expanded ? "Close menu" : "Open menu"}
                    >
                        <span class="[&>svg]:w-4 [&>svg]:h-4">
                            ${unsafeSVG(this.expanded ? ChevronDown : ChevronUp)}
                        </span>
                    </button>
                </div>

                <!-- Primary bar (always visible) - clickable to toggle drawer -->
                <button
                    class="w-full h-14 px-4 flex items-center justify-between bg-transparent border-none"
                    @click=${this.toggleExpanded}
                    aria-label=${this.expanded ? "Close menu" : "Open menu"}
                    aria-expanded=${this.expanded}
                >
                    <!-- Save (left) -->
                    <div class="flex items-center w-16" @click=${(e: Event) => e.stopPropagation()}>
                        ${this.hasChanges ? this.renderSaveButton() : nothing}
                    </div>

                    <!-- Center: Element badge -->
                    <div class="flex items-center justify-center">
                        ${this.renderActiveElement()}
                    </div>

                    <!-- Help (right) -->
                    <div
                        class="flex items-center w-16 justify-end"
                        @click=${(e: Event) => e.stopPropagation()}
                    >
                        ${this.renderHelpButton()}
                    </div>
                </button>

                <!-- Expandable drawer -->
                <div
                    class="${this.expanded
                        ? "overflow-y-auto"
                        : "overflow-hidden"} transition-all duration-200 ease-out"
                    style="max-height: ${this.expanded
                        ? "calc(100vh - 56px - env(safe-area-inset-bottom, 0px))"
                        : "0"}"
                >
                    <div class="px-4 py-3 border-t border-gray-100">
                        <!-- Element section (only when element selected) -->
                        ${this.activeElement ? this.renderMobileElementSection() : nothing}

                        <!-- Template section (when element is in a template OR instance is selected) -->
                        ${this.activeElement || this.templateId
                            ? this.renderMobileTemplateSection()
                            : nothing}

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
        return html`
            ${this.warning ? this.renderWarning() : nothing}
            ${!this.warning && this.readOnly ? this.renderReadOnlyBanner() : nothing}
            ${this.isMobile ? this.renderMobile() : this.renderDesktop()}
        `;
    }

    private renderWarning() {
        return html`
            <div
                class="bg-amber-500 text-black px-4 py-2 text-center text-sm flex items-center justify-center gap-3"
            >
                <span>${this.warning}</span>
                <button
                    class="px-2 py-1 bg-amber-600 hover:bg-amber-700 rounded text-white text-xs font-medium"
                    @click=${() => window.location.reload()}
                >
                    Reload
                </button>
            </div>
        `;
    }

    private renderReadOnlyBanner() {
        return html`
            <div
                class="bg-blue-100 text-blue-800 px-4 py-2 text-center text-sm flex items-center justify-center gap-2"
            >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
                <span>View-only mode. You don't have permission to edit content.</span>
            </div>
        `;
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
