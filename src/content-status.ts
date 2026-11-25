/**
 * Whether the page shows saved content.
 *
 * The loader records it once it has finished loading content, and the editor
 * reads it before turning editing on: editing over the page's built-in
 * content would save that content over the saved version.
 */

const ATTRIBUTE = "data-scms-content";

export function setPageShowsSavedContent(shows: boolean): void {
    document.documentElement.setAttribute(ATTRIBUTE, shows ? "applied" : "failed");
}

/**
 * False until the loader has applied saved content, including when the
 * loader hasn't run.
 */
export function pageShowsSavedContent(): boolean {
    return document.documentElement.getAttribute(ATTRIBUTE) === "applied";
}
