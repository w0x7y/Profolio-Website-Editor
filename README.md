# Profolio Editor

A browser-based editor for building and customizing a personal portfolio
website — pick a starting layout, choose a theme, drag in your own content,
and publish. Think "Webflow/Framer, but scoped specifically to portfolio
sites."

This repo currently contains the **editor UI shell only**. It looks like a
real editor (top bar, left tool rail, center canvas, right panel with
Layouts/Themes/Assets/Settings tabs) and the Layouts tab loads its cards
dynamically from the `layout/` folder, but nothing is wired to actually
edit, save, or publish a site yet.

## Project structure

```
Profolio Editor/
├── index.html          Editor shell markup (top bar, toolbar, canvas, right panel)
├── style.css            All styling (dark editor chrome + light canvas page + rendered node styles)
├── script.js             UI interactions (tab/tool switching, layout loader/selection)
├── renderer.js           Renders a sections node tree onto the canvas (see docs/DATA_MODEL.md)
├── docs/
│   └── DATA_MODEL.md      The data model a page/site is built from (sections → blocks → elements)
└── layout/
    ├── manifest.json      List of layout files to load (see note below)
    ├── minimal.json
    ├── bold-studio.json
    ├── grid-works.json
    ├── split-bio.json
    ├── photo-first.json
    ├── blank.json
    └── example.json        Fully filled-in reference layout (nav/hero/projects/about/footer)
```

Each `layout/*.json` file describes one starting layout: an `id`, `name`,
`description`, a `preview` (used to draw the little thumbnail block diagram
in the panel), and a `sections` field holding the actual page content as a
node tree — see [docs/DATA_MODEL.md](./docs/DATA_MODEL.md) for the shape.
Clicking a layout card renders its `sections` onto the canvas via
`renderer.js`. `manifest.json` exists because a browser can't list a
folder's contents on its own — it just tells `script.js` which files to
fetch.

## Running locally

The layout loader uses `fetch()`, so the project needs to be served over
`http://`, not opened directly as a `file://` path (browsers block local
`fetch` requests under `file://`). Any static server works, e.g.:

```bash
npx serve .
# or, with the VS Code "Live Server" extension: right-click index.html → Open with Live Server
```

## Current status

- [x] Editor shell layout (top bar, left toolbar, canvas area, right panel)
- [x] Visual-only tool selection, tab switching, theme/font card selection
- [x] Device switcher visually resizes the canvas frame (desktop/tablet/mobile)
- [x] Canvas is blank by default
- [x] Layout cards in the right panel load automatically from `layout/*.json` via `manifest.json`
- [x] Data model for a site/page (sections → blocks → elements) decided — see [docs/DATA_MODEL.md](./docs/DATA_MODEL.md)
- [x] Canvas renders from that data model (`renderer.js`) — clicking a layout card in the right panel renders its content onto the canvas
- [ ] Everything else, including selecting/editing what's rendered (see [TODO.md](./TODO.md))

See [TODO.md](./TODO.md) for the full task list and a prioritized, dependency-ordered implementation plan.
