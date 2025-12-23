/**
 * Global setup for browser tests.
 * Starts the TestServer before any tests run.
 * Port is set by vitest.browser.config.ts via shared module.
 */
import { TestServer } from "./server.js";
import { getPort, cleanupPortFile } from "./test-port.js";

let server: TestServer | null = null;

/**
 * Check if a server is already running on the port
 */
async function isPortInUse(p: number): Promise<boolean> {
    try {
        const response = await fetch(`http://localhost:${p}/test/config`);
        return response.ok;
    } catch {
        return false;
    }
}

export async function setup(): Promise<void> {
    const port = getPort();
    const serverUrl = `http://localhost:${port}`;

    // Check if server is already running (from a previous interrupted run)
    if (await isPortInUse(port)) {
        console.log(`\n  Test server already running at ${serverUrl} (reusing)\n`);
        return;
    }

    // Prevent double initialization within this process
    if (server) {
        console.log("\n  Test server already initialized in this process\n");
        return;
    }

    server = new TestServer(port);
    await server.start();

    console.log(`\n  Test server started at ${serverUrl}\n`);
}

export async function teardown(): Promise<void> {
    if (server) {
        await server.stop();
        server = null;
        console.log("\n  Test server stopped\n");
    }
    cleanupPortFile();
}
