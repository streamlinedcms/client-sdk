#!/usr/bin/env node

/**
 * Update KV version aliases for the CDN.
 *
 * Sets the following aliases for the current package version:
 *   - "latest" -> current version
 *   - "<major>" -> current version (e.g., "0")
 *   - "<major>.<minor>" -> current version (e.g., "0.1")
 *
 * Usage: node scripts/cdn-publish.js <staging|production>
 */

import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { parse as parseToml } from "smol-toml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));

const environment = process.argv[2];

if (!["staging", "production"].includes(environment)) {
    console.error("Usage: node scripts/cdn-publish.js <staging|production>");
    process.exit(1);
}

// Read KV namespace ID from cdn package's wrangler config
const wranglerConfigPath = join(
    __dirname,
    "../../cdn",
    environment === "staging" ? "wrangler.staging.toml" : "wrangler.toml",
);

if (!existsSync(wranglerConfigPath)) {
    console.error(`Error: wrangler config not found at ${wranglerConfigPath}`);
    process.exit(1);
}

const wranglerConfig = parseToml(readFileSync(wranglerConfigPath, "utf-8"));
const namespaceId = wranglerConfig.kv_namespaces?.[0]?.id;

if (!namespaceId) {
    console.error(`Error: KV namespace not configured in ${wranglerConfigPath}`);
    process.exit(1);
}

const version = packageJson.version;
const [major, minor] = version.split(".");

// Asset collection name for KV key prefixing
const collection = "client-sdk";

// KV entries to write:
// - Exact version marker ("_") to mark version as published
// - Aliases pointing to the version
const VERSION_MARKER = "_";
const kvEntries = [
    [version, VERSION_MARKER],  // Exact version marker
    ["latest", version],
    [major, version],
    [`${major}.${minor}`, version],
];

console.log(`Publishing SDK v${version} to ${environment}:\n`);

console.log(`  Version marker:`);
console.log(`    "${collection}/${version}" -> "${VERSION_MARKER}" (marks version as published)\n`);

console.log(`  Aliases:`);
const aliases = kvEntries.slice(1);
const maxKeyLen = Math.max(...aliases.map(([alias]) => `${collection}/${alias}`.length));
for (const [alias, targetVersion] of aliases) {
    const key = `${collection}/${alias}`;
    console.log(`    "${key}"${" ".repeat(maxKeyLen - key.length)} -> "${targetVersion}"`);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await new Promise((resolve) => {
    rl.question(`\nProceed? (yes/N): `, resolve);
});
rl.close();
if (answer.toLowerCase() !== "yes") {
    console.log("Aborted.");
    process.exit(0);
}

console.log();

for (const [key, value] of kvEntries) {
    const kvKey = `${collection}/${key}`;
    try {
        execSync(
            `wrangler kv key put --namespace-id="${namespaceId}" --remote "${kvKey}" "${value}"`,
            { stdio: "inherit" },
        );
    } catch (error) {
        console.error(`\nFailed to set "${kvKey}"`);
        process.exit(1);
    }
}

const cdnDomain =
    environment === "staging" ? "cdn.staging.streamlinedcms.com" : "cdn.streamlinedcms.com";

console.log(`\nPublish complete. SDK v${version} is now live.`);
console.log(`\nTest URLs:`);
console.log(`  https://${cdnDomain}/${collection}/v${version}/streamlined-cms.min.js`);
console.log(`  https://${cdnDomain}/${collection}/v${major}.${minor}/streamlined-cms.min.js`);
console.log(`  https://${cdnDomain}/${collection}/versions.json`);
