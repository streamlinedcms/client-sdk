/**
 * Whitespace normalization utilities
 *
 * Pure functions for normalizing whitespace in text and HTML content.
 * Used to clean up DOM formatting from source HTML while preserving user intent.
 */

/**
 * Normalize whitespace in text content.
 * Collapses multiple whitespace characters (including newlines from HTML formatting)
 * into single spaces and trims leading/trailing whitespace.
 */
export function normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, " ").trim();
}

/**
 * Normalize whitespace in HTML content.
 * Collapses runs of whitespace between tags into single spaces,
 * and trims leading/trailing whitespace.
 */
export function normalizeHtmlWhitespace(html: string): string {
    return html.replace(/>\s+</g, "> <").replace(/\s+/g, " ").trim();
}
