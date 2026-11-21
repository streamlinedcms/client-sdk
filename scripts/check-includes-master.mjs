#!/usr/bin/env node

/**
 * Check that a PR to master already includes everything on master, so what
 * ships is exactly what was tested on the branch. Without it, merging a release
 * branch that lacks a hotfix would combine the two only at merge time: the
 * released code would never have been tested as an rc. It also makes develop
 * take hotfixes and release branch fixes before its next release, and brings a
 * stale hotfix or Dependabot PR up to date first.
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
 *   BASE_REF    Base branch of the PR, for local runs. Anything but master passes
 *               without checks. In CI (PR_NUMBER, GH_REPO and GH_TOKEN set) the
 *               PR's current base is looked up instead, so a run started before
 *               the PR was retargeted doesn't skip this check when re-run.
 *   HEAD_REF    Source branch of the PR.
 *   HEAD_SHA    Commit at the tip of the PR's source branch (default HEAD).
 */

import { execFileSync } from "node:child_process";

const { HEAD_REF = "", HEAD_SHA = "HEAD" } = process.env;

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
            `git ${args.join(" ")} failed: ${(error.stderr?.trim() || error.message).replace(/\.$/, "")}. ` +
                `Fetch master and the PR's branch first.`,
        );
    }
}

const BASE_REF = process.env.PR_NUMBER
    ? (() => {
          try {
              return execFileSync(
                  "gh",
                  [
                      "api",
                      `repos/${process.env.GH_REPO}/pulls/${process.env.PR_NUMBER}`,
                      "--jq",
                      ".base.ref",
                  ],
                  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
              ).trim();
          } catch (error) {
              fail(`Couldn't read the PR's base branch: ${error.stderr?.trim() || error.message}`);
          }
      })()
    : process.env.BASE_REF;

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
if (HEAD_REF.startsWith("dependabot/")) {
    fail(
        `master has changed since Dependabot opened this PR. Merge master into the branch (or comment ` +
            `'@dependabot recreate', which discards your commits), then push a version bump to the next ` +
            `patch after master's version, which may have moved on. Files: ${files}`,
    );
}
fail(
    `master has changed since this branch was made, and the branch doesn't have those changes. ` +
        `Merge master into ${HEAD_REF || "the branch"}, then push. Files: ${files}`,
);
