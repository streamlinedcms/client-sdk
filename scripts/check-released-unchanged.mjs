#!/usr/bin/env node

/**
 * For a push to master whose version is already tagged: fail if anything that
 * goes into the built SDK changed since that tag, because merging it released
 * nothing. The release label check catches this before merge for release:none
 * PRs; this catches what slips past it, such as two PRs carrying the same new
 * version both merging (the second sees the tag the first created).
 *
 * A re-run of a push whose changes are already in the tag passes.
 *
 * Usage: node scripts/check-released-unchanged.mjs <version>
 * Requires tags to be fetched (checkout fetch-depth: 0).
 */

import { sdkChangesSince } from "./sdk-changes.mjs";

const version = process.argv[2];
const tag = `v${version}`;
const changes = sdkChangesSince(tag);

if (!changes) {
    console.log(`Nothing in the built SDK changed since ${tag}; nothing to release.`);
    process.exit(0);
}

console.error(
    `::error::master has SDK changes since ${tag} (${changes}), but its version is still ${version}, ` +
        `so nothing was released. Probably two PRs set the same version. ` +
        `Merge a PR that bumps the version to release these changes.`,
);
process.exit(1);
