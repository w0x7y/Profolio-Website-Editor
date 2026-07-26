# TODO

Some foundational items are implemented, but most editor behavior is still
planned. Roughly ordered by dependency within each section, not by priority.

Tags on each item: **difficulty** (`Easy` / `Medium` / `Hard`) and
**priority** — `P0` (blocking / must-have for a usable editor), `P1` (high,
needed soon after), `P2` (medium, real but not urgent), `P3` (low / nice-to-have,
can wait a long time).

### Core canvas & editing engine
- [x] Decide on a data model for a "site"/"page" (JSON tree of sections → blocks → elements) that the canvas renders from, instead of static HTML `Hard` `P0` — see [docs/DATA_MODEL.md](./docs/DATA_MODEL.md)
- [x] Render the canvas from that data model instead of hardcoded markup `Hard` `P0` — see `renderer.js` (`renderNode`/`renderSections`/`renderPageIntoCanvas`)
- [ ] Click-to-select an element on the canvas `Medium` `P0`
- [ ] Show a selection outline + resize/move handles around the selected element `Hard` `P0`
- [ ] A floating/contextual toolbar for the selected element (font size, color, alignment, spacing, etc.) `Medium` `P1`
- [ ] Inline text editing (contenteditable or similar) for text elements `Medium` `P0`
- [ ] Drag-and-drop reordering of sections/elements within the canvas `Hard` `P0`
- [ ] Drag elements from the left toolbar onto the canvas to insert them `Medium` `P1`
- [ ] Multi-select elements (shift-click / marquee select) `Medium` `P2`
- [ ] Copy / paste / duplicate elements `Easy` `P1`
- [ ] Delete elements (with confirmation or undo safety net) `Easy` `P0`
- [ ] Keyboard shortcuts (delete, duplicate, arrow-key nudge, escape to deselect, etc.) `Easy` `P2`
- [ ] Snapping / alignment guides while dragging or resizing `Hard` `P2`
- [ ] Spacing/margin/padding visual editor (like Webflow's box model UI) `Hard` `P1`
- [ ] Nested elements / grouping (containers holding other elements) `Hard` `P1`
- [ ] Z-index / layer ordering support `Medium` `P2`
- [ ] Undo/redo history that actually works (top bar buttons are currently decorative) `Hard` `P1`
- [ ] Autosave (to local storage first, later to backend) `Medium` `P1`
- [ ] Manual "Save" state indicator (saved / saving / unsaved changes) `Easy` `P2`

### Left toolbar (tools)
- [ ] Select tool: real selection behavior (currently just toggles active style) `Medium` `P0`
- [ ] Text tool: click-to-place a new text block on canvas `Easy` `P0`
- [ ] Image tool: click-to-place an image placeholder, then upload/choose an image `Medium` `P0`
- [ ] Section tool: insert a new full-width section (with layout presets: 1 col, 2 col, grid, etc.) `Medium` `P1`
- [ ] Shapes tool: insert basic shapes (rectangle, circle, line, divider) `Easy` `P2`
- [ ] Embed tool: insert custom HTML/embed blocks (e.g. YouTube, Spotify, custom code) `Medium` `P2`
- [ ] Layers tool: build an actual layers panel (tree view of the page structure, click to select, drag to reorder/reparent, visibility toggle, lock toggle) `Hard` `P1`
- [ ] Settings tool (left toolbar): decide what this opens (currently duplicates the right panel's Settings tab — clarify UX) `Easy` `P3`
- [ ] Tooltips are static — verify they stay correct as tools gain real behavior `Easy` `P3`

### Right panel — Layouts tab
- [x] Clicking a layout card actually applies it to the canvas `Hard` `P0` — wired in `script.js` via `renderPageIntoCanvas()`; still needs the confirmation prompt below
- [ ] Confirmation prompt when applying a layout over existing canvas content ("this will replace your current page") `Easy` `P1`
- [ ] Fill in the `sections` field for `minimal.json`, `split-bio.json`, and `photo-first.json` (currently empty arrays — only `example.json` has real content; schema migrated from a raw `html` string to a `sections` node tree, see [docs/DATA_MODEL.md](./docs/DATA_MODEL.md)) `Easy` `P1`
- [ ] Decide whether "layout" means a whole starter page, or a single section users can insert (right now it's page-level only) `Medium` `P1`
- [ ] Support applying a layout to a single section instead of the whole page `Medium` `P2`
- [ ] More layout options / categories (e.g. filter by style, industry, single-page vs multi-page) `Easy` `P3`
- [ ] Search/filter within the Layouts tab if the list grows `Easy` `P3`
- [ ] Show a bigger preview / hover-to-preview before applying a layout `Medium` `P2`
- [ ] Loading and error states in the UI while `loadLayouts()` fetches (currently just a console error + plain text fallback) `Easy` `P2`
- [ ] Consider bundling/inlining `layout/*.json` at build time instead of runtime `fetch`, so the editor also works from a plain `file://` open (currently requires a local server) `Medium` `P3`

### Right panel — Themes tab
- [ ] Theme cards actually apply colors to the canvas (currently only toggles a visual "selected" state) `Medium` `P0`
- [ ] Font cards actually apply the chosen font to the canvas (currently only toggles a visual "selected" state) `Easy` `P0`
- [ ] Load Google Fonts (or self-hosted fonts) for the "Editorial Serif" / "Neutral Sans" options — currently just fall back to system fonts `Easy` `P1`
- [ ] Let users customize a theme's individual colors (not just pick a preset) `Medium` `P2`
- [ ] Let users customize font sizes / scale, not just family `Medium` `P2`
- [ ] More theme presets `Easy` `P3`
- [ ] Custom theme creation + save as a new preset `Hard` `P2`
- [ ] Dark-mode variant toggle for the published site itself (separate from the editor's own dark UI) `Medium` `P3`
- [ ] Persist selected theme/font with the project data `Easy` `P1`

### Right panel — Assets tab
- [ ] Real file upload (drag-and-drop and click-to-upload currently do nothing) `Medium` `P0`
- [ ] Image storage/hosting (needs a backend or third-party storage — decide on provider) `Hard` `P0`
- [ ] Image thumbnails reflect actual uploaded files instead of empty gradient placeholders `Easy` `P1`
- [ ] Click an asset to insert it into the canvas / assign it to the selected image element `Medium` `P1`
- [ ] Delete / replace uploaded assets `Easy` `P1`
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
- [ ] Multi-page support: page switcher (the canvas toolbar's "Page: Home" chip is currently a dead dropdown-styled button) `Hard` `P1`
- [ ] Zoom controls: actually change canvas zoom level (currently static "100%" label, buttons do nothing) `Medium` `P2`

### Canvas toolbar
- [ ] "Page: Home" chip opens a real page list / page switcher + "add page" action `Medium` `P1`
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
- [ ] Split `script.js` into modules as real functionality gets added (currently one file) `Easy` `P2`
- [ ] Decide on a build step (bundler) if the project outgrows plain HTML/CSS/JS — note this would also fix the "must run a local server" limitation mentioned above `Medium` `P2`
- [ ] Accessibility pass: keyboard navigation through the editor, ARIA labels on icon-only buttons, focus states, color contrast `Medium` `P1`
- [ ] Empty/loading/error states throughout (most panels currently assume happy-path data) `Easy` `P1`
- [ ] Responsive support for the editor UI itself on smaller screens (currently desktop-only layout) `Hard` `P3`
- [ ] Cross-browser testing `Medium` `P2`
- [ ] Basic automated tests once there's real logic to test (currently pure UI, nothing to test) `Medium` `P2`
- [ ] Error boundary / handling for failed `fetch` calls beyond the current `console.error` in `loadLayouts()` `Easy` `P2`
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
7. Select tool: real selection behavior `Medium` `P0`
8. Click-to-select an element on the canvas `Medium` `P0`
9. Selection outline + resize/move handles around the selected element `Hard` `P0`
10. Delete elements (with confirmation or undo safety net) `Easy` `P0`
11. Inline text editing (contenteditable) for text elements `Medium` `P0`
12. Text tool: click-to-place a new text block `Easy` `P0`
13. Image tool: click-to-place an image placeholder `Medium` `P0`
14. Drag-and-drop reordering of sections/elements within the canvas `Hard` `P0`

### Phase 3 — Layouts, themes & basic settings
Makes the existing UI shell actually do something.
15. ~~Layouts tab: clicking a card applies it to the canvas~~ `Hard` `P0` — done (no confirmation prompt yet, see Phase 9 #38)
16. Fill in the `sections` field for `minimal.json`, `split-bio.json`, and `photo-first.json` (schema migrated from `html` to `sections` — see [docs/DATA_MODEL.md](./docs/DATA_MODEL.md)) `Easy` `P1`
17. Theme cards actually apply colors to the canvas `Medium` `P0`
18. Font cards actually apply the chosen font `Easy` `P0`
19. Site title field editable and persisted `Easy` `P0`

### Phase 4 — Assets pipeline
20. Real file upload (drag-and-drop and click-to-upload) `Medium` `P0`
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
36. Section tool: insert a new full-width section with layout presets `Medium` `P1`
37. Layers tool: full layers panel (tree view, reorder/reparent, visibility, lock) `Hard` `P1`

### Phase 9 — Round out layouts, themes & assets (P1)
38. Confirmation prompt when applying a layout over existing content `Easy` `P1`
39. Decide whether "layout" means a whole page or a single insertable section `Medium` `P1`
40. Load Google Fonts (or self-hosted fonts) for theme font options `Easy` `P1`
41. Persist selected theme/font with the project data `Easy` `P1`
42. Image thumbnails reflect actual uploaded files `Easy` `P1`
43. Click an asset to insert it into the canvas / assign to selected image `Medium` `P1`
44. Delete / replace uploaded assets `Easy` `P1`
45. File size / type validation and limits `Easy` `P1`
46. Favicon upload wired to the Assets/upload system `Easy` `P1`

### Phase 10 — Top bar, pages & UI wiring (P1)
47. Project name editable / rename flow `Easy` `P1`
48. Device switcher reflects real responsive breakpoints per element `Hard` `P1`
49. Undo/redo buttons wired to the real history stack `Easy` `P1`
50. "Preview" button opens a real, non-editable preview `Medium` `P1`
51. Publish flow: subdomain vs custom domain, confirm, progress/success state `Medium` `P1`
52. Multi-page support: page switcher `Hard` `P1`
53. "Page: Home" chip opens a real page list / "add page" action `Medium` `P1`

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
62. Shapes tool (rectangle, circle, line, divider) `Easy` `P2`
63. Embed tool (custom HTML/embed blocks) `Medium` `P2`
64. Support applying a layout to a single section instead of the whole page `Medium` `P2`
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
85. Split `script.js` into modules `Easy` `P2`
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
95. Bundle/inline `layout/*.json` at build time (works from `file://`) `Medium` `P3`
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
