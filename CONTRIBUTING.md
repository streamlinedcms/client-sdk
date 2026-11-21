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

A release is a PR to `master` that sets a new version in `package.json`. When
it merges, `.github/workflows/deploy-prod.yml` builds that version, uploads it
to the production CDN, updates the aliases, and tags the commit `v<version>`.
Nothing is committed to `master` by CI. If the version is already tagged, the
merge releases nothing.

### Setting the Version

Set the version with `npm version <x.y.z> --no-git-tag-version` and commit it
in a PR to `develop` (or on the release or hotfix branch). Don't create the tag
yourself: the release workflow creates it, and skips any version that already
has one.

### PR Labels

PRs to `master` need exactly one release label, and the
`check-release-label / check` job fails unless the version matches it:

| Label | Meaning | Example (last stable release `1.3.0`) |
|-------|---------|---------|
| `release:patch` | Patch release | `1.3.1` |
| `release:minor` | Minor release | `1.4.0`, or `1.4.0-beta.0` on its way there |
| `release:major` | Major release | `2.0.0`, or `2.0.0-rc.1` on its way there |
| `release:none` | Merge without releasing | stays `1.3.0` |

The label describes the jump to the version the release series is heading
for, measured from the last stable release. So `1.4.0-beta.0`, `1.4.0-beta.1`
and the final `1.4.0` are all `release:minor`. The version must also be newer
than `master`'s and not yet tagged, and the error says which version the
label expects.

To merge into `master` without releasing, for example to get dev dependency
updates or tooling changes onto `master` (Dependabot reads its config and
reports alerts from there), use `release:none`. The version must be unchanged
from `master` and already released, so only use it for changes that don't
affect the built SDK.

Adding or removing a label doesn't start a new CI run; if you change it after
the checks have run, re-run the `check-release-label / check` job.

### Release Branches

For major releases or prereleases, use a release branch created from
`develop`:

| Branch | Version in `package.json` | Purpose |
|--------|---------|---------|
| `release/1.0.0-beta` | `1.0.0-beta.0`, `1.0.0-beta.1`, … | Beta testing before stable release |
| `release/1.0.0-rc` | `1.0.0-rc.0`, `1.0.0-rc.1`, … | Release candidate, final validation |
| `release/1.0.0` | `1.0.0` | Stable release preparation |

Every push to a release branch deploys a test build to the production CDN
under a one-off version (`1.0.0-beta.<timestamp>.<sha>`), without updating any
aliases. Merging a `-beta` or `-rc` branch to `master` releases a real
prerelease that updates only the prerelease aliases (`beta`, `1.0.0-beta`);
merging `release/1.0.0` releases the stable version. Prerelease versions can
only be released from a release branch.

Release branches aren't deleted automatically, so the same branch can carry
the next beta. Delete it (maintainers only) once the series is done.

### Hotfixes

An urgent fix that can't wait for the changes on `develop` goes straight to
`master` from a branch off `master`, with `release:patch`. That includes the
PRs Dependabot opens for critical alerts in runtime dependencies (see
`.github/dependabot.yml`): push a commit to the PR's branch that bumps the
patch version, and the check passes.

Nothing merges `master` back into `develop` automatically. Instead, the check
on the next `develop` to `master` PR fails if `master` has changes that
`develop` doesn't, from a hotfix or a release branch, and asks you to open and
merge a PR from `master` to `develop` first. Because you open that PR, CI runs
on it like any other.

Automating that sync would need a credential that can push to `develop` or
open PRs that run CI, such as a GitHub App's token (a personal access token
was rejected as a long-lived personal credential). There is nothing wrong with
a GitHub App beyond being one more thing to maintain, so it's worth
reconsidering if hotfixes become frequent. See #132 for the rest of the
reasoning.

### Deployment Flow

1. **Feature work** → PR to `develop` → auto-deploys to staging CDN
2. **Version** → set the release version on `develop` (or a release branch)
3. **Testing** (optional) → commits to a release branch deploy to the production CDN (no aliases)
4. **Release** → PR to `master` with the matching release label → publish, alias updates, tag
5. **Post-release** → after a hotfix or release branch, merge `master` into `develop` through a PR

### Repository Setup

The release workflow requires specific GitHub configuration. Run `./scripts/setup-github.sh` to configure:

**Rulesets:**
```bash
./scripts/setup-github.sh rulesets apply
```
- `master-protection` - require PR, approvals, status checks (the PR's branch doesn't need to be up to date with `master`)
- `develop-protection` - require PR, status checks (no approval needed)
- `release-protection` - only maintainers can create/delete `release/*` branches

**Environments:**
```bash
./scripts/setup-github.sh environments apply
```
- `production` - restricted to `master` and `release/*` branches
- `staging` - restricted to `develop` branch

**Tokens:**

The release workflow pushes the release tag with its own `GITHUB_TOKEN`, so no
personal access token is needed.

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
