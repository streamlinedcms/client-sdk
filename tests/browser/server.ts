import { createServer, Server, IncomingMessage, ServerResponse } from "http";
import { readFile } from "fs/promises";
import { join, extname } from "path";
import getPort from "get-port";

interface ContentElement {
    content: string;
    updatedAt: string;
}

/**
 * Simple HTTP server for browser tests
 * Serves test fixtures, the built SDK, and mock API endpoints
 */
export class TestServer {
    private server: Server | null = null;
    private port: number | null = null;
    // In-memory storage for content during tests
    private contentStore: Map<string, ContentElement> = new Map();

    constructor(_preferredPort?: number) {
        // Preferred port is ignored - we always use getPort()
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

    private async handleApiRequest(
        req: IncomingMessage,
        res: ServerResponse,
        pathname: string,
    ): Promise<boolean> {
        // Handle CORS preflight for all API routes
        if (req.method === "OPTIONS") {
            res.writeHead(204, {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
            });
            res.end();
            return true;
        }

        // Match: /apps/{appId}/content (GET all content)
        const contentListMatch = pathname.match(/^\/apps\/([^/]+)\/content$/);
        if (contentListMatch && req.method === "GET") {
            const appId = contentListMatch[1];
            // Build key-value response format: { elements: {...}, groups: {...} }
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
        const groupedMatch = pathname.match(/^\/apps\/([^/]+)\/content\/groups\/([^/]+)\/elements\/([^/]+)$/);
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
        // Find any available port
        this.port = await getPort();

        return new Promise((resolve, reject) => {
            this.server = createServer(async (req, res) => {
                try {
                    const url = new URL(req.url || "/", `http://localhost:${this.port}`);
                    const pathname = url.pathname;

                    // Handle API requests first
                    if (pathname.startsWith("/apps/")) {
                        const handled = await this.handleApiRequest(req, res, pathname);
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
                            "tests/browser/fixtures/test-page.html",
                        );
                        let html = await readFile(htmlPath, "utf-8");
                        // Replace template placeholder with actual API URL
                        html = html.replace("{{API_URL}}", `http://localhost:${this.port}`);
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

            this.server.listen(this.port, () => {
                resolve();
            });

            this.server.on("error", reject);
        });
    }

    async stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.server) {
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
