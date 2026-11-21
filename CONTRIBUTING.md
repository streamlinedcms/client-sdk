# Contributing

## Project Architecture

The SDK uses a **two-bundle strategy** to minimize impact on page load performance:

### Sync Loader (`streamlined-cms.js`)

A tiny IIFE script that runs synchronously when the page loads. It:

1. Immediately hides editable elements to prevent flash of unstyled content (FOUC)
2. Injects a preconnect hint for early TLS negotiation with the API
3. Dynamically loads the ESM module after the critical path

### ESM Module (`streamlined-cms.esm.js`)

The main module, lazy-loaded after the page renders. Contains:

- Lit-based web components (toolbar, modals)
- Authentication and API integration
- Editing functionality and state management

### Why Two Bundles?

- The sync loader is tiny (~2KB) and blocks only briefly to hide elements
- The larger ESM module (~50KB) loads asynchronously without blocking render
- Users see their page immediately while editing features load in the background

### Shadow DOM Isolation

All UI components use Shadow DOM to ensure:

- SDK styles never leak into the host page
- Host page styles never break the SDK toolbar/modals
- Tailwind CSS is compiled into each component's shadow root

## Project Structure

```
src/
├── loader.ts              # Sync IIFE entry point
├── lazy/
│   └── index.ts           # ESM module entry point (initLazy)
├── components/            # Lit web components
│   ├── toolbar.ts         # Main editing toolbar
│   ├── html-editor-modal.ts
│   ├── link-editor-modal.ts
│   ├── seo-modal.ts
│   ├── accessibility-modal.ts
│   ├── attributes-modal.ts
│   ├── sign-in-link.ts
│   ├── element-badge.ts
│   ├── mode-toggle.ts
│   ├── hold-button.ts
│   └── styles.ts          # Shared Tailwind stylesheet
├── types.ts               # TypeScript interfaces
├── key-storage.ts         # localStorage persistence
├── popup-manager.ts       # Cross-origin popup handling
└── popup-connection.ts    # Penpal wrapper for popups

tests/
├── unit/                  # JSDOM-based unit tests
└── browser/               # Playwright browser tests
    ├── fixtures/          # Test HTML pages
    └── server.ts          # Test HTTP server

dist/                      # Build output
├── streamlined-cms.js     # Sync loader
├── streamlined-cms.min.js
├── streamlined-cms.esm.js # ESM module
├── streamlined-cms.esm.min.js
└── *.d.ts                 # TypeScript declarations
```

## Testing

### Unit Tests

Unit tests use Vitest with JSDOM for DOM simulation.

```bash
# Run all unit tests
npm run test:unit

# Watch mode
npm run test:watch
```

### Browser Tests

Browser tests use Playwright (library only) with Vitest as the test runner. Tests are fully self-contained - they start their own HTTP server and use controlled test fixtures.

#### Running Browser Tests

```bash
# Run all browser tests
npm run test:browser

# Run browser tests in watch mode
npm run test:browser:watch
```

Browser tests automatically:
- Build the SDK (if needed)
- Start an HTTP server on an available port
- Serve test fixtures from `tests/browser/fixtures/`
- Run tests against controlled HTML
- Shut down the server when complete

#### Test Environment

- Self-hosted test server (auto-selects available port)
- Tests run against the staging API: `https://streamlined-cms-api-worker-staging.whi.workers.dev`
- Test fixtures use `data-app-id="test-app"` to isolate from demo data
- Mock authentication is enabled via `data-mock-auth="true"`
- Debug logging is enabled via `data-debug="true"`
- Uses Chromium browser (headless by default)

#### Writing Browser Tests

Browser tests use semantic selectors and user-focused assertions:

```typescript
// Good - semantic, user-focused
const saveButton = page.locator('#streamlined-save-btn');
const isVisible = await saveButton.isVisible();
expect(isVisible).toBe(true);

// Good - using data attributes
const heroTitle = page.locator('[data-editable="hero-title"]');
await heroTitle.click();
```

#### Development

To see the browser during test execution, modify the test file:

```typescript
browser = await chromium.launch({
    headless: false, // Show the browser
});
```

### Running All Tests

```bash
npm test
```

## Adding New Features

### New Editable Type

To add a new editable type (like `data-scms-video`):

1. Define the type in `src/types.ts` (add to `EditableType`)
2. Add detection logic in `src/lazy/index.ts` where elements are scanned
3. Create editing UI (modal or inline) in `src/components/`
4. Add toolbar integration for the new type
5. Write browser tests in `tests/browser/`

### New Modal Component

1. Create the component in `src/components/` extending `LitElement`
2. Import the shared styles from `styles.ts`
3. Register the custom element with a `streamlined-` prefix
4. Add open/close logic in the toolbar component

## Code Formatting

This project uses Prettier for code formatting:

- 4-space indent for TypeScript/JavaScript
- 2-space indent for CSS
- Double quotes, semicolons, trailing commas

```bash
# Format all files
npm run format

# Check formatting
npm run format:check
```

## Node Version

`.nvmrc` pins the Node version every workflow uses; use the same one locally. `package.json` sets the minimum under `engines`, and `.npmrc` makes `npm ci` fail on a Node version a dependency doesn't support, instead of only warning.

## Building

```bash
# Build the SDK
npm run build

# Build and watch for changes
npm run dev
```

## Versioning

See [docs/versioning-strategy.md](docs/versioning-strategy.md) for the SDK versioning strategy, including URL structure, cache headers, prerelease versions, and breaking change policy.

## Release Process

`master` only ever holds stable releases. A release is a PR to `master` that
sets a new version in `package.json`. When it merges,
`.github/workflows/deploy-prod.yml` builds that version, uploads it to the
production CDN, updates the stable aliases (`latest`, `v1`, `v1.5`), and tags the
commit `v<version>`. Nothing is committed to `master` by CI, and if the version
is already tagged the merge releases nothing.

If a release fails partway, re-run the failed Deploy Production run: it
re-uploads every file and only tags once the release is complete. If a re-run
can't fix it (the release itself is broken), merge the fix as the next version
(e.g. 1.4.2 with `release:patch` when `master` is stuck at an unreleased
1.4.1); the broken version is simply never released. A run stops without
releasing if `master` has moved on to a newer version, and fails if the
version is already tagged but the SDK changed since that tag (two PRs set the
same version); merge a PR with a new version to release those changes.

### Setting the Version

Set the version with `npm version <x.y.z> --no-git-tag-version` and commit it
in a PR to `develop`, or on the release or hotfix branch. Don't create the tag
yourself: the release workflow creates it, and skips any version that already
has one.

### PR Checks

PRs to `master` need exactly one release label, and the
`check-release-label / check` job fails unless the version matches it:

| Label | Meaning | Example (`master` at `1.4.0`) |
|-------|---------|---------|
| `release:patch` | Patch release | `1.4.1` |
| `release:minor` | Minor release | `1.5.0` |
| `release:major` | Major release | `2.0.0` |
| `release:none` | Merge without releasing | stays `1.4.0` |

The version must be a stable `X.Y.Z`: `master`'s version bumped by the label,
and not yet tagged. The error says which version the label expects. Adding or removing
a label doesn't start a new CI run; if you change it after the checks have
run, re-run the `check-release-label / check` job.

To merge into `master` without releasing, for example to get dev dependency
updates or tooling changes onto `master` (Dependabot reads its config and
reports alerts from there), use `release:none`. The version must be unchanged
from `master` and already released, and the check fails if the PR changes the
built SDK: its source, build config, or runtime dependencies. Dependabot's
weekly grouped PR often updates runtime dependencies too, so once that's on
`develop`, the next PR to `master` needs a real release.

The `includes-master` job fails a PR to `master` whose branch is missing
changes already on `master`, such as a hotfix that landed after the branch was
made. Merge `master` into the branch to fix it (for `develop`, see
[Getting Changes Back to develop](#getting-changes-back-to-develop); for a
Dependabot PR, see [Hotfixes](#hotfixes)).

### Release Branches and Prereleases

To test a release before it goes live, use a release branch named
`release/X.Y.Z`, created from `develop` (only admins can create or delete
release branches):

1. Create the branch locally, commit `npm version X.Y.Z --no-git-tag-version`
   on it, then push. (Pushing the branch before the version commit gives one
   failed run, since it still carries `develop`'s version.)
2. Open its PR to `master` as a draft, with its release label (the label check
   shows a failure until it has one).

Every push to the branch runs the tests and publishes a prerelease build to
the production CDN, named after its commit:

| PR state | Build | Alias it moves |
|----------|-------|----------------|
| Draft (or no PR yet) | `1.5.0-beta.<timestamp>.<sha>` | `1.5.0-beta` |
| Ready for review | `1.5.0-rc.<timestamp>.<sha>` | `1.5.0-rc` |

Testers can follow the alias (`/client-sdk/v1.5.0-beta/…`) or load an exact
build by its version. Aliases are cached for an hour and browsers may keep
using a stale copy for up to a day while they refresh it, so use the exact
build to see a push straight away. Prereleases never move the stable aliases.

- **Beta:** keep the PR a draft while testing still finds problems or the
  scope may change.
- **Release candidate:** mark the PR ready for review once you believe the
  current code is what ships; only bug fixes go in after that. Marking it ready
  (or opening or reopening the PR as ready) republishes the current commit as
  an rc without a push, and moving it back to draft makes later builds betas
  again.
- **Release:** merge the PR (with its release label). A draft can't be merged,
  so every release branch ends as an rc. Once the version is released, the
  branch publishes nothing more; delete it.

Fixes made on the release branch reach `develop` after the release; see below.
Don't merge a release branch into `develop` while it's being tested.

If a prerelease publish fails, re-run it (either re-run button works): it
replaces any files the failed attempt uploaded, and it leaves the alias alone
if the branch has moved on. If the tests failed, push a fix instead.

To abandon a release, close its PR and have an admin delete the branch. Its
`X.Y.Z-beta`/`X.Y.Z-rc` aliases keep pointing at its last build until another
release of the same version moves them.

**While a release branch is open:**
- Send urgent fixes through a [hotfix](#hotfixes), not a `develop` release.
  After a `develop` release, `includes-master` makes the release branch take
  everything `develop` had, possibly in the middle of its rc.
- With two release branches open (say `1.5.0` and `2.0.0`), release the lower
  version first. Once a higher version is released, the lower branch can't
  merge: abandon it, or rename it and re-version it above the new release.

### Hotfixes

An urgent fix that can't wait for the changes on `develop` goes straight to
`master` from a branch off `master`: make the fix, bump the patch version, and
open a PR with `release:patch`. Because `master` only holds stable releases,
this works at any time, even while a release branch is in testing.

That includes the PRs Dependabot opens for critical alerts in runtime
dependencies (see `.github/dependabot.yml`): push a commit to the PR's branch
that bumps the patch version, and the check passes. After that, Dependabot
won't rebase the PR. If `master` moves on before it merges (say another hotfix
took 1.4.1), merge `master` into the branch and bump to the next patch again
(1.4.2); `@dependabot recreate` also works but discards your commits.

After a hotfix, merge `master` into any open release branch so its next
prerelease, and the release itself, include the fix (`includes-master` won't
let the release branch merge without it). The version line in `package.json`
and `package-lock.json` will conflict: keep the release branch's `X.Y.Z`. Until
that merge, the PR has a conflict, and GitHub runs no PR workflows for it.

### Getting Changes Back to develop

Nothing merges `master` back into `develop` automatically. After a hotfix or a
release branch merges, the next `develop` PR to `master` fails
`includes-master` until `develop` has those changes:

1. Create a branch from `master` (e.g. `sync/master-to-develop`). Don't open
   the PR from `master` itself: resolving a conflict in GitHub's editor would
   commit the resolution to `master`.
2. Merge `develop` into it if there are conflicts, and resolve them there. On
   the version line in `package.json` and `package-lock.json`, keep
   `develop`'s version if `develop` already has its next version set.
3. Open a PR from it to `develop` and merge it.

Automating this would need a credential that can push to `develop` or open PRs
that run CI, such as a GitHub App's token (a personal access token was
rejected as a long-lived personal credential). There is nothing wrong with a
GitHub App beyond being one more thing to maintain, so it's worth reconsidering
if hotfixes become frequent. See #132 for the rest of the reasoning.

### Deployment Flow

1. **Feature work** → PR to `develop` → auto-deploys to staging CDN
2. **Version** → set the release version on `develop`, or create `release/X.Y.Z`
3. **Testing** (optional) → pushes to the release branch publish betas, then rcs once its PR is ready
4. **Release** → merge the PR to `master` with the matching release label → publish, alias updates, tag
5. **Post-release** → after a hotfix or release branch, bring `master`'s changes into `develop` through a PR

### Repository Setup

The release workflow requires specific GitHub configuration. Run `./scripts/setup-github.sh` to configure:

**Rulesets:**
```bash
./scripts/setup-github.sh rulesets apply
```
- `master-protection` - require PR and status checks, including `includes-master` (no approval needed; the PR's branch doesn't need to be up to date with `master`)
- `develop-protection` - require PR, status checks (no approval needed)
- `release-protection` - only admins can create/delete `release/*` branches
- `tags-protection` - release tags (`v*`) can't be deleted or moved; anyone can create them, so the release workflow can tag releases

Anyone with write access can push to an existing release branch, and every
push publishes a prerelease with the production Cloudflare token. Before adding
collaborators with write access, require PRs for release branches too.

**Environments:**
```bash
./scripts/setup-github.sh environments apply
```
- `production` - restricted to `master` and `release/*` branches
- `staging` - restricted to `develop` branch

**Tokens:**

The release workflows use their own `GITHUB_TOKEN` to push release tags and to
republish a release branch when its PR changes stage, so no personal access
token is needed.

See the [deployment guide](https://github.com/streamlinedcms/planning/blob/master/guides/cloudflare-github-deployment.md#cicd-security) for security details.

## Pull Requests

Before submitting a PR:

1. **Run tests**: `npm test` (all tests must pass)
2. **Format code**: `npm run format`
3. **Test in browser**: `npm run demo:local` and manually verify your changes
4. **Write meaningful commits**: Describe what changed and why
5. **Keep PRs focused**: One feature or fix per PR when possible

For bug fixes, include a test that would have caught the bug.

For new features, include tests and update docs/INTEGRATION.md if the feature is user-facing.
