import { createServer, Server, IncomingMessage, ServerResponse } from "http";
import { readFile } from "fs/promises";
import { join, extname } from "path";
import type { Socket } from "net";
import getPort from "get-port";

interface ContentElement {
    content: string;
    updatedAt: string;
}

interface TriggerError {
    status: number;
    message: string;
}

/**
 * Error triggers that can be embedded in content to simulate server errors.
 * When the server sees content containing these strings, it returns the corresponding error.
 */
const ERROR_TRIGGERS: Record<string, TriggerError> = {
    "__TRIGGER_500__": { status: 500, message: "Internal Server Error" },
    "__TRIGGER_401__": { status: 401, message: "Unauthorized" },
    "__TRIGGER_403__": { status: 403, message: "Forbidden" },
    "__TRIGGER_404__": { status: 404, message: "Not Found" },
    "__TRIGGER_429__": { status: 429, message: "Too Many Requests" },
};

/**
 * Check if a string contains an error trigger and return the corresponding error.
 * This function can be used by any endpoint to check for triggers in request content.
 * @param content - The content string to check
 * @returns The error to return, or null if no trigger found
 */
function checkForErrorTrigger(content: string): TriggerError | null {
    for (const [trigger, error] of Object.entries(ERROR_TRIGGERS)) {
        if (content.includes(trigger)) {
            return error;
        }
    }
    return null;
}

/**
 * Check if any value in an object (recursively) contains an error trigger.
 * Useful for checking request bodies with nested content.
 * @param obj - The object to search
 * @returns The error to return, or null if no trigger found
 */
function checkObjectForErrorTrigger(obj: unknown): TriggerError | null {
    if (typeof obj === "string") {
        return checkForErrorTrigger(obj);
    }
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const error = checkObjectForErrorTrigger(item);
            if (error) return error;
        }
    }
    if (obj && typeof obj === "object") {
        for (const value of Object.values(obj)) {
            const error = checkObjectForErrorTrigger(value);
            if (error) return error;
        }
    }
    return null;
}

/**
 * Simple HTTP server for browser tests
 * Serves test fixtures, the built SDK, and mock API endpoints
 */
export class TestServer {
    private server: Server | null = null;
    private port: number | null = null;
    private connections: Set<Socket> = new Set();
    // In-memory storage for content during tests
    private contentStore: Map<string, ContentElement> = new Map();
    // Set of API keys that should be rejected with 401
    private invalidApiKeys: Set<string> = new Set();

    constructor(private preferredPort?: number) {
        // If preferredPort is specified, we'll use it; otherwise use getPort()
    }

    /**
     * Mark an API key as invalid (will return 401 on authenticated requests)
     */
    setInvalidApiKey(apiKey: string): void {
        this.invalidApiKeys.add(apiKey);
    }

    /**
     * Clear all invalid API keys
     */
    clearInvalidApiKeys(): void {
        this.invalidApiKeys.clear();
    }

    /**
     * Check if a request has an invalid API key
     * Returns true if the key is invalid and response was sent
     */
    private checkAuthAndReject(req: IncomingMessage, res: ServerResponse): boolean {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith("Bearer ")) {
            const apiKey = authHeader.slice(7);
            if (this.invalidApiKeys.has(apiKey)) {
                res.writeHead(401, {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                });
                res.end(JSON.stringify({ error: "Invalid API key" }));
                return true;
            }
        }
        return false;
    }

    /**
     * Set content directly for testing (bypasses API)
     * @param appId - The app ID
     * @param elementId - The element ID (use "groupId:elementId" for grouped elements)
     * @param content - The content string (can be JSON for typed content)
     */
    setContent(appId: string, elementId: string, content: string): void {
        const key = `${appId}:${elementId}`;
        this.contentStore.set(key, {
            content,
            updatedAt: new Date().toISOString(),
        });
    }

    /**
     * Clear all stored content
     */
    clearContent(): void {
        this.contentStore.clear();
    }

    /**
     * Handle test configuration endpoints (for browser-based tests)
     * These endpoints allow tests running in the browser to configure the server
     */
    private async handleTestRequest(
        req: IncomingMessage,
        res: ServerResponse,
        pathname: string,
    ): Promise<boolean> {
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };

        // Handle CORS preflight
        if (req.method === "OPTIONS") {
            res.writeHead(204, corsHeaders);
            res.end();
            return true;
        }

        // GET /test/config - Get server configuration (for browser tests to discover URL)
        if (pathname === "/test/config" && req.method === "GET") {
            res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
            res.end(JSON.stringify({ url: `http://localhost:${this.port}` }));
            return true;
        }

        // POST /test/content - Set content for an element
        if (pathname === "/test/content" && req.method === "POST") {
            const body = await this.readBody(req);
            const { appId, elementId, content } = JSON.parse(body);
            this.setContent(appId, elementId, content);
            res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true }));
            return true;
        }

        // DELETE /test/content - Clear all content
        if (pathname === "/test/content" && req.method === "DELETE") {
            this.clearContent();
            res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true }));
            return true;
        }

        // POST /test/invalid-api-key - Mark an API key as invalid
        if (pathname === "/test/invalid-api-key" && req.method === "POST") {
            const body = await this.readBody(req);
            const { apiKey } = JSON.parse(body);
            this.setInvalidApiKey(apiKey);
            res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true }));
            return true;
        }

        // DELETE /test/invalid-api-keys - Clear all invalid API keys
        if (pathname === "/test/invalid-api-keys" && req.method === "DELETE") {
            this.clearInvalidApiKeys();
            res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true }));
            return true;
        }

        return false;
    }

    private async handleApiRequest(
        req: IncomingMessage,
        res: ServerResponse,
        pathname: string,
    ): Promise<boolean> {
        // Handle CORS preflight for all API routes
        if (req.method === "OPTIONS") {
            res.writeHead(204, {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, HEAD, PUT, PATCH, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
            });
            res.end();
            return true;
        }

        // Match: /apps/{appId}/keys/@me (GET) - API key validation endpoint
        const keysMeMatch = pathname.match(/^\/apps\/([^/]+)\/keys\/@me$/);
        if (keysMeMatch && req.method === "GET") {
            // Check for invalid API key
            if (this.checkAuthAndReject(req, res)) {
                return true;
            }

            // Return mock key info for valid keys
            const authHeader = req.headers.authorization;
            const apiKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

            if (!apiKey) {
                res.writeHead(401, {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                });
                res.end(JSON.stringify({ error: "API key required" }));
                return true;
            }

            // Return mock key info
            res.writeHead(200, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            });
            res.end(
                JSON.stringify({
                    id: "test-key-id",
                    userId: "test-user-id",
                    createdAt: new Date().toISOString(),
                    lastUsedAt: new Date().toISOString(),
                }),
            );
            return true;
        }

        // Match: /apps/{appId}/content (GET, HEAD, or PATCH)
        const contentListMatch = pathname.match(/^\/apps\/([^/]+)\/content$/);
        if (contentListMatch && (req.method === "GET" || req.method === "HEAD" || req.method === "PATCH")) {
            // Check for invalid API key (used for auth validation)
            if (this.checkAuthAndReject(req, res)) {
                return true;
            }

            const appId = contentListMatch[1];

            // HEAD request - just return 200 to validate auth
            if (req.method === "HEAD") {
                res.writeHead(200, {
                    "Access-Control-Allow-Origin": "*",
                });
                res.end();
                return true;
            }

            // PATCH request - batch update
            if (req.method === "PATCH") {
                const body = await this.readBody(req);
                const data = JSON.parse(body) as {
                    elements?: Record<string, { content: string } | null>;
                    groups?: Record<string, { elements: Record<string, { content: string } | null> }>;
                };

                // Check for error triggers in the request content
                const triggerError = checkObjectForErrorTrigger(data);
                if (triggerError) {
                    res.writeHead(triggerError.status, {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                    });
                    res.end(JSON.stringify({ error: triggerError.message }));
                    return true;
                }

                const responseElements: Record<string, ContentElement> = {};
                const responseGroups: Record<string, { elements: Record<string, ContentElement> }> = {};
                const deletedElements: string[] = [];
                const deletedGroups: Record<string, string[]> = {};

                // Process ungrouped elements
                if (data.elements) {
                    for (const [elementId, value] of Object.entries(data.elements)) {
                        const key = `${appId}:${elementId}`;
                        if (value === null) {
                            // Delete
                            this.contentStore.delete(key);
                            deletedElements.push(elementId);
                        } else {
                            // Create/update
                            const element: ContentElement = {
                                content: value.content,
                                updatedAt: new Date().toISOString(),
                            };
                            this.contentStore.set(key, element);
                            responseElements[elementId] = element;
                        }
                    }
                }

                // Process grouped elements
                if (data.groups) {
                    for (const [groupId, group] of Object.entries(data.groups)) {
                        for (const [elementId, value] of Object.entries(group.elements)) {
                            const key = `${appId}:${groupId}:${elementId}`;
                            if (value === null) {
                                // Delete
                                this.contentStore.delete(key);
                                if (!deletedGroups[groupId]) {
                                    deletedGroups[groupId] = [];
                                }
                                deletedGroups[groupId].push(elementId);
                            } else {
                                // Create/update
                                const element: ContentElement = {
                                    content: value.content,
                                    updatedAt: new Date().toISOString(),
                                };
                                this.contentStore.set(key, element);
                                if (!responseGroups[groupId]) {
                                    responseGroups[groupId] = { elements: {} };
                                }
                                responseGroups[groupId].elements[elementId] = element;
                            }
                        }
                    }
                }

                res.writeHead(200, {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                });
                res.end(JSON.stringify({
                    elements: responseElements,
                    groups: responseGroups,
                    deleted: {
                        elements: deletedElements,
                        groups: deletedGroups,
                    },
                }));
                return true;
            }

            // GET request - Build key-value response format: { elements: {...}, groups: {...} }
            const elements: Record<string, ContentElement> = {};
            const groups: Record<string, { elements: Record<string, ContentElement> }> = {};

            for (const [key, element] of this.contentStore.entries()) {
                if (!key.startsWith(`${appId}:`)) continue;

                const rest = key.slice(appId.length + 1); // Remove "appId:"
                if (rest.includes(":")) {
                    // Grouped: appId:groupId:elementId
                    const [groupId, elementId] = rest.split(":");
                    if (!groups[groupId]) {
                        groups[groupId] = { elements: {} };
                    }
                    groups[groupId].elements[elementId] = element;
                } else {
                    // Ungrouped: appId:elementId
                    elements[rest] = element;
                }
            }

            res.writeHead(200, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            });
            res.end(JSON.stringify({ elements, groups }));
            return true;
        }

        // Match: /apps/{appId}/content/elements/{elementId} (ungrouped)
        const ungroupedMatch = pathname.match(/^\/apps\/([^/]+)\/content\/elements\/([^/]+)$/);
        if (ungroupedMatch) {
            const appId = ungroupedMatch[1];
            const elementId = ungroupedMatch[2];
            const key = `${appId}:${elementId}`;

            // GET content
            if (req.method === "GET") {
                const element = this.contentStore.get(key);
                if (element) {
                    res.writeHead(200, {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                    });
                    res.end(JSON.stringify({ elementId, ...element }));
                } else {
                    res.writeHead(404, {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                    });
                    res.end(JSON.stringify({ error: "Not found" }));
                }
                return true;
            }

            // PUT content
            if (req.method === "PUT") {
                const body = await this.readBody(req);
                const data = JSON.parse(body);
                const element: ContentElement = {
                    content: data.content,
                    updatedAt: new Date().toISOString(),
                };
                this.contentStore.set(key, element);
                res.writeHead(201, {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                });
                res.end(JSON.stringify({ elementId, ...element }));
                return true;
            }
        }

        // Match: /apps/{appId}/content/groups/{groupId}/elements/{elementId} (grouped)
        const groupedMatch = pathname.match(
            /^\/apps\/([^/]+)\/content\/groups\/([^/]+)\/elements\/([^/]+)$/,
        );
        if (groupedMatch) {
            const appId = groupedMatch[1];
            const groupId = groupedMatch[2];
            const elementId = groupedMatch[3];
            const key = `${appId}:${groupId}:${elementId}`;

            // GET content
            if (req.method === "GET") {
                const element = this.contentStore.get(key);
                if (element) {
                    res.writeHead(200, {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                    });
                    res.end(JSON.stringify({ elementId, ...element }));
                } else {
                    res.writeHead(404, {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                    });
                    res.end(JSON.stringify({ error: "Not found" }));
                }
                return true;
            }

            // PUT content
            if (req.method === "PUT") {
                const body = await this.readBody(req);
                const data = JSON.parse(body);
                const element: ContentElement = {
                    content: data.content,
                    updatedAt: new Date().toISOString(),
                };
                this.contentStore.set(key, element);
                res.writeHead(201, {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                });
                res.end(JSON.stringify({ elementId, ...element }));
                return true;
            }
        }

        return false;
    }

    private readBody(req: IncomingMessage): Promise<string> {
        return new Promise((resolve, reject) => {
            let body = "";
            req.on("data", (chunk) => (body += chunk));
            req.on("end", () => resolve(body));
            req.on("error", reject);
        });
    }

    async start(): Promise<void> {
        // Use preferred port if specified, otherwise find any available port
        this.port = this.preferredPort ?? await getPort();

        return new Promise((resolve, reject) => {
            this.server = createServer(async (req, res) => {
                try {
                    const url = new URL(req.url || "/", `http://localhost:${this.port}`);
                    const pathname = url.pathname;

                    // Handle test configuration endpoints (for browser-based tests)
                    if (pathname.startsWith("/test/")) {
                        const handled = await this.handleTestRequest(req, res, pathname);
                        if (handled) return;
                    }

                    // Handle API requests (strip /v1 prefix like the real worker)
                    if (pathname.startsWith("/v1/")) {
                        const strippedPath = pathname.slice(3); // Remove "/v1"
                        const handled = await this.handleApiRequest(req, res, strippedPath);
                        if (handled) return;
                    }

                    let filePath: string;

                    // Serve dist files
                    if (pathname.startsWith("/dist/")) {
                        filePath = join(process.cwd(), pathname);
                    }
                    // Serve test fixtures (with template substitution)
                    else if (pathname === "/" || pathname === "/index.html") {
                        const htmlPath = join(
                            process.cwd(),
                            "tests/browser/support/fixtures/test-page.html",
                        );
                        let html = await readFile(htmlPath, "utf-8");
                        // Replace template placeholder with actual API URL
                        html = html.replace("{{API_URL}}", `http://localhost:${this.port}/v1`);
                        res.writeHead(200, { "Content-Type": "text/html" });
                        res.end(html);
                        return;
                    }
                    // Auth test page (no mock auth)
                    else if (pathname === "/auth-test.html") {
                        const htmlPath = join(
                            process.cwd(),
                            "tests/browser/support/fixtures/test-page-no-mock-auth.html",
                        );
                        let html = await readFile(htmlPath, "utf-8");
                        html = html.replace("{{API_URL}}", `http://localhost:${this.port}/v1`);
                        res.writeHead(200, { "Content-Type": "text/html" });
                        res.end(html);
                        return;
                    } else {
                        res.writeHead(404);
                        res.end("Not found");
                        return;
                    }

                    // Read and serve the file
                    const content = await readFile(filePath);
                    const ext = extname(filePath);

                    // Set content type
                    const contentTypes: Record<string, string> = {
                        ".html": "text/html",
                        ".js": "application/javascript",
                        ".css": "text/css",
                        ".json": "application/json",
                        ".map": "application/json",
                    };

                    const contentType = contentTypes[ext] || "text/plain";
                    res.writeHead(200, { "Content-Type": contentType });
                    res.end(content);
                } catch (error) {
                    res.writeHead(404);
                    res.end("Not found");
                }
            });

            // Track connections so we can force-close them on stop
            this.server.on("connection", (socket: Socket) => {
                this.connections.add(socket);
                socket.on("close", () => {
                    this.connections.delete(socket);
                });
            });

            this.server.listen(this.port, () => {
                resolve();
            });

            this.server.on("error", reject);
        });
    }

    async stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.server) {
                // Force close all existing connections
                for (const socket of this.connections) {
                    socket.destroy();
                }
                this.connections.clear();

                this.server.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }

    getUrl(): string {
        if (!this.port) {
            throw new Error("Server not started - call start() first");
        }
        return `http://localhost:${this.port}`;
    }

    getPort(): number {
        if (!this.port) {
            throw new Error("Server not started - call start() first");
        }
        return this.port;
    }
}
