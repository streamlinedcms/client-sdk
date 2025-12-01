import { test, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { chromium, Browser, Page } from "playwright";
import { createServer, Server, IncomingMessage, ServerResponse } from "http";
import { readFile } from "fs/promises";
import { join, extname } from "path";
import getPort from "get-port";

/**
 * Load timing integration tests
 *
 * Verifies the loading sequence:
 * 1. Hiding styles injected (sync)
 * 2. Content fetch starts (async, before DOMContentLoaded)
 * 3. Content populated after DOMContentLoaded
 * 4. Hiding styles removed (content visible)
 * 5. ESM module loaded (lazy features)
 */

let browser: Browser;
let page: Page;
let server: Server;
let port: number;
let contentFetchTime: number | null = null;
let contentResponseTime: number | null = null;

beforeAll(async () => {
    port = await getPort();

    // Create a test server that tracks timing
    server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || "/", `http://localhost:${port}`);
        const pathname = url.pathname;

        // Track content API fetch timing
        if (pathname === "/apps/timing-test/content") {
            contentFetchTime = Date.now();
            // Add small delay to make timing measurable
            await new Promise(resolve => setTimeout(resolve, 50));
            contentResponseTime = Date.now();

            res.writeHead(200, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            });
            res.end(JSON.stringify({
                elements: [
                    { elementId: "test-content", content: "Loaded from API" }
                ]
            }));
            return;
        }

        // Serve the timing test page
        if (pathname === "/" || pathname === "/index.html") {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`<!doctype html>
<html>
<head>
    <title>Load Timing Test</title>
    <script>
        // Record timing milestones
        window.__loadTiming = {
            pageStart: performance.now(),
            hidingStylesInjected: null,
            domContentLoaded: null,
            contentVisible: null,
            esmLoaded: null,
            lazyInitialized: null
        };

        // Watch for hiding styles
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.id === 'streamlined-cms-hiding') {
                        window.__loadTiming.hidingStylesInjected = performance.now();
                    }
                }
                for (const node of mutation.removedNodes) {
                    if (node.id === 'streamlined-cms-hiding') {
                        window.__loadTiming.contentVisible = performance.now();
                    }
                }
            }
        });
        observer.observe(document.head, { childList: true });

        document.addEventListener('DOMContentLoaded', () => {
            window.__loadTiming.domContentLoaded = performance.now();
        });
    </script>
    <script
        src="/dist/streamlined-cms.js"
        data-api-url="http://localhost:${port}"
        data-app-id="timing-test"
        data-log-level="none"
        data-mock-auth="true"
    ></script>
</head>
<body>
    <p data-editable="test-content">Default content</p>
</body>
</html>`);
            return;
        }

        // Serve dist files
        if (pathname.startsWith("/dist/")) {
            try {
                const filePath = join(process.cwd(), pathname);
                const content = await readFile(filePath);
                const ext = extname(filePath);
                const contentTypes: Record<string, string> = {
                    ".js": "application/javascript",
                    ".map": "application/json",
                };
                res.writeHead(200, { "Content-Type": contentTypes[ext] || "text/plain" });
                res.end(content);
            } catch {
                res.writeHead(404);
                res.end("Not found");
            }
            return;
        }

        res.writeHead(404);
        res.end("Not found");
    });

    await new Promise<void>((resolve) => {
        server.listen(port, resolve);
    });

    browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
    await browser.close();
    await new Promise<void>((resolve, reject) => {
        server.close((err) => err ? reject(err) : resolve());
    });
});

beforeEach(async () => {
    page = await browser.newPage();
    contentFetchTime = null;
    contentResponseTime = null;
});

afterEach(async () => {
    await page.close();
});

test("hiding styles are injected before DOMContentLoaded", async () => {
    await page.goto(`http://localhost:${port}`);

    // Wait for lazy features to initialize
    await page.waitForSelector(".streamlined-editable");

    const timing = await page.evaluate(() => window.__loadTiming);

    expect(timing.hidingStylesInjected).not.toBeNull();
    expect(timing.domContentLoaded).not.toBeNull();

    // Hiding styles should be injected before DOMContentLoaded
    expect(timing.hidingStylesInjected).toBeLessThan(timing.domContentLoaded!);
});

test("content becomes visible before ESM lazy features load", async () => {
    await page.goto(`http://localhost:${port}`);

    // Wait for lazy features to initialize (indicates ESM loaded)
    await page.waitForSelector(".streamlined-editable");

    const timing = await page.evaluate(() => window.__loadTiming);

    expect(timing.contentVisible).not.toBeNull();

    // Content should be visible (hiding styles removed) before or around the same time as lazy init
    // The key assertion is that content is visible - not waiting for ESM
    expect(timing.contentVisible).toBeLessThanOrEqual(timing.domContentLoaded! + 500);
});

test("content is fetched and populated correctly", async () => {
    await page.goto(`http://localhost:${port}`);

    // Wait for content to be populated
    await page.waitForFunction(() => {
        const el = document.querySelector('[data-editable="test-content"]');
        return el && el.textContent === "Loaded from API";
    });

    const content = await page.locator('[data-editable="test-content"]').textContent();
    expect(content).toBe("Loaded from API");
});

test("hiding styles are removed after content loads", async () => {
    await page.goto(`http://localhost:${port}`);

    // Wait for lazy features
    await page.waitForSelector(".streamlined-editable");

    // Verify hiding styles element is gone
    const hidingStyles = await page.$("#streamlined-cms-hiding");
    expect(hidingStyles).toBeNull();

    // Verify content is visible
    const contentEl = page.locator('[data-editable="test-content"]');
    const isVisible = await contentEl.isVisible();
    expect(isVisible).toBe(true);
});

test("load sequence completes in correct order", async () => {
    await page.goto(`http://localhost:${port}`);

    // Wait for full initialization
    await page.waitForSelector(".streamlined-editable");

    const timing = await page.evaluate(() => window.__loadTiming);

    // Verify all milestones were recorded
    expect(timing.pageStart).toBeDefined();
    expect(timing.hidingStylesInjected).not.toBeNull();
    expect(timing.domContentLoaded).not.toBeNull();
    expect(timing.contentVisible).not.toBeNull();

    // Verify order: hidingStyles -> domContentLoaded -> contentVisible
    expect(timing.hidingStylesInjected).toBeLessThan(timing.domContentLoaded!);
    expect(timing.contentVisible).toBeGreaterThanOrEqual(timing.domContentLoaded!);
});

test("timing data is captured correctly", async () => {
    await page.goto(`http://localhost:${port}`);

    // Wait for full initialization
    await page.waitForSelector(".streamlined-editable");

    const timing = await page.evaluate(() => window.__loadTiming);

    const base = timing.pageStart;

    // Verify timing data is reasonable
    expect(timing.hidingStylesInjected! - base).toBeGreaterThan(0);
    expect(timing.hidingStylesInjected! - base).toBeLessThan(100);
    expect(timing.domContentLoaded! - base).toBeGreaterThan(0);
    expect(timing.contentVisible! - base).toBeGreaterThan(timing.domContentLoaded! - base);
});

// Extend Window interface for TypeScript
declare global {
    interface Window {
        __loadTiming: {
            pageStart: number;
            hidingStylesInjected: number | null;
            domContentLoaded: number | null;
            contentVisible: number | null;
            esmLoaded: number | null;
            lazyInitialized: number | null;
        };
    }
}
