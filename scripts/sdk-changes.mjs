/**
 * What changed in the built SDK between a release tag and a commit, used to
 * tell whether merging a commit under an already-released version would leave
 * unreleased SDK changes on master.
 *
 * Counts the build inputs listed below and the runtime dependencies resolved
 * in package-lock.json. Build tools (dev dependencies such as rollup, terser,
 * tailwindcss or tslib) can also change the output, but are deliberately not
 * counted, so dev dependency updates can merge without a release.
 */

import { execFileSync } from "node:child_process";

// Files that go into the built SDK, besides runtime dependencies
const BUILD_INPUTS = [
    "src/",
    "rollup.config.js",
    "tsconfig.json",
    "postcss.config.cjs",
    "postcss-shadow-dom-fix.cjs",
];

function git(...args) {
    try {
        return execFileSync("git", args, {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        }).trim();
    } catch (error) {
        console.error(
            `::error::git ${args.join(" ")} failed: ${(error.stderr?.trim() || error.message).replace(/\.$/, "")}. ` +
                `Fetch master and tags first (git fetch origin master --tags).`,
        );
        process.exit(1);
    }
}

function isAncestor(commit, of) {
    try {
        execFileSync("git", ["merge-base", "--is-ancestor", commit, of], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}

// Runtime packages by name and version, ignoring where npm placed them in
// node_modules, so a dev dependency update that moves one isn't a change.
// The SDK's own direct dependencies are also compared at the top level, where
// npm always installs them: with two versions of a package installed, which
// one the SDK imports can change without the set of versions changing.
function runtimeDependencies(ref) {
    const lock = JSON.parse(git("show", `${ref}:package-lock.json`));
    const packages = Object.entries(lock.packages)
        .filter(([path, entry]) => path !== "" && !entry.dev)
        .map(([path, entry]) => `${path.split("node_modules/").at(-1)}@${entry.version}`);
    const direct = Object.keys(lock.packages[""]?.dependencies ?? {}).map(
        (name) => `direct ${name}@${lock.packages[`node_modules/${name}`]?.version}`,
    );
    return [...new Set(packages), ...direct].sort().join("\n");
}

/**
 * Returns a description of the SDK changes between tag and ref, or null if
 * there are none (including when ref is already part of a tag on master).
 */
export function sdkChangesSince(tag, ref = "HEAD") {
    if (isAncestor(ref, tag) && isAncestor(tag, "origin/master")) return null;
    return sdkChangesBetween(tag, ref);
}

/**
 * Returns a description of the SDK changes between two commits, or null if
 * there are none.
 */
export function sdkChangesBetween(from, to) {
    const files = git("diff", "--name-only", from, to, "--", ...BUILD_INPUTS);
    const dependenciesChanged = runtimeDependencies(from) !== runtimeDependencies(to);
    if (!files && !dependenciesChanged) return null;

    return [
        files && `files: ${files.split("\n").join(", ")}`,
        dependenciesChanged && "runtime dependencies",
    ]
        .filter(Boolean)
        .join("; ");
}
