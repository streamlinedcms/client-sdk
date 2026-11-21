#!/usr/bin/env node

/**
 * Check that a PR to master includes everything already on master, so merging
 * it can't drop a change that reached master after the branch was made: a
 * hotfix missing from develop or from a release branch, or a stale hotfix or
 * Dependabot PR.
 *
 * Compares file contents between master and the point where the PR's branch
 * last joined it, not commits: the merge commit a release leaves on master
 * changes no files, so it doesn't count, while a real change does.
 *
 * This only runs when the PR is opened or updated. master doesn't require
 * branches to be up to date, so if master moves after this passes, the release
 * workflow's own checks are what catch an unreleased change.
 *
 * Requires master and the PR's head commit to be fetched (checkout
 * fetch-depth: 0).
 *
 * Environment:
 *   BASE_REF    Base branch of the PR. Anything but master passes without checks.
 *   HEAD_REF    Source branch of the PR.
 *   HEAD_SHA    Commit at the tip of the PR's source branch (default HEAD).
 */

import { execFileSync } from "node:child_process";

const { BASE_REF, HEAD_REF = "", HEAD_SHA = "HEAD" } = process.env;

function fail(message) {
    console.error(`::error::${message}`);
    process.exit(1);
}

function git(...args) {
    try {
        return execFileSync("git", args, {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        }).trim();
    } catch (error) {
        fail(
            `git ${args.join(" ")} failed: ${error.stderr?.trim() || error.message}. ` +
                `Fetch master and the PR's branch first.`,
        );
    }
}

if (BASE_REF !== "master") {
    console.log(`PR to ${BASE_REF}, not master: nothing to check.`);
    process.exit(0);
}

const base = git("merge-base", "origin/master", HEAD_SHA);
const missing = git("diff", "--name-only", base, "origin/master");
if (!missing) {
    console.log("This PR includes everything on master. OK.");
    process.exit(0);
}

const files = missing.split("\n").join(", ");
if (HEAD_REF === "develop") {
    fail(
        `master has changes that develop doesn't, probably from a hotfix or release branch. ` +
            `Create a branch from master, open a PR from it to develop, merge it, then update this PR. ` +
            `Files: ${files}`,
    );
}
fail(
    `master has changed since this branch was made, and the branch doesn't have those changes. ` +
        `Merge master into ${HEAD_REF || "the branch"}, then push. Files: ${files}`,
);
