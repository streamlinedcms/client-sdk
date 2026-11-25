import { test, expect, describe } from "vitest";
import { esmBundleUrl } from "../../src/esm-url.js";

const CDN = "https://cdn.streamlinedcms.com/client-sdk";

describe("esmBundleUrl", () => {
    test.each([
        ["major alias", `${CDN}/v1/streamlined-cms.js`],
        ["minor alias", `${CDN}/v1.3/streamlined-cms.min.js`],
        ["latest alias", `${CDN}/latest/streamlined-cms.js`],
        ["prerelease alias", `${CDN}/v1.3.5-beta/streamlined-cms.js`],
    ])("a loader from a %s fetches the bundle by exact version", (_, loaderSrc) => {
        expect(esmBundleUrl(loaderSrc, "1.3.5")).toBe(`${CDN}/v1.3.5/streamlined-cms.esm.js`);
    });

    test("a loader from its exact version path fetches the bundle beside it", () => {
        expect(esmBundleUrl(`${CDN}/v1.3.5-beta.2/streamlined-cms.js`, "1.3.5-beta.2")).toBe(
            `${CDN}/v1.3.5-beta.2/streamlined-cms.esm.js`,
        );
    });

    test.each([
        ["a self-hosted copy", "https://example.com/assets/v1/streamlined-cms.js"],
        ["a local dev server", "http://localhost:5173/dist/streamlined-cms.js"],
    ])("a loader from %s fetches the bundle beside it", (_, loaderSrc) => {
        const directory = loaderSrc.substring(0, loaderSrc.lastIndexOf("/") + 1);
        expect(esmBundleUrl(loaderSrc, "1.3.5")).toBe(`${directory}streamlined-cms.esm.js`);
    });

    test("ignores a query string on the loader URL", () => {
        expect(esmBundleUrl(`${CDN}/v1/streamlined-cms.js?cache=a/b`, "1.3.5")).toBe(
            `${CDN}/v1.3.5/streamlined-cms.esm.js`,
        );
    });

    test("a loader from a file:// page fetches the bundle beside it", () => {
        expect(esmBundleUrl("file:///Users/me/site/sdk/streamlined-cms.js", "1.3.5")).toBe(
            "file:///Users/me/site/sdk/streamlined-cms.esm.js",
        );
    });

    test("a loader with no URL (inlined) falls back to a relative bundle URL", () => {
        expect(esmBundleUrl("", "1.3.5")).toBe("streamlined-cms.esm.js");
    });
});
