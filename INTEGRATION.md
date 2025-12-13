# Streamlined CMS Integration Guide

This guide explains how to integrate Streamlined CMS into an HTML website to enable inline content editing.

## Quick Start

Add this script tag to your HTML `<head>`:

```html
<script
    src="https://cdn.streamlinedcms.com/client-sdk/v0.1/streamlined-cms.min.js"
    data-app-id="YOUR_APP_ID"
></script>
```

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

For plain text content like headings, labels, and simple paragraphs.

```html
<h1 data-scms-text="hero-title">Welcome to Our Site</h1>
<p data-scms-text="hero-subtitle">We build great products.</p>
```

### HTML (`data-scms-html`)

For rich content that needs formatting (bold, italic, lists, etc.). Authors edit via a code editor in the toolbar.

```html
<div data-scms-html="about-content">
    <p>This content supports <strong>bold</strong>, <em>italic</em>, and more.</p>
    <ul>
        <li>List items</li>
        <li>And other HTML</li>
    </ul>
</div>
```

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

Add `data-scms-template` to a container element. The first child becomes the template that can be repeated. Authors can add new instances, delete existing ones, and reorder them.

```html
<div class="team-grid" data-scms-template="team-member">
    <div class="team-card">
        <img data-scms-image="photo" src="placeholder.jpg" alt="Team member" />
        <h3 data-scms-text="name">Team Member Name</h3>
        <p data-scms-text="role">Role / Title</p>
    </div>
</div>
```

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

Authors need a way to sign in to enable editing. Add the `data-scms-signin` attribute to any element, typically in your footer:

```html
<footer>
    <p>&copy; 2025 Company Name | <a href="#" data-scms-signin>Sign In</a></p>
</footer>
```

The SDK automatically:
- Attaches click handlers for sign-in
- Changes the text to "Sign Out" when authenticated
- Restores the original text when signed out

**Recommended placement:** Footer or copyright section, where it's accessible but unobtrusive.

If you don't add a `data-scms-signin` element, the SDK will automatically append a default sign-in link to the page.

## Complete Example

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Website</title>
    <script
        src="https://cdn.streamlinedcms.com/client-sdk/v0.1/streamlined-cms.min.js"
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
