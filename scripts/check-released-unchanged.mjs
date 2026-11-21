#!/usr/bin/env node

/**
 * For a push to master whose version is already tagged: fail if anything that
 * goes into the built SDK changed since that tag, because merging it released
 * nothing. This happens when two PRs carrying the same new version both merge
 * (the second sees the tag the first created), or when a PR whose checks ran
 * before a release merges after it.
 *
 * A release:none merge with only dev changes (tooling, tests, docs, dev
 * dependencies) passes.
 *
 * Usage: node scripts/check-released-unchanged.mjs <version>
 * Requires tags to be fetched (checkout fetch-depth: 0).
 */

import { execFileSync } from "node:child_process";

// What goes into the built SDK, besides runtime dependencies
const BUILD_INPUTS = ["src/", "rollup.config.js", "tsconfig.json", "postcss.config.cjs"];

const version = process.argv[2];
const tag = `v${version}`;

function git(...args) {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function runtimeDependencies(ref) {
    const lock = JSON.parse(git("show", `${ref}:package-lock.json`));
    return Object.entries(lock.packages)
        .filter(([path, entry]) => path !== "" && !entry.dev)
        .map(([path, entry]) => `${path}@${entry.version}`)
        .sort()
        .join("\n");
}

const changedFiles = git("diff", "--name-only", tag, "HEAD", "--", ...BUILD_INPUTS);
const dependenciesChanged = runtimeDependencies(tag) !== runtimeDependencies("HEAD");

if (!changedFiles && !dependenciesChanged) {
    console.log(`Nothing in the built SDK changed since ${tag}; nothing to release.`);
    process.exit(0);
}

const what = [
    changedFiles && `files: ${changedFiles.split("\n").join(", ")}`,
    dependenciesChanged && "runtime dependencies",
]
    .filter(Boolean)
    .join("; ");
console.error(
    `::error::master has SDK changes since ${tag} (${what}), but its version is still ${version}, ` +
        `so nothing was released. Probably two PRs set the same version, or a PR's checks ran before ` +
        `${tag} was released. Merge a PR that bumps the version to release these changes.`,
);
process.exit(1);
