/**
 * ESM bundle URL for the sync loader
 */

const BUNDLE = "streamlined-cms.esm.js";

// A CDN alias directory: /client-sdk/v1/, /client-sdk/v1.2/, /client-sdk/latest/,
// /client-sdk/v1.5.0-beta/ and so on. Matches the CDN worker's version segment.
const CDN_VERSION_PATH = /^(.*\/client-sdk\/)(v[\d.]+(?:-[\w.]+)?|latest|beta|rc|alpha)\/[^/]*$/;

/**
 * URL of the ESM bundle that goes with this loader. Normally that's the
 * loader's own directory. A loader loaded through a CDN alias points at its
 * exact version instead: an alias moves to each new build while browsers and
 * the edge can still hold the previous loader or bundle, and that old bundle
 * would ask the alias for code-split chunks the new build doesn't have.
 * @param loaderSrc - The loader script's URL
 * @param version - The version this loader was built as
 */
export function esmBundleUrl(loaderSrc: string, version: string): string {
    let url: URL;
    try {
        url = new URL(loaderSrc);
    } catch {
        // Not an absolute URL (an inlined loader has none): resolve beside it
        return loaderSrc.substring(0, loaderSrc.lastIndexOf("/") + 1) + BUNDLE;
    }
    const match = url.pathname.match(CDN_VERSION_PATH);
    if (match && match[2] !== `v${version}`) {
        return new URL(`${match[1]}v${version}/${BUNDLE}`, url).href;
    }
    return new URL(BUNDLE, url).href;
}
