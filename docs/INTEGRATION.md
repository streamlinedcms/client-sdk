---
title: Integration Guide
---

# Integration Guide

This guide explains how to integrate Streamlined CMS into an HTML website to enable inline content editing.

## Quick Start

Add this script tag to your HTML `<head>` (not at the end of `<body>`):

```html
<head>
    <script
        src="https://cdn.streamlinedcms.com/client-sdk/v1/streamlined-cms.min.js"
        data-app-id="YOUR_APP_ID"
    ></script>
</head>
```

The script must be in `<head>` so it can load and apply saved content before the page renders. Placing it at the end of `<body>` would cause a flash of default content.

Get your App ID from your app details on [app.streamlinedcms.com](https://app.streamlinedcms.com).

## Script Configuration

The script tag accepts these `data-*` attributes:

| Attribute | Required | Description |
|-----------|----------|-------------|
| `data-app-id` | Yes | Your application ID from Streamlined CMS |
| `data-api-url` | No | Override the API endpoint (for development) |
| `data-app-url` | No | Override the app URL (for development) |
| `data-log-level` | No | Logging verbosity: `error`, `warn`, `info`, `debug`, `trace` |

## Marking Editable Elements

Add `data-scms-*` attributes to HTML elements to make them editable. Each element needs a unique ID within its context.

### Text (`data-scms-text`)

Use text for any single piece of content: headings, paragraphs, labels, captions, etc. Authors get a clean inline editing experience.

```html
<h1 data-scms-text="hero-title">Welcome to Our Site</h1>
<p data-scms-text="hero-subtitle">We build great products.</p>
```

**Prefer text over HTML.** If you have three headings, use three `data-scms-text` elements—not one `data-scms-html` containing all three. This gives authors a better editing experience and keeps content structured.

### HTML (`data-scms-html`)

Use HTML only when the author needs to control the actual HTML code, or when a combination of other element types (text, link, image) won't work. Authors edit via a code editor in the toolbar.

```html
<div data-scms-html="about-content">
    <p>This content supports <strong>bold</strong>, <em>italic</em>, and more.</p>
    <ul>
        <li>List items</li>
        <li>And other HTML</li>
    </ul>
</div>
```

**When to use HTML:**
- Content with tables or complex formatting
- Blocks where the structure itself needs to be editable
- Cases where you can't break the content into separate text/link/image elements

**When NOT to use HTML:**
- Individual headings, paragraphs, or labels (use `data-scms-text`)
- A paragraph that just needs one link (use a `data-scms-href` anchor with a nested `data-scms-text` label)
- Multiple separate elements that could each be their own editable (use multiple `data-scms-text`)

### Images (`data-scms-image`)

For `<img>` elements. Authors can select new images from the media manager.

```html
<img
    data-scms-image="hero-image"
    src="default-hero.jpg"
    alt="Hero image"
/>
```

### Links (`data-scms-href`)

For `<a>` elements. `data-scms-href` tracks only the link's URL and target — the anchor's inner content is left entirely under your control. To make the link text editable, nest a `data-scms-text` (or `data-scms-html`) child inside the anchor.

```html
<!-- Simple editable link: metadata on the anchor, text in a nested editable -->
<a data-scms-href="cta" href="/signup">
    <span data-scms-text="cta-label">Sign Up</span>
</a>

<!-- Icon + editable label -->
<a data-scms-href="docs" href="/docs">
    <i class="fa fa-book"></i>
    <span data-scms-text="docs-label">Read the Docs</span>
</a>

<!-- Rich editable body inside a link -->
<a data-scms-href="promo" href="/promo">
    <div data-scms-html="promo-body">
        <strong>Limited time:</strong> 20% off your first order
    </div>
</a>

<!-- Link wrapping a logo or image (nothing editable inside) -->
<a data-scms-href="logo-link" href="/">
    <img src="/logo.svg" alt="Company Logo" />
</a>
```

**Why this split?** The `<a>` element's job is navigation. Its URL/target is metadata; whatever markup sits inside is your layout. Separating them means icons, images, multi-element compositions, and rich formatted text all work inside a link without the SDK having to assume the anchor owns a single text value.

**Nesting rule:** putting `data-scms-href` and another `data-scms-*` attribute on the **same element** isn't supported — only the first matching attribute will register and a console warning is emitted. Nest a child editable inside the anchor instead:

```html
<!-- Not supported — only one of the two will register -->
<a data-scms-href="cta" data-scms-text="label" href="/x">Sign Up</a>

<!-- Do this instead -->
<a data-scms-href="cta" href="/x">
    <span data-scms-text="label">Sign Up</span>
</a>
```

**Selecting the outer anchor:** when a nested editable fills the entire interior of the `<a>` (e.g. a `data-scms-html` block that stretches edge-to-edge), clicks land on the inner editable. Select any inner editable and use the **Select outer element** button in the toolbar (icon with arrows pointing outward, next to the Content Viewer) to walk up to the anchor.

### Deprecated: `data-scms-link`

> **Legacy — prefer `data-scms-href`.** `data-scms-link` treats the anchor's inner HTML as an editable value, which conflates structure with metadata and causes rich inner markup (icons, nested editables) to be wiped when the link is inside a template. It is kept for backward compatibility; new code should use `data-scms-href` with a nested `data-scms-text` (or `data-scms-html`) for the label.

```html
<!-- Legacy -->
<a data-scms-link="cta-button" href="/get-started">Get Started</a>

<!-- Preferred -->
<a data-scms-href="cta-button" href="/get-started">
    <span data-scms-text="cta-label">Get Started</span>
</a>
```

## Groups (`data-scms-group`)

Groups organize how content is stored. Wrap sections of your page in groups to control whether content is shared across pages or isolated to a specific page.

Add `data-scms-group` to a container element. All editable elements inside are stored under that group ID.

### Shared Groups (headers, footers, sidebars)

Use the same group ID across multiple pages to share content. Edit once, update everywhere.

```html
<header data-scms-group="header">
    <div data-scms-text="logo">Company Name</div>
    <nav>
        <a data-scms-href="nav-home" href="/">
            <span data-scms-text="nav-home-label">Home</span>
        </a>
        <a data-scms-href="nav-about" href="/about">
            <span data-scms-text="nav-about-label">About</span>
        </a>
        <a data-scms-href="nav-contact" href="/contact">
            <span data-scms-text="nav-contact-label">Contact</span>
        </a>
    </nav>
</header>
```

### Page-Specific Groups

Use a unique group ID per page to isolate that page's content storage.

```html
<!-- On about.html -->
<main data-scms-group="page-about">
    <h1 data-scms-text="title">About Us</h1>
    <div data-scms-html="content">...</div>
</main>

<!-- On contact.html -->
<main data-scms-group="page-contact">
    <h1 data-scms-text="title">Contact Us</h1>
    <div data-scms-html="content">...</div>
</main>
```

Both pages can use the same element IDs (`title`, `content`) because they're in different groups.

### Why Use Groups

- **Efficiency**: Content is fetched and stored by group, reducing API calls
- **Sharing**: Shared groups (like `header`) sync content across all pages automatically
- **Isolation**: Page-specific groups keep content organized and allow reusing element IDs
- **Clarity**: Groups make it clear which content belongs together

**Note:** If groups are nested, the innermost group takes precedence. Elements inside the inner group are stored under the inner group's ID; the outer group is ignored for those elements.

## Templates (`data-scms-template`)

Use templates for repeating content blocks where authors need to add, remove, or reorder items.

Add `data-scms-template` to the **wrapper element** that will contain all instances. The first child element inside becomes the template that gets cloned for each instance. Authors can add new instances, delete existing ones, and reorder them.

**Important:** The attribute goes on the wrapper, not on individual items. Do NOT put `data-scms-template` on the repeating item itself.

```html
<!-- The attribute goes on the wrapper (team-grid), NOT on team-card -->
<div class="team-grid" data-scms-template="team-member">
    <!-- This first child is the item template - it gets cloned for each instance -->
    <div class="team-card">
        <img data-scms-image="photo" src="placeholder.jpg" alt="Team member" />
        <h3 data-scms-text="name">Team Member Name</h3>
        <p data-scms-text="role">Role / Title</p>
    </div>
</div>
```

Your HTML can include one or many instances—the SDK uses the first child as the template structure and manages all instances from there. You don't need to reduce existing instances down to one; leave your HTML as-is.

**Note:** If you have multiple instances in your HTML, ensure they all have the same structure (elements, IDs, and classes). The SDK expects all instances to match the first child's structure.

**When to use templates:**
- Lists (feature lists, benefit lists, navigation items)
- Team member listings
- Testimonials or reviews
- Product cards
- FAQ accordions
- Blog post previews
- Portfolio items

**When NOT to use templates:**
- Single, non-repeating content (use regular editable elements)
- Content where the count is fixed and known (just use individual elements)

**Note:** Nested templates (a template inside another template) are not supported. The inner template will be ignored.

### Groups Inside Templates

You can use groups inside templates for content that should be identical across all instances. Edit it once, and it updates everywhere.

```html
<div data-scms-template="product-card">
    <div class="product">
        <div data-scms-group="promo-banner">
            <span data-scms-text="promo-text">Free Shipping on Orders $50+</span>
        </div>
        <img data-scms-image="product-image" src="placeholder.jpg" alt="Product" />
        <h4 data-scms-text="product-name">Product Name</h4>
        <p data-scms-text="product-price">$0.00</p>
    </div>
</div>
```

In this example, the promo banner text is shared across all product cards, while the image, name, and price are unique to each instance.

### Links Inside Templates

Use `data-scms-href` for links inside templates. The SDK preserves the anchor's inner markup (icons, images, nested editables) across instance creation, so developer-authored layout survives. `data-scms-link` has a known issue where rich inner markup is wiped when new instances are cloned — don't use it in templates.

```html
<div data-scms-template="feature-cards">
    <article class="feature-card">
        <img data-scms-image="icon" src="placeholder.svg" alt="Feature icon" />
        <h3 data-scms-text="title">Feature title</h3>
        <div data-scms-html="description">
            <p>Feature description with <strong>rich</strong> formatting.</p>
        </div>
        <!-- Link metadata on the anchor; label as a nested editable -->
        <a data-scms-href="cta" href="/learn-more" class="btn">
            <span data-scms-text="cta-label">Learn more</span>
        </a>
    </article>
</div>
```

Each instance independently stores its own `href`, `target`, and child editable values. The icon, button styling, and surrounding layout come from the template definition and remain untouched.

## Sign-In Link

Authors need a way to sign in to enable editing. You should add a sign-in link to your footer, typically in the copyright line. Add the `data-scms-signin` attribute to a link element:

```html
<footer>
    <p>&copy; 2025 Company Name | <a href="#" data-scms-signin>Sign In</a></p>
</footer>
```

The SDK automatically:
- Attaches click handlers for sign-in
- Changes the text to "Sign Out" when authenticated
- Restores the original text when signed out

**Note:** If you forget to add a `data-scms-signin` element, the SDK will append a default sign-in link to the page. This fallback is unstyled and may not match your design, so always add your own.

## Complete Example

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Website</title>
    <script
        src="https://cdn.streamlinedcms.com/client-sdk/v1/streamlined-cms.min.js"
        data-app-id="YOUR_APP_ID"
    ></script>
</head>
<body>
    <!-- Shared header across all pages -->
    <header data-scms-group="header">
        <div data-scms-text="logo">My Company</div>
        <nav>
            <a data-scms-href="nav-1" href="/">
                <span data-scms-text="nav-1-label">Home</span>
            </a>
            <a data-scms-href="nav-2" href="/about">
                <span data-scms-text="nav-2-label">About</span>
            </a>
        </nav>
    </header>

    <!-- Page-specific content (unique group per page) -->
    <main data-scms-group="page-home">
        <h1 data-scms-text="title">Welcome</h1>
        <div data-scms-html="intro">
            <p>This is the intro paragraph with <strong>rich text</strong> support.</p>
        </div>
        <img data-scms-image="hero" src="hero.jpg" alt="Hero image" />

        <!-- Repeating team section -->
        <section>
            <h2 data-scms-text="team-heading">Our Team</h2>
            <div data-scms-template="team-member">
                <div class="team-card">
                    <img data-scms-image="photo" src="placeholder.jpg" alt="Photo" />
                    <h3 data-scms-text="name">Name</h3>
                    <p data-scms-text="role">Role</p>
                </div>
            </div>
        </section>
    </main>

    <!-- Shared footer across all pages -->
    <footer data-scms-group="footer">
        <p data-scms-text="copyright">&copy; 2025 My Company</p>
        <a href="#" data-scms-signin>Sign In</a>
    </footer>
</body>
</html>
```

## Element ID Guidelines

- Use descriptive, kebab-case IDs: `hero-title`, `nav-link-1`, `team-photo`
- IDs must be unique within their context (page, group, or template)
- Template element IDs are scoped to each instance, so `name` in one team member doesn't conflict with `name` in another

## Element Pairing

Keep logically separate elements as separate editables. Don't combine unrelated content into a single editable element.

### Logo + Company Name

```html
<!-- Separate editables for logo image and company name -->
<div class="logo-container">
    <img data-scms-image="logo" src="logo.png" alt="Logo" />
    <span data-scms-text="company-name">Acme Services</span>
</div>

<!-- If the logo itself is a link, use data-scms-href so the URL is editable
     while the image stays intact -->
<a data-scms-href="logo-link" href="/">
    <img data-scms-image="logo" src="logo.png" alt="Logo" />
</a>
```

### Text + Link Combinations

```html
<!-- Text before the link, link's label is its own editable -->
<p>
    <span data-scms-text="powered-by-text">Powered by</span>
    <a data-scms-href="powered-by-link" href="https://example.com">
        <span data-scms-text="powered-by-label">Example CMS</span>
    </a>
</p>
```

### Rich HTML inside a link

When the link's body needs formatted content (bold, italic, mixed elements), nest a `data-scms-html` child. The outer `<a>` keeps its URL/target editable; the inner block gets rich-text editing.

```html
<a data-scms-href="feature-card" href="/features/analytics">
    <div data-scms-html="feature-card-body">
        <strong>Analytics</strong> — see everything in one dashboard.
    </div>
</a>
```

When a nested editable fills the entire interior of a link, clicks land on the inner editable. Select the inner element, then use the **Select outer element** button in the toolbar to jump up to the `<a>` and edit its URL.

## Link Clickability

For the best editing experience, put padding inside links rather than using gap or margin on the parent container. This ensures the entire clickable area is part of the link element.

```html
<!-- CORRECT: Padding inside the link -->
<nav class="flex items-center">
    <a data-scms-href="nav-1" href="/" class="px-4 py-2">
        <span data-scms-text="nav-1-label">Home</span>
    </a>
    <a data-scms-href="nav-2" href="/about" class="px-4 py-2">
        <span data-scms-text="nav-2-label">About</span>
    </a>
</nav>

<!-- WRONG: Gap creates unclickable dead zones between links -->
<nav class="flex items-center gap-8">
    <a data-scms-href="nav-1" href="/">
        <span data-scms-text="nav-1-label">Home</span>
    </a>
    <a data-scms-href="nav-2" href="/about">
        <span data-scms-text="nav-2-label">About</span>
    </a>
</nav>
```

For vertical link lists:

```html
<!-- CORRECT: Block links with padding -->
<ul>
    <li>
        <a data-scms-href="menu-1" href="/services" class="block py-2">
            <span data-scms-text="menu-1-label">Services</span>
        </a>
    </li>
    <li>
        <a data-scms-href="menu-2" href="/contact" class="block py-2">
            <span data-scms-text="menu-2-label">Contact</span>
        </a>
    </li>
</ul>

<!-- WRONG: Spacing on list items creates unclickable gaps -->
<ul class="space-y-4">
    <li>
        <a data-scms-href="menu-1" href="/services">
            <span data-scms-text="menu-1-label">Services</span>
        </a>
    </li>
    <li>
        <a data-scms-href="menu-2" href="/contact">
            <span data-scms-text="menu-2-label">Contact</span>
        </a>
    </li>
</ul>
```

## SEO & Accessibility

SEO attributes (alt text, title) and accessibility attributes (ARIA labels, roles) can be configured in the CMS after content is set up. No additional HTML markup is required.

## Browser Support

The SDK is designed to work on all modern browsers (desktop and mobile).

<!-- TODO: Add specific browser version requirements -->

## JavaScript API

The SDK loads in two phases:

1. **Loader** (synchronous script) — fetches saved content from the API, populates the DOM, and removes FOUC-hiding styles. This is the critical rendering path.
2. **ESM module** (async, injected by the loader) — handles authentication, editing UI, and cross-origin bridges. This phase creates the `window.StreamlinedCMS` object.

The loader always finishes before the ESM module begins, so any `StreamlinedCMS.ready()` stage implicitly guarantees that content is already populated in the DOM.

### SDK Lifecycle Timeline

```
Loader phase:
  1. Fetch content from API
  2. Clone template instances
  3. Populate DOM elements with saved content
  4. Remove hiding styles (content is now visible)
  5. Dispatch 'streamlined-cms:loader-complete' event
  6. Inject ESM module script

ESM phase:
  7. ready('loaded')  — SDK controller created
  8. ready('auth')     — authentication status determined
  9. ready('editing')  — editing setup complete (auth required)
 10. ready('bridges')  — cross-origin bridges ready (auth required)
```

### Choosing the Right Event

| You need to... | Use |
|---|---|
| Read content from the DOM after it has been populated | `streamlined-cms:loader-complete` event |
| Access the `StreamlinedCMS` API object | `streamlined-cms:ready` event or `await StreamlinedCMS.ready()` |
| Check if the user is authenticated | `await StreamlinedCMS.ready('auth')` then read `StreamlinedCMS.isAuthenticated` |
| Wait for editing to be fully set up | `await StreamlinedCMS.ready('editing')` |
| Make cross-origin API calls via bridges | `await StreamlinedCMS.ready('bridges')` |

### Loader Event

The `streamlined-cms:loader-complete` event fires when the loader has finished populating the DOM. This is the earliest point at which saved content is visible. The `StreamlinedCMS` object does not exist yet at this point.

```javascript
document.addEventListener('streamlined-cms:loader-complete', function() {
    // Content is populated and visible in the DOM
    // StreamlinedCMS API is NOT yet available
});
```

### Waiting for the SDK

The `streamlined-cms:ready` event fires once the ESM module has loaded and the `StreamlinedCMS` controller is created. Content is already populated at this point.

```javascript
document.addEventListener('streamlined-cms:ready', function() {
    // StreamlinedCMS is now available, content is already in the DOM
    console.log('SDK version:', StreamlinedCMS.version);
});
```

### Lifecycle Stages

Use `ready(stage)` to wait for specific stages within the ESM module:

```javascript
// Wait for SDK to load — content is already populated (default)
await StreamlinedCMS.ready();

// Wait for authentication status to be determined
await StreamlinedCMS.ready('auth');

// Wait for editing setup (throws if not authenticated)
await StreamlinedCMS.ready('editing');

// Wait for cross-origin bridges (throws if not authenticated)
await StreamlinedCMS.ready('bridges');
```

**Stages:**
- `loaded` — SDK controller created; content is already in the DOM (default)
- `auth` — authentication status determined (check `isAuthenticated` after)
- `editing` — editing setup complete (throws if not authenticated)
- `bridges` — cross-origin bridges ready for API calls (throws if not authenticated)

### State Getters

```javascript
StreamlinedCMS.isAuthenticated  // boolean - whether user is signed in
StreamlinedCMS.mode             // 'author' | 'viewer' - current editing mode
StreamlinedCMS.editingEnabled   // boolean - whether editing is active
StreamlinedCMS.appId            // string - the configured app ID
StreamlinedCMS.version          // string - SDK version
```

### Event Hooks

Register handlers for SDK lifecycle events:

```javascript
function onSignIn() {
    console.log('User signed in');
}

function onSignOut() {
    console.log('User signed out');
}

// Register handlers
StreamlinedCMS.on('signin', onSignIn);
StreamlinedCMS.on('signout', onSignOut);

// Remove a handler when no longer needed
StreamlinedCMS.off('signin', onSignIn);
```

### Programmatic Sign-In

For demo sites or custom login flows, you can sign in programmatically:

```javascript
const result = await StreamlinedCMS.signIn(email, password);
if (result.success) {
    console.log('Signed in successfully');
} else {
    console.error('Sign-in failed:', result.error);
}
```

