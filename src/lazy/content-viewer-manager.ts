/**
 * ContentViewerManager - Manages the content viewer overlay
 *
 * Responsible for:
 * - Toggling floating badges over all editable elements
 * - Classifying elements as visible or hidden
 * - Positioning badges and updating on scroll/resize
 * - Showing a panel for hidden/off-screen elements
 */

import type { Logger } from "loganite";
import type { EditorState } from "./state.js";
import type { ContentViewerBadge } from "../components/content-viewer-badge.js";
import type { ContentViewerPanel, HiddenElementInfo } from "../components/content-viewer-panel.js";

/**
 * Helpers that ContentViewerManager needs from EditorController
 */
export interface ContentViewerHelpers {
    selectAndEdit: (key: string, element: HTMLElement) => void;
    scrollToElement: (element: HTMLElement, delay?: number) => void;
    updateToolbarContentViewer: (active: boolean, hiddenCount: number) => void;
}

interface BadgeInfo {
    badge: ContentViewerBadge;
    element: HTMLElement;
    key: string;
}

type ElementVisibility =
    | { visible: true }
    | { visible: false; reason: string };

export class ContentViewerManager {
    private active = false;
    private badges: BadgeInfo[] = [];
    private panel: ContentViewerPanel | null = null;
    private panelCloseHandler: ((e: MouseEvent) => void) | null = null;
    private hiddenElements: HiddenElementInfo[] = [];
    private rafId: number | null = null;
    private scrollHandler: (() => void) | null = null;
    private resizeHandler: (() => void) | null = null;
    private lastClassifyTime = 0;
    private readonly RECLASSIFY_INTERVAL = 500;

    constructor(
        private state: EditorState,
        private log: Logger,
        private helpers: ContentViewerHelpers,
    ) {}

    get isActive(): boolean {
        return this.active;
    }

    toggle(): void {
        if (this.active) {
            this.deactivate();
        } else {
            this.activate();
        }
    }

    activate(): void {
        if (this.active) return;
        this.active = true;
        this.log.trace("Content viewer activated");

        this.createBadges();
        this.updatePositions();
        this.registerListeners();
        this.helpers.updateToolbarContentViewer(true, this.hiddenElements.length);
    }

    deactivate(): void {
        if (!this.active) return;
        this.active = false;
        this.log.trace("Content viewer deactivated");

        this.destroyBadges();
        this.closeHiddenPanel();
        this.unregisterListeners();
        this.helpers.updateToolbarContentViewer(false, 0);
    }

    showHiddenPanel(): void {
        if (!this.active) return;

        // Toggle off if already open
        if (this.panel) {
            this.closeHiddenPanel();
            return;
        }

        const panel = document.createElement("scms-content-viewer-panel") as ContentViewerPanel;
        panel.hiddenElements = this.hiddenElements;

        panel.addEventListener("close", () => this.closeHiddenPanel());
        panel.addEventListener("hidden-element-click", (e: Event) => {
            const key = (e as CustomEvent<{ key: string }>).detail.key;
            this.handleHiddenElementClick(key);
        });

        document.body.appendChild(panel);
        this.panel = panel;

        // Close on click outside (after short delay to avoid immediate close)
        this.panelCloseHandler = (e: MouseEvent) => {
            if (this.panel && !this.panel.contains(e.target as Node)) {
                this.closeHiddenPanel();
            }
        };
        setTimeout(() => {
            if (this.panelCloseHandler) {
                document.addEventListener("click", this.panelCloseHandler);
            }
        }, 0);
    }

    private closeHiddenPanel(): void {
        if (this.panel) {
            this.panel.remove();
            this.panel = null;
        }
        if (this.panelCloseHandler) {
            document.removeEventListener("click", this.panelCloseHandler);
            this.panelCloseHandler = null;
        }
    }

    private handleHiddenElementClick(key: string): void {
        const infos = this.state.editableElements.get(key);
        if (!infos || infos.length === 0) return;

        const element = infos[0].element;

        // Scroll into view first, then select after deactivating overlay
        this.helpers.scrollToElement(element, 0);
        this.deactivate();
        this.helpers.selectAndEdit(key, element);
    }

    private handleBadgeClick(key: string): void {
        const infos = this.state.editableElements.get(key);
        if (!infos || infos.length === 0) return;

        // Find the element corresponding to this badge
        const element = infos[0].element;

        this.deactivate();
        this.helpers.selectAndEdit(key, element);
    }

    private createBadges(): void {
        this.badges = [];
        this.hiddenElements = [];

        this.state.editableElements.forEach((infos, key) => {
            const elementType = this.state.editableTypes.get(key) || "html";

            for (const info of infos) {
                if (!info.element.isConnected) continue;

                const visibility = this.classifyElement(info.element);

                if (visibility.visible) {
                    const badge = document.createElement(
                        "scms-content-viewer-badge",
                    ) as ContentViewerBadge;
                    badge.elementKey = key;
                    badge.elementId = info.elementId;
                    badge.elementType = elementType;

                    badge.addEventListener("badge-click", (e: Event) => {
                        const clickedKey = (e as CustomEvent<{ key: string }>).detail.key;
                        this.handleBadgeClick(clickedKey);
                    });

                    document.body.appendChild(badge);
                    this.badges.push({ badge, element: info.element, key });
                } else {
                    this.hiddenElements.push({
                        key,
                        elementId: info.elementId,
                        elementType,
                        reason: visibility.reason,
                    });
                }
            }
        });
    }

    private classifyElement(element: HTMLElement): ElementVisibility {
        // Check display:none (offsetParent is null for non-fixed/non-sticky elements)
        const style = getComputedStyle(element);
        if (
            element.offsetParent === null &&
            style.position !== "fixed" &&
            style.position !== "sticky"
        ) {
            return { visible: false, reason: "hidden" };
        }

        // Check visibility:hidden
        if (style.visibility === "hidden") {
            return { visible: false, reason: "hidden" };
        }

        // Check zero dimensions
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
            return { visible: false, reason: "zero size" };
        }

        // Check completely off-screen
        if (
            rect.bottom < 0 ||
            rect.top > window.innerHeight ||
            rect.right < 0 ||
            rect.left > window.innerWidth
        ) {
            return { visible: false, reason: "off-screen" };
        }

        return { visible: true };
    }

    private updatePositions(): void {
        if (!this.active) return;

        const now = Date.now();
        const shouldReclassify = now - this.lastClassifyTime > this.RECLASSIFY_INTERVAL;

        if (shouldReclassify) {
            this.lastClassifyTime = now;
            this.reclassifyElements();
        }

        // Position all visible badges
        for (const { badge, element } of this.badges) {
            if (!element.isConnected) {
                badge.style.display = "none";
                continue;
            }

            const rect = element.getBoundingClientRect();

            // Hide badges for elements currently off-screen
            if (
                rect.bottom < 0 ||
                rect.top > window.innerHeight ||
                rect.right < 0 ||
                rect.left > window.innerWidth
            ) {
                badge.style.display = "none";
                continue;
            }

            badge.style.display = "";
            badge.style.top = `${Math.max(0, rect.top + 4)}px`;
            badge.style.left = `${Math.max(0, rect.left + 4)}px`;
        }

        this.rafId = requestAnimationFrame(() => this.updatePositions());
    }

    private reclassifyElements(): void {
        // Rebuild badges and hidden list from scratch
        const oldBadges = this.badges;
        const oldHidden = this.hiddenElements;

        // Track which elements currently have badges (by key + element ref)
        const existingBadgeMap = new Map<string, Map<HTMLElement, ContentViewerBadge>>();
        for (const { key, element, badge } of oldBadges) {
            if (!existingBadgeMap.has(key)) {
                existingBadgeMap.set(key, new Map());
            }
            existingBadgeMap.get(key)!.set(element, badge);
        }

        this.badges = [];
        this.hiddenElements = [];

        this.state.editableElements.forEach((infos, key) => {
            const elementType = this.state.editableTypes.get(key) || "html";

            for (const info of infos) {
                if (!info.element.isConnected) continue;

                const visibility = this.classifyElement(info.element);

                if (visibility.visible) {
                    // Reuse existing badge if available
                    const existingBadge = existingBadgeMap.get(key)?.get(info.element);
                    if (existingBadge) {
                        this.badges.push({
                            badge: existingBadge,
                            element: info.element,
                            key,
                        });
                        existingBadgeMap.get(key)!.delete(info.element);
                    } else {
                        // Create new badge
                        const badge = document.createElement(
                            "scms-content-viewer-badge",
                        ) as ContentViewerBadge;
                        badge.elementKey = key;
                        badge.elementId = info.elementId;
                        badge.elementType = elementType;

                        badge.addEventListener("badge-click", (e: Event) => {
                            const clickedKey = (e as CustomEvent<{ key: string }>).detail.key;
                            this.handleBadgeClick(clickedKey);
                        });

                        document.body.appendChild(badge);
                        this.badges.push({ badge, element: info.element, key });
                    }
                } else {
                    this.hiddenElements.push({
                        key,
                        elementId: info.elementId,
                        elementType,
                        reason: visibility.reason,
                    });
                }
            }
        });

        // Remove badges that are no longer needed
        for (const [, elementMap] of existingBadgeMap) {
            for (const [, badge] of elementMap) {
                badge.remove();
            }
        }

        // Update hidden panel if open
        if (this.panel) {
            this.panel.hiddenElements = [...this.hiddenElements];
        }

        // Check if hidden count changed
        if (this.hiddenElements.length !== oldHidden.length) {
            this.helpers.updateToolbarContentViewer(true, this.hiddenElements.length);
        }
    }

    private destroyBadges(): void {
        for (const { badge } of this.badges) {
            badge.remove();
        }
        this.badges = [];
        this.hiddenElements = [];
    }

    private registerListeners(): void {
        let ticking = false;
        this.scrollHandler = () => {
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(() => {
                    ticking = false;
                });
            }
        };
        this.resizeHandler = () => {
            // Force reclassification on resize
            this.lastClassifyTime = 0;
        };

        window.addEventListener("scroll", this.scrollHandler, { passive: true });
        window.addEventListener("resize", this.resizeHandler, { passive: true });
    }

    private unregisterListeners(): void {
        if (this.scrollHandler) {
            window.removeEventListener("scroll", this.scrollHandler);
            this.scrollHandler = null;
        }
        if (this.resizeHandler) {
            window.removeEventListener("resize", this.resizeHandler);
            this.resizeHandler = null;
        }
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }
}
