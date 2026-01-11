# Client SDK

[![license](https://img.shields.io/github/license/StreamlinedCMS/client-sdk?style=flat-square)](https://github.com/StreamlinedCMS/client-sdk/blob/master/LICENSE)

The Streamlined CMS client SDK is a lightweight JavaScript library that enables inline content editing for websites. Add a single script tag to your HTML and mark elements as editable—no admin interface required.

## Features

- **Inline Editing** - Edit content directly on the page with a floating toolbar
- **Multiple Content Types** - Text, rich HTML, images, and links
- **Templates** - Repeating content blocks (team members, testimonials, products) with add/remove/reorder
- **Groups** - Share content across pages (headers, footers) or isolate page-specific content
- **Zero Layout Impact** - Shadow DOM components won't interfere with your styles

## Installation

Add this script tag to your HTML `<head>`:

```html
<script
    src="https://cdn.streamlinedcms.com/client-sdk/v1/streamlined-cms.min.js"
    data-app-id="YOUR_APP_ID"
></script>
```

Get your App ID from [app.streamlinedcms.com](https://app.streamlinedcms.com).

## Quick Example

```html
<!DOCTYPE html>
<html>
<head>
    <script
        src="https://cdn.streamlinedcms.com/client-sdk/v1/streamlined-cms.min.js"
        data-app-id="YOUR_APP_ID"
    ></script>
</head>
<body>
    <header data-scms-group="header">
        <h1 data-scms-text="site-title">My Website</h1>
    </header>

    <main data-scms-group="page-home">
        <h2 data-scms-text="hero-title">Welcome</h2>
        <div data-scms-html="intro">
            <p>Edit this <strong>rich text</strong> content.</p>
        </div>
        <img data-scms-image="hero-image" src="hero.jpg" alt="Hero" />
        <a data-scms-link="cta" href="/start">Get Started</a>
    </main>

    <footer>
        <a href="#" data-scms-signin>Sign In</a>
    </footer>
</body>
</html>
```

## Documentation

See [INTEGRATION.md](./docs/INTEGRATION.md) for the complete integration guide, including:

- Script configuration options
- All editable element types
- Groups for shared/isolated content
- Templates for repeating content
- Full working examples

## Development

```bash
# Install dependencies
npm install

# Build the SDK
npm run build

# Build and watch for changes
npm run dev

# Run the demo server
npm run demo

# Run tests
npm test
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines, testing, and code style.

## Issues

Report bugs and request features on [GitHub Issues](https://github.com/StreamlinedCMS/client-sdk/issues).

## License

[LGPL-3.0](./LICENSE)
