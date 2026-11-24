/**
 * Replaced images with responsive sources (visitor path)
 *
 * Browsers show an image from srcset, or from a <source> in a <picture>,
 * over src. A saved image that differs from the page's must drop those, or
 * visitors keep seeing the original. A saved image that is the page's own
 * (e.g. saved for its alt text) keeps them. Runs the loader only, without
 * the editor, so the editor can't mask the loader.
 *
 * Regression test for: https://github.com/streamlinedcms/client-sdk/issues/110
 */

import { test, expect, beforeAll } from "vitest";
import { setContent } from "~/@browser-support/test-helpers.js";
import { runLoader, setupTestHelpers, generateTestAppId } from "~/@browser-support/sdk-helpers.js";

function image(id: string): HTMLImageElement {
    return document.querySelector(`[data-scms-image="${id}"]`) as HTMLImageElement;
}

beforeAll(async () => {
    setupTestHelpers();
    const appId = generateTestAppId();

    await setContent(
        appId,
        "srcset-replaced",
        JSON.stringify({ type: "image", src: "https://example.com/replaced.png" }),
    );
    await setContent(
        appId,
        "srcset-unchanged",
        JSON.stringify({
            type: "image",
            src: "https://example.com/original.png",
            attributes: { alt: "Saved alt" },
        }),
    );
    await setContent(
        appId,
        "picture-replaced",
        JSON.stringify({ type: "image", src: "https://example.com/replaced.png" }),
    );

    // Replaced, with the editor's own srcset for the new image
    await setContent(
        appId,
        "srcset-own",
        JSON.stringify({
            type: "image",
            src: "https://example.com/replaced.png",
            attributes: { srcset: "https://example.com/own-600.png 600w", sizes: "300px" },
        }),
    );
    // The page writes a relative src; the editor saves it resolved
    await setContent(
        appId,
        "srcset-relative",
        JSON.stringify({
            type: "image",
            src: new URL("/images/original.png", document.baseURI).href,
            attributes: { alt: "Saved alt" },
        }),
    );

    await setContent(
        appId,
        "picture-unchanged",
        JSON.stringify({
            type: "image",
            src: "https://example.com/original.png",
            attributes: { alt: "Saved alt" },
        }),
    );
    // An image with no src of its own is saved with an empty src
    await setContent(
        appId,
        "picture-no-src",
        JSON.stringify({ type: "image", src: "", attributes: { alt: "Saved alt" } }),
    );
    await setContent(
        appId,
        "srcset-no-src",
        JSON.stringify({ type: "image", src: "", attributes: { alt: "Saved alt" } }),
    );

    await runLoader(appId);
});

test("a replaced image drops the page's srcset and sizes", () => {
    const img = image("srcset-replaced");
    expect(img.getAttribute("src")).toBe("https://example.com/replaced.png");
    expect(img.hasAttribute("srcset")).toBe(false);
    expect(img.hasAttribute("sizes")).toBe(false);
});

test("an image saved unchanged keeps the page's srcset and sizes", () => {
    const img = image("srcset-unchanged");
    expect(img.getAttribute("alt")).toBe("Saved alt");
    expect(img.hasAttribute("srcset")).toBe(true);
    expect(img.getAttribute("sizes")).toBe("600px");
});

test("a replaced image in a <picture> drops the picture's sources", () => {
    const img = image("picture-replaced");
    expect(img.getAttribute("src")).toBe("https://example.com/replaced.png");
    expect(img.parentElement!.tagName).toBe("PICTURE");
    expect(img.parentElement!.querySelectorAll("source")).toHaveLength(0);
});

test("a srcset the editor saved for the replaced image is kept", () => {
    const img = image("srcset-own");
    expect(img.getAttribute("src")).toBe("https://example.com/replaced.png");
    expect(img.getAttribute("srcset")).toBe("https://example.com/own-600.png 600w");
    expect(img.getAttribute("sizes")).toBe("300px");
});

test("an image the page names by a relative address, saved unchanged, keeps its srcset", () => {
    const img = image("srcset-relative");
    expect(img.getAttribute("alt")).toBe("Saved alt");
    expect(img.getAttribute("srcset")).toBe(
        "/images/original-600.png 600w, /images/original-1200.png 1200w",
    );
    expect(img.getAttribute("sizes")).toBe("600px");
});

test("an image in a <picture> saved unchanged keeps the picture's sources", () => {
    const img = image("picture-unchanged");
    expect(img.getAttribute("alt")).toBe("Saved alt");
    expect(img.parentElement!.querySelectorAll("source")).toHaveLength(1);
});

test("an image without its own src, saved for its alt text, keeps the picture's sources", () => {
    const img = image("picture-no-src");
    expect(img.getAttribute("alt")).toBe("Saved alt");
    expect(img.parentElement!.querySelectorAll("source")).toHaveLength(1);
});

test("an image without its own src, saved for its alt text, keeps its srcset", () => {
    const img = image("srcset-no-src");
    expect(img.getAttribute("alt")).toBe("Saved alt");
    expect(img.hasAttribute("srcset")).toBe(true);
    expect(img.getAttribute("sizes")).toBe("600px");
});
