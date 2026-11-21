#!/usr/bin/env node

/**
 * Update KV version aliases for the CDN.
 *
 * By default it updates the stable aliases:
 *   - "latest" -> current version
 *   - "<major>" -> current version (e.g., "1")
 *   - "<major>.<minor>" -> current version (e.g., "1.2")
 *
 * --alias=<name> updates only that alias instead (e.g. "1.5.0-beta" for a
 * release branch build), and --no-alias updates none.
 *
 * In production, a version with a prerelease suffix (anything after a "-")
 * must use --no-alias or an --alias that is itself a prerelease alias
 * (containing a "-"), so a prerelease build can never move the stable aliases.
 * Staging's -dev builds still update its stable aliases.
 *
 * Usage: node scripts/cdn-publish.js <staging|production> [options]
 */

import { execSync } from "child_process";
import { readFileSync } from "fs";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

const packageJson = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));

const args = process.argv.slice(2);
const environment = args.find((arg) => !arg.startsWith("--"));
const flags = new Set(args.filter((arg) => arg.startsWith("--") && !arg.includes("=")));

// Parse --version=X.Y.Z option
const versionArg = args.find((arg) => arg.startsWith("--version="));
const versionOverride = versionArg ? versionArg.split("=")[1] : null;

// --ci implies --yes (used in CI pipelines)
const skipPrompts = flags.has("--yes") || flags.has("--ci");
// --no-alias skips alias updates
const noAlias = flags.has("--no-alias");
// --alias=<name> updates only that alias (e.g. "1.5.0-beta")
const aliasArg = args.find((arg) => arg.startsWith("--alias="));
const aliasOverride = aliasArg ? aliasArg.split("=")[1] : null;

if (!["staging", "production"].includes(environment)) {
    console.error("Usage: node scripts/cdn-publish.js <staging|production> [options]");
    console.error("  --yes            Skip confirmation prompts");
    console.error("  --ci             Same as --yes (for CI pipelines)");
    console.error("  --version=X.Y.Z  Override version (e.g., 0.1.22-dev.20260110143052)");
    console.error("  --no-alias       Only publish exact version, skip alias updates");
    console.error("  --alias=NAME     Update only this alias (e.g., 1.5.0-beta)");
    process.exit(1);
}

const namespaceId =
    environment === "staging"
        ? process.env.KV_NAMESPACE_STAGING
        : process.env.KV_NAMESPACE_PRODUCTION;

if (!namespaceId) {
    const envVar = environment === "staging" ? "KV_NAMESPACE_STAGING" : "KV_NAMESPACE_PRODUCTION";
    console.error(`Error: ${envVar} not set in .env`);
    process.exit(1);
}

const version = versionOverride || packageJson.version;

const isPrerelease = version.includes("-");
const [major, minor] = version.split("-")[0].split(".");

if (aliasArg && !aliasOverride) {
    console.error("Error: --alias needs a name, e.g. --alias=1.5.0-beta");
    process.exit(1);
}
if (noAlias && aliasOverride) {
    console.error("Error: use either --alias or --no-alias, not both");
    process.exit(1);
}
if (environment === "production" && isPrerelease && aliasOverride && !aliasOverride.includes("-")) {
    console.error(
        `Error: ${version} is a prerelease; in production its alias must be a prerelease alias ` +
            `(e.g. ${version.split("-")[0]}-beta), not "${aliasOverride}"`,
    );
    process.exit(1);
}
if (environment === "production" && isPrerelease && !noAlias && !aliasOverride) {
    console.error(
        `Error: ${version} is a prerelease; in production it needs --alias=<name> or --no-alias, ` +
            `so it can't move the stable aliases (latest, ${major}, ${major}.${minor})`,
    );
    process.exit(1);
}

// Asset collection name for KV key prefixing
const collection = "client-sdk";

// KV entries to write:
// - Exact version marker ("_") to mark version as published
// - Aliases pointing to the version (unless --no-alias)
const VERSION_MARKER = "_";
const kvEntries = [[version, VERSION_MARKER]]; // Always include version marker

if (aliasOverride) {
    kvEntries.push([aliasOverride, version]);
} else if (!noAlias) {
    // Stable aliases: "latest", "1", "1.2"
    kvEntries.push(["latest", version], [major, version], [`${major}.${minor}`, version]);
}

console.log(`Publishing SDK v${version} to ${environment}:\n`);

console.log(`  Version marker:`);
console.log(`    "${collection}/${version}" -> "${VERSION_MARKER}" (marks version as published)\n`);

if (noAlias) {
    console.log(`  Aliases: (skipped due to --no-alias)\n`);
} else {
    console.log(aliasOverride ? `  Alias:` : `  Stable aliases:`);
    const aliases = kvEntries.slice(1);
    const maxKeyLen = Math.max(...aliases.map(([alias]) => `${collection}/${alias}`.length));
    for (const [alias, targetVersion] of aliases) {
        const key = `${collection}/${alias}`;
        console.log(`    "${key}"${" ".repeat(maxKeyLen - key.length)} -> "${targetVersion}"`);
    }
}

if (!skipPrompts) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve) => {
        rl.question(`\nProceed? (yes/N): `, resolve);
    });
    rl.close();
    if (answer.toLowerCase() !== "yes") {
        console.log("Aborted.");
        process.exit(0);
    }
}

console.log();

for (const [key, value] of kvEntries) {
    const kvKey = `${collection}/${key}`;
    try {
        execSync(
            `npx wrangler kv key put --namespace-id="${namespaceId}" --remote "${kvKey}" "${value}"`,
            { stdio: "inherit" },
        );
    } catch (error) {
        console.error(`\nFailed to set "${kvKey}"`);
        process.exit(1);
    }
}

const cdnDomain =
    environment === "staging" ? "cdn.staging.streamlinedcms.com" : "cdn.streamlinedcms.com";

if (noAlias) {
    console.log(`\nPublish complete. SDK v${version} is available (no aliases updated).`);
    console.log(`\nTest URL:`);
    console.log(`  https://${cdnDomain}/${collection}/v${version}/streamlined-cms.min.js`);
} else if (aliasOverride) {
    console.log(`\nPublish complete. SDK v${version} is available as ${aliasOverride}.`);
    console.log(`\nTest URLs:`);
    console.log(`  https://${cdnDomain}/${collection}/v${version}/streamlined-cms.min.js`);
    console.log(`  https://${cdnDomain}/${collection}/v${aliasOverride}/streamlined-cms.min.js`);
} else {
    console.log(`\nPublish complete. SDK v${version} is now live.`);
    console.log(`\nTest URLs:`);
    console.log(`  https://${cdnDomain}/${collection}/v${version}/streamlined-cms.min.js`);
    console.log(`  https://${cdnDomain}/${collection}/v${major}.${minor}/streamlined-cms.min.js`);
    console.log(`  https://${cdnDomain}/${collection}/versions.json`);
}
