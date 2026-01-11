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
- A paragraph that just needs one link (use `data-scms-text` + `data-scms-link`)
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

### Links (`data-scms-link`)

For `<a>` elements. Authors can edit the URL, link text, and target.

```html
<a data-scms-link="cta-button" href="/get-started">Get Started</a>
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
        <a data-scms-link="nav-home" href="/">Home</a>
        <a data-scms-link="nav-about" href="/about">About</a>
        <a data-scms-link="nav-contact" href="/contact">Contact</a>
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
            <a data-scms-link="nav-1" href="/">Home</a>
            <a data-scms-link="nav-2" href="/about">About</a>
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
<!-- CORRECT: Separate editables for logo and name -->
<div class="logo-container">
    <img data-scms-image="logo" src="logo.png" alt="Logo" />
    <span data-scms-text="company-name">Acme Services</span>
</div>

<!-- WRONG: Combined into one link loses individual editability -->
<a href="/" data-scms-link="logo">
    <img src="logo.png" />
    <span>Acme</span>
</a>
```

### Text + Link Combinations

```html
<!-- CORRECT: Separate text and link -->
<p>
    <span data-scms-text="powered-by-text">Powered by</span>
    <a href="https://example.com" data-scms-link="powered-by-link">Example CMS</a>
</p>

<!-- WRONG: Can't edit text and link separately -->
<a href="https://example.com" data-scms-link="powered-by">Powered by Example CMS</a>
```

## Link Clickability

For the best editing experience, put padding inside links rather than using gap or margin on the parent container. This ensures the entire clickable area is part of the link element.

```html
<!-- CORRECT: Padding inside the link -->
<nav class="flex items-center">
    <a data-scms-link="nav-1" href="/" class="px-4 py-2">Home</a>
    <a data-scms-link="nav-2" href="/about" class="px-4 py-2">About</a>
</nav>

<!-- WRONG: Gap creates unclickable dead zones between links -->
<nav class="flex items-center gap-8">
    <a data-scms-link="nav-1" href="/">Home</a>
    <a data-scms-link="nav-2" href="/about">About</a>
</nav>
```

For vertical link lists:

```html
<!-- CORRECT: Block links with padding -->
<ul>
    <li><a data-scms-link="menu-1" href="/services" class="block py-2">Services</a></li>
    <li><a data-scms-link="menu-2" href="/contact" class="block py-2">Contact</a></li>
</ul>

<!-- WRONG: Spacing on list items creates unclickable gaps -->
<ul class="space-y-4">
    <li><a data-scms-link="menu-1" href="/services">Services</a></li>
    <li><a data-scms-link="menu-2" href="/contact">Contact</a></li>
</ul>
```

## SEO & Accessibility

SEO attributes (alt text, title) and accessibility attributes (ARIA labels, roles) can be configured in the CMS after content is set up. No additional HTML markup is required.

## Browser Support

The SDK is designed to work on all modern browsers (desktop and mobile).

<!-- TODO: Add specific browser version requirements -->

## JavaScript API

The SDK exposes a `window.StreamlinedCMS` object for programmatic control. Wait for the `streamlined-cms:ready` event before accessing it.

### Waiting for the SDK

```javascript
document.addEventListener('streamlined-cms:ready', function() {
    // StreamlinedCMS is now available
    console.log('SDK version:', StreamlinedCMS.version);
});
```

### Lifecycle Stages

Use `ready(stage)` to wait for specific SDK lifecycle stages:

```javascript
// Wait for SDK to load (default)
await StreamlinedCMS.ready();

// Wait for authentication status to be determined
await StreamlinedCMS.ready('auth');

// Wait for editing setup (throws if not authenticated)
await StreamlinedCMS.ready('editing');

// Wait for cross-origin bridges (throws if not authenticated)
await StreamlinedCMS.ready('bridges');
```

**Stages:**
- `loaded` - SDK module loaded, controller created (default)
- `auth` - Authentication status determined (check `isAuthenticated` after)
- `editing` - Editing setup complete (requires authentication)
- `bridges` - Penpal bridges ready for API calls (requires authentication)

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

