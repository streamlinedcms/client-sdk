/**
 * Shadow DOM utilities for tours
 */

const SHADOW_PIERCE = ">>>";

/**
 * Query selector that can pierce shadow DOM boundaries.
 * Use >>> to indicate shadow DOM boundary crossings.
 * @example queryShadowSelector('scms-toolbar >>> scms-dropdown-menu[label="Help"] >>> div.absolute')
 */
export function queryShadowSelector(
    selector: string,
    root: Element | Document | ShadowRoot = document,
): HTMLElement | null {
    const parts = selector.split(SHADOW_PIERCE).map((p) => p.trim());

    let current: Element | Document | ShadowRoot = root;

    for (const part of parts.slice(0, -1)) {
        const found = current.querySelector(part);
        if (!found?.shadowRoot) return null;
        current = found.shadowRoot;
    }

    return current.querySelector(parts[parts.length - 1]!) as HTMLElement | null;
}
