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

## Marking Up a Site

Work in this order. Each step depends on the one before it.

1. **Plan the shared values.** Before adding any attributes, list the content that has to match wherever it appears (prices, phone numbers and email addresses, a tagline, anything repeated) and decide which [shared group](#shared-groups-content-that-must-match-everywhere) holds each one. Name groups after what they hold.
2. **Mark up the shared pieces first.** The header, footer and any component used on several pages get their groups and IDs before any page does, because pages reuse those groups and IDs.
3. **Then one page at a time,** each inside its own `page-<name>` group (see [Page-specific groups](#page-specific-groups)).
4. **Check each page signed in before moving on.** Open it in edit mode and look for:
    - "Structure differs from first item template" and other `[StreamlinedCMS]` warnings in the browser console
    - layout that moves when editing turns on (see [Edit Mode and Layout](#edit-mode-and-layout))
    - text you can't click to edit, or clicks that select the wrong element

## How Content Is Stored

Every editable element is saved under a key built from its group and its own ID: `groupId:elementId`. Elements that share a key share **one stored value**. That one rule explains most of what follows:

- Two elements with the same group ID and element ID, on the same page or on different pages, always show the same content. Editing one updates the others.
- Two elements with the same element ID in **different** groups are unrelated.
- Template items add their own instance ID to the key (`groupId:templateId.instanceId.elementId`), so every item stores its own copy of each element.

Each element type stores something different, and when saved content is applied, the SDK **replaces** the matching part of the element with it:

| Type | Goes on | What is stored | What gets replaced |
|------|---------|----------------|--------------------|
| `data-scms-text` | Any element | Plain text (line breaks allowed) | **Everything inside the element.** Child elements are erased. |
| `data-scms-html` | A wrapping container, usually a `<div>` | The element's inner HTML | Everything inside the element |
| `data-scms-image` | `<img>` only | The image `src` | The `src` |
| `data-scms-href` | `<a>` only | The link's URL and target | The `href` and `target` only. Children are never touched. |

Put **one** content type (`data-scms-text`, `-html`, `-image` or `-href`) on an element. If an element has more than one, only the first one found is used and the rest are ignored (the console warns about it). To combine behaviours, nest one editable inside another. `data-scms-group` isn't a content type and can sit alongside one (see [Shared groups](#shared-groups-content-that-must-match-everywhere)).

## Marking Editable Elements

Add `data-scms-*` attributes to HTML elements to make them editable. Each element needs an ID that's unique within its group (see [IDs and where they must be unique](#ids-and-where-they-must-be-unique)).

### Text (`data-scms-text`)

For a single piece of content with **one consistent style** that the layout sizes to fit: a heading, a label, a button, a caption, a line of card copy. Authors type straight into the page.

```html
<h1 data-scms-text="hero-title">Welcome to Our Site</h1>
<p data-scms-text="hero-subtitle">We build great products.</p>
```

A text element stores plain text. Whenever its content is loaded or saved, everything inside the element is replaced with that text, so **any child elements are erased**: `<span>`s that change colour or font, `<strong>`, `<em>`, icons, links. Line breaks the author types are kept (stored as new lines and shown with `<br>`), and those are the only markup that survives.

Whitespace in your source (indentation, or a code formatter putting the text on its own line) becomes part of the starting text. The SDK currently collapses it, so it's harmless, but where you can, keep the text tight against its tags: `<h2 data-scms-text="title">Our Team</h2>`.

```html
<!-- WRONG: the coloured span is erased the first time content loads -->
<h1 data-scms-text="hero-title">
    Ready to grow? <span class="text-red-600">We can help.</span>
</h1>

<!-- RIGHT: one text element per style -->
<h1>
    <span data-scms-text="hero-title-lead">Ready to grow?</span>
    <span class="text-red-600" data-scms-text="hero-title-accent">We can help.</span>
</h1>
```

### HTML (`data-scms-html`)

For content the author should be able to **format**: prose with bold or italic words, links inside a sentence, several paragraphs, lists, subheadings. Authors edit it in a simple rich-text editor (paragraphs, headings H1 to H3, bold, italic, underline, strikethrough, inline code, bulleted and numbered lists, quotes, links and horizontal rules), and can switch to a raw HTML editor from the toolbar. The editor writes `<p>`, `<h1>`–`<h3>`, `<strong>`, `<em>`, `<u>`, `<s>`, `<code>`, `<ul>`/`<ol>`/`<li>`, `<blockquote>`, `<a>` and `<hr>`, so style those tags from the wrapper.

**Put `data-scms-html` on the element that wraps the content (usually a `<div>`), never on a `<p>` or a heading.** The editor creates block elements, such as a new paragraph when the author presses Enter, or a list. Inside a `<p>` those become invalid nested markup that browsers rearrange.

```html
<!-- WRONG: the first Enter or list puts a <p> or <ul> inside a <p> -->
<p data-scms-html="about-body">We started in 2015.</p>

<!-- RIGHT: the wrapper is editable; the paragraphs are its content -->
<div data-scms-html="about-body">
    <p>We started in <strong>2015</strong> with one client.</p>
    <p>Today we work with businesses across Canada.</p>
</div>
```

Keep layout and styling outside the HTML element. The editor works with the formatting listed above; custom classes, wrapper `<div>`s and images inside it aren't something authors can manage. Style the content from the wrapper instead (for example with a `prose` class or `.about-body p { … }`).

**If your framework scopes component styles** (Astro, Vue's `<style scoped>`, Svelte), it does so by adding an attribute or class to each element it renders and matching on it. The content of an HTML element is replaced by the editor and by saved content, without that marker, so scoped rules for it stop applying, for visitors as well as while editing. Write the rules for the content so they don't need the marker: keep the wrapper scoped and mark the inner part global, e.g. `.about-body :global(p)` in Astro and Svelte or `.about-body :deep(p)` in Vue, or put them in a global stylesheet.

### Choosing between text and HTML

Ask these in order:

1. **Should the author be able to format it** (bold a word, add a link mid-sentence, add a paragraph or a list)? Use **HTML** on the wrapper. This includes a single paragraph, as long as the layout has room for it to grow into more paragraphs. Use text when the design can't take more than the one line or paragraph, such as a card caption, a button label or copy sized to fit a fixed box.
2. **Does the content you're marking up already contain child elements or style changes** (a coloured word, a `<strong>`, a `<br>` for layout, an icon)? Either split it into one **text** element per style, or use **HTML** if the author should control that formatting. Never use text: it erases them.
3. **Otherwise**, it's one plain, uniformly styled piece of content: use **text**.

| Content | Use |
|---------|-----|
| A heading, button label or caption in one style | `data-scms-text` |
| A heading with one word in a different colour | Two `data-scms-text` spans, styled separately |
| A paragraph containing a link or a bold word | `data-scms-html` on a `<div>` around the `<p>` |
| An "About" section with several paragraphs | `data-scms-html` on the `<div>` wrapping them |
| Three separate headings | Three `data-scms-text` elements, not one `data-scms-html` around all three |
| A link's own label | `data-scms-text` nested in a `data-scms-href` anchor (see [Links](#links-data-scms-href)) |

### Images (`data-scms-image`)

For `<img>` elements only. Authors pick a new image from the media manager, and the SDK replaces the image's `src`.

```html
<img data-scms-image="hero-image" src="default-hero.jpg" alt="Hero image" />
```

- **Background images set with CSS aren't editable.** Use a real `<img>` positioned behind the content instead (see [Edit Mode and Layout](#edit-mode-and-layout) for how to position it).
- `<picture>`/`<source>` and `srcset` aren't managed. If the `<img>` has a `srcset`, the browser keeps using it after the author changes the `src`, so leave `srcset` off editable images.

### Links (`data-scms-href`)

For `<a>` elements only. `data-scms-href` stores only the link's URL and target; everything inside the anchor is left alone. To make the link text editable, nest a `data-scms-text` (or `data-scms-html`) inside the anchor.

```html
<!-- Editable URL with an editable label -->
<a data-scms-href="cta" href="/signup">
    <span data-scms-text="cta-label">Sign Up</span>
</a>

<!-- Icon + editable label: the icon is layout and stays put -->
<a data-scms-href="docs" href="/docs">
    <i class="fa fa-book"></i>
    <span data-scms-text="docs-label">Read the Docs</span>
</a>

<!-- Link wrapping a logo or icon (nothing editable inside) -->
<a data-scms-href="logo-link" href="/">
    <img src="/logo.svg" alt="Company Logo" />
</a>

<!-- Rich editable body inside a link -->
<a data-scms-href="promo" href="/promo">
    <div data-scms-html="promo-body">
        <strong>Limited time:</strong> 20% off your first order
    </div>
</a>
```

`data-scms-href` and another `data-scms-*` attribute on the **same** element don't combine: nest the label instead.

```html
<!-- Not supported: only one of the two attributes is used -->
<a data-scms-href="cta" data-scms-text="label" href="/x">Sign Up</a>

<!-- Do this instead -->
<a data-scms-href="cta" href="/x">
    <span data-scms-text="label">Sign Up</span>
</a>
```

**Selecting the outer anchor:** when a nested editable fills the whole link, clicks land on the inner editable. Select it, then use the **Select outer element** button in the toolbar (the icon with arrows pointing outward, next to the Content Viewer) to move up to the anchor and edit its URL.

### Deprecated: `data-scms-link`

> **Legacy: use `data-scms-href`.** `data-scms-link` stores the anchor's inner HTML as its value, so icons and nested editables inside the link are wiped when it's inside a template. It's kept for backward compatibility only.

```html
<!-- Legacy -->
<a data-scms-link="cta-button" href="/get-started">Get Started</a>

<!-- Preferred -->
<a data-scms-href="cta-button" href="/get-started">
    <span data-scms-text="cta-label">Get Started</span>
</a>
```

## Groups (`data-scms-group`)

Add `data-scms-group` to a container element. Every editable inside it is stored under that group's ID. Because the group ID is part of each element's key (see [How Content Is Stored](#how-content-is-stored)), **groups decide what stays in sync**:

- **Same group ID, same element ID → one value**, everywhere it appears.
- **Different group IDs → separate values**, even when the element IDs match.

Wrap every editable in a group.

### Shared groups: content that must match everywhere

Anything that has to read the same wherever it appears belongs in a shared group, used with the same ID everywhere it's needed. Name shared groups after **what they hold** (`pricing`, `contact-details`, `company`), not where they first appear (`site-footer`), since the same content often turns up somewhere else later.

**When in doubt, don't share.** Share content only when it must be identical by nature: a price, a phone number, the company's legal name, a call to action or sign-up that does the same thing wherever it appears. Content that's only *coincidentally* the same (two pages that both happen to have a section headed "How it works", or the same intro sentence used twice) belongs in each page's own group, so an author can reword one without changing the other. Headers and footers are the obvious case, but it applies just as much to:

- **Prices**, so a price changed on the pricing page also changes on the home page
- Phone numbers, email addresses and opening hours
- A tagline or a call-to-action repeated on several pages

```html
<!-- Header, identical on every page -->
<header data-scms-group="header">
    <nav>
        <a data-scms-href="nav-home" href="/" class="px-4 py-2">
            <span data-scms-text="nav-home-label">Home</span>
        </a>
        <a data-scms-href="nav-about" href="/about" class="px-4 py-2">
            <span data-scms-text="nav-about-label">About</span>
        </a>
    </nav>
</header>

<!-- On the home page -->
<p>
    Plans from
    <span data-scms-group="pricing"><span data-scms-text="starter-price">$100</span></span>/month
</p>

<!-- On the pricing page: same group, same ID, so it's the same value -->
<div data-scms-group="pricing">
    <h3>Starter</h3>
    <p data-scms-text="starter-price">$100</p>
</div>
```

The group can be any element. An inline `<span>` works, as the home-page example shows, so a single synced value can sit inside an otherwise page-specific section.

A single editable that needs its own group can carry `data-scms-group` itself; no wrapper is needed. The two forms below store the same value:

```html
<span data-scms-group="pricing" data-scms-text="starter-price">$100</span>

<span data-scms-group="pricing"><span data-scms-text="starter-price">$100</span></span>
```

Use a wrapper only when several editables share the group.

### Page-specific groups

Give each page's main content its own group ID, so its content is stored separately and can reuse simple element IDs.

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

Both pages can use `title` and `content` because they're in different groups.

### Author-only panels

Some values are easier to edit side by side than one at a time where they appear: a full price list, prices in several currencies, the numbers behind a calculator. For these, add a panel that only signed-in authors see, listing every value in one place.

The panel works through the same rule as any shared group: **it uses the same group and element IDs as the copies shown on the page**, so editing a value in the panel updates every copy, and editing a copy updates the panel.

```html
<!-- On the page: the price in the visitor's currency, edited in place -->
<span data-scms-group="pricing">
    <span class="price-cad">$<span data-scms-text="starter-cad">100</span></span>
    <span class="price-usd">$<span data-scms-text="starter-usd">100</span></span>
    <span class="price-eur">€<span data-scms-text="starter-eur">100</span></span>
</span>/month

<!-- Author-only panel: every price and currency in one table -->
<section id="price-panel" data-scms-group="pricing" hidden>
    <h2>Prices (only visible to you while signed in)</h2>
    <table>
        <tr><th></th><th>CAD</th><th>USD</th><th>EUR</th></tr>
        <tr>
            <th>Starter, per month</th>
            <td>$<span data-scms-text="starter-cad">100</span></td>
            <td>$<span data-scms-text="starter-usd">100</span></td>
            <td>€<span data-scms-text="starter-eur">100</span></td>
        </tr>
    </table>
</section>

<script>
    // Show the panel only to signed-in authors
    async function connect(cms) {
        const panel = document.getElementById("price-panel");
        const sync = () => (panel.hidden = !cms.isAuthenticated);
        await cms.ready("auth");
        sync();
        cms.on("signin", sync);
        cms.on("signout", sync);
    }
    // The SDK may already be loaded by the time this script runs
    if (window.StreamlinedCMS) connect(window.StreamlinedCMS);
    else
        document.addEventListener("streamlined-cms:ready", () => connect(window.StreamlinedCMS), {
            once: true,
        });
</script>
```

- **Keep symbols, units and labels outside the editable elements** (`$`, `€`, `/month`), so authors only type the number. Keep the symbol and the editable element together with no whitespace between them: if a code formatter splits `$<span …>100</span>` across lines, the page shows "$ 100". Wrapping the pair in an inline-flex element (`<span class="inline-flex">`) avoids that.
- **Every value is text.** There's no number type, so if your code reads a value (to calculate an estimate, for example), parse it and handle text that isn't a number.
- **Multiple currencies or variants** are separate values, one element ID each. Show only the visitor's currency with CSS; the author edits the others in the panel. Nothing converts between them.
- **One panel per shared group**, listing every value in that group (not just the ones on the page it sits on), on **one** page: the page where those values matter most, or a dedicated page. Put it at the bottom, and say on it that visitors can't see it.

### Nested groups

If groups are nested, the innermost group wins. Elements inside the inner group are stored under the inner group's ID, as with the `pricing` span inside a page group above.

### Elements outside any group

Editables that aren't inside any group are stored in a catch-all bucket of ungrouped content. It exists in case grouping is skipped; don't rely on it. Put every editable inside a group so it's clear whether its content is shared or page-specific.

### IDs and where they must be unique

**One ID per value.** Give each separate piece of content its own ID, and reuse an ID only when you want the copies to show the same value (a shared price, a panel entry). Two unrelated elements with the same ID in the same group would overwrite each other.

| Where the element is | Each value's ID is unique within |
|----------------------|----------------------------------|
| Inside a group | That group, across every page that uses the group |
| Inside a template item | That item (each item stores its own copy) |
| Inside a group inside a template | That group, and it's shared by every item |

Use descriptive, kebab-case IDs (`hero-title`, `nav-home-label`, `team-photo`) and don't put dots in group, template or element IDs: dots separate the parts of template keys.

Template IDs must also be unique **across the whole page**, even when the templates are in different groups.

## Templates (`data-scms-template`)

Use a template wherever **an author might want to add, remove or reorder items**. The question isn't how many items there are today, but whether an author could ever want one more:

- Lists: features, benefits, services
- FAQs
- Tags, badges and labels
- Team members, testimonials, logos of clients
- Product, portfolio or blog cards

Use individual elements instead when the items aren't interchangeable:

- **A fixed sequence where each item is its own content.** For example, a three-step process (Evaluate → Clean up → Keep watch) where each step has a different structure, its own price or its own sub-list. Adding a fourth step would be a change to the business, not to the content.
- **A layout where the number of items is part of the design**, such as exactly two columns of a comparison.

The test is whether the items are copies of one pattern that an author could add to (a template), or distinct pieces that happen to sit side by side (individual elements).

### Markup

Put `data-scms-template` on the **wrapper** that holds the items. Every element child of the wrapper is an item, and the **first** child is the model that new items are cloned from.

```html
<!-- The attribute goes on the wrapper (team-grid), NOT on team-card -->
<div class="team-grid" data-scms-template="team-member">
    <!-- First child: cloned for each new item -->
    <div class="team-card">
        <img data-scms-image="photo" src="placeholder.jpg" alt="Team member" />
        <h3 data-scms-text="name">Team Member Name</h3>
        <p data-scms-text="role">Role / Title</p>
    </div>
    <div class="team-card">
        <img data-scms-image="photo" src="jane.jpg" alt="Team member" />
        <h3 data-scms-text="name">Jane Doe</h3>
        <p data-scms-text="role">Designer</p>
    </div>
</div>
```

- Leave every existing item in your HTML; there's no need to cut it down to one.
- Every item must have the same structure as the first: the same elements, classes and IDs. The SDK flags items that differ.
- Headings, intro text and "view all" links go **outside** the wrapper. Anything inside it is treated as an item.
- Once an author saves the template, the saved items replace the items in your HTML.
- Templates inside templates aren't supported; the inner one is ignored.

### Designing for templates

Every item is a clone of the first, so **differences between items have to come from CSS, not from markup**. Before turning a section into a template, check whether its items differ in their HTML. If they do, rework the design so the differences come from position:

| Design | Instead of… | Use |
|--------|-------------|-----|
| Alternating image left/right | A different class on every other item | `:nth-child(even)` (Tailwind: `even:flex-row-reverse`) |
| Numbered steps ("01", "02", "03") | Numbers typed into each item | A CSS counter (`counter-increment` and `::before { content: counter(step, decimal-leading-zero) }`) |
| A highlighted first or last item | A special class on that item | `:first-child` / `:last-of-type` (see [Edit Mode and Layout](#edit-mode-and-layout) for why not `:last-child`) |

**Icons stay in code.** Keep icons as part of the design rather than making them editable images, so they always match the site's colours and style. What that means for a template depends on *why* the icons differ:

- **The difference comes from position** (the last item gets an arrow instead of a check, every other item is mirrored): it's still a template. Put every variant in every item and let CSS show the right one, e.g. `group-last-of-type:hidden` on the check and `hidden group-last-of-type:block` on the arrow.
- **Each item has its own icon for its own reason** (a lock for security, a card for billing): it isn't a template. Give every item the same icon, or mark the items up as individual elements, each with its icon in code. This holds even when the items look like a list that would otherwise be a template: the icons are part of the design, so authors can't add an item.

**Icon libraries that reuse drawings break item matching.** Some icon components (Astro's `astro-icon`, other SVG sprite setups) write an icon's full drawing only the first time it appears on a page and make every later copy a short reference to it. The first template item then contains the drawing and the others only references, so the SDK reports "Structure differs from first item template". Either:

- **render the icon in full every time** (in `astro-icon`, `<Icon is:inline name="…" />`), or
- **place one hidden copy of each icon before the template** (`<Icon name="lucide:star" class="hidden" aria-hidden="true" />`), so the full drawing lands outside it and every item gets the same reference.

**Values that sync can't sit inside a template item.** A shared group inside a template is shared by *every* item, so items can't each point at a different shared value (for example, a different price per plan). Keep such items as individual elements, or type the value into the item as ordinary text, knowing it won't stay in sync with anywhere else.

**Alt text in template items:** a new item is cloned from the first, including its `alt`. Give template images generic alt text (for example `alt="Team member"`, not `alt="Jane Doe"`) so new items aren't described as someone else.

Items an author adds start empty: their text is blank (shown as "Click to edit") and images show a grey placeholder until filled in.

If your build tool generates the items from data in your code (an array of FAQs, steps or team members), that data only provides the starting content. After an author edits the template, the CMS holds the real list, and later changes to the array in code don't appear on the site.

### What templates can't handle yet

Leave these in code (individual elements, or not editable) rather than building workarounds:

- **Items with optional parts.** If some items have a part that others don't (a quote, a website link, a second screenshot), the items don't share one structure, and the SDK has no way to mark a part as optional. Don't put every part in every item and hide the empty ones: authors would see empty slots on every item.
- **Items with a category that drives behaviour.** If an item's type picks its icon or decides which filter shows it, that type is data, not wording, and a template item can only store text, HTML, images and links. Keep the category in code; such items can't be a template.

### Groups inside templates

A group inside a template is shared by every item. Use it for content that should be identical in each item.

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

Here the promo banner is shared across all product cards, while the image, name and price are unique to each one.

### Links inside templates

Use `data-scms-href` with a nested label. The anchor's icons, images and styling come from the template and are kept in every item, while each item stores its own URL, target and label. (`data-scms-link` wipes the inner markup of new items, so don't use it in templates.)

```html
<div data-scms-template="feature-cards">
    <article class="feature-card">
        <h3 data-scms-text="title">Feature title</h3>
        <div data-scms-html="description">
            <p>Feature description with <strong>rich</strong> formatting.</p>
        </div>
        <a data-scms-href="cta" href="/learn-more" class="btn">
            <span data-scms-text="cta-label">Learn more</span>
        </a>
    </article>
</div>
```

## Edit Mode and Layout

When an author signs in and editing turns on, the SDK adds styles and controls to the page. Visitors never see them, but some can move your layout around while the author is editing. Build pages so editing doesn't change how they look.

**What the SDK changes in edit mode:**

- **Every editable gets `position: relative`.** It overrides your own positioning, so an editable that relies on `position: absolute`, `fixed` or `sticky` drops back into the page flow. ([client-sdk#105](https://github.com/streamlinedcms/client-sdk/issues/105) tracks this.)
- **Each template wrapper gets an "Add item" `<button>` as its last child.** It takes up space in grid and flex layouts, and `:last-child` styles move to it. Style the last item with `:last-of-type` instead (the button is a different element from your items).
- **Template items get delete and drag controls**, absolutely positioned in their top corners, once there are two or more items.
- **Empty editables show "Click to edit"** so the author can find them, which adds a line of text to elements that are normally empty.
- **HTML elements' content is replaced by the editor** when an author clicks in. Styles your framework scoped to the original markup stop applying to it (see [HTML](#html-data-scms-html)).
- **Links don't navigate** while editing, so authors can select them.
- **Collapsible content stays collapsed.** Editables inside a closed `<details>` element or a hidden tab can't be clicked until the author opens it, and clicking an editable inside a `<summary>` may also open or close it.

### Don't position editable elements

Put the positioning on a wrapper and keep the editable itself unpositioned. A full-bleed background photo is the common case:

```html
<!-- WRONG: in edit mode the image loses position: absolute and pushes the content down -->
<section class="relative">
    <img class="absolute inset-0 h-full w-full object-cover" data-scms-image="bg" src="bg.jpg" alt="" />
    <div class="relative">…</div>
</section>

<!-- RIGHT: the wrapper is positioned; the editable image just fills it -->
<section class="relative">
    <div class="absolute inset-0">
        <img class="h-full w-full object-cover" data-scms-image="bg" src="bg.jpg" alt="" />
    </div>
    <div class="relative">…</div>
</section>
```

### Text in attributes and form controls

The SDK edits element content, not attributes, so these aren't directly editable: input `placeholder`s, the text of `<option>`s in a `<select>`, validation messages your script shows, and `title`/`aria-label` wording. When an author needs to change them, list them as text elements in an [author-only panel](#author-only-panels) and have your page script copy each value into its attribute once content has loaded (see [Running page scripts after content loads](#running-page-scripts-after-content-loads)). Otherwise leave them in code.

Clicks on editables in edit mode don't trigger native behaviour (the SDK prevents it), so an editable label inside a button or a form doesn't submit the form while editing.

### Make the whole link clickable

In rows and lists of small links (navigation, footer link lists, social icons), put padding inside the links rather than gaps or margins between them, so the whole area around each link is the link, and selectable. This doesn't apply to buttons, where the visible pill or box already is the link: spacing buttons apart with `gap` is fine.

```html
<!-- CORRECT: padding inside the link -->
<nav class="flex items-center">
    <a data-scms-href="nav-1" href="/" class="px-4 py-2">
        <span data-scms-text="nav-1-label">Home</span>
    </a>
    <a data-scms-href="nav-2" href="/about" class="px-4 py-2">
        <span data-scms-text="nav-2-label">About</span>
    </a>
</nav>

<!-- WRONG: the gap creates unclickable dead zones between links -->
<nav class="flex items-center gap-8">
    <a data-scms-href="nav-1" href="/">
        <span data-scms-text="nav-1-label">Home</span>
    </a>
    <a data-scms-href="nav-2" href="/about">
        <span data-scms-text="nav-2-label">About</span>
    </a>
</nav>
```

For vertical lists, make each link a block with vertical padding (`class="block py-2"`) rather than spacing the list items apart (`space-y-4`).

## Sign-In Link

Authors need a way to sign in. Add a link with the `data-scms-signin` attribute, typically in the footer's copyright line:

```html
<footer>
    <p>&copy; 2025 Company Name | <a href="#" data-scms-signin>Sign In</a></p>
</footer>
```

The `href="#"` is only a placeholder: once the SDK loads, it takes over the link's clicks to open the sign-in. If the SDK isn't on the page (for example a local dev server that isn't configured with your App ID), clicking it just jumps to `#`.

The SDK:

- Opens the sign-in when the link is clicked
- Changes the link's text to "Sign Out" while the author is signed in (so keep it plain text; child elements are replaced)
- Restores the original text after sign-out

**Note:** If the page has no `data-scms-signin` element, the SDK appends a small, unstyled "Sign In" link to the bottom of the page. Always add your own so it fits your design.

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
    <!-- Pointer for non-JS clients (crawlers, AI agents) to the live content API.
         Invisible to browsers, which run the SDK and get live copy. -->
    <noscript><pre>NOTE FOR AUTOMATED CLIENTS / AI AGENTS: The visible text on this page is a fallback snapshot and may be out of date. Content is served live by StreamlinedCMS.

To read the current copy, GET:
  https://api.streamlinedcms.com/v1/apps/YOUR_APP_ID/content</pre></noscript>

    <!-- Shared header across all pages -->
    <header data-scms-group="header">
        <nav class="flex">
            <a data-scms-href="nav-1" href="/" class="px-4 py-2">
                <span data-scms-text="nav-1-label">Home</span>
            </a>
            <a data-scms-href="nav-2" href="/about" class="px-4 py-2">
                <span data-scms-text="nav-2-label">About</span>
            </a>
        </nav>
    </header>

    <!-- Page-specific content (unique group per page) -->
    <main data-scms-group="page-home">
        <h1>
            <span data-scms-text="title-lead">Welcome.</span>
            <span class="accent" data-scms-text="title-accent">We're glad you're here.</span>
        </h1>
        <div data-scms-html="intro">
            <p>This is the intro paragraph with <strong>rich text</strong> support.</p>
        </div>
        <img data-scms-image="hero" src="hero.jpg" alt="Hero image" />

        <!-- Synced with the pricing page -->
        <p>
            Plans from
            <span data-scms-group="pricing"><span data-scms-text="starter-price">$100</span></span>/month
        </p>

        <!-- Repeating team section: heading outside the template wrapper -->
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

## Element Pairing

Keep logically separate things as separate editables.

### Logo + Company Name

```html
<!-- Separate editables for the logo image and the company name -->
<div class="logo-container">
    <img data-scms-image="logo" src="logo.png" alt="Logo" />
    <span data-scms-text="company-name">Acme Services</span>
</div>

<!-- If the logo is a link, the URL is editable and the image stays intact -->
<a data-scms-href="logo-link" href="/">
    <img data-scms-image="logo" src="logo.png" alt="Logo" />
</a>
```

### Text + Link Combinations

```html
<!-- Text before the link; the link's label is its own editable -->
<p>
    <span data-scms-text="powered-by-text">Powered by</span>
    <a data-scms-href="powered-by-link" href="https://example.com">
        <span data-scms-text="powered-by-label">Example CMS</span>
    </a>
</p>
```

If the author should be able to rewrite the whole sentence, including where the link goes in it, make the paragraph's wrapper a `data-scms-html` element instead.

### Sentences containing a synced value

A sentence such as "from **$1,000** one-time, then **$100** a year" mixes wording with values that must stay in sync elsewhere (here, prices from a shared group). An HTML element can't contain the synced values, so the choices are:

- **Split the wording around the values** into text elements ("from", "one-time, then", "a year"). Everything is editable, but the author edits the sentence in fragments.
- **Leave the wording in code** and make only the values editable.

Neither is ideal; pick whichever fits how often the wording will change. Keep these sentences short.

## SEO & Accessibility

SEO attributes (alt text, title) and accessibility attributes (ARIA labels, roles) can be configured in the CMS after content is set up. No additional HTML markup is required.

## Fresh Content for Crawlers & AI Agents

The HTML you commit is a **fallback snapshot**. When a browser loads the page, the SDK fetches the current content from the API and swaps it into the DOM before render — so visitors always see live copy. But a client that doesn't run JavaScript (curl, most crawlers, AI agents) never runs the SDK, so it only sees the committed fallback, which goes stale the moment an author saves an edit.

To point those clients at the live content, add a `<noscript>` note as the first thing inside `<body>`. Because it's wrapped in `<noscript>`, browsers that run the SDK never render it — there's no visual cost. It reaches only the non-JS clients that need it.

```html
<body>
    <noscript><pre>NOTE FOR AUTOMATED CLIENTS / AI AGENTS: The visible text on this page is a fallback snapshot and may be out of date. Content is served live by StreamlinedCMS.

To read the current copy, GET:
  https://api.streamlinedcms.com/v1/apps/YOUR_APP_ID/content

Response shape:
  elements[<id>].content                     (ungrouped elements)
  groups[<groupId>].elements[<id>].content   (grouped elements)
Each "content" is a JSON string, e.g. {"type":"text","value":"..."}, {"type":"link","href":"...","value":"..."} or {"type":"image","src":"..."}.

Apply each override to the element on this page whose data-scms-text / data-scms-href / data-scms-image id equals <id>, inside the matching data-scms-group. A missing id means no edit - keep this page's text. An empty {"elements":{},"groups":{}} means the whole site currently matches the committed fallback copy.</pre></noscript>

    <!-- ...rest of your page... -->
</body>
```

**Why this can't be automatic:** the note has to be in the static HTML the server sends. It can't be injected by the SDK, because the SDK is a script — anything it adds appears only when scripts are on, which is exactly when the note is useless (the SDK has already loaded the live copy). Bake the block in at build time, or paste it into your template.

**Notes:**
- Replace `YOUR_APP_ID` with your application ID. The endpoint is public (a plain `GET`, no auth) and the `/v1` prefix is part of the path.
- The response keys are the `data-scms-*` IDs and `data-scms-group` IDs from your markup — see [Marking Editable Elements](#marking-editable-elements) and [Groups](#groups-data-scms-group).

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

### Running page scripts after content loads

Page code that reads editable content (to filter cards, copy panel values into attributes, or calculate from prices) has to run again once saved content is in the page, because the loader can replace text and template items after your script first runs:

```javascript
function setUp() {
    // read the content and wire things up
}
setUp(); // the committed copy, for visitors without the SDK
document.addEventListener('streamlined-cms:loader-complete', setUp, { once: true });
```

- The loader waits for the page to finish parsing (`DOMContentLoaded`) before filling it, so ordinary page scripts, including bundled module scripts, always register this listener in time. A script loaded later (an `async` script or one injected at runtime) can miss the event, and there's no flag to check afterwards. Use `await StreamlinedCMS.ready()` in that case, which resolves only after content is in the page.
- **No event fires when an author edits.** Adding a template item or changing text while editing doesn't re-run your code; the result shows after the page reloads. Build page code so the visitor view is right after a reload, and expect new or changed items to look unprocessed while the author is still editing.

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

