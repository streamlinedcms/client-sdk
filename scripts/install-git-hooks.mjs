// Link the repo's git hooks (scripts/git-hooks/) into .git/hooks.
// Runs as npm's prepare step. Writes to the repo's own hooks folder even when
// a global core.hooksPath is set, since a global hook can hand off to it.
import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, readdirSync, readlinkSync, symlinkSync } from "node:fs";
import { join, relative, resolve } from "node:path";

if (process.env.CI) process.exit(0);

let gitDir;
try {
    gitDir = execFileSync("git", ["rev-parse", "--absolute-git-dir"], { encoding: "utf8" }).trim();
} catch {
    process.exit(0); // Not a git checkout (e.g. installed as a package)
}

const source = resolve("scripts/git-hooks");
const hooksDir = join(gitDir, "hooks");
mkdirSync(hooksDir, { recursive: true });

for (const name of readdirSync(source)) {
    const target = join(hooksDir, name);
    const link = relative(hooksDir, join(source, name));
    const existing = lstatSync(target, { throwIfNoEntry: false });
    if (existing) {
        const current = existing.isSymbolicLink() ? readlinkSync(target) : null;
        if (current !== link) {
            console.warn(
                `install-git-hooks: ${target} already exists; leaving it. Remove it and run 'npm run prepare' to use the repo's hook.`,
            );
        }
        continue;
    }
    symlinkSync(link, target);
    console.log(`install-git-hooks: linked ${name}`);
}
