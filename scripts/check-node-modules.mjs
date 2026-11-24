// Exit non-zero if installed packages don't match package-lock.json.
// npm records what it installed in node_modules/.package-lock.json.
import { readFileSync } from "node:fs";

function readPackages(path) {
    try {
        return JSON.parse(readFileSync(path, "utf8")).packages ?? {};
    } catch {
        return null;
    }
}

const locked = readPackages("package-lock.json");
const installed = readPackages("node_modules/.package-lock.json");

if (!installed) {
    console.error("node_modules isn't installed.");
    process.exit(1);
}

const mismatched = [];
for (const [path, entry] of Object.entries(locked)) {
    // The root entry and optional packages for other platforms aren't installed
    if (!path || entry.optional) continue;
    if (installed[path]?.version !== entry.version) {
        mismatched.push(
            `${path.replace(/^node_modules\//, "")}: installed ${installed[path]?.version ?? "none"}, locked ${entry.version}`,
        );
    }
}

if (mismatched.length > 0) {
    console.error(`Installed packages don't match package-lock.json (${mismatched.length}):`);
    for (const line of mismatched.slice(0, 10)) console.error(`  ${line}`);
    if (mismatched.length > 10) console.error(`  ...and ${mismatched.length - 10} more`);
    process.exit(1);
}
