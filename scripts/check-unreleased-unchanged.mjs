#!/usr/bin/env node

/**
 * For a push to master whose version isn't tagged yet: fail if master already
 * carried that same version before this push and the built SDK changed since.
 * That happens when two PRs set the same version, both checked before either
 * merged, and the first one's release failed: releasing now would rebuild a
 * version that may already be partly published with different code.
 *
 * Starts from master's tip before this push (BEFORE, the push event's
 * "before" commit), so commits within one push (e.g. an admin pushing several
 * at once) don't count as "already at this version". From there it walks
 * master's history (following merges' first parents) to the oldest commit
 * still carrying this version, not just the previous one, so a later push that
 * changes nothing can't release changes an earlier same-version push brought
 * in. A re-run of a failed release passes, since it reuses its event.
 *
 * Usage: BEFORE=<sha> node scripts/check-unreleased-unchanged.mjs <version>
 * Without a usable BEFORE, starts from HEAD's first parent.
 * Requires master's history to be fetched (checkout fetch-depth: 0).
 */

import { execFileSync } from "node:child_process";
import { sdkChangesBetween } from "./sdk-changes.mjs";

const version = process.argv[2];

function versionAt(commit) {
    try {
        return JSON.parse(
            execFileSync("git", ["show", `${commit}:package.json`], {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
            }),
        ).version;
    } catch {
        return null;
    }
}

function git(...args) {
    return execFileSync("git", args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
    }).trim();
}

function isAncestor(commit, of) {
    try {
        execFileSync("git", ["merge-base", "--is-ancestor", commit, of], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}

// master's tip before this push
const before = process.env.BEFORE;
const start = before && !/^0+$/.test(before) && isAncestor(before, "HEAD") ? before : "HEAD^1";

if (versionAt(start) !== version) {
    console.log(`master wasn't at ${version} before this push; releasing it.`);
    process.exit(0);
}

let first = start;
for (const commit of git("rev-list", "--first-parent", start).split("\n").slice(1)) {
    if (versionAt(commit) !== version) break;
    first = commit;
}

const changes = sdkChangesBetween(first, "HEAD");
if (!changes) {
    console.log(`master was already at ${version} and the SDK hasn't changed since; releasing it.`);
    process.exit(0);
}

console.error(
    `::error::master was already at the unreleased version ${version} (since ${first.slice(0, 7)}: ` +
        `its release failed or hasn't finished), and the built SDK has changed since under the same ` +
        `version (${changes}). Releasing would rebuild ${version} with different code. Merge a PR ` +
        `with the next version to release these changes.`,
);
process.exit(1);
