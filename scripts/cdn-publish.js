#!/usr/bin/env node

/**
 * Update KV version aliases for the CDN.
 *
 * For stable versions (e.g., 1.2.3):
 *   - "latest" -> current version
 *   - "<major>" -> current version (e.g., "1")
 *   - "<major>.<minor>" -> current version (e.g., "1.2")
 *
 * For prerelease versions (e.g., 1.0.0-beta.0):
 *   - "<type>" -> current version (e.g., "beta")
 *   - "<base>-<type>" -> current version (e.g., "1.0.0-beta")
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
// --no-alias skips alias updates (for release branch testing)
const noAlias = flags.has("--no-alias");

if (!["staging", "production"].includes(environment)) {
    console.error("Usage: node scripts/cdn-publish.js <staging|production> [options]");
    console.error("  --yes            Skip confirmation prompts");
    console.error("  --ci             Same as --yes (for CI pipelines)");
    console.error("  --version=X.Y.Z  Override version (e.g., 0.1.22-dev.20260110143052)");
    console.error("  --no-alias       Only publish exact version, skip alias updates");
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

// Parse version to detect prerelease
// Examples: "1.2.3" (stable), "1.0.0-beta.0" (prerelease), "1.0.0-rc.1" (prerelease)
const prereleaseMatch = version.match(/^(\d+\.\d+\.\d+)-([a-z]+)\.(\d+)$/i);
const isPrerelease = prereleaseMatch !== null;
const baseVersion = prereleaseMatch ? prereleaseMatch[1] : version.split("-")[0];
const prereleaseType = prereleaseMatch ? prereleaseMatch[2] : null; // "beta", "rc", "alpha"
const [major, minor] = baseVersion.split(".");

// Asset collection name for KV key prefixing
const collection = "client-sdk";

// KV entries to write:
// - Exact version marker ("_") to mark version as published
// - Aliases pointing to the version (unless --no-alias)
const VERSION_MARKER = "_";
const kvEntries = [[version, VERSION_MARKER]]; // Always include version marker

if (!noAlias) {
    if (isPrerelease) {
        // Prerelease aliases: "beta" and "1.0.0-beta"
        kvEntries.push(
            [prereleaseType, version], // e.g., "beta" -> "1.0.0-beta.0"
            [`${baseVersion}-${prereleaseType}`, version], // e.g., "1.0.0-beta" -> "1.0.0-beta.0"
        );
    } else {
        // Stable aliases: "latest", "1", "1.2"
        kvEntries.push(["latest", version], [major, version], [`${major}.${minor}`, version]);
    }
}

const versionType = isPrerelease ? `prerelease (${prereleaseType})` : "stable";
console.log(`Publishing SDK v${version} to ${environment} [${versionType}]:\n`);

console.log(`  Version marker:`);
console.log(`    "${collection}/${version}" -> "${VERSION_MARKER}" (marks version as published)\n`);

if (noAlias) {
    console.log(`  Aliases: (skipped due to --no-alias)\n`);
} else {
    const aliasType = isPrerelease ? "Prerelease aliases" : "Stable aliases";
    console.log(`  ${aliasType}:`);
    const aliases = kvEntries.slice(1);
    const maxKeyLen = Math.max(...aliases.map(([alias]) => `${collection}/${alias}`.length));
    for (const [alias, targetVersion] of aliases) {
        const key = `${collection}/${alias}`;
        console.log(`    "${key}"${" ".repeat(maxKeyLen - key.length)} -> "${targetVersion}"`);
    }
    if (isPrerelease) {
        console.log(
            `\n  Note: Stable aliases (latest, ${major}, ${major}.${minor}) are NOT updated.`,
        );
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
} else if (isPrerelease) {
    console.log(
        `\nPublish complete. SDK v${version} is now available for ${prereleaseType} testing.`,
    );
    console.log(`\nTest URLs:`);
    console.log(`  https://${cdnDomain}/${collection}/v${version}/streamlined-cms.min.js`);
    console.log(`  https://${cdnDomain}/${collection}/${prereleaseType}/streamlined-cms.min.js`);
    console.log(
        `  https://${cdnDomain}/${collection}/${baseVersion}-${prereleaseType}/streamlined-cms.min.js`,
    );
} else {
    console.log(`\nPublish complete. SDK v${version} is now live.`);
    console.log(`\nTest URLs:`);
    console.log(`  https://${cdnDomain}/${collection}/v${version}/streamlined-cms.min.js`);
    console.log(`  https://${cdnDomain}/${collection}/v${major}.${minor}/streamlined-cms.min.js`);
    console.log(`  https://${cdnDomain}/${collection}/versions.json`);
}
