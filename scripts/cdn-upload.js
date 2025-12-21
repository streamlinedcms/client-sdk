#!/usr/bin/env node

/**
 * Upload SDK build artifacts to R2 bucket for CDN distribution.
 *
 * Usage: node scripts/cdn-upload.js <staging|production>
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

const environment = process.argv[2];

if (!["staging", "production"].includes(environment)) {
    console.error("Usage: node scripts/cdn-upload.js <staging|production>");
    process.exit(1);
}

const bucketName =
    environment === "staging" ? process.env.R2_BUCKET_STAGING : process.env.R2_BUCKET_PRODUCTION;

if (!bucketName) {
    const envVar = environment === "staging" ? "R2_BUCKET_STAGING" : "R2_BUCKET_PRODUCTION";
    console.error(`Error: ${envVar} not set in .env`);
    process.exit(1);
}

const version = packageJson.version;
const collection = "client-sdk";

const files = [
    "streamlined-cms.js",
    "streamlined-cms.js.map",
    "streamlined-cms.min.js",
    "streamlined-cms.min.js.map",
    "streamlined-cms.esm.js",
    "streamlined-cms.esm.js.map",
    "streamlined-cms.esm.min.js",
    "streamlined-cms.esm.min.js.map",
];

// Build first
console.log("Building SDK...\n");
execSync("npm run build", { stdio: "inherit", cwd: join(__dirname, "..") });

// Check if version already exists in R2
const checkPath = `${bucketName}/${collection}/${version}/${files[0]}`;
let versionExists = false;
try {
    execSync(`wrangler r2 object get "${checkPath}" --remote --pipe > /dev/null 2>&1`, {
        stdio: "pipe",
    });
    versionExists = true;
} catch {
    // File doesn't exist
}

// Show what will be uploaded
console.log(`\nUploading SDK v${version} to ${environment}:\n`);
for (const file of files) {
    console.log(`  ${bucketName} -> ${collection}/${version}/${file}`);
}

if (versionExists) {
    console.log(`\n⚠️  Version ${version} already exists and will be overwritten.`);
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

for (const file of files) {
    const localPath = join(__dirname, "..", "dist", file);
    const r2Path = `${bucketName}/${collection}/${version}/${file}`;

    try {
        execSync(`wrangler r2 object put "${r2Path}" --remote --file "${localPath}"`, {
            stdio: "inherit",
        });
    } catch (error) {
        console.error(`\nFailed to upload ${file}`);
        process.exit(1);
    }
}

console.log(`\nUpload complete. SDK v${version} is now in ${bucketName}.`);
console.log(`\nTo make this version live, run:`);
console.log(`  npm run cdn:publish:${environment}`);
