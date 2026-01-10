# Client SDK Versioning

This document describes the versioning strategy for the Client SDK.

## Version Independence

SDK versions are **fully independent** from API versions:

- SDK version reflects client-side code changes
- API version reflects backend contract changes
- They evolve on separate timelines

```html
<script
    src="cdn.streamlinedcms.com/v1/streamlined-cms.js"
    data-api-url="https://api.streamlinedcms.com/v2"
></script>
```

SDK version in the URL path, API version in the configuration.

---

## URL Structure

Hybrid versioning with three levels of specificity:

```
cdn.streamlinedcms.com/
├── v1/streamlined-cms.js         → latest 1.x.x
├── v1.2/streamlined-cms.js       → latest 1.2.x
├── v1.2.3/streamlined-cms.js     → exact 1.2.3
```

### Version Resolution

| URL Pattern | Resolves To | Use Case |
|-------------|-------------|----------|
| `/v1/` | Latest 1.x.x | Recommended default - auto-updates |
| `/v1.2/` | Latest 1.2.x | Pin to minor, get patches |
| `/v1.2.3/` | Exact 1.2.3 | Pin to exact version |

### Examples

```html
<!-- Recommended: always get latest v1, including bug fixes -->
<script src="https://cdn.streamlinedcms.com/v1/streamlined-cms.js"></script>

<!-- Pin to minor version (e.g., if v1.3 introduced a regression) -->
<script src="https://cdn.streamlinedcms.com/v1.2/streamlined-cms.js"></script>

<!-- Pin to exact version (e.g., for debugging or compliance) -->
<script src="https://cdn.streamlinedcms.com/v1.2.3/streamlined-cms.js"></script>
```

---

## Version Baked Into Bundle

The exact version is embedded in the built JavaScript file:

```javascript
// Accessible at runtime
window.StreamlinedCMS.version // "1.2.3"
```

**Use cases:**
- Debugging: "What version are you running?" → check console
- Support: User reports issue, ask for `StreamlinedCMS.version`
- Analytics: Track version distribution across customer sites

### Build Configuration

The version is injected at build time from `package.json`:

```javascript
// rollup.config.js
import { readFileSync } from 'fs';
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

const replacePlugin = replace({
    preventAssignment: true,
    values: {
        __SDK_VERSION__: JSON.stringify(pkg.version),
        // ... other replacements
    },
});
```

```typescript
// In SDK source
export const version = __SDK_VERSION__;
```

---

## Available Files Per Version

Each version directory contains:

```
/v1.2.3/
├── streamlined-cms.js          # Sync loader (IIFE, unminified)
├── streamlined-cms.min.js      # Sync loader (IIFE, minified)
├── streamlined-cms.esm.js      # Full bundle (ESM, unminified)
└── streamlined-cms.esm.min.js  # Full bundle (ESM, minified)
```

The sync loader is the primary entry point for most users. It handles FOUC prevention and lazy-loads the full bundle.

---

## Deployment Strategy

### Directory Structure on CDN

```
cdn.streamlinedcms.com/
├── v1/                    # Symlink or redirect to latest 1.x.x
├── v1.0/                  # Symlink or redirect to latest 1.0.x
├── v1.0.0/                # Actual files
├── v1.0.1/                # Actual files
├── v1.1/                  # Symlink or redirect to latest 1.1.x
├── v1.1.0/                # Actual files
├── v2/                    # Symlink or redirect to latest 2.x.x
└── ...
```

### Release Process

When releasing v1.2.3:

1. Build the bundle with version baked in
2. Deploy to `/v1.2.3/` directory
3. Update `/v1.2/` to point to `/v1.2.3/`
4. Update `/v1/` to point to `/v1.2.3/`

### Cloudflare Pages/Workers Implementation

Options for version routing:

**Option A: Static directories with redirects**
- Upload each version to its own directory
- Use `_redirects` file for `/v1/` → `/v1.2.3/`
- Update redirects on each release

**Option B: Worker-based routing**
- Single Worker handles version resolution
- Lookup table: `v1` → `1.2.3`, `v1.2` → `1.2.3`
- Fetch from R2 or serve from KV

---

## Cache Headers

Different cache strategies per version type:

| URL Pattern | Cache Strategy | Rationale |
|-------------|---------------|-----------|
| `/v1.2.3/` | Immutable, long TTL | Exact version never changes |
| `/v1.2/` | Short TTL or revalidate | May update when patch releases |
| `/v1/` | Short TTL or revalidate | May update when minor/patch releases |

```
# Exact version - cache forever
/v1.2.3/*
  Cache-Control: public, max-age=31536000, immutable

# Minor version - revalidate
/v1.2/*
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400

# Major version - revalidate
/v1/*
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
```

---

## API Compatibility

> **TODO:** Link to api-worker versioning strategy once documented.

SDK versions document which API versions they support:

| SDK Version | Compatible API Versions | Notes |
|-------------|------------------------|-------|
| 1.0.x | v1 | Initial release |
| 1.1.x | v1 | Added template support |
| 1.2.x | v1, v2 | Works with both |
| 2.0.x | v2+ | Dropped v1 API support |

This is documented in:
- SDK changelog
- SDK README
- Console warning if incompatible API detected

```javascript
// Runtime compatibility check (optional)
if (apiVersion < minSupportedApiVersion) {
    console.warn(`SDK ${sdkVersion} requires API v${minSupportedApiVersion}+`);
}
```

---

## Breaking Changes (Major Version)

When to bump major version:

- Removing SDK features
- Changing configuration attributes
- Changing `data-scms-*` attribute semantics
- Dropping support for API versions
- Changing default behaviors

**Migration path:**
1. Document changes in changelog
2. Provide migration guide
3. Consider console warnings in old version pointing to upgrade docs
4. Maintain old major version for reasonable period

---

## Prerelease Versions

Prerelease versions allow testing before stable release. They have their own alias pipeline, isolated from stable aliases.

### Prerelease Types

| Type | Example | Purpose |
|------|---------|---------|
| Alpha | `1.0.0-alpha.0` | Early testing, incomplete features |
| Beta | `1.0.0-beta.0` | Feature complete, external testing welcome |
| RC | `1.0.0-rc.0` | Release candidate, believed ready |

### Prerelease URL Structure

```
cdn.streamlinedcms.com/
├── beta/streamlined-cms.js       → latest beta (any version)
├── rc/streamlined-cms.js         → latest rc (any version)
├── v1.0.0-beta/streamlined-cms.js → latest 1.0.0 beta build
├── v1.0.0-rc/streamlined-cms.js   → latest 1.0.0 rc build
├── v1.0.0-beta.3/streamlined-cms.js → exact prerelease
```

### Prerelease Aliases

Prerelease aliases are separate from stable aliases:

| Alias | Resolves To | Updated When |
|-------|-------------|--------------|
| `beta` | Latest beta of any version | New beta published |
| `rc` | Latest rc of any version | New rc published |
| `1.0.0-beta` | Latest beta for 1.0.0 | New 1.0.0 beta published |
| `1.0.0-rc` | Latest rc for 1.0.0 | New 1.0.0 rc published |

**Important:** Prerelease versions never update stable aliases (`latest`, `v1`, `v1.0`).

### Cache Headers for Prereleases

| URL Pattern | Cache Strategy |
|-------------|---------------|
| `/v1.0.0-beta.3/` | Immutable, long TTL (exact prerelease) |
| `/v1.0.0-beta/` | Short TTL, revalidate (alias) |
| `/beta/` | Short TTL, revalidate (alias) |

### Future Expansion

Major/minor prerelease aliases (e.g., `beta/1`, `beta/1.0`) may be added if a use case emerges for tracking prereleases across version lines. Currently deferred as typical workflow has only one version in beta at a time.

---

## Version Discovery

For tooling and automation, provide a version manifest:

```
GET https://cdn.streamlinedcms.com/versions.json
```

```json
{
  "latest": "1.2.3",
  "versions": {
    "1": "1.2.3",
    "1.2": "1.2.3",
    "1.1": "1.1.5",
    "1.0": "1.0.8"
  },
  "all": ["1.2.3", "1.2.2", "1.2.1", "1.1.5", "1.0.8", ...]
}
```

Use cases:
- CI/CD checking for updates
- Dashboard showing current vs latest
- Automated upgrade PRs
