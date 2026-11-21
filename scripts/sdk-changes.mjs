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
    return execFileSync("git", args, { encoding: "utf8" }).trim();
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
// node_modules, so a dev dependency update that moves one isn't a change
function runtimeDependencies(ref) {
    const lock = JSON.parse(git("show", `${ref}:package-lock.json`));
    return [
        ...new Set(
            Object.entries(lock.packages)
                .filter(([path, entry]) => path !== "" && !entry.dev)
                .map(([path, entry]) => `${path.split("node_modules/").at(-1)}@${entry.version}`),
        ),
    ]
        .sort()
        .join("\n");
}

/**
 * Returns a description of the SDK changes between tag and ref, or null if
 * there are none (including when ref is already part of the tag).
 */
export function sdkChangesSince(tag, ref = "HEAD") {
    if (isAncestor(ref, tag)) return null;

    const files = git("diff", "--name-only", tag, ref, "--", ...BUILD_INPUTS);
    const dependenciesChanged = runtimeDependencies(tag) !== runtimeDependencies(ref);
    if (!files && !dependenciesChanged) return null;

    return [
        files && `files: ${files.split("\n").join(", ")}`,
        dependenciesChanged && "runtime dependencies",
    ]
        .filter(Boolean)
        .join("; ");
}
