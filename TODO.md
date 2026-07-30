# TODO

Some foundational items are implemented, but most editor behavior is still
planned. Roughly ordered by dependency within each section, not by priority.

Tags on each item: **difficulty** (`Easy` / `Medium` / `Hard`) and
**priority** — `P0` (blocking / must-have for a usable editor), `P1` (high,
needed soon after), `P2` (medium, real but not urgent), `P3` (low / nice-to-have,
can wait a long time).

### Core canvas & editing engine
- [x] Decide on a data model for a "site"/"page" (JSON tree of sections → blocks → elements) that the canvas renders from, instead of static HTML `Hard` `P0` — see [docs/DATA_MODEL.md](./docs/DATA_MODEL.md)
- [x] Render the canvas from that data model instead of hardcoded markup `Hard` `P0` — see `renderer.js` (`renderNode`/`renderSections`/`renderSectionsIntoCanvas`)
- [x] Click-to-select an element on the canvas `Medium` `P0` — wired in `selection.js` (`initCanvasSelection()`); content nodes only (image/icon, heading/text, button), tracked as a DOM reference, and nothing acts on the selection yet
- [ ] Show a selection outline + resize/move handles around the selected element `Hard` `P0` — the outline (plus a hover hint) is done in `style.css`; resize/move handles are not
- [ ] A floating/contextual toolbar for the selected element (font size, color, alignment, spacing, etc.) `Medium` `P1` — the Text panel now covers these for text nodes; decide whether the floating toolbar duplicates it or replaces it
- [ ] Inline text editing (contenteditable or similar) for text elements `Medium` `P0` — partly addressed: text is editable in the Text panel's Content box, but not by typing directly on the canvas
- [x] Drag-and-drop reordering of sections within the canvas `Hard` `P0` — grab handle per section, wired in `section-dnd.js` (`initSectionDragAndDrop()`). Reorders the DOM only; it needs to move the node in a real project tree once one exists
- [ ] Drag-and-drop reordering of *elements* inside a section (the section-level case above is done) `Hard` `P0`
- [ ] Drag elements from the left toolbar onto the canvas to insert them `Medium` `P1`
- [ ] `renderer.js` only renders `href` on `button` nodes, so a `nav-link` text node's target still renders as nothing — the Text pane's Link group now *edits* that target (stored on the element, see `link-controls.js`), but these need to render as real links for it to do anything `Easy` `P2`
- [ ] Multi-select elements (shift-click / marquee select) `Medium` `P2`
- [ ] Copy / paste / duplicate elements `Easy` `P1`
- [ ] Delete elements (with confirmation or undo safety net) `Easy` `P0` — sections can already be deleted by dragging them onto the right panel's trash zone, but that is immediate and unrecoverable; sub-section elements have no delete at all
- [ ] Keyboard shortcuts (delete, duplicate, arrow-key nudge, escape to deselect, etc.) `Easy` `P2`
- [ ] Snapping / alignment guides while dragging or resizing `Hard` `P2`
- [ ] Spacing/margin/padding visual editor (like Webflow's box model UI) `Hard` `P1`
- [ ] Nested elements / grouping (containers holding other elements) `Hard` `P1`
- [ ] Z-index / layer ordering support `Medium` `P2`
- [ ] Undo/redo history that actually works (top bar buttons are currently decorative) `Hard` `P1`
- [ ] Autosave (to local storage first, later to backend) `Medium` `P1`
- [ ] Manual "Save" state indicator (saved / saving / unsaved changes) `Easy` `P2`

### Left toolbar (tools)
- [x] Select tool: real selection behavior `Medium` `P0` — click-to-select is live only while this tool is active; switching tools drops the selection (`setActiveTool()` in `selection.js`). Selecting opens the tool panel on that node type's pane via `NODE_TYPE_PANES`, and deselecting closes it
- [x] Text tool panel: real controls for the selected text node `Medium` `P0` — see `text-panel.js`; content (with per-word bold/italic/underline/strikethrough), font family, size with unit conversion, letter spacing, uppercase, and text/background/outline colors. Writes to the canvas DOM, so nothing persists across a reload until there's a project object
- [ ] Text tool: click-to-place a new text block on canvas `Easy` `P0` — the pane's controls exist, but the tool itself still places nothing, so it always shows the "select text" empty state
- [ ] Image tool: click-to-place an image placeholder `Medium` `P0` — the pane itself is built (`image-panel.js`); what's left is inserting a new image node from the toolbar
- [x] Button tool panel: real controls for the selected button `Easy` `P0` — see `button-panel.js` / `link-controls.js`; "Edit Text" hands the label off to the Text pane, a Link/Button toggle picks what it does, and a link points at a section on the canvas or at an address. On-click JS is stored (`data-on-click`) and never executed inside the editor. Writes to the canvas DOM, so nothing persists across a reload
- [ ] Button tool: click-to-place a new button on canvas `Easy` `P0` — the pane's controls exist, but the tool itself still places nothing, so it always shows the "select a button" empty state
- [ ] Button styling controls (fill, radius, padding, size) — color and typography currently reach a button only via the Button pane's "Edit Text" `Easy` `P1`
- [x] Section tool: GUI section builder `Medium` `P1` — see `section-builder.js` / `section-panel.js`. Compose a section as rows → columns → unfilled content slots, with a live draft on the canvas you click into to pick what the pane edits, then Insert. Layout presets were dropped: every section starts empty, since a builder answers "what shape do you want" rather than "which of these five". Structure can't be re-edited after Insert — that needs the project object (item 3) — but content is editable through the Text/Image/Button panes
- [ ] Embed tool: insert custom HTML/embed blocks (e.g. YouTube, Spotify, custom code) `Medium` `P2`
- [ ] Settings tool (left toolbar): decide what this opens (currently duplicates the right panel's Settings tab — clarify UX) `Easy` `P3`
- [ ] Tooltips are static — verify they stay correct as tools gain real behavior `Easy` `P3`

### Right panel — Layouts tab
- [x] Clicking a layout card actually applies it to the canvas `Hard` `P0` — wired in `layouts-panel.js` via `appendSectionsToCanvas()`
- [x] Decide whether "layout" means a whole starter page, or a single section users can insert `Medium` `P1` — both, and every card is additive: it appends its sections to the bottom of the canvas rather than replacing it. Home's cards are page shells, the other pages' cards are sections that stack underneath.
- [x] Each page's folder loads its own layouts (Navbar / About / Showcase / Blog / Contact / Links / Footer, not just Home) `Easy` `P1` — every manifest is populated; only `home/example.json` and `about/example.json` carry real copy, the rest are `blank-test.json` cards whose sections are structurally real but have every slot unfilled
- [ ] Fill in the `sections` field for `minimal.json`, `split-bio.json`, and `photo-first.json` (currently empty arrays — clicking them is a no-op now that cards append instead of replace) `Easy` `P1`
- [ ] Real Navbar / Showcase / Blog / Contact / Links / Footer layouts to replace the `blank-test.json` fixtures `Medium` `P1`
- [ ] A "clear canvas" / start-over action — sections can now be removed one at a time via the trash zone, but there's still no single "empty the canvas" action, and no undo for a mis-drop `Easy` `P0`
- [ ] Let the user choose where an inserted section lands (drop between existing sections) instead of always appending at the bottom `Medium` `P2`
- [ ] Support applying a layout to a single existing section (replace in place) `Medium` `P2`
- [ ] More layout options / categories (e.g. filter by style, industry, single-page vs multi-page) `Easy` `P3`
- [ ] "Add page" / rename / reorder / delete actions on the Layouts tab's page accordion (pages are fixed by `layout/pages.json` right now) `Medium` `P1`
- [ ] Search/filter within the Layouts tab if the list grows `Easy` `P3`
- [ ] Show a bigger preview / hover-to-preview before applying a layout `Medium` `P2`
- [ ] Loading and error states in the UI while `loadPages()` fetches (currently just a console error + plain text fallback) `Easy` `P2`
- [ ] Consider bundling/inlining `layout/**/*.json` at build time instead of runtime `fetch`, so the editor also works from a plain `file://` open (currently requires a local server) `Medium` `P3`

### Right panel — Themes tab
- [x] Theme cards actually apply colors to the canvas `Medium` `P0` — see `theme.js`; a preset writes six custom properties on `.canvas-frame` and every canvas rule reads them, so sections added later come out on-theme with no re-theming step
- [x] Font cards actually apply the chosen font to the canvas `Easy` `P0` — replaced by two dropdowns (headings and body text) covering ~27 families
- [x] Load Google Fonts (or self-hosted fonts) for theme font options `Easy` `P1` — 17 Google families alongside the web-safe stacks; the faces are declared in one request and only downloaded once something is set in them
- [ ] Let users customize a theme's individual colors (not just pick a preset) `Medium` `P2` — the six tokens in `THEMES` are the ones to expose; the rest are derived from them in `style.css`
- [ ] Let users customize font sizes / scale, not just family `Medium` `P2`
- [ ] More theme presets `Easy` `P3`
- [ ] Custom theme creation + save as a new preset `Hard` `P2`
- [ ] Dark-mode variant toggle for the published site itself (separate from the editor's own dark UI) `Medium` `P3`
- [ ] Persist selected theme/font with the project data `Easy` `P1`

### Right panel — Assets tab
- [x] Real file upload (drag-and-drop and click-to-upload) `Medium` `P0` — `upload-modal.js`; the Assets tab's box is both a button that opens it and a drop target of its own
- [ ] Image storage/hosting (needs a backend or third-party storage — decide on provider) `Hard` `P0` — in-memory blob URLs for now (`asset-store.js`), which is the one file this changes
- [x] Image thumbnails reflect actual uploaded files `Easy` `P1` — `asset-grid.js`, rendered in both the Assets tab and the Image pane
- [x] Assign an asset to the selected image element `Medium` `P1` — the Image pane's Source grid. Inserting a *new* image into the canvas still needs click-to-place
- [x] Delete / replace uploaded assets `Easy` `P1` — deleting one first resets every canvas image using it, since removing it revokes the blob URL
- [ ] Basic image editing (crop, resize) on upload `Hard` `P2`
- [ ] File size / type validation and limits `Easy` `P1`
- [ ] Support other asset types beyond images (icons, documents/resume PDF, video) `Medium` `P2`
- [ ] Asset search/filter and folders once the list grows `Medium` `P3`

### Right panel — Settings tab
- [ ] Site title field actually editable and persisted (currently static text) `Easy` `P0`
- [ ] Domain field actually editable, plus custom domain connection flow `Hard` `P2`
- [ ] Favicon upload wired to the Assets/upload system `Easy` `P1`
- [ ] SEO settings (meta description, social share image/OG tags, page titles per page) `Medium` `P2`
- [ ] Analytics integration (e.g. Google Analytics / Plausible snippet field) `Easy` `P3`
- [ ] Password-protect / unlisted site option `Medium` `P3`
- [ ] Danger zone: delete project `Easy` `P2`

### Top bar
- [ ] Project name is a static button — make it editable / add a rename flow `Easy` `P1`
- [ ] Project name dropdown should do something (currently just a chevron icon with no menu) `Easy` `P2`
- [ ] Device switcher: currently only resizes canvas width — should also reflect actual responsive breakpoints defined per element (currently the mock content has no responsive rules at all) `Hard` `P1`
- [ ] Undo/redo buttons wired to real history stack (engine work tracked above; this is just wiring the UI) `Easy` `P1`
- [ ] "Preview" button opens a real, non-editable preview of the current page (new tab or modal) `Medium` `P1`
- [ ] "Publish" button actually publishes/deploys the site somewhere `Hard` `P0`
- [ ] Publish flow: choose subdomain vs custom domain, confirm, show progress/success state `Medium` `P1`
- [ ] Avatar/account menu (currently a static "JD" circle with no click behavior) `Easy` `P2`
- [ ] Multi-page support: the Layouts tab lists Navbar/Home/About/Showcase/Blog/Contact/Links/Footer as accordion rows, but there's still only one canvas — every row's layouts append to that same canvas, so the rows are really section categories, not separate pages. Decide whether these become real pages (with their own canvas + navigation between them) or stay as section groups `Hard` `P1`
- [ ] Zoom controls: actually change canvas zoom level (currently static "100%" label, buttons do nothing) `Medium` `P2`

### Canvas toolbar
- [ ] Zoom in/out buttons functional, plus fit-to-screen and keyboard/scroll-wheel zoom `Medium` `P2`
- [ ] Breadcrumb of currently selected element's parent chain (common in editors like this) `Medium` `P3`

### Data & persistence
- [ ] Define how a project is stored (local storage for MVP → backend database later) `Medium` `P0`
- [ ] Load an existing project into the editor on open `Medium` `P0`
- [ ] Create new project flow (name it, maybe pick a layout as starting point) `Easy` `P0`
- [ ] Project list / dashboard page (outside the editor) to see and manage all of a user's portfolios `Hard` `P0`
- [ ] Duplicate / delete / rename project from the dashboard `Easy` `P1`
- [ ] Export project data (e.g. download as JSON, or export static HTML/CSS) `Medium` `P2`
- [ ] Import content (e.g. paste in resume text/LinkedIn data to prefill sections) `Hard` `P3`

### Accounts & backend
- [ ] User authentication (sign up / log in / log out) `Hard` `P0`
- [ ] Per-user project storage tied to an account `Medium` `P0`
- [ ] Backend API for saving/loading projects and assets `Hard` `P0`
- [ ] Hosting/deployment pipeline for published sites (subdomain routing, custom domains, SSL) `Hard` `P0`
- [ ] Rate limiting / abuse prevention for publishing and uploads `Medium` `P2`
- [ ] Billing/plans if this becomes a paid product (free vs pro tier, custom domain gating, etc.) `Hard` `P3`

### Publishing / output
- [ ] Generate clean, real static HTML/CSS/JS from the internal data model for the published site `Hard` `P0`
- [ ] Make sure published output is responsive (desktop/tablet/mobile), not just the editor preview `Hard` `P0`
- [ ] Sitemap + basic SEO defaults on generated output `Easy` `P2`
- [ ] 404 page for published sites `Easy` `P2`
- [ ] Custom domain DNS instructions/flow `Hard` `P2`

### Quality, polish & infra
- [ ] Split `style.css` into smaller files as it grows (currently one large stylesheet) `Easy` `P2`
- [x] Split `script.js` into modules as real functionality gets added `Easy` `P2` — done: `scripts/*.js`, one module per subsystem, all wired together by `main.js`
- [ ] Decide on a build step (bundler) if the project outgrows plain HTML/CSS/JS — note this would also fix the "must run a local server" limitation mentioned above `Medium` `P2`
- [ ] Accessibility pass: keyboard navigation through the editor, ARIA labels on icon-only buttons, focus states, color contrast `Medium` `P1`
- [ ] Empty/loading/error states throughout (most panels currently assume happy-path data) `Easy` `P1`
- [ ] Responsive support for the editor UI itself on smaller screens (currently desktop-only layout) `Hard` `P3`
- [ ] Cross-browser testing `Medium` `P2`
- [ ] Basic automated tests once there's real logic to test (currently pure UI, nothing to test) `Medium` `P2`
- [ ] Error boundary / handling for failed `fetch` calls beyond the current `console.error` in `loadPages()` `Easy` `P2`
- [ ] Performance check once the canvas holds real, larger pages (virtualization if needed) `Medium` `P3`
- [ ] Write proper in-app help/onboarding (empty-state canvas currently just says "Blank canvas" with no next-step guidance) `Medium` `P2`

---

## Implementation Plan

A single build order across all sections, sequenced by dependency first and
priority second — i.e. "what would you actually start coding first." Grouped
into phases; work roughly top-to-bottom within each phase.

### Phase 1 — Data model & project foundation
Nothing else can be built until there's a data model and a place to store it.
1. ~~Decide on a data model for a "site"/"page" (sections → blocks → elements)~~ `Hard` `P0` — done, see [docs/DATA_MODEL.md](./docs/DATA_MODEL.md)
2. ~~Render the canvas from that data model instead of hardcoded markup~~ `Hard` `P0` — done, see `renderer.js`
3. Define how a project is stored (local storage for MVP → backend later) `Medium` `P0`
4. Create new project flow `Easy` `P0`
5. Load an existing project into the editor on open `Medium` `P0`
6. Project list / dashboard page to see and manage all projects `Hard` `P0`

### Phase 2 — Core selection & direct editing
The minimum interaction loop: select something, change it, remove it.
7. ~~Select tool: real selection behavior~~ `Medium` `P0` — done, see `selection.js` (`setActiveTool()`)
8. ~~Click-to-select an element on the canvas~~ `Medium` `P0` — done, see `selection.js` (`initCanvasSelection()`); selectable = content nodes (image/icon, heading/text, button), held as a DOM reference until there's a project tree to hold a node id instead
9. Selection outline + resize/move handles around the selected element `Hard` `P0` — outline done; resize/move handles still open
10. Delete elements (with confirmation or undo safety net) `Easy` `P0` — sections are deletable via the trash zone; elements and the undo safety net are not
11. Inline text editing (contenteditable) for text elements `Medium` `P0` — partly done: editable in the Text panel (`text-panel.js`), not yet directly on the canvas
12. Text tool: click-to-place a new text block `Easy` `P0`
13. Image tool: click-to-place an image placeholder `Medium` `P0` — the Image *pane* is done; this is the insert-into-canvas half
14. ~~Drag-and-drop reordering of sections within the canvas~~ `Hard` `P0` — done, see `section-dnd.js`; reordering elements *inside* a section is still open

### Phase 3 — Layouts, themes & basic settings
Makes the existing UI shell actually do something.
15. ~~Layouts tab: clicking a card applies it to the canvas~~ `Hard` `P0` — done (no confirmation prompt yet, see Phase 9 #38)
16. Fill in the `sections` field for `minimal.json`, `split-bio.json`, and `photo-first.json` (schema migrated from `html` to `sections` — see [docs/DATA_MODEL.md](./docs/DATA_MODEL.md)) `Easy` `P1`
17. ~~Theme cards actually apply colors to the canvas~~ `Medium` `P0` — done, see `theme.js`
18. ~~Font cards actually apply the chosen font~~ `Easy` `P0` — done: heading + body dropdowns, see `theme.js`
19. Site title field editable and persisted `Easy` `P0`

### Phase 4 — Assets pipeline
20. ~~Real file upload (drag-and-drop and click-to-upload)~~ `Medium` `P0` — done, see `upload-modal.js`
21. Image storage/hosting (backend or third-party provider) `Hard` `P0`

### Phase 5 — History & autosave
22. Undo/redo history that actually works `Hard` `P1`
23. Autosave (local storage first, later backend) `Medium` `P1`

### Phase 6 — Accounts & backend
Needed before real publishing/multi-user use is possible.
24. User authentication (sign up / log in / log out) `Hard` `P0`
25. Per-user project storage tied to an account `Medium` `P0`
26. Backend API for saving/loading projects and assets `Hard` `P0`
27. Hosting/deployment pipeline (subdomain routing, custom domains, SSL) `Hard` `P0`

### Phase 7 — Publishing
28. Generate clean, real static HTML/CSS/JS from the data model `Hard` `P0`
29. Make sure published output is responsive (desktop/tablet/mobile) `Hard` `P0`
30. "Publish" button actually publishes/deploys the site `Hard` `P0`

### Phase 8 — Round out the editing engine (P1)
31. Floating/contextual toolbar for the selected element `Medium` `P1`
32. Copy / paste / duplicate elements `Easy` `P1`
33. Spacing/margin/padding visual editor `Hard` `P1`
34. Nested elements / grouping `Hard` `P1`
35. Drag elements from the left toolbar onto the canvas to insert them `Medium` `P1`
36. ~~Section tool: insert a new full-width section with layout presets~~ — done as a GUI section builder instead; presets dropped `Medium` `P1`
37. ~~Layers tool: full layers panel (tree view, reorder/reparent, visibility, lock)~~ — moot: the Layers tool was removed from the left toolbar `Hard` `P1`

### Phase 9 — Round out layouts, themes & assets (P1)
38. ~~Confirmation prompt when applying a layout over existing content~~ — moot: layouts append instead of replacing `Easy` `P1`
39. ~~Decide whether "layout" means a whole page or a single insertable section~~ — done: both, every card appends `Medium` `P1`
39a. Real Navbar / Showcase / Blog / Contact / Links / Footer layouts, replacing the `blank-test.json` fixtures `Medium` `P1`
40. ~~Load Google Fonts (or self-hosted fonts) for theme font options~~ `Easy` `P1` — done, see the stylesheet link in `index.html` and `FONT_GROUPS` in `theme.js`
41. Persist selected theme/font with the project data `Easy` `P1`
42. ~~Image thumbnails reflect actual uploaded files~~ `Easy` `P1` — done, see `asset-grid.js`
43. ~~Assign an asset to the selected image~~ `Medium` `P1` — done, see the Image pane's Source grid; inserting a new one is item 13
44. ~~Delete / replace uploaded assets~~ `Easy` `P1` — done, see `assets-panel.js`
45. File size / type validation and limits `Easy` `P1`
46. Favicon upload wired to the Assets/upload system `Easy` `P1`

### Phase 10 — Top bar, pages & UI wiring (P1)
47. Project name editable / rename flow `Easy` `P1`
48. Device switcher reflects real responsive breakpoints per element `Hard` `P1`
49. Undo/redo buttons wired to the real history stack `Easy` `P1`
50. "Preview" button opens a real, non-editable preview `Medium` `P1`
51. Publish flow: subdomain vs custom domain, confirm, progress/success state `Medium` `P1`
52. Multi-page support: canvas holds a page per accordion row, not one shared canvas `Hard` `P1`
53. "Add page" / rename / reorder / delete on the Layouts page accordion `Medium` `P1`

### Phase 11 — Data & quality wrap-up (P1)
54. Duplicate / delete / rename project from the dashboard `Easy` `P1`
55. Accessibility pass (keyboard nav, ARIA labels, focus states, contrast) `Medium` `P1`
56. Empty/loading/error states throughout the UI `Easy` `P1`

### Phase 12 — Nice-to-haves (P2)
57. Multi-select elements (shift-click / marquee select) `Medium` `P2`
58. Keyboard shortcuts (delete, duplicate, nudge, escape) `Easy` `P2`
59. Snapping / alignment guides while dragging or resizing `Hard` `P2`
60. Z-index / layer ordering support `Medium` `P2`
61. Manual "Save" state indicator `Easy` `P2`
62. ~~Shapes tool (rectangle, circle, line, divider)~~ — moot: the Shapes tool was removed from the left toolbar `Easy` `P2`
63. Embed tool (custom HTML/embed blocks) `Medium` `P2`
64. Support applying a layout to a single existing section (replace in place), and choosing where an inserted section lands instead of always appending `Medium` `P2`
65. Bigger preview / hover-to-preview before applying a layout `Medium` `P2`
66. Loading and error states in the Layouts tab while fetching `Easy` `P2`
67. Let users customize a theme's individual colors `Medium` `P2`
68. Let users customize font sizes / scale `Medium` `P2`
69. Custom theme creation + save as a new preset `Hard` `P2`
70. Basic image editing (crop, resize) on upload `Hard` `P2`
71. Support other asset types (icons, documents/resume PDF, video) `Medium` `P2`
72. Domain field editable + custom domain connection flow `Hard` `P2`
73. SEO settings (meta description, OG tags, per-page titles) `Medium` `P2`
74. Danger zone: delete project `Easy` `P2`
75. Project name dropdown menu `Easy` `P2`
76. Avatar/account menu `Easy` `P2`
77. Zoom controls (top bar) `Medium` `P2`
78. Zoom in/out buttons functional in canvas toolbar `Medium` `P2`
79. Export project data (JSON download / static HTML/CSS export) `Medium` `P2`
80. Rate limiting / abuse prevention for publishing and uploads `Medium` `P2`
81. Sitemap + basic SEO defaults on generated output `Easy` `P2`
82. 404 page for published sites `Easy` `P2`
83. Custom domain DNS instructions/flow `Hard` `P2`
84. Split `style.css` into smaller files `Easy` `P2`
85. ~~Split `script.js` into modules~~ `Easy` `P2` — done, see `scripts/*.js` and `main.js`
86. Decide on a build step / bundler `Medium` `P2`
87. Cross-browser testing `Medium` `P2`
88. Basic automated tests once there's real logic to test `Medium` `P2`
89. Error boundary / handling for failed `fetch` calls `Easy` `P2`
90. Write proper in-app help/onboarding `Medium` `P2`

### Phase 13 — Long tail (P3)
91. Settings tool (left toolbar): clarify UX vs right panel Settings tab `Easy` `P3`
92. Tooltips stay correct as tools gain real behavior `Easy` `P3`
93. More layout options / categories `Easy` `P3`
94. Search/filter within the Layouts tab `Easy` `P3`
95. Bundle/inline `layout/**/*.json` at build time (works from `file://`) `Medium` `P3`
96. More theme presets `Easy` `P3`
97. Dark-mode variant toggle for the published site `Medium` `P3`
98. Asset search/filter and folders `Medium` `P3`
99. Analytics integration (GA / Plausible snippet field) `Easy` `P3`
100. Password-protect / unlisted site option `Medium` `P3`
101. Breadcrumb of the selected element's parent chain `Medium` `P3`
102. Import content (resume text/LinkedIn prefill) `Hard` `P3`
103. Billing/plans (free vs pro tier, custom domain gating) `Hard` `P3`
104. Responsive support for the editor UI itself on smaller screens `Hard` `P3`
105. Performance check once the canvas holds real, larger pages `Medium` `P3`
