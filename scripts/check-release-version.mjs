#!/usr/bin/env node

/**
 * Check that a PR to master carries a release label matching the version in
 * package.json, so merging it publishes exactly what the label says.
 *
 * Release labels:
 *   release:patch / release:minor / release:major
 *     The jump to the version this release series is heading for, measured
 *     from the last stable release. 1.3.0 -> 1.4.0-beta.0, 1.4.0-beta.1 and
 *     1.4.0 are all release:minor. The version must also be newer than
 *     master's and not yet tagged.
 *   release:none
 *     Merge without releasing: the version must be unchanged from master and
 *     already tagged.
 *
 * Branch rules:
 *   - release/X.Y.Z-<type> must carry X.Y.Z-<type>.N; release/X.Y.Z must carry
 *     X.Y.Z. Other branches can't carry a prerelease version.
 *   - From develop, master must have no changes develop is missing (a hotfix
 *     or release branch merged to master), so they aren't left out of develop.
 *
 * Requires tags and the base branch to be fetched (checkout fetch-depth: 0).
 *
 * Environment:
 *   BASE_REF    Base branch of the PR. Anything but master passes without checks.
 *   HEAD_REF    Source branch of the PR.
 *   HEAD_SHA    Commit at the tip of the PR's source branch.
 *   PR_NUMBER, GH_REPO, GH_TOKEN
 *               Used to look up the PR's labels when this runs, rather than
 *               taking them from the event that started the run, since CI
 *               doesn't re-run on label changes. Locally, set RELEASE_LABEL
 *               (patch, minor, major or none) instead.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const { BASE_REF, HEAD_REF = "", HEAD_SHA = "HEAD" } = process.env;
const RERUN = "then re-run this job";

function git(...args) {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function fail(message) {
    console.error(`::error::${message}`);
    process.exit(1);
}

// Semver parsing and comparison, enough for X.Y.Z and X.Y.Z-<prerelease>
function parse(version) {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
    if (!match) return null;
    const [, major, minor, patch, pre] = match;
    return {
        core: [Number(major), Number(minor), Number(patch)],
        pre: pre ? pre.split(".") : [],
    };
}

function compareIdentifiers(a, b) {
    const aNum = /^\d+$/.test(a);
    const bNum = /^\d+$/.test(b);
    if (aNum && bNum) return Number(a) - Number(b);
    if (aNum) return -1;
    if (bNum) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
}

function compare(a, b) {
    const va = parse(a);
    const vb = parse(b);
    for (let i = 0; i < 3; i++) {
        if (va.core[i] !== vb.core[i]) return va.core[i] - vb.core[i];
    }
    // A prerelease sorts before its stable version
    if (!va.pre.length || !vb.pre.length) return vb.pre.length - va.pre.length;
    for (let i = 0; i < Math.min(va.pre.length, vb.pre.length); i++) {
        const diff = compareIdentifiers(va.pre[i], vb.pre[i]);
        if (diff) return diff;
    }
    return va.pre.length - vb.pre.length;
}

function bump(version, type) {
    const [major, minor, patch] = parse(version).core;
    if (type === "major") return `${major + 1}.0.0`;
    if (type === "minor") return `${major}.${minor + 1}.0`;
    return `${major}.${minor}.${patch + 1}`;
}

function releaseLabel() {
    if (!process.env.PR_NUMBER) {
        return process.env.RELEASE_LABEL ? [process.env.RELEASE_LABEL] : [];
    }
    const labels = execFileSync(
        "gh",
        [
            "api",
            `repos/${process.env.GH_REPO}/issues/${process.env.PR_NUMBER}/labels`,
            "--jq",
            ".[].name",
        ],
        { encoding: "utf8" },
    );
    return labels
        .split("\n")
        .map((label) => /^release:(major|minor|patch|none)$/.exec(label)?.[1])
        .filter(Boolean);
}

if (BASE_REF !== "master") {
    console.log(`PR to ${BASE_REF}, not master: nothing to check.`);
    process.exit(0);
}

const types = releaseLabel();
if (types.length === 0) {
    fail(
        `PRs to master need a release:patch, release:minor, release:major or release:none label; add one and ${RERUN}.`,
    );
}
if (types.length > 1) {
    fail(
        `PR has more than one release label (${types.map((t) => `release:${t}`).join(", ")}); keep one and ${RERUN}.`,
    );
}
const type = types[0];

const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const masterVersion = JSON.parse(git("show", "origin/master:package.json")).version;
const tags = git("tag", "--list", "v*").split("\n").filter(Boolean);
const isTagged = tags.includes(`v${version}`);

if (!parse(version)) {
    fail(`package.json version ${version} isn't a valid version.`);
}

if (HEAD_REF === "develop") {
    // Compare file contents, not commits: the merge commit a release leaves on
    // master changes nothing, but a hotfix or release branch fix does
    const base = git("merge-base", "origin/master", HEAD_SHA);
    const missing = git("diff", "--name-only", base, "origin/master");
    if (missing) {
        fail(
            `master has changes that develop doesn't (probably a hotfix or release branch). ` +
                `Open a PR from master to develop, merge it, then update this PR. Files: ${missing.split("\n").join(", ")}`,
        );
    }
}

if (type === "none") {
    if (version !== masterVersion) {
        fail(
            `release:none, but this PR changes the version from ${masterVersion} to ${version}. ` +
                `Revert the version, or use a release label to release it.`,
        );
    }
    if (!isTagged) {
        fail(
            `release:none, but version ${version} has no v${version} tag, so merging would release it.`,
        );
    }
    console.log(`release:none: version ${version} is unchanged and already released. OK.`);
    process.exit(0);
}

const stableTags = tags
    .map((tag) => tag.slice(1))
    .filter((v) => parse(v) && !parse(v).pre.length)
    .sort(compare);
const lastStable = stableTags.at(-1);
if (!lastStable) {
    fail("No stable release tag (vX.Y.Z) found to measure the version bump from.");
}

const target = bump(lastStable, type);
const prerelease = parse(version).pre;
const core = parse(version).core.join(".");

if (core !== target) {
    fail(
        `release:${type} from the last stable release ${lastStable} means version ${target}` +
            `${prerelease.length ? `-${prerelease.join(".")}` : ""}, but package.json has ${version}. ` +
            `Change the version, or change the label and ${RERUN}.`,
    );
}

const branch = /^release\/(\d+\.\d+\.\d+)(?:-([a-z]+))?$/.exec(HEAD_REF);
if (branch) {
    const [, branchCore, branchType] = branch;
    const expected = branchType ? `${branchCore}-${branchType}.N` : branchCore;
    const matches = branchType
        ? core === branchCore &&
          prerelease.length === 2 &&
          prerelease[0] === branchType &&
          /^\d+$/.test(prerelease[1])
        : core === branchCore && !prerelease.length;
    if (!matches) {
        fail(`Branch ${HEAD_REF} must carry version ${expected}, but package.json has ${version}.`);
    }
} else if (prerelease.length) {
    fail(
        `Prerelease versions (${version}) can only be released from a release/X.Y.Z-<type> branch.`,
    );
}

if (compare(version, masterVersion) <= 0) {
    fail(`Version ${version} isn't newer than master's ${masterVersion}.`);
}
if (isTagged) {
    fail(
        `Version ${version} is already released (tag v${version} exists). Bump the version in package.json.`,
    );
}

console.log(`release:${type}: version ${version} is unreleased and matches the label. OK.`);
