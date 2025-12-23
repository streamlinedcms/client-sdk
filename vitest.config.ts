import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for unit tests.
 * These tests run in jsdom environment.
 * For browser integration tests, see vitest.browser.config.ts
 */
export default defineConfig({
    // Build-time constants must be defined to avoid reference errors.
    define: {
        __SDK_API_URL__: JSON.stringify("http://unused-in-tests"),
        __SDK_APP_URL__: JSON.stringify("http://unused-in-tests"),
        __SDK_VERSION__: JSON.stringify("0.0.0-test"),
    },
    test: {
        name: "unit",
        include: ["tests/unit/**/*.test.ts"],
        environment: "jsdom",
        globals: true,
        setupFiles: ["./tests/setup.ts"],
        coverage: {
            provider: "v8",
            reporter: ["text"],
            reportsDirectory: "./coverage/unit",
            include: ["src/**/*.ts"],
            exclude: [
                "src/types.ts", // Type definitions only
                "src/index.ts", // Re-exports only
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
