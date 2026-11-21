#!/usr/bin/env node

/**
 * Check that a PR to master carries a release label matching the version in
 * package.json, so merging it publishes exactly what the label says. master
 * only ever holds stable releases; prereleases are published from release
 * branches (see .github/workflows/deploy-release.yml).
 *
 * Release labels:
 *   release:patch / release:minor / release:major
 *     The version must be the last stable release bumped by the label, newer
 *     than master's, and not yet tagged.
 *   release:none
 *     Merge without releasing: the version must be unchanged from master and
 *     already tagged.
 *
 * Versions must be stable (X.Y.Z), and a release/X.Y.Z branch must carry X.Y.Z.
 *
 * Requires tags and master to be fetched (checkout fetch-depth: 0).
 *
 * Environment:
 *   BASE_REF    Base branch of the PR. Anything but master passes without checks.
 *   HEAD_REF    Source branch of the PR.
 *   PR_NUMBER, GH_REPO, GH_TOKEN
 *               Used to look up the PR's labels when this runs, rather than
 *               taking them from the event that started the run, since CI
 *               doesn't re-run on label changes. Locally, set RELEASE_LABEL
 *               (patch, minor, major or none) instead.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { sdkChangesSince } from "./sdk-changes.mjs";

const { BASE_REF, HEAD_REF = "" } = process.env;
const RERUN = "then re-run this job";
const LABEL = /^release:(major|minor|patch|none)$/;

function fail(message) {
    console.error(`::error::${message}`);
    process.exit(1);
}

function run(command, args, hint) {
    try {
        return execFileSync(command, args, {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        }).trim();
    } catch (error) {
        fail(
            `${command} ${args.join(" ")} failed: ${error.stderr?.trim() || error.message}. ${hint}`,
        );
    }
}

// Stable versions only: X.Y.Z, no leading zeros
function parse(version) {
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
    return match ? match.slice(1).map(Number) : null;
}

function compare(a, b) {
    const [va, vb] = [parse(a), parse(b)];
    return va[0] - vb[0] || va[1] - vb[1] || va[2] - vb[2];
}

function bump(version, type) {
    const [major, minor, patch] = parse(version);
    if (type === "major") return `${major + 1}.0.0`;
    if (type === "minor") return `${major}.${minor + 1}.0`;
    return `${major}.${minor}.${patch + 1}`;
}

function releaseLabels() {
    if (!process.env.PR_NUMBER) {
        const label = process.env.RELEASE_LABEL;
        if (!label) return [];
        if (!LABEL.test(`release:${label}`)) {
            fail(`RELEASE_LABEL must be patch, minor, major or none, not '${label}'.`);
        }
        return [label];
    }
    const labels = run(
        "gh",
        [
            "api",
            `repos/${process.env.GH_REPO}/issues/${process.env.PR_NUMBER}/labels`,
            "--jq",
            ".[].name",
        ],
        "Couldn't read the PR's labels.",
    );
    return labels
        .split("\n")
        .map((label) => LABEL.exec(label)?.[1])
        .filter(Boolean);
}

if (BASE_REF !== "master") {
    console.log(`PR to ${BASE_REF}, not master: nothing to check.`);
    process.exit(0);
}

const types = releaseLabels();
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

const FETCH_HINT = "Fetch master and tags first (git fetch origin master --tags).";
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const masterVersion = JSON.parse(
    run("git", ["show", "origin/master:package.json"], FETCH_HINT),
).version;
const tags = run("git", ["tag", "--list", "v*"], FETCH_HINT).split("\n").filter(Boolean);
const isTagged = tags.includes(`v${version}`);

if (!parse(version)) {
    fail(
        `package.json version ${version} isn't a stable X.Y.Z version. master only holds stable ` +
            `releases; prereleases are published from release/X.Y.Z branches.`,
    );
}

const releaseBranch = /^release\/(.*)$/.exec(HEAD_REF);
if (releaseBranch) {
    if (!parse(releaseBranch[1])) {
        fail(`Release branches must be named release/X.Y.Z (e.g. release/1.5.0), not ${HEAD_REF}.`);
    }
    if (version !== releaseBranch[1]) {
        fail(
            `Branch ${HEAD_REF} must carry version ${releaseBranch[1]}, but package.json has ${version}.`,
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
            `release:none, but version ${version} has no v${version} tag, so merging would release it. ` +
                `If master was just released, wait for its release to finish tagging, ${RERUN}.`,
        );
    }
    const changes = sdkChangesSince(`v${version}`);
    if (changes) {
        fail(
            `release:none, but this PR changes the built SDK since v${version} (${changes}), so merging ` +
                `would leave unreleased SDK changes on master. Use a release label and bump the version instead.`,
        );
    }
    console.log(
        `release:none: version ${version} is unchanged, already released, and the SDK hasn't changed. OK.`,
    );
    process.exit(0);
}

const lastStable = tags
    .map((tag) => tag.slice(1))
    .filter(parse)
    .sort(compare)
    .at(-1);
if (!lastStable) {
    fail(`No stable release tag (vX.Y.Z) found to measure the version bump from. ${FETCH_HINT}`);
}

const expected = bump(lastStable, type);
if (version !== expected) {
    const masterHint = !tags.includes(`v${masterVersion}`)
        ? ` master's version ${masterVersion} was never released: re-run its failed Deploy Production run, ` +
          `or keep ${masterVersion} in this PR so merging it releases it.`
        : "";
    fail(
        `release:${type} from the last stable release ${lastStable} means version ${expected}, ` +
            `but package.json has ${version}. Change the version, or change the label and ${RERUN}.${masterHint}`,
    );
}
// master's version is normally released, but if its release failed and a
// re-run can't fix it, a PR that keeps that version (with fixes) releases it
const masterUnreleased = !tags.includes(`v${masterVersion}`);
if (version === masterVersion && masterUnreleased) {
    console.log(
        `release:${type}: master's version ${version} isn't released yet; merging this PR releases it. OK.`,
    );
    process.exit(0);
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
