#!/usr/bin/env node

/**
 * Purge CDN cache for SDK assets.
 *
 * Interactive script that prompts for what to purge:
 *   - Collection (e.g., client-sdk)
 *   - Scope: everything, specific version, or just manifest
 *
 * Usage: node scripts/cdn-purge.js <staging|production>
 */

import { createInterface } from "readline";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { parse as parseToml } from "smol-toml";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Must match ASSET_COLLECTIONS in cdn worker
const ASSET_COLLECTIONS = {
    "client-sdk": [
        "streamlined-cms.js",
        "streamlined-cms.min.js",
        "streamlined-cms.esm.js",
        "streamlined-cms.esm.min.js",
        "streamlined-cms.js.map",
        "streamlined-cms.min.js.map",
        "streamlined-cms.esm.js.map",
        "streamlined-cms.esm.min.js.map",
    ],
};

const environment = process.argv[2];

if (!["staging", "production"].includes(environment)) {
    console.error("Usage: node scripts/cdn-purge.js <staging|production>");
    process.exit(1);
}

// Read zone ID from cdn package's wrangler config
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
const accountId = wranglerConfig.account_id;

if (!accountId) {
    console.error(`Error: account_id not found in ${wranglerConfigPath}`);
    process.exit(1);
}

// Zone ID for streamlinedcms.com (same for staging subdomain)
const ZONE_ID = "f0ada6cb76674ab6c9a22df2d30ff788";

const cdnDomain =
    environment === "staging" ? "cdn.staging.streamlinedcms.com" : "cdn.streamlinedcms.com";

const rl = createInterface({ input: process.stdin, output: process.stdout });

function prompt(question) {
    return new Promise((resolve) => rl.question(question, resolve));
}

function printOptions(options) {
    options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt}`));
}

async function selectOption(question, options) {
    console.log(`\n${question}`);
    printOptions(options);
    const answer = await prompt(`\nSelect (1-${options.length}): `);
    const index = parseInt(answer, 10) - 1;
    if (index < 0 || index >= options.length) {
        console.error("Invalid selection");
        process.exit(1);
    }
    return index;
}

// Step 1: Select collection
const collections = Object.keys(ASSET_COLLECTIONS);
const collectionIndex = await selectOption("Select collection to purge:", collections);
const collection = collections[collectionIndex];
const files = ASSET_COLLECTIONS[collection];

// Step 2: Select version
const versionOptions = ["Manifest (versions.json)", "Specific version(s)", "All known versions"];
const versionIndex = await selectOption("Select what to purge:", versionOptions);

let urlsToPurge = [];

if (versionIndex === 0) {
    // Manifest only
    urlsToPurge = [`https://${cdnDomain}/${collection}/versions.json`];
} else {
    let versions = [];

    if (versionIndex === 1) {
        // Specific versions
        const input = await prompt("\nEnter version(s), comma-separated (e.g., 0.1.0, 0.1, latest): ");
        versions = input.split(",").map((v) => v.trim()).filter(Boolean);
        if (versions.length === 0) {
            console.error("No versions specified");
            process.exit(1);
        }

        // Check for exact versions (x.y.z) and offer to include related aliases
        const exactVersions = versions.filter((v) => /^\d+\.\d+\.\d+$/.test(v));
        if (exactVersions.length > 0) {
            const relatedAliases = new Set();
            for (const v of exactVersions) {
                const [major, minor] = v.split(".");
                relatedAliases.add("latest");
                relatedAliases.add(major);
                relatedAliases.add(`${major}.${minor}`);
            }
            // Remove any aliases already in versions list
            for (const v of versions) {
                relatedAliases.delete(v);
            }

            if (relatedAliases.size > 0) {
                const aliasesArray = Array.from(relatedAliases).sort();
                const includeAliases = await prompt(
                    `\nInclude related aliases? (${aliasesArray.join(", ")}) (Y/n): `
                );
                if (includeAliases.toLowerCase() !== "n") {
                    versions.push(...aliasesArray);
                }
            }
        }
    } else {
        // All known versions
        versions = ["latest"];

        // Read package.json to get current version for aliases
        const packageJsonPath = join(__dirname, "..", "package.json");
        if (existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
            const [major, minor] = packageJson.version.split(".");
            versions.push(packageJson.version, major, `${major}.${minor}`);
        }
    }

    // Step 3: Select files scope
    const fileOptions = ["All files", "Specific file(s)"];
    const fileIndex = await selectOption("Select files to purge:", fileOptions);

    let filesToPurge = files;

    if (fileIndex === 1) {
        // Specific files
        const input = await prompt(`\nEnter file number(s), comma-separated (1-${files.length}):\n${files.map((f, i) => `  ${i + 1}. ${f}`).join("\n")}\n\nSelection: `);
        const indices = input.split(",").map((s) => parseInt(s.trim(), 10) - 1);
        const invalid = indices.filter((i) => i < 0 || i >= files.length);
        if (invalid.length > 0) {
            console.error("Invalid selection");
            process.exit(1);
        }
        filesToPurge = indices.map((i) => files[i]);
    }

    // Build URLs
    for (const version of versions) {
        const versionPath = version.match(/^\d/) ? `v${version}` : version;
        for (const file of filesToPurge) {
            urlsToPurge.push(`https://${cdnDomain}/${collection}/${versionPath}/${file}`);
        }
    }
}

// Show confirmation
console.log(`\n${"=".repeat(60)}`);
console.log(`PURGE PREVIEW - ${environment.toUpperCase()}`);
console.log(`${"=".repeat(60)}\n`);
console.log(`URLs to purge (${urlsToPurge.length}):\n`);

for (const url of urlsToPurge) {
    console.log(`  ${url}`);
}

console.log();
const confirm = await prompt("Proceed with purge? (yes/N): ");
rl.close();

if (confirm.toLowerCase() !== "yes") {
    console.log("Aborted.");
    process.exit(0);
}

// Execute purge
console.log("\nPurging cache...\n");

// Cloudflare API allows max 30 URLs per request
const BATCH_SIZE = 30;
const batches = [];
for (let i = 0; i < urlsToPurge.length; i += BATCH_SIZE) {
    batches.push(urlsToPurge.slice(i, i + BATCH_SIZE));
}

// Get API token from environment
const apiToken = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;
if (!apiToken) {
    console.error("Error: CLOUDFLARE_API_TOKEN or CF_API_TOKEN environment variable required");
    process.exit(1);
}

let totalPurged = 0;

for (const batch of batches) {
    const response = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ files: batch }),
        },
    );

    const result = await response.json();

    if (!result.success) {
        console.error("Purge failed:", result.errors);
        process.exit(1);
    }

    totalPurged += batch.length;
    console.log(`  Purged ${totalPurged}/${urlsToPurge.length} URLs`);
}

console.log(`\nCache purge complete. ${totalPurged} URLs purged from ${environment} CDN.`);
