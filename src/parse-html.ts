/**
 * Parse HTML strings into elements.
 *
 * Shared by the loader and the editor. Parsing goes through a <template>
 * element, which accepts any element as content. A <div> doesn't: the parser
 * drops table parts such as <tr> and <td> there, so a template item that is
 * a table row would come back as bare text.
 */

/**
 * Parse HTML into a fragment.
 */
export function parseHtml(html: string): DocumentFragment {
    const template = document.createElement("template");
    template.innerHTML = html;
    return template.content;
}

/**
 * Parse HTML holding a single element, such as a template item.
 */
export function parseElement(html: string): HTMLElement | null {
    return parseHtml(html).firstElementChild as HTMLElement | null;
}

/**
 * Serialize a fragment back to HTML.
 */
export function serializeHtml(fragment: DocumentFragment): string {
    const template = document.createElement("template");
    template.content.appendChild(fragment);
    return template.innerHTML;
}
