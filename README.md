# Profolio Editor

A browser-based editor for building and customizing a personal portfolio
website — pick a starting layout, choose a theme, drag in your own content,
and publish. Think "Webflow/Framer, but scoped specifically to portfolio
sites."

This repo currently contains the **editor UI shell only**. It looks like a
real editor (top bar, left tool rail, center canvas, right panel with
Layouts/Themes/Assets/Settings tabs). The Layouts tab is an accordion with
one collapsible row per page of the site (Navbar, Home, About, Showcase,
Blog, Contact, Links, Footer); every row starts collapsed, loads its cards
from that page's folder under `layout/`, and clicking a card appends that
layout's `sections` tree to the bottom of the canvas. Layouts are additive —
nothing already on the canvas is replaced — so a page is assembled by stacking
one card after another: Navbar's nav bar, then Home's hero, then Showcase's
project grid, then Footer. Sections already on the canvas can be dragged by
their grab handle to reorder them, or dropped on the right panel's trash zone
to delete them. With the Select tool active, the content inside a section —
images, text, and buttons/links — can be clicked to select it, which draws a
selection outline and nothing more. Editing what's selected, saving, and
publishing are not wired yet.

Content-wise: `home/example.json` and `about/example.json` are the only cards
filled in with real copy. Every page also ships a `blank-test.json` card that
inserts that page's real section structure with all of its slots left unfilled
(placeholder text, empty image boxes) — useful both as a test fixture and as a
preview of the placeholder system. `minimal.json`, `split-bio.json` and
`photo-first.json` still have empty `sections` arrays, so clicking them does
nothing.

## Project structure

```
Profolio Editor/
├── index.html          Editor shell markup (top bar, toolbar, canvas, right panel)
├── style.css            All styling (dark editor chrome + light canvas page + rendered node styles)
├── script.js             UI interactions (tab/tool switching, page accordion, layout loader/insertion, section drag & drop, canvas selection)
├── renderer.js           Renders a sections node tree onto the canvas (see docs/DATA_MODEL.md)
├── TODO.md               Full task list + a prioritized, dependency-ordered plan
├── docs/
│   └── DATA_MODEL.md      The data model a page/site is built from (sections → blocks → elements)
└── layout/
    ├── pages.json         The site's pages, in the order the accordion shows them
    ├── navbar/
    │   ├── manifest.json   List of layout files to load for this page (see note below)
    │   └── blank-test.json  Nav bar: logo + links + button, all slots unfilled
    ├── home/
    │   ├── manifest.json
    │   ├── minimal.json     `sections: []` — not built yet
    │   ├── split-bio.json   `sections: []` — not built yet
    │   ├── photo-first.json `sections: []` — not built yet
    │   └── example.json     Filled-in hero section (eyebrow, title, subtitle, two CTAs, portrait)
    ├── about/
    │   ├── manifest.json
    │   ├── example.json     Filled-in About section (title + portrait + bio)
    │   └── blank-test.json  Same section with its slots unfilled
    ├── showcase/
    │   ├── manifest.json
    │   └── blank-test.json  Project grid: three project cards, slots unfilled
    ├── blog/
    │   ├── manifest.json
    │   └── blank-test.json
    ├── contact/
    │   ├── manifest.json
    │   └── blank-test.json
    ├── links/
    │   ├── manifest.json
    │   └── blank-test.json
    └── footer/
        ├── manifest.json
        └── blank-test.json  Footer: logo + tagline + link row, slots unfilled
```

`pages.json` lists the site's pages as `{ "id", "name" }` pairs; each `id` is
the name of that page's folder under `layout/`.

Each `layout/<page>/*.json` file describes one starting layout: an `id`,
`name`, `description`, a `preview` (used to draw the little thumbnail block
diagram in the panel), and a `sections` field holding the actual page content
as a node tree — see [docs/DATA_MODEL.md](./docs/DATA_MODEL.md) for the shape.
Clicking a layout card appends its `sections` to the bottom of the canvas via
`renderer.js` — nothing already on the canvas is replaced, and the same card
can be used more than once (node ids are rewritten on insert to stay unique).
Each page's `manifest.json` exists because a browser can't list
a folder's contents on its own — it just tells `script.js` which files to
fetch. A page with an empty manifest (`[]`) still gets its accordion row; the
row just says it has no layouts yet.

To add a layout to a page, drop the `.json` file in that page's folder and add
its filename to that folder's `manifest.json`. To add a page, create the
folder with an empty `manifest.json` and add an entry to `pages.json`.

Preview block tones are semantic: `gradient-accent` = image,
`gradient-dark` = text, `accent` = links/navbar, `neutral` = other, and
`" "` (a single space) = blank spacer.

## Running locally

The layout loader uses `fetch()`, so the project needs to be served over
`http://`, not opened directly as a `file://` path (browsers block local
`fetch` requests under `file://`). Any static server works, e.g.:

```bash
python3 -m http.server
# then open http://localhost:8000/

# or, if Node is available:
npx serve .
# or, with the VS Code "Live Server" extension: right-click index.html → Open with Live Server
```

## Current status

- [x] Editor shell layout (top bar, left toolbar, canvas area, right panel)
- [x] Visual-only tool selection, tab switching, theme/font card selection
- [x] Device switcher visually resizes the canvas frame (desktop/tablet/mobile)
- [x] Canvas is blank by default
- [x] Layouts tab is a per-page accordion (Navbar / Home / About / Showcase / Blog / Contact / Links / Footer) driven by `layout/pages.json`, with every row collapsed at load
- [x] Each page's layout cards load automatically from `layout/<page>/*.json` via that folder's `manifest.json`
- [x] Data model for a site/page (sections → blocks → elements) decided — see [docs/DATA_MODEL.md](./docs/DATA_MODEL.md)
- [x] Canvas renders from that data model (`renderer.js`) — clicking a layout card appends its sections to the bottom of the canvas, so layouts stack instead of replacing each other
- [x] Unfilled slots render as real placeholders (dashed/muted text, upload-icon image boxes) rather than empty space
- [x] Top-level sections can be dragged to reorder, and dropped on the right panel's trash zone to delete (DOM-only, no undo yet)
- [x] Click-to-select content on the canvas with the Select tool — images, text and buttons/links get a selection outline; clicking a container or the page background deselects, as does Escape or picking another tool
- [x] Selecting content opens the left tool panel on the pane for what you picked (Image for images/icons, Text for headings/text, Button for buttons); deselecting closes it. The panes are still placeholders, so nothing is editable there yet
- [ ] Everything else, including editing what's selected (see [TODO.md](./TODO.md))

See [TODO.md](./TODO.md) for the full task list and a prioritized, dependency-ordered implementation plan.
