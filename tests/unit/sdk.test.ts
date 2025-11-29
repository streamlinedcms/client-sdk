import { describe, it, expect, beforeEach, vi } from "vitest";
import { StreamlinedCMS } from "../../src/sdk";

describe("StreamlinedCMS", () => {
    let config: any;

    beforeEach(() => {
        // Reset DOM
        document.body.innerHTML = "";

        // Reset config
        config = {
            apiUrl: "http://localhost:8787",
            appId: "test-app",
            logLevel: "fatal",
            mockAuth: {
                enabled: true,
                userId: "test-user",
            },
        };
    });

    describe("constructor", () => {
        it("should initialize with provided config", () => {
            const cms = new StreamlinedCMS(config);
            expect(cms).toBeDefined();
        });

        it("should enable mock auth when configured", () => {
            const cms = new StreamlinedCMS(config);
            expect(cms).toBeDefined();
            // Auth state is private, but we can test it indirectly through init
        });
    });

    describe("init", () => {
        it("should scan for editable elements", async () => {
            document.body.innerHTML = `
        <div data-editable="element1">Content 1</div>
        <div data-editable="element2">Content 2</div>
      `;

            const cms = new StreamlinedCMS(config);

            // Mock fetch to prevent API calls
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
            });

            await cms.init();

            // Check that editable class was added
            const elements = document.querySelectorAll(".streamlined-editable");
            expect(elements.length).toBe(2);
        });

        it("should inject edit styles", async () => {
            document.body.innerHTML = '<div data-editable="test">Test</div>';

            const cms = new StreamlinedCMS(config);

            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
            });

            await cms.init();

            const styleElement = document.getElementById("streamlined-cms-styles");
            expect(styleElement).toBeDefined();
            expect(styleElement?.tagName).toBe("STYLE");
        });

        it("should load content from API if available", async () => {
            document.body.innerHTML = '<div data-editable="test">Original</div>';

            const cms = new StreamlinedCMS(config);

            // Mock successful API response
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    appId: "test-app",
                    count: 1,
                    elements: [
                        {
                            appId: "test-app",
                            elementId: "test",
                            content: "Updated from API",
                            updatedAt: new Date().toISOString(),
                        },
                    ],
                }),
            });

            await cms.init();

            const element = document.querySelector('[data-editable="test"]');
            expect(element?.innerHTML).toBe("Updated from API");
        });

        it("should handle API errors gracefully", async () => {
            document.body.innerHTML = '<div data-editable="test">Original</div>';

            const cms = new StreamlinedCMS(config);

            // Mock API error
            global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

            // Should not throw
            await expect(cms.init()).resolves.not.toThrow();

            // Original content should remain
            const element = document.querySelector('[data-editable="test"]');
            expect(element?.innerHTML).toBe("Original");
        });
    });

    describe("editing", () => {
        it("should make element contenteditable when clicked", async () => {
            document.body.innerHTML = '<div data-editable="test">Test content</div>';

            const cms = new StreamlinedCMS(config);

            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
            });

            await cms.init();

            const element = document.querySelector('[data-editable="test"]') as HTMLElement;
            element.click();

            expect(element.getAttribute("contenteditable")).toBe("true");
            expect(element.classList.contains("streamlined-editing")).toBe(true);
        });

        it("should switch between editable elements", async () => {
            document.body.innerHTML = `
                <div data-editable="element1">First element</div>
                <div data-editable="element2">Second element</div>
            `;

            const cms = new StreamlinedCMS(config);

            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
            });

            await cms.init();

            const element1 = document.querySelector('[data-editable="element1"]') as HTMLElement;
            const element2 = document.querySelector('[data-editable="element2"]') as HTMLElement;

            // Start editing first element
            element1.click();
            expect(element1.getAttribute("contenteditable")).toBe("true");
            expect(element1.classList.contains("streamlined-editing")).toBe(true);

            // Start editing second element (should stop editing first)
            element2.click();
            expect(element2.getAttribute("contenteditable")).toBe("true");
            expect(element2.classList.contains("streamlined-editing")).toBe(true);
            // First element should no longer be in edit mode
            expect(element1.getAttribute("contenteditable")).toBe("false");
            expect(element1.classList.contains("streamlined-editing")).toBe(false);
        });

        it("should show save button when editing", async () => {
            document.body.innerHTML = '<div data-editable="test">Test content</div>';

            const cms = new StreamlinedCMS(config);

            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
            });

            await cms.init();

            const element = document.querySelector('[data-editable="test"]') as HTMLElement;
            element.click();

            const saveButton = document.getElementById("streamlined-save-btn");
            expect(saveButton).toBeDefined();
            expect(saveButton?.textContent).toBe("Save Changes");
        });
    });

    describe("log level", () => {
        it("should return configured log level", () => {
            const cms = new StreamlinedCMS({ ...config, logLevel: "debug" });
            expect(cms.getLogLevel()).toBe("debug");
        });

        it("should default to error log level", () => {
            const { logLevel, ...configWithoutLogLevel } = config;
            const cms = new StreamlinedCMS(configWithoutLogLevel);
            expect(cms.getLogLevel()).toBe("error");
        });

        it("should normalize false to fatal", () => {
            const cms = new StreamlinedCMS({ ...config, logLevel: false });
            expect(cms.getLogLevel()).toBe("fatal");
        });

        it("should normalize null to fatal", () => {
            const cms = new StreamlinedCMS({ ...config, logLevel: null });
            expect(cms.getLogLevel()).toBe("fatal");
        });

        it("should support all log levels", () => {
            const levels = ["fatal", "error", "warn", "info", "debug"] as const;

            levels.forEach((level) => {
                const cms = new StreamlinedCMS({ ...config, logLevel: level });
                expect(cms.getLogLevel()).toBe(level);
            });
        });

        it("should log debug messages when debug level set", async () => {
            // Clear the global LOG_LEVEL override so config level takes effect
            localStorage.removeItem("LOG_LEVEL");

            const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

            document.body.innerHTML = '<div data-editable="test">Test</div>';

            const cms = new StreamlinedCMS({ ...config, logLevel: "debug" });

            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
            });

            await cms.init();

            expect(consoleSpy).toHaveBeenCalled();
            // Loganite formats logs as: "timestamp [ context ] LEVEL: message"
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining("StreamlinedCMS"),
                expect.anything()
            );

            consoleSpy.mockRestore();
            // Restore the override for other tests
            localStorage.setItem("LOG_LEVEL", "fatal");
        });

        it("should not log when log level is none", async () => {
            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

            document.body.innerHTML = '<div data-editable="test">Test</div>';

            const cms = new StreamlinedCMS({ ...config, logLevel: "fatal" });

            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
            });

            await cms.init();

            // With logLevel 'none', no logs should appear
            // Loganite uses console.log for all levels
            const streamlinedLogs = consoleLogSpy.mock.calls.filter(
                (call) => call[0]?.toString().includes("StreamlinedCMS")
            );
            expect(streamlinedLogs.length).toBe(0);

            consoleLogSpy.mockRestore();
        });

        it("should log warning when domain is not whitelisted (403)", async () => {
            // Clear override so config level takes effect
            localStorage.removeItem("LOG_LEVEL");

            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

            document.body.innerHTML = '<div data-editable="test">Test</div>';

            const cms = new StreamlinedCMS({ ...config, logLevel: "warn" });

            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 403,
            });

            await cms.init();

            const warnLogs = consoleLogSpy.mock.calls.filter(
                (call) => call[0]?.toString().includes("WARN")
            );
            expect(warnLogs.length).toBeGreaterThan(0);

            consoleLogSpy.mockRestore();
            localStorage.setItem("LOG_LEVEL", "fatal");
        });

        it("should log warning when content load fails", async () => {
            // Clear override so config level takes effect
            localStorage.removeItem("LOG_LEVEL");

            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

            document.body.innerHTML = '<div data-editable="test">Test</div>';

            const cms = new StreamlinedCMS({ ...config, logLevel: "warn" });

            global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

            await cms.init();

            const warnLogs = consoleLogSpy.mock.calls.filter(
                (call) => call[0]?.toString().includes("WARN")
            );
            expect(warnLogs.length).toBeGreaterThan(0);

            consoleLogSpy.mockRestore();
            localStorage.setItem("LOG_LEVEL", "fatal");
        });

        it("should log error when save fails", async () => {
            // Clear override so config level takes effect
            localStorage.removeItem("LOG_LEVEL");

            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
            // Mock alert to prevent jsdom errors
            vi.spyOn(window, "alert").mockImplementation(() => {});

            document.body.innerHTML = '<div data-editable="test">Test content</div>';

            const cms = new StreamlinedCMS({ ...config, logLevel: "error" });

            let fetchCalls = 0;
            global.fetch = vi.fn(() => {
                fetchCalls++;
                if (fetchCalls === 1) {
                    return Promise.resolve({ ok: false, status: 404 });
                }
                // Save fails
                return Promise.reject(new Error("Save failed"));
            });

            await cms.init();

            const element = document.querySelector('[data-editable="test"]') as HTMLElement;
            element.click();

            const saveButton = document.getElementById("streamlined-save-btn") as HTMLButtonElement;
            saveButton.click();

            // Wait for async save
            await new Promise((resolve) => setTimeout(resolve, 100));

            const errorLogs = consoleLogSpy.mock.calls.filter(
                (call) => call[0]?.toString().includes("ERROR")
            );
            expect(errorLogs.length).toBeGreaterThan(0);

            consoleLogSpy.mockRestore();
            localStorage.setItem("LOG_LEVEL", "fatal");
        });
    });

    describe("saving", () => {
        it("should handle API error response during save", async () => {
            // Clear override so config level takes effect
            localStorage.removeItem("LOG_LEVEL");

            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
            vi.spyOn(window, "alert").mockImplementation(() => {});

            document.body.innerHTML = '<div data-editable="test">Test content</div>';

            const cms = new StreamlinedCMS({ ...config, logLevel: "error" });

            let fetchCalls = 0;
            global.fetch = vi.fn(() => {
                fetchCalls++;
                if (fetchCalls === 1) {
                    return Promise.resolve({ ok: false, status: 404 });
                }
                // Save returns non-OK response - throw happens before json is called
                return Promise.resolve({
                    ok: false,
                    status: 500,
                    statusText: "Internal Server Error",
                    json: () => Promise.resolve({}),
                });
            });

            await cms.init();

            const element = document.querySelector('[data-editable="test"]') as HTMLElement;
            element.click();

            const saveButton = document.getElementById("streamlined-save-btn") as HTMLButtonElement;
            saveButton.click();

            await new Promise((resolve) => setTimeout(resolve, 100));

            const errorLogs = consoleLogSpy.mock.calls.filter(
                (call) => call[0]?.toString().includes("ERROR")
            );
            expect(errorLogs.length).toBeGreaterThan(0);

            consoleLogSpy.mockRestore();
            localStorage.setItem("LOG_LEVEL", "fatal");
        });

        it("should show success and stop editing after save", async () => {
            document.body.innerHTML = '<div data-editable="test">Updated content</div>';

            const cms = new StreamlinedCMS(config);

            let fetchCalls = 0;
            global.fetch = vi.fn(() => {
                fetchCalls++;
                if (fetchCalls === 1) {
                    return Promise.resolve({ ok: false, status: 404 });
                }
                // Successful save
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        appId: "test-app",
                        elementId: "test",
                        content: "Updated content",
                        updatedAt: new Date().toISOString(),
                    }),
                });
            });

            await cms.init();

            const element = document.querySelector('[data-editable="test"]') as HTMLElement;
            element.click();

            const saveButton = document.getElementById("streamlined-save-btn") as HTMLButtonElement;
            saveButton.click();

            // Wait for save
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(saveButton.textContent).toBe("Saved!");

            // Wait for setTimeout to call stopEditing
            await new Promise((resolve) => setTimeout(resolve, 1100));

            // Button should be removed after stopEditing
            expect(document.getElementById("streamlined-save-btn")).toBeNull();
            expect(element.getAttribute("contenteditable")).toBe("false");
        });

        it("should send PUT request when saving", async () => {
            document.body.innerHTML = '<div data-editable="test">Updated content</div>';

            const cms = new StreamlinedCMS(config);

            let fetchCalls = 0;
            global.fetch = vi.fn((url: string, options?: any) => {
                fetchCalls++;

                // First call is loading content
                if (fetchCalls === 1) {
                    return Promise.resolve({
                        ok: false,
                        status: 404,
                    });
                }

                // Second call is saving
                expect(url).toBe("http://localhost:8787/apps/test-app/content/test");
                expect(options?.method).toBe("PUT");

                const body = JSON.parse(options?.body);
                expect(body.content).toBe("Updated content");
                expect(body.updatedBy).toBe("test-user");

                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        appId: "test-app",
                        elementId: "test",
                        content: "Updated content",
                        updatedAt: new Date().toISOString(),
                        updatedBy: "test-user",
                    }),
                });
            });

            await cms.init();

            const element = document.querySelector('[data-editable="test"]') as HTMLElement;
            element.click();

            const saveButton = document.getElementById("streamlined-save-btn") as HTMLButtonElement;
            saveButton.click();

            // Wait for async save
            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(fetchCalls).toBe(2);
        });
    });
});
