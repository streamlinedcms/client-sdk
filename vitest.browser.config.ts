import { defineConfig, type Plugin } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import getPort from "get-port";
import { setPort } from "./tests/browser/support/test-port.js";

// Get an available port and share it with globalSetup
const port = await getPort();
setPort(port);

/**
 * Plugin to handle CSS imports as strings (like rollup-plugin-postcss).
 * The SDK imports CSS files and expects them as strings for Lit components.
 *
 * Uses Vite's built-in PostCSS processing via postcss.config.cjs, then
 * transforms the result to export as a string.
 */
function cssAsStringPlugin(): Plugin {
    return {
        name: "css-as-string",
        enforce: "post", // Run after Vite's CSS processing
        transform(code, id) {
            // Only handle CSS files in src/ (not node_modules or processed CSS)
            if (id.endsWith(".css") && id.includes("/src/")) {
                // Vite may have already wrapped this - check if it's a module
                if (code.startsWith("export default")) {
                    return; // Already processed
                }
                // Export the CSS content as a string
                return {
                    code: `export default ${JSON.stringify(code)};`,
                    map: null,
                };
            }
        },
    };
}

/**
 * Vitest configuration for browser integration tests.
 * These tests run in a real browser using Vitest's browser mode.
 *
 * The SDK is imported directly from source in tests, allowing Vite to
 * bundle it with V8 coverage instrumentation.
 */
export default defineConfig({
    plugins: [cssAsStringPlugin()],
    // Build-time constants
    define: {
        __SDK_API_URL__: JSON.stringify(`http://localhost:${port}/v1`),
        __SDK_APP_URL__: JSON.stringify("http://unused-in-tests"),
        __SDK_VERSION__: JSON.stringify("0.0.0-test"),
    },
    // Pre-bundle dependencies to avoid reload during tests
    optimizeDeps: {
        include: [
            "loganite",
            "sortablejs",
            "lit",
            "lit/decorators.js",
            "lit/directives/style-map.js",
            "penpal",
        ],
    },
    css: {
        // Disable CSS modules to get raw CSS
        modules: false,
    },
    test: {
        name: "browser",
        include: ["tests/browser/**/*.browser.test.ts"],
        globals: true,
        globalSetup: ["./tests/browser/support/globalSetup.ts"],
        browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
            testerHtmlPath: "./tests/browser/support/fixtures/tester.html",
        },
        coverage: {
            provider: "v8",
            reporter: ["text"],
            reportsDirectory: "./coverage/browser",
            include: ["src/**/*.ts"],
            exclude: [
                "src/types.ts",
            ],
            thresholds: {
                lines: 80,
                functions: 80,
                branches: 80,
                statements: 80,
            },
        },
    },
});
