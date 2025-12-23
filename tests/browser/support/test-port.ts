/**
 * Shared test server port via file.
 * Config writes the port, globalSetup reads it.
 * File-based because Vitest loads config and globalSetup in different module contexts.
 */
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";

const PORT_FILE = join(process.cwd(), "tests/browser/.test-server-port");

export function setPort(port: number): void {
    writeFileSync(PORT_FILE, String(port));
}

export function getPort(): number {
    if (!existsSync(PORT_FILE)) {
        throw new Error("Test server port file not found. Config must run before globalSetup.");
    }
    return parseInt(readFileSync(PORT_FILE, "utf-8"), 10);
}

export function cleanupPortFile(): void {
    if (existsSync(PORT_FILE)) {
        unlinkSync(PORT_FILE);
    }
}
