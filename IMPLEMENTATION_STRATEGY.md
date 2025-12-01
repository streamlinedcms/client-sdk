# Client SDK Authentication & UI Architecture Plan

## Overview

This document captures architectural decisions for implementing real authentication and content management UI in the client SDK.

---

## Decisions Summary

### 1. Auth Mechanism: Two-Tier Authentication

**Decision:** Use session cookies for our domain, API keys for SDK on customer sites.

**Session Cookies (first-party, on `app.streamlinedcms.com`):**
- Standard session auth via MagicAuth
- Used by admin UI, login page, auth-check iframe
- Never exposed to customer sites

**API Keys (for SDK on customer sites):**
- Scoped to a single app
- Stored per-user in AppDO (allows app admin to revoke)
- Sliding expiry: expires after inactivity (default 60 min, configurable in app config)
- Used via `Authorization: Bearer {apiKey}` header
- Only grants content read/write, not admin access

**Security rationale:**
- Session ID never leaves our domain - malicious customer can't hijack user's full account
- API key only grants access to that specific app's content
- Domain whitelist still applies - even with valid key, origin must be whitelisted

**API Key lifecycle:**
- Created when user authenticates via auth-check iframe (if they have app permission)
- `lastUsedAt` updated on each valid request
- Expires if `now - lastUsedAt > expiryMinutes` (from app config, default 60)
- App admin can revoke keys via admin UI

**SDK Bridge (hidden iframe for all postMessage communication):**
```
SDK loads on customer.com
    │
    ▼
Hidden iframe: app.streamlinedcms.com/sdk-bridge
    │
    ▼
SDK sends postMessage: { type: 'auth-check', requestId: '123', appId: 'xxx' }
    │
    ▼
Bridge checks session cookie (first-party)
    │
    ├── Not signed in → { type: 'auth-check-result', requestId: '123', key: null }
    ├── Signed in, no permission → { type: 'auth-check-result', requestId: '123', key: null }
    └── Signed in + permission → { type: 'auth-check-result', requestId: '123', key: '...' }
    │
    ▼
SDK receives:
    ├── Got key → store in localStorage, show "Edit" button
    └── No key → show "Sign In" button
```

The SDK bridge is a single iframe endpoint that handles all postMessage communication.
Same pattern used for future operations (media manager, admin panel, etc.).

**Login flow (popup, when user clicks "Sign In"):**
```
Popup: app.streamlinedcms.com/login?appId=xxx
    │
    ├── Already signed in + no permission → "You are not authorized to edit this app"
    └── Not signed in → login form → check permission → key or error
    │
    ▼
On success: postMessage key to SDK, close popup
```

### 2. UI Asset Delivery: Web Components + Iframes

**Decision:** Use web components for simple UI, iframes for complex UI.

**Web Components (built into JS):**
- Sign-in / Edit button
- Editing toolbar
- Toast notifications

**Popup Window (hosted on our domain):**
- Login/signup page - credentials never touch customer site

**Iframes (loaded from CDN):**
- Admin control panel (settings, user management)
- Media manager (file browser, upload, cropping)
- Any complex, feature-rich UI

**Rationale:**
- Web components: tight DOM integration, simpler for focused UI
- Iframes: complete isolation, can update independently, reusable across products

### 3. Token Storage: localStorage with Expiry

**Decision:** Store session token in localStorage with expiry timestamp.

```typescript
localStorage.setItem('scms_token', JSON.stringify({
  token: sessionId,
  expiresAt: expiresAt
}));
```

**Rationale:**
- Best UX - persists across tabs, refreshes, browser restarts
- XSS risk is acceptable given limited blast radius (content editing only)
- Combat security incidents with transparency and reversibility (audit logs, session revocation) rather than relying solely on prevention

### 4. Bundle Architecture: Two Entry Scripts with Lazy Loading

**Decision:** Two entry bundles, with aggressive lazy loading within each.

**Bundles:**
```
streamlined-cms.js        → Viewer mode (public read)
streamlined-cms-admin.js  → Author mode (editing) - loaded on demand
```

**Viewer Bundle - Critical Path (target: ≤8KB, no dependencies):**
- Parse config from script tag attributes
- Fetch content from API
- Populate `[data-editable]` elements
- Remove FOUC hiding styles
- Logging via console.log only (no loganite)

**Viewer Bundle - Lazy (non-blocking, no size constraints):**
- Loganite logger (for detailed logging in auth/editing flows)
- Check localStorage for existing session
- Inject "Sign In" or "Edit" button
- Popup window handler for login (opens hosted login page)

**Author Bundle (loaded after successful auth):**
- Editing toolbar, contenteditable handlers
- Draft status UI, toast notifications
- Iframe loaders for admin/media manager

**Loading Flow:**
```
Page Load
    │
    ▼
Critical path loads (~8KB, no deps)
    │
    ▼
Fetch & populate content
    │
    ▼
User sees content (fast)
    │
    ▼
Lazy: Load loganite, check session, inject button
    │
    ▼
User clicks "Sign In" → Lazy load login modal
    │
    ▼
User authenticates → Load author bundle
```

### 5. Technology Choices

**Viewer Bundle - Critical Path:**
- **Vanilla JS** - No dependencies, pure browser APIs
- No framework overhead for simple fetch/populate logic
- Console.log for minimal logging

**Viewer Bundle - Lazy & Author Bundle (Web Components):**
- **Lit** (~5KB) - For toolbar, sign-in button, toasts
- Declarative templates, reactive properties
- Compiles to standard web components
- Shadow DOM for style isolation
- **Tailwind CSS** via Constructable Stylesheets (shared across all shadow roots)

**Hosted Login Page (app.streamlinedcms.com):**
- **Vue 3** + **Tailwind CSS** - Consistent with iframe apps
- Full page, not embedded - password managers work perfectly
- Returns token to SDK via postMessage

**Iframe Apps (Media Manager, Admin Panel):**
- **Vue 3** (~33KB) - Full application framework
- Single-file components, great devtools
- Vue Router / Pinia if needed
- **Tailwind CSS** - Utility-first styling, purged for production

**When to use Lit vs Vue:**
- Lit: Web components that may be shared across apps or embedded in host pages
- Vue: Full application UI inside iframes where we control the environment

### 6. CSS Isolation: Shadow DOM + Minimal Host Styles

**Decision:**
- All component styling inside Shadow DOM (complete isolation)
- Host page only gets minimal fixed-positioning styles

**In Shadow DOM (isolated):**
- All modal styling
- Form inputs, buttons
- Toolbar content
- Everything visual

**In Host Page (minimal):**
```css
.scms-trigger {
  position: fixed;
  z-index: 2147483647;
  /* coordinates only */
}

.scms-iframe-container {
  position: fixed;
  z-index: 2147483647;
  top: 0; left: 0;
  width: 100vw; height: 100vh;
}
```

**Rationale:**
- Customer CSS cannot affect our components
- Our CSS cannot break customer's site layout
- Fixed positioning with max z-index ensures visibility

### 7. Iframe Apps: Separate HTML Apps, Same Package

**Decision:**
- Each iframe feature is a separate HTML app (not SPA routes)
- Built within `client-sdk` package for now

**Structure:**
```
packages/client-sdk/
├── src/
│   ├── viewer/          # Public read bundle
│   ├── author/          # Edit mode bundle
│   └── components/      # Web components
├── apps/
│   ├── media-manager/   # Iframe app
│   ├── admin-panel/     # Iframe app
│   └── ...
```

**Rationale:**
- Modular - each app independent
- Simpler to start in same package
- Can split to separate packages later if complexity warrants

### 8. PostMessage Protocol: Custom Messaging Library

**Decision:** Develop a messaging library for SDK ↔ iframe communication, based on patterns from `@holo-host/comb`.

**Requirements:**
- Handshake (iframe signals ready, SDK sends init with token/config)
- Request/response pairing (for actions that return results)
- Origin validation on both sides
- Type-safe message definitions

**Basic flow:**
```
Iframe loads → sends 'ready'
SDK receives → sends 'init' { token, appId, apiUrl }
Iframe ready to operate

SDK → iframe: { type: 'open', requestId: '123' }
Iframe → SDK: { type: 'result', requestId: '123', payload: {...} }
```

### 9. Login UI: Popup Window to Hosted Login Page

**Decision:**
- Login happens on our domain (`app.streamlinedcms.com`) in a popup window, NOT in the SDK
- Customer can mark their own sign-in trigger (`data-scms-signin` attribute)
- SDK attaches click handler to marked element
- Default: inject a simple button if none marked
- Clicking trigger opens popup to `app.streamlinedcms.com/login?appId=xxx`

**Security rationale:**
- Users have one SCMS account across multiple customer apps
- If credentials were entered on customer sites, malicious customers could steal them
- By keeping auth on our domain, host site cannot access credentials (same-origin policy)
- URL bar in popup provides trust signal (user can verify domain)

**Password manager compatibility:**
- Popup is a full page on our domain - password managers work perfectly
- Native browser autofill also works
- Avoids iframe issues with credential detection

**Login flow:**
1. User clicks "Sign In" on `customer.com`
2. SDK opens popup to `app.streamlinedcms.com/login?appId=xxx`
3. User enters credentials on our domain (first-party, secure)
4. Our login page authenticates and sends token back via `postMessage`
5. SDK receives token, stores in localStorage, closes popup
6. SDK uses `Authorization: Bearer` for subsequent API calls

### 10. Editing UX: Seamless WYSIWYG with Draft System

**Edit Mode:**
- Always on when authenticated
- Page looks exactly as it would to visitors
- No visible changes unless user is interacting

**Visual Indicators:**
- Hover highlight only (desktop)
- Mobile: TBD, users assume content is editable
- Must not alter page layout

**Saving:**
- Auto-save to draft on blur/change
- Drafts are not live until published
- Draft/publish system to be built as upcoming feature

**Toolbar:**
- Fixed position (corner/edge of screen)
- Shows: draft status, unsaved/unpublished indicators
- Actions: publish, logout
- Web component with Shadow DOM

**Exit Edit Mode:**
- Logout button in toolbar
- Warn about unsaved changes (future)

---

## Implementation Phases

### Phase 1: API Key Support ✓
- Add `apiKeyExpiryMinutes` to app config (default 60)
- Add API key storage to AppDO: `{ key, userId, createdAt, lastUsedAt }`
- Add `POST /apps/:appId/keys` endpoint (requires session + app permission)
- Add `GET /apps/:appId/keys` endpoint (list keys for admin)
- Add `DELETE /apps/:appId/keys/:keyId` endpoint (revoke key)
- Add `Authorization: Bearer` support to content endpoints
- Validate key: check exists, check expiry, update `lastUsedAt`
- Keep cookie support for admin UI on our domain

**Completed:** API key CRUD in AppDO, Bearer token auth in api-worker, integration tests (11 tests), unit tests added for both packages. Coverage: durable-objects 89%, api-worker 95%.

### Phase 2: Messaging Library (Postponed)
- PostMessage abstraction
- Handshake protocol
- Request/response handling
- Used by login popup and iframe apps

**Postponed:** Using [penpal](https://github.com/Aaronius/penpal) (v7.0.4) for now. It provides promise-based postMessage communication for iframes and popups with origin validation. May revisit building `@whi/comb` as a replacement later if needed.

### Phase 3: Hosted Login Page + SDK Auth Flow
- Build login page on `app.streamlinedcms.com` (Vue 3 + Tailwind)
- Password hashing (Web Crypto API)
- Uses messaging library for returning token to SDK
- SDK: popup handler, token storage (localStorage), session validation

### Phase 4: Viewer Bundle Refactor
- Split current SDK into viewer-only core
- Critical path: ≤8KB, no dependencies
- Implement lazy session check
- Inject sign-in button

### Phase 5: Author Bundle
- Editing toolbar component
- Dynamic import on auth
- Connect to existing editing functionality

### Phase 6: Iframe Apps (Future)
- Media manager
- Admin panel
- Draft/publish UI

---

## Open Items for Future

- Mobile editing indicators
- Draft/publish system
- OAuth-like scoped permissions for iframes (if needed)
- Audit logging
- Content versioning / revert
- Session management UI (view/revoke sessions)
- Email notifications for security events

---

## Current Codebase Context

### 1. API Structure

The API is a Cloudflare Worker in `packages/api-worker/`. Key files:

- `src/index.ts` - Router setup, defines `Env` interface with `APP_DO`, `USER_DO`, `USER_INDEX_DO` bindings
- `src/auth.ts` - Auth handlers (`UsersHandler`, `SessionsHandler`), session validation via MagicAuth
- `src/apps.ts` - Content handlers, permission checking

Current auth uses session cookies (`session_id`). The `validateSession()` function in `auth.ts` needs to be updated to also accept `Authorization: Bearer` header.

### 2. Current SDK State

The SDK in `packages/client-sdk/` already has:

- **Content fetching**: `sdk.ts` fetches from `/apps/{appId}/content` and populates `[data-editable]` elements
- **Inline editing**: Uses `contenteditable`, handles click-to-edit, blur-to-save
- **FOUC prevention**: `auto-init.ts` injects hiding styles early
- **Mock auth**: Has `mockAuth` config option but doesn't send real auth to API

What's missing: real auth flow, session management, web components, bundle splitting.

### 3. MagicAuth

MagicAuth (`@whi/magicauth-sdk`) is a backend authentication service. It's already integrated in `api-worker`:

- `packages/api-worker/src/auth.ts` uses it for session creation/validation
- MagicAuth is agnostic about password format - it just compares what it receives against what was stored at creation
- **Decision: Hash client-side (SHA-512) before sending to API** - this ensures MagicAuth servers never see raw passwords
- Use Web Crypto API (`crypto.subtle.digest('SHA-512', ...)`) - no library needed
- Both signup and login must hash the same way
- No client-side MagicAuth SDK needed - just hash password and call our API

### 4. Build Tooling

Current setup in `packages/client-sdk/`:

- **Vite** for builds (replacing Rollup for consistency with other packages)
- Vitest for testing (already in use across all packages)
- Outputs UMD (`streamlined-cms.js`) and ESM (`streamlined-cms.esm.js`)
- Current bundle: ~21KB

Vite's library mode supports multiple entry points for viewer/author bundle splitting.

### 5. Content API Contract

**GET `/apps/{appId}/content`** - List all content for app:
```json
{
  "appId": "my-app",
  "count": 3,
  "elements": [
    {
      "appId": "my-app",
      "elementId": "hero-title",
      "content": "<h1>Welcome</h1>",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "updatedBy": "user-123"
    }
  ]
}
```

**PUT `/apps/{appId}/content/{elementId}`** - Save content:
```json
// Request
{ "content": "<h1>New Title</h1>", "updatedBy": "user-123" }

// Response
{ "appId": "...", "elementId": "...", "content": "...", "updatedAt": "...", "updatedBy": "..." }
```

**Mapping**: `[data-editable="hero-title"]` → `elementId: "hero-title"`

### 6. Session Token Format

The token is the MagicAuth session ID - an opaque string (not JWT). Validation happens server-side:

1. SDK sends `Authorization: Bearer {sessionId}`
2. API calls `magicauth.validate(sessionId, ip, userAgent)`
3. MagicAuth returns credential info or throws if invalid

The session ID is returned from `POST /sessions` (login endpoint).

### 7. CDN Setup

Not yet determined. Options discussed:

- Same CDN as SDK JS files
- Subdomain like `admin.streamlinedcms.com`
- Cloudflare Pages or R2

For now, the SDK will accept a configurable `adminUrl` or similar. The iframe apps will be static HTML/JS that make API calls.

---

## Key Files Reference

```
packages/
├── api-worker/
│   ├── src/
│   │   ├── index.ts      # Env interface, router
│   │   ├── auth.ts       # UsersHandler, SessionsHandler, validateSession()
│   │   └── apps.ts       # ContentElementHandler, AppConfigHandler
│   └── wrangler.toml     # DO bindings (APP_DO, USER_DO, USER_INDEX_DO)
│
├── client-sdk/
│   ├── src/
│   │   ├── index.ts      # Exports, auto-init import
│   │   ├── auto-init.ts  # Script tag config, FOUC prevention
│   │   ├── sdk.ts        # StreamlinedCMS class (fetch, edit, save)
│   │   └── types.ts      # Config interfaces
│   ├── demo/
│   │   └── index.html    # Demo page with data-editable elements
│   └── rollup.config.js  # Build config
│
├── durable-objects/
│   └── src/
│       ├── app.ts        # AppDO (content + config storage)
│       ├── user.ts       # UserDO (user permissions)
│       └── user-index.ts # UserIndexDO (email → user lookup)
│
└── shared/
    └── src/
        └── index.ts      # Hash neighborhood routing utility
```
