#!/usr/bin/env node

/**
 * Upload SDK build artifacts to R2 bucket for CDN distribution.
 *
 * Usage: node scripts/cdn-upload.js <staging|production> [options]
 */

import { exec as execCallback, execSync } from "child_process";
import { readFileSync, readdirSync } from "fs";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { promisify } from "util";

const exec = promisify(execCallback);
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
const skipBuild = flags.has("--skip-build");
// --overwrite replaces an already-uploaded version instead of failing, so a
// release whose upload or later steps failed can be re-run with every file
// re-uploaded. Only for versions nothing points to yet (not yet released).
const overwrite = flags.has("--overwrite");

if (!["staging", "production"].includes(environment)) {
    console.error("Usage: node scripts/cdn-upload.js <staging|production> [options]");
    console.error("  --yes            Skip confirmation prompts");
    console.error("  --ci             Same as --yes (for CI pipelines)");
    console.error("  --skip-build     Skip npm run build (use pre-built dist/)");
    console.error("  --overwrite      Replace the version if it's already uploaded");
    console.error("  --version=X.Y.Z  Override version (e.g., 0.1.22-dev.20260110143052)");
    process.exit(1);
}

const bucketName =
    environment === "staging" ? process.env.R2_BUCKET_STAGING : process.env.R2_BUCKET_PRODUCTION;

if (!bucketName) {
    const envVar = environment === "staging" ? "R2_BUCKET_STAGING" : "R2_BUCKET_PRODUCTION";
    console.error(`Error: ${envVar} not set in .env`);
    process.exit(1);
}

const version = versionOverride || packageJson.version;
const collection = "client-sdk";

// Build first (unless --skip-build)
if (skipBuild) {
    console.log("Skipping build (--skip-build)\n");
} else {
    console.log("Building SDK...\n");
    execSync("npm run build", {
        stdio: "inherit",
        cwd: join(__dirname, ".."),
        env: { ...process.env, SDK_VERSION: version },
    });
}

// The loader finds its ESM bundle by the version it was built as, so a build
// uploaded under another version's directory wouldn't load the editor
let builtVersion = null;
try {
    builtVersion = readFileSync(join(__dirname, "..", "dist", "sdk-version.txt"), "utf-8").trim();
} catch {
    // Missing: built before the version was recorded, or not built
}
if (builtVersion !== version) {
    console.error(
        `Error: dist/ was built as ${builtVersion ?? "an unknown version"}, not ${version}. ` +
            `Rebuild with SDK_VERSION=${version}, or run without --skip-build.`,
    );
    process.exit(1);
}

// Discover JS files in dist/ (excluding TypeScript declarations)
const distPath = join(__dirname, "..", "dist");
const files = readdirSync(distPath)
    .filter((f) => f.endsWith(".js") || f.endsWith(".js.map"))
    .filter((f) => !f.endsWith(".d.ts") && !f.endsWith(".d.ts.map"))
    .sort();

if (files.length === 0) {
    console.error("Error: No JS files found in dist/");
    process.exit(1);
}

// Check if version already exists in R2
const checkPath = `${bucketName}/${collection}/${version}/${files[0]}`;
let versionExists = false;
try {
    execSync(`npx wrangler r2 object get "${checkPath}" --remote --pipe > /dev/null 2>&1`, {
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
    if (skipPrompts && !overwrite) {
        console.error(`\n❌ Version ${version} already exists. Bump the version before deploying.`);
        process.exit(1);
    }
    console.log(`\n⚠️  Version ${version} already exists and will be overwritten.`);
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

// Upload all files in parallel
const uploads = files.map(async (file) => {
    const localPath = join(__dirname, "..", "dist", file);
    const r2Path = `${bucketName}/${collection}/${version}/${file}`;

    try {
        await exec(`npx wrangler r2 object put "${r2Path}" --remote --file "${localPath}"`);
        console.log(`  ✓ ${file}`);
        return { file, success: true };
    } catch (error) {
        console.error(`  ✗ ${file}`);
        return { file, success: false, error };
    }
});

const results = await Promise.all(uploads);
const failures = results.filter((r) => !r.success);

if (failures.length > 0) {
    console.error(`\nFailed to upload ${failures.length} file(s):`);
    for (const { file, error } of failures) {
        console.error(`  - ${file}`);
        if (error.stderr) console.error(`    ${error.stderr.trim()}`);
        if (error.stdout) console.error(`    ${error.stdout.trim()}`);
    }
    process.exit(1);
}

console.log(`\nUpload complete. SDK v${version} is now in ${bucketName}.`);
console.log(`\nTo make this version live, run:`);
console.log(`  npm run cdn:publish:${environment}`);
