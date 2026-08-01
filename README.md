# Profolio Editor

A browser-based editor for building and customizing a personal portfolio
website — pick a starting layout, choose a theme, drag in your own content,
and publish. Think "Webflow/Framer, but scoped specifically to portfolio
sites."

The app is two pages. `index.html` is the **dashboard**: the projects stored in
this browser, with New / Rename / Delete, and a card that opens one in the
editor. `editor.html` is the **editor**, which always opens on a saved project
(`editor.html?project=<id>`) — a URL naming no project sends you back to the
dashboard. Work is saved explicitly, with a Save button and a save-state
indicator in the top bar; projects and uploaded images live in IndexedDB, so
they survive a reload but never leave the browser.

The editor looks like a real editor (top bar, left tool rail, center canvas,
right panel with Layouts/Themes/Assets/Settings tabs). The Layouts tab is an accordion with
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
selection outline and opens the matching left tool panel. The Section tool
composes a brand-new section instead of editing an existing one: rows, columns
and unfilled content slots, drafted live on the canvas and committed with
Insert. The Themes tab
restyles the whole canvas: a color preset and a heading/body font pair, both
applied through custom properties on the canvas frame. Publishing is not wired
yet.

Content-wise: `home/example.json` and `about/example.json` are the only cards
filled in with real copy. Every page ships a `blank-test.json` card that
inserts that page's real section structure with its content slots unfilled
(placeholder text, empty image boxes) — anything that *is* filled in one is a
structural label, like the heading naming the section or the nav link names.
Useful both as a test fixture and as a preview of the placeholder system.
`minimal.json`, `split-bio.json` and `photo-first.json` still have empty
`sections` arrays, so clicking them does nothing.

## Project structure

```
Profolio Editor/
├── .claude/             Claude Code configuration (see CLAUDE.md for the prose half)
│   ├── launch.json      The `editor` run configuration: python3 -m http.server 4173
│   ├── settings.json    Shared permissions + the layout-check hook
│   └── hooks/
│       └── check-layout-json.py  Validates layout/ JSON and manifest registration
├── index.html          The dashboard: every project stored in this browser
├── editor.html         Editor shell markup (top bar, toolbar, canvas, right panel)
├── styles/
│   ├── style.css        All styling (dark editor chrome + light canvas page + rendered node styles)
│   └── dashboard.css    The project list, its cards and its dialogs
├── fonts/                The editor chrome's typeface, self-hosted
│   ├── maple-mono-latin-400-normal.woff2   Vendored from @fontsource/maple-mono@5.2.6
│   └── LICENSE           SIL Open Font License 1.1, as the font's license requires
├── scripts/              ES modules; the editor's are all reached through main.js
│   ├── main.js           The one entry point editor.html loads; wires everything up as soon as the DOM is parsed
│   ├── dashboard.js      index.html's own entry point: the project list and its actions
│   ├── storage.js        IndexedDB: the project records and the uploaded image blobs
│   ├── project-record.js What a stored project *is*, and the function that mints one
│   ├── project.js        The project the editor has open: loading it, saving it, tracking changes
│   ├── serializer.js     Reads the canvas DOM back into a sections node tree, for saving
│   ├── dom.js            The app's singleton elements, and the shared is-active toggle
│   ├── renderer.js       Renders a sections node tree onto the canvas (see docs/DATA_MODEL.md)
│   ├── layouts-panel.js  The Layouts accordion: loads /layout and inserts a card's sections
│   ├── selection.js      Click-to-select on the canvas, and which tool is active
│   ├── section-dnd.js    Drag sections to reorder them, or onto the trash to delete
│   ├── tool-panel.js     Opening and closing the left tool panel on the right pane
│   ├── text-panel.js     Text tool panel: content, typography and color for the selected node
│   ├── button-panel.js   Button tool panel: link/button type, target and stored on-click
│   ├── image-panel.js    Image tool panel: source, size, fit, border, shadow and opacity
│   ├── section-builder.js The Section tool's draft: the tree, the live draft on canvas, Insert/Cancel
│   ├── section-panel.js  Section tool panel: the picked row/column's layout and content
│   ├── link-controls.js  The link action model plus the shared link-target controls
│   ├── panel-widgets.js  Generic panel controls: segmented switches, toggles, color fields
│   ├── node-style.js     How a pane writes a per-node style override, and how the Themes tab undoes it
│   ├── asset-store.js    The uploaded images: in memory to read, in IndexedDB to keep
│   ├── upload-modal.js   The upload window, and the shared drop-zone wiring
│   ├── asset-grid.js     The thumbnail grid, rendered in both the Assets tab and the Image pane
│   ├── assets-panel.js   Assets tab: the upload button and the library
│   └── theme.js          Themes tab: the color presets, the font list, and applying either to the canvas
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
    │   ├── example.json     Filled-in hero section (eyebrow, title, subtitle, two CTAs, portrait)
    │   └── blank-test.json  One Home section, its body slot unfilled
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
a folder's contents on its own — it just tells `layouts-panel.js` which files to
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
`fetch` requests under `file://`). Serving it also gives the two pages a single
origin, which is what lets them share one IndexedDB database. Any static
server works, e.g.:

```bash
python3 -m http.server
# then open http://localhost:8000/ — the dashboard

# or, if Node is available:
npx serve .
# or, with the VS Code "Live Server" extension: right-click index.html → Open with Live Server
# (index.html is the dashboard; the editor is opened from a project card)
```

## Current status

- [x] A dashboard at `index.html` listing every project stored in this browser, with New project (name it, then open an empty editor), Rename, and Delete (confirmed, and it removes the project's uploaded images with it). Cards show a project's section count and are sorted by most recently edited
- [x] Projects and their images persist in IndexedDB (`storage.js`) — one database, a `projects` store and an `assets` store indexed by project. Nothing leaves the browser, and clearing site data still clears everything
- [x] The editor opens on a saved project (`editor.html?project=<id>`) and redirects to the dashboard if that id names nothing. Save is explicit — a Save button, ⌘/Ctrl+S, and a saved / unsaved / saving indicator in the top bar — with a warning before leaving with unsaved work. There is no autosave and no undo yet
- [x] A save captures the canvas, the active theme and fonts, and the project name. `serializer.js` reads the canvas DOM back into a node tree; the Section builder's draft, the blank-canvas placeholder and editor chrome are left out of it. Uploaded images are stored by asset id, since the blob URL they display through is minted fresh each session
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
- [x] Selecting content opens the left tool panel on the pane for what you picked (Image for images/icons, Text for headings/text, Button for buttons); deselecting closes it. The Text, Button and Image panes all have real controls
- [x] Themes tab applies colors and fonts to the canvas (`theme.js`) — four color presets plus separate heading and body font pickers (web-safe stacks and Google families). Both write custom properties on `.canvas-frame`, which every canvas style rule reads, so one write restyles what's on the canvas *and* whatever is added later. Applying a preset clears the per-node colors set in the Text panel, and picking a font clears its per-node fonts, so the canvas ends up uniformly on the new theme. Both the preset and the two fonts are saved with the project, and restoring them on open is the one case that does *not* clear per-node overrides — those are the ones being restored alongside it
- [x] Assets tab is a real image library — the upload box opens a centered window that takes images by drag-and-drop or through the file picker, and everything uploaded shows as a thumbnail under it. Uploads belong to the project they were made in and are kept as blobs in IndexedDB (`asset-store.js`), so they come back on reload; there is still no backend, so they never leave this browser. Deleting an asset resets the canvas images that were using it, since removing it releases the blob the browser was showing them from
- [x] Image tool panel edits the selected image (`image-panel.js`): which uploaded asset it shows, alt text, width/height in px/rem/%/vh, how the image fits its box (cover/contain/stretch/none plus a position), border width/style/color, corner roundness, box shadow and opacity. Switching a size unit converts the number rather than relabelling it. Each declaration lands on the wrapper or on the inner `<img>` depending on which one the property means anything on
- [x] Section tool is a GUI section builder (`section-builder.js` / `section-panel.js`): compose a section as rows → columns → unfilled content slots, watching a live draft on the canvas and clicking into it to pick what the pane edits. Rows carry gap, align, distribute and wrap; columns carry a width (auto / equal / explicit %) and their content slots. Insert commits it as a real section — reorderable, trashable, and editable through the Text/Image/Button panes — and Cancel throws it away. Structure can't be re-edited after Insert yet (see [TODO.md](./TODO.md))
- [ ] Everything else, including autosave, undo/redo, publishing, and placing a *new* image on the canvas with the Image tool (see [TODO.md](./TODO.md))

See [TODO.md](./TODO.md) for the full task list and a prioritized, dependency-ordered implementation plan.
