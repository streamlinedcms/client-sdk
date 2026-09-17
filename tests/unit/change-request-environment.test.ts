import { test, expect, describe, vi, beforeEach } from "vitest";
import {
    ChangeRequestManager,
    ChangeRequestAccessError,
} from "../../src/lazy/change-request-manager.js";
import type { EditorState } from "../../src/lazy/state.js";
import type { Logger } from "loganite";

/**
 * Covers the passive browser-environment snapshot attached to a change-request
 * draft (issue #94): what gatherEnvironment collects, how fitEnvironment keeps
 * the blob under the API's 8 KB cap, and that createDraft only sends the field
 * when there is one.
 */
describe("ChangeRequestManager environment", () => {
    const apiFetch = vi.fn();
    const log = { warn: vi.fn(), error: vi.fn(), info: vi.fn() } as unknown as Logger;
    let manager: ChangeRequestManager;

    beforeEach(() => {
        apiFetch.mockReset();
        vi.mocked(log.warn).mockReset();
        manager = new ChangeRequestManager(
            {} as EditorState,
            log,
            { apiUrl: "http://api.test", appUrl: "http://app.test", appId: "app-1" },
            { apiFetch, deselect: vi.fn() },
        );
    });

    const gather = (): Record<string, unknown> => manager["gatherEnvironment"]();
    const fit = (
        base: Record<string, unknown>,
        extra: Record<string, unknown> | undefined,
    ): Record<string, unknown> | undefined => manager["fitEnvironment"](base, extra);

    describe("gatherEnvironment", () => {
        test("collects the passive snapshot including the build-time sdkVersion", () => {
            const env = gather();
            expect(env.sdkVersion).toBe("0.0.0-test");
            expect(typeof env.userAgent).toBe("string");
            expect(env.viewport).toEqual({
                width: window.innerWidth,
                height: window.innerHeight,
            });
        });

        test("omits probes that read empty or undefined rather than sending blanks", () => {
            const env = gather();
            for (const value of Object.values(env)) {
                expect(value).not.toBe(undefined);
                expect(value).not.toBe("");
            }
        });
    });

    describe("fitEnvironment", () => {
        test("merges extra over base, with per-call fields winning", () => {
            const merged = fit(
                { userAgent: "ua", sdkVersion: "0.0.0-test" },
                { userAgent: "override", orderId: 7 },
            );
            expect(merged).toEqual({
                userAgent: "override",
                sdkVersion: "0.0.0-test",
                orderId: 7,
            });
        });

        test("drops caller-supplied extra when the full blob exceeds 8 KB, keeping the base", () => {
            const base = { sdkVersion: "0.0.0-test" };
            const merged = fit(base, { big: "x".repeat(9000) });
            expect(merged).toEqual(base);
            expect(log.warn).toHaveBeenCalledWith(
                expect.stringContaining("dropping caller-supplied fields"),
            );
        });

        test("omits the environment entirely when even the base exceeds 8 KB", () => {
            const result = fit({ big: "x".repeat(9000) }, undefined);
            expect(result).toBeUndefined();
            expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("omitting environment"));
        });
    });

    describe("createDraft body", () => {
        const createDraft = (
            pageUrl: string,
            environment?: Record<string, unknown>,
        ): Promise<string> => manager["createDraft"](pageUrl, environment);

        beforeEach(() => {
            apiFetch.mockResolvedValue(
                new Response(JSON.stringify({ id: "draft-1" }), { status: 200 }),
            );
        });

        test("includes environment in the POST body when provided", async () => {
            await createDraft("http://site.test/page", { sdkVersion: "0.0.0-test" });
            const [, init] = apiFetch.mock.calls[0];
            expect(JSON.parse(init.body)).toEqual({
                pageUrl: "http://site.test/page",
                environment: { sdkVersion: "0.0.0-test" },
            });
        });

        test("omits environment from the POST body when absent", async () => {
            await createDraft("http://site.test/page");
            const [, init] = apiFetch.mock.calls[0];
            expect(JSON.parse(init.body)).toEqual({ pageUrl: "http://site.test/page" });
        });

        test("throws a swallowable ChangeRequestAccessError on 402 (banner owns the message)", async () => {
            // The API's plan-limit sentence is surfaced by apiFetch in the
            // warning banner, not here — so createDraft raises a typed access
            // error the flow ignores rather than a second, conflicting message.
            apiFetch.mockResolvedValue(
                new Response(
                    JSON.stringify({
                        error: "This app has reached its limit of stored change requests.",
                        code: "stored_request_limit_reached",
                    }),
                    { status: 402, statusText: "Payment Required" },
                ),
            );

            await expect(createDraft("http://site.test/page")).rejects.toBeInstanceOf(
                ChangeRequestAccessError,
            );
        });

        test("surfaces the API's message for non-access errors (e.g. 400)", async () => {
            apiFetch.mockResolvedValue(
                new Response(JSON.stringify({ error: "pageUrl must be a string" }), {
                    status: 400,
                    statusText: "Bad Request",
                }),
            );

            await expect(createDraft("http://site.test/page")).rejects.toThrow(
                "pageUrl must be a string",
            );
        });

        test("falls back to the status line when the error body isn't our JSON shape", async () => {
            apiFetch.mockResolvedValue(
                new Response("<html>gateway error</html>", {
                    status: 502,
                    statusText: "Bad Gateway",
                }),
            );

            await expect(createDraft("http://site.test/page")).rejects.toThrow(
                "Failed to create draft: 502 Bad Gateway",
            );
        });
    });
});
