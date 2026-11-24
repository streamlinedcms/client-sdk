// Install the repo's git hooks (scripts/git-hooks/) into the repo's shared
// hooks folder, as small hooks that run the checked-in script from whichever
// checkout git is running in. That covers worktrees, which share the main
// repo's hooks folder, and needs no symlinks (which Windows often refuses).
//
// Runs as npm's prepare step. It never fails the install: a hook is a
// convenience, so problems are only warned about.
//
// Writes to the repo's own hooks folder even when a global core.hooksPath is
// set, and never changes core.hooksPath, since a global hook can hand off to
// the repo's.
import { execFileSync } from "node:child_process";
import {
    lstatSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    readlinkSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

if (process.env.CI && process.env.CI !== "false") process.exit(0);

function shim(name) {
    return `#!/bin/sh
# Installed by scripts/install-git-hooks.mjs: runs this checkout's own copy.
hook="$(git rev-parse --show-toplevel)/scripts/git-hooks/${name}"
[ -x "$hook" ] || exit 0
exec "$hook" "$@"
`;
}

let commonDir;
try {
    // Relative to the current directory on older git versions, so resolve it
    commonDir = resolve(
        execFileSync("git", ["rev-parse", "--git-common-dir"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim(),
    );
} catch {
    process.exit(0); // Not a git checkout (e.g. installed as a package)
}

try {
    const hooksDir = join(commonDir, "hooks");
    mkdirSync(hooksDir, { recursive: true });

    for (const name of readdirSync(resolve("scripts/git-hooks"))) {
        const target = join(hooksDir, name);
        const content = shim(name);
        const existing = lstatSync(target, { throwIfNoEntry: false });

        if (existing) {
            // An earlier version of this script linked the hook directly
            const ours = existing.isSymbolicLink()
                ? readlinkSync(target).endsWith(`scripts/git-hooks/${name}`)
                : readFileSync(target, "utf8") === content;
            if (!ours) {
                console.warn(
                    `install-git-hooks: ${target} already exists; leaving it. Remove it and run 'npm run prepare' to use the repo's hook.`,
                );
                continue;
            }
            if (existing.isFile()) continue; // Already installed
            rmSync(target);
        }

        writeFileSync(target, content, { mode: 0o755 });
        console.log(`install-git-hooks: installed ${name}`);
    }
} catch (error) {
    console.warn(`install-git-hooks: couldn't install git hooks (${error.message}); skipping.`);
}
