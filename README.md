# Profolio Editor

A browser-based editor for building and customizing a personal portfolio
website — pick a starting layout, choose a theme, drag in your own content,
and publish. Think "Webflow/Framer, but scoped specifically to portfolio
sites."

This repo currently contains the **editor UI shell only**. It looks like a
real editor (top bar, left tool rail, center canvas, right panel with
Layouts/Themes/Assets/Settings tabs). The Layouts tab is an accordion with
one collapsible row per page of the site (Home, About, Showcase, Blog,
Contact, Links); each row loads its cards from that page's folder under
`layout/`, and clicking a layout appends that layout's `sections` tree to the
bottom of the canvas. Layouts are additive: Home's cards give you a page shell
(nav / hero / projects / footer) and the other pages' cards stack their
sections underneath, so a page is assembled by picking one card after another.
Home and About ship with real layouts; the other pages currently hold only a
`blank-test` placeholder. Selecting/editing content, saving, and publishing are
not wired yet.

## Project structure

```
Profolio Editor/
├── index.html          Editor shell markup (top bar, toolbar, canvas, right panel)
├── style.css            All styling (dark editor chrome + light canvas page + rendered node styles)
├── script.js             UI interactions (tab/tool switching, page accordion, layout loader/insertion)
├── renderer.js           Renders a sections node tree onto the canvas (see docs/DATA_MODEL.md)
├── docs/
│   └── DATA_MODEL.md      The data model a page/site is built from (sections → blocks → elements)
└── layout/
    ├── pages.json         The site's pages, in the order the accordion shows them
    ├── home/
    │   ├── manifest.json   List of layout files to load for this page (see note below)
    │   ├── minimal.json
    │   ├── split-bio.json
    │   ├── photo-first.json
    │   ├── blank.json
    │   └── example.json     Fully filled-in reference layout (nav/hero/projects/footer)
    ├── about/
    │   ├── manifest.json
    │   ├── example.json     Filled-in About section (title + portrait + bio)
    │   └── blank-test.json  Placeholder section, for checking that inserts work
    ├── showcase/
    │   ├── manifest.json
    │   └── blank-test.json
    ├── blog/
    │   ├── manifest.json
    │   └── blank-test.json
    ├── contact/
    │   ├── manifest.json
    │   └── blank-test.json
    └── links/
        ├── manifest.json
        └── blank-test.json
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
`gradient-dark` = text, `accent` = links/navbar, and `neutral` = other.

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
- [x] Layouts tab is a per-page accordion (Home / About / Showcase / Blog / Contact / Links) driven by `layout/pages.json`
- [x] Each page's layout cards load automatically from `layout/<page>/*.json` via that folder's `manifest.json`
- [x] Data model for a site/page (sections → blocks → elements) decided — see [docs/DATA_MODEL.md](./docs/DATA_MODEL.md)
- [x] Canvas renders from that data model (`renderer.js`) — clicking a layout card appends its sections to the bottom of the canvas, so layouts stack instead of replacing each other
- [ ] Everything else, including selecting/editing what's rendered (see [TODO.md](./TODO.md))

See [TODO.md](./TODO.md) for the full task list and a prioritized, dependency-ordered implementation plan.
