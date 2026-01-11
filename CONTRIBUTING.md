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

### PR Labels

PRs to `master` require a release label to determine version bump:

| Label | Bump Type | Example |
|-------|-----------|---------|
| `release:patch` | Patch | `0.1.22` → `0.1.23` |
| `release:minor` | Minor | `0.1.22` → `0.2.0` |
| `release:major` | Major | `0.1.22` → `1.0.0` |

### Release Branches

For major releases or prereleases, use a release branch:

| Branch | Purpose |
|--------|---------|
| `release/1.0.0-beta` | Beta testing before stable release |
| `release/1.0.0-rc` | Release candidate, final validation |
| `release/1.0.0` | Stable release preparation |

Commits to release branches auto-deploy to the production CDN for testing (without updating aliases). When merged to `master`, the version is bumped and aliases are updated.

### Deployment Flow

1. **Feature work** → PR to `develop` → auto-deploys to staging CDN
2. **Release prep** → create `release/X.Y.Z[-suffix]` from `develop`
3. **Testing** → commits to release branch deploy to production CDN (no aliases)
4. **Release** → PR to `master` with release label → version bump + alias updates
5. **Post-release** → master auto-syncs to develop, release branch deleted

### Repository Setup

The release workflow requires specific GitHub configuration. Run `./scripts/setup-github.sh` to configure:

**Rulesets:**
```bash
./scripts/setup-github.sh rulesets apply
```
- `master-protection` - require PR, approvals, status checks
- `develop-protection` - require PR, status checks (no approval needed)
- `release-protection` - only maintainers can create/delete `release/*` branches

**Environments:**
```bash
./scripts/setup-github.sh environments apply
```
- `production` - restricted to `master` and `release/*` branches
- `staging` - restricted to `develop` branch

**Secrets:**

The production environment requires a `RELEASE_PAT` secret for pushing version commits:

1. Create a fine-grained PAT at https://github.com/settings/tokens?type=beta
   - Repository access: this repo only
   - Permissions: Contents (read/write), Pull requests (read/write)
2. Add as environment secret in `production` (not repository secret)

See the [deployment guide](https://github.com/streamlinedcms/planning/blob/master/guides/cloudflare-github-deployment.md#cicd-security) for security details.

## Pull Requests

Before submitting a PR:

1. **Run tests**: `npm test` (all tests must pass)
2. **Format code**: `npm run format`
3. **Test in browser**: `npm run demo` and manually verify your changes
4. **Write meaningful commits**: Describe what changed and why
5. **Keep PRs focused**: One feature or fix per PR when possible

For bug fixes, include a test that would have caught the bug.

For new features, include tests and update docs/INTEGRATION.md if the feature is user-facing.
