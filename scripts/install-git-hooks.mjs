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

// Marks hooks this script installed, so it can update them later
const MARKER = "# Installed by scripts/install-git-hooks.mjs";

function shim(name) {
    return `#!/bin/sh
${MARKER}: runs this checkout's own copy.
hook="$(git rev-parse --show-toplevel 2>/dev/null)/scripts/git-hooks/${name}"
[ -x "$hook" ] || exit 0
exec "$hook" "$@"
`;
}

function git(...args) {
    return execFileSync("git", args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
    }).trim();
}

let commonDir;
let installed = false;
try {
    // Relative to the current directory on older git versions, so resolve it
    commonDir = resolve(git("rev-parse", "--git-common-dir"));
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
            const current = existing.isSymbolicLink() ? null : readFileSync(target, "utf8");
            const ours = existing.isSymbolicLink()
                ? // An earlier version of this script linked the hook directly
                  readlinkSync(target).endsWith(`scripts/git-hooks/${name}`)
                : current.includes(MARKER);
            if (!ours) {
                console.warn(
                    `install-git-hooks: ${target} already exists; leaving it. Remove it and run 'npm run prepare' to use the repo's hook.`,
                );
                continue;
            }
            if (current === content) continue; // Already up to date
            rmSync(target);
        }

        writeFileSync(target, content, { mode: 0o755 });
        installed = true;
        console.log(`install-git-hooks: installed ${name}`);
    }
} catch (error) {
    console.warn(`install-git-hooks: couldn't install git hooks (${error.message}); skipping.`);
}

// A hooks folder set in git config makes git ignore the repo's own hooks,
// unless the hooks there hand off to them. Said once, when installing.
if (installed) {
    try {
        const hooksPath = git("config", "--get", "core.hooksPath");
        console.log(
            `install-git-hooks: note: core.hooksPath is set (${hooksPath}), so git runs the repo's hooks only if the hooks there hand off to them.`,
        );
    } catch {
        // Not set
    }
}
