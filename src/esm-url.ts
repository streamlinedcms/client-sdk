/**
 * ESM bundle URL for the sync loader
 */

// A CDN alias directory: /client-sdk/v1/, /client-sdk/v1.2/, /client-sdk/latest/,
// /client-sdk/v1.5.0-beta/ and so on. Matches the CDN worker's version segment.
const CDN_VERSION_PATH = /^(.*\/client-sdk\/)(v[\d.]+(?:-[\w.]+)?|latest|beta|rc|alpha)\/[^/]*$/;

/**
 * URL of the ESM bundle that goes with this loader. Normally that's the
 * loader's own directory. A loader loaded through a CDN alias points at its
 * exact version instead: an alias moves to each new build while browsers and
 * the edge can still hold the previous loader or bundle, and that old bundle
 * would ask the alias for code-split chunks the new build doesn't have.
 * @param loaderSrc - The loader script's absolute URL
 * @param version - The version this loader was built as
 */
export function esmBundleUrl(loaderSrc: string, version: string): string {
    const url = new URL(loaderSrc);
    const match = url.pathname.match(CDN_VERSION_PATH);
    const directory =
        match && match[2] !== `v${version}`
            ? `${match[1]}v${version}/`
            : url.pathname.substring(0, url.pathname.lastIndexOf("/") + 1);
    return `${url.origin}${directory}streamlined-cms.esm.js`;
}
