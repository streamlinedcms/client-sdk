/**
 * Change-request screenshot capture.
 *
 * Regression guard for the "sticky/fixed nav missing from the screenshot" bug:
 * the capture used to render the whole document and crop to the scroll offset,
 * which dropped pinned elements — they render at their document-flow position
 * (a sticky header at document top), outside the crop window once scrolled.
 * captureScreenshot now uses snapdom's `clip: "viewport"`, which renders what
 * the user actually sees, pinned elements included. These tests paint a
 * distinctive header and assert its colour lands in the top of the shot.
 */

import { test, expect, beforeEach, afterEach } from "vitest";
import { ChangeRequestManager } from "~/src/lazy/change-request-manager.js";
import type { Logger } from "loganite";
import type { EditorState } from "~/src/lazy/state.js";

// captureScreenshot uses only snapdom + the DOM, none of the constructor
// dependencies, so minimal stubs are enough to reach the real capture path.
function makeManager(): ChangeRequestManager {
    const noop = (): void => {};
    return new ChangeRequestManager(
        {} as unknown as EditorState,
        { warn: noop, error: noop, info: noop, trace: noop } as unknown as Logger,
        { apiUrl: "", appUrl: "", appId: "" },
        { apiFetch: (async () => new Response()) as never, deselect: noop },
    );
}

let savedBody: string;

beforeEach(() => {
    savedBody = document.body.innerHTML;
    // A layout with overflow on html/body breaks position: sticky; the tests
    // need it to actually pin. (This is also why the SDK captures document.body
    // rather than a scroll container.)
    document.documentElement.style.overflow = "visible";
    document.body.style.cssText = "margin:0;overflow:visible";
});

afterEach(() => {
    document.body.innerHTML = savedBody;
    document.body.style.cssText = "";
    document.documentElement.style.overflow = "";
    window.scrollTo(0, 0);
});

/** Paint a distinctive full-width header (magenta) over tall scrollable content. */
function buildPage(position: "sticky" | "fixed"): void {
    document.body.innerHTML = `
        <div id="cr-test-header"
             style="position:${position};top:0;left:0;right:0;height:80px;background:rgb(255,0,255);z-index:50"></div>
        <div style="height:3000px;background:#f0f0f0"></div>`;
}

/** Capture via the real SDK path and report whether the header colour is in the top strip. */
async function headerInTopOfShot(): Promise<boolean> {
    const manager = makeManager();
    const blob = await manager["captureScreenshot"]();

    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    // Sample the top 15% of the shot — comfortably covers the 80px header.
    const stripHeight = Math.max(1, Math.round(canvas.height * 0.15));
    const { data } = ctx.getImageData(0, 0, canvas.width, stripHeight);
    let magenta = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 200 && data[i + 1] < 80 && data[i + 2] > 200) magenta++;
    }
    return magenta > 100;
}

/** Capture via the real SDK path and return the shot's pixel dimensions. */
async function shotDimensions(): Promise<{ width: number; height: number }> {
    const blob = await makeManager()["captureScreenshot"]();
    const bitmap = await createImageBitmap(blob);
    const dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dims;
}

async function scrollTo(y: number): Promise<void> {
    window.scrollTo(0, y);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
}

test("sticky header is captured at the top when not scrolled", async () => {
    buildPage("sticky");
    await scrollTo(0);
    expect(await headerInTopOfShot()).toBe(true);
});

test("sticky header is captured at the top when scrolled (regression)", async () => {
    buildPage("sticky");
    await scrollTo(1000);
    expect(await headerInTopOfShot()).toBe(true);
});

test("fixed header is captured at the top when scrolled", async () => {
    buildPage("fixed");
    await scrollTo(1000);
    expect(await headerInTopOfShot()).toBe(true);
});

// The header-colour checks above pass even for a full-page capture, because a
// sticky/fixed header sits at document top either way. This asserts the shot is
// actually clipped to the viewport — the guard for the "captures the whole page"
// regression (issue #100), which happens if snapdom silently ignores
// `clip: "viewport"` (e.g. an older cached snapdom chunk) and renders the whole
// body over a page much taller than the viewport.
test("capture is clipped to the viewport, not the whole page", async () => {
    buildPage("sticky"); // 80px header over 3000px of content
    await scrollTo(1000);

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = await shotDimensions();

    // Viewport-sized (within a few px for scrollbar/DPR rounding), not full page.
    expect(height).toBeLessThanOrEqual(Math.round(window.innerHeight * dpr) + 4);
    expect(width).toBeLessThanOrEqual(Math.round(window.innerWidth * dpr) + 4);
    // And unambiguously smaller than the ~3080px document — a whole-page shot
    // would be several times the viewport height.
    expect(height).toBeLessThan(Math.round(document.body.scrollHeight * dpr) / 2);
});
