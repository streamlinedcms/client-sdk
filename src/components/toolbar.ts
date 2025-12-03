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

    @state()
    private expanded = false;

    @state()
    private isMobile = false;

    private resizeObserver: ResizeObserver | null = null;

    static styles = [
        tailwindSheet,
        css`
            :host {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                z-index: 2147483646;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
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
        this.resizeObserver = new ResizeObserver(() => this.checkMobile());
        this.resizeObserver.observe(document.body);
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
                })
            );
        }
    }

    private handleSave() {
        this.dispatchEvent(
            new CustomEvent("save", {
                bubbles: true,
                composed: true,
            })
        );
    }

    private handleReset() {
        this.dispatchEvent(
            new CustomEvent("reset", {
                bubbles: true,
                composed: true,
            })
        );
    }

    private handleEditHtml() {
        this.dispatchEvent(
            new CustomEvent("edit-html", {
                bubbles: true,
                composed: true,
            })
        );
    }

    private handleSignOut() {
        this.dispatchEvent(
            new CustomEvent("sign-out", {
                bubbles: true,
                composed: true,
            })
        );
    }

    private handleChangeImage() {
        this.dispatchEvent(
            new CustomEvent("change-image", {
                bubbles: true,
                composed: true,
            })
        );
    }

    private handleEditLink() {
        this.dispatchEvent(
            new CustomEvent("edit-link", {
                bubbles: true,
                composed: true,
            })
        );
    }

    private handleGoToLink() {
        this.dispatchEvent(
            new CustomEvent("go-to-link", {
                bubbles: true,
                composed: true,
            })
        );
    }

    private renderModeToggle() {
        return html`
            <scms-mode-toggle
                .mode=${this.mode}
                @mode-change=${(e: CustomEvent<{ mode: EditorMode }>) => this.handleModeChange(e.detail.mode)}
            ></scms-mode-toggle>
        `;
    }

    private renderEditHtmlButton() {
        // Show for html and text types (not for image or link)
        if (!this.activeElement || this.activeElementType === "image" || this.activeElementType === "link") return nothing;
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
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
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
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
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
            <button
                class=${saveClasses}
                ?disabled=${this.saving}
                @click=${this.handleSave}
            >
                ${this.saving ? "Saving..." : "Save"}
            </button>
        `;
    }

    private renderActiveElement() {
        return html`<scms-element-badge element-id=${this.activeElement || ""}></scms-element-badge>`;
    }

    private renderDesktop() {
        return html`
            <div class="h-12 bg-white border-t border-gray-200 shadow-lg">
                <div class="h-full max-w-screen-xl mx-auto px-4 flex items-center justify-between">
                    <!-- Left: Mode toggle -->
                    <div class="flex items-center gap-3">
                        ${this.renderModeToggle()}
                    </div>

                    <!-- Center: Reset + Active element + Element-specific buttons -->
                    <div class="flex items-center gap-3">
                        ${this.renderResetButton()}
                        ${this.renderActiveElement()}
                        ${this.renderEditHtmlButton()}
                        ${this.renderChangeImageButton()}
                        ${this.renderEditLinkButton()}
                        ${this.renderGoToLinkButton()}
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

    private renderMobile() {
        return html`
            <div class="bg-white border-t border-gray-200 shadow-lg">
                <!-- Primary bar (always visible) - minimal: menu, element badge, save -->
                <div class="h-14 px-4 flex items-center justify-between">
                    <!-- Menu toggle (left) -->
                    <button
                        class="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                        @click=${this.toggleExpanded}
                        aria-label=${this.expanded ? "Close menu" : "Open menu"}
                    >
                        ${this.expanded
                            ? html`
                                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            `
                            : html`
                                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            `}
                    </button>

                    <!-- Center: Element badge only -->
                    <div class="flex items-center justify-center">
                        ${this.renderActiveElement()}
                    </div>

                    <!-- Save (right) -->
                    <div class="flex items-center">
                        ${this.hasChanges ? this.renderSaveButton() : html`<div class="w-10"></div>`}
                    </div>
                </div>

                <!-- Expandable drawer -->
                <div
                    class="overflow-hidden transition-all duration-200 ease-out"
                    style="max-height: ${this.expanded ? "400px" : "0"}"
                >
                    <div class="px-4 py-3 border-t border-gray-100">
                        <!-- Element-specific actions (only when element selected) -->
                        ${this.activeElement
                            ? html`
                                <div class="mobile-actions mb-3 pb-3 border-b border-gray-100">
                                    ${this.renderEditLinkButton()}
                                    ${this.renderGoToLinkButton()}
                                    ${this.renderChangeImageButton()}
                                    ${this.renderEditHtmlButton()}
                                    ${this.renderResetButton()}
                                </div>
                            `
                            : nothing}
                        <!-- Mode toggle -->
                        <div class="flex items-center justify-between mb-3">
                            <span class="text-sm font-medium text-gray-700">Mode</span>
                            ${this.renderModeToggle()}
                        </div>
                        <!-- Sign Out + Admin -->
                        <div class="pt-2 border-t border-gray-200 flex justify-center items-center">
                            ${this.renderSignOutButton()}
                            ${this.appUrl && this.appId
                                ? html`
                                    <span class="mx-2 text-gray-300">|</span>
                                    ${this.renderAdminLink()}
                                `
                                : nothing}
                        </div>
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
