import { test, expect, describe, vi, beforeEach, afterEach } from "vitest";
import { ChangeRequestManager } from "../../src/lazy/change-request-manager.js";
import type { EditorState } from "../../src/lazy/state.js";
import type { Logger } from "loganite";

/**
 * Covers the screenshot PUT to the pre-signed R2 URL. The server may return
 * uploadHeaders that are signed into the URL (api#70); the SDK must echo them
 * verbatim — adding or substituting headers would break the signature.
 */
describe("ChangeRequestManager uploadBlob", () => {
    const fetchMock = vi.fn();
    let manager: ChangeRequestManager;

    beforeEach(() => {
        fetchMock.mockReset();
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        manager = new ChangeRequestManager(
            {} as EditorState,
            { warn: vi.fn(), error: vi.fn(), info: vi.fn() } as unknown as Logger,
            { apiUrl: "http://api.test", appUrl: "http://app.test", appId: "app-1" },
            { apiFetch: vi.fn() },
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const uploadBlob = (
        headers: Record<string, string> | undefined,
        blob: Blob,
    ): Promise<void> =>
        // Private method — invoked directly because the public flow requires
        // a real snapdom/canvas capture unavailable in jsdom.
        manager["uploadBlob"]("http://r2.test/signed-put", headers, blob);

    test("echoes server uploadHeaders verbatim on the PUT", async () => {
        const blob = new Blob(["png-bytes"], { type: "image/png" });
        const uploadHeaders = {
            "Content-Type": "image/png",
            "Content-Length": "9",
            "x-amz-checksum-sha256": "3q2+7w==",
        };

        await uploadBlob(uploadHeaders, blob);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("http://r2.test/signed-put");
        expect(init.method).toBe("PUT");
        expect(init.body).toBe(blob);
        // Exactly the signed headers — nothing added, renamed, or dropped.
        expect(init.headers).toEqual(uploadHeaders);
        expect(init.headers).not.toHaveProperty("Authorization");
    });

    test("falls back to Content-Type only when the server sends no uploadHeaders", async () => {
        await uploadBlob(undefined, new Blob(["png-bytes"]));

        const [, init] = fetchMock.mock.calls[0];
        expect(init.headers).toEqual({ "Content-Type": "image/png" });
    });

    test("throws on a non-ok PUT response", async () => {
        fetchMock.mockResolvedValue(
            new Response(null, { status: 403, statusText: "Forbidden" }),
        );

        await expect(uploadBlob(undefined, new Blob(["png-bytes"]))).rejects.toThrow(
            "Screenshot upload failed: 403 Forbidden",
        );
    });
});
