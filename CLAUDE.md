# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this is

**Profolio Editor** — a browser-based editor for building a personal portfolio
site: pick a starting layout, choose a theme, drag in content, and (eventually)
publish. Think "Webflow/Framer, scoped to portfolio sites."

The repo is two pages: a **dashboard** (`index.html`) listing the projects
stored in this browser, and the **editor** (`editor.html`), which always opens
on one of them via `editor.html?project=<id>`. There is no backend and no
publish step. Persistence is local: projects and uploaded images live in
IndexedDB, saved explicitly with the top bar's Save button. `README.md`
describes what works; `TODO.md` holds the full task list and a
dependency-ordered implementation plan.

## Stack and constraints

- **Vanilla HTML / CSS / ES modules.** No framework, no bundler, no
  `package.json`, no `node_modules`, no build step, no test suite, no linter.
- **Everything is hand-written and hand-verified in a browser.** There is
  nothing to run to prove a change works other than opening the app.
- One external network dependency: the Google Fonts `css2` stylesheet in
  `editor.html` (non-blocking, `media=print` + `onload`). The editor chrome's
  own font is vendored under `fonts/`, and the dashboard loads no third party
  at all.
- Do not introduce a build step, a dependency, or a framework without being
  asked. `TODO.md` lists "decide on a build step" as an open, deliberate
  question.

## Running it

The layout loader uses `fetch()`, so the app must be served over `http://` —
opening the files as `file://` paths silently breaks layout loading. Serving
also gives both pages one origin, which is what lets them share a database.

```bash
python3 -m http.server 4173    # matches .claude/launch.json
# then open http://localhost:4173/ — the dashboard; make a project to reach the editor
```

`.claude/launch.json` defines an `editor` configuration that does exactly this.

**Verification is manual.** After a change: serve the app, open it, and exercise
the path you touched (insert a layout card, select a node, apply a theme, upload
an image, build and insert a section). Check the browser console for errors.
There is no automated check that will catch a regression for you — do not claim
a change works without having actually loaded it.

Anything touching persistence has a second half: **save, reload, and look
again.** A change that works until the page is refreshed is the characteristic
failure here, and it is invisible in a single session — a style the whitelist
doesn't name, a field the serializer doesn't read, an asset stored under a URL
that won't exist next time. Reloading is the only way to see it. Deleting the
project afterwards also checks that its images went with it.

The one exception is the layout library, which has a mechanical checker:

```bash
python3 .claude/hooks/check-layout-json.py          # the whole layout/ tree
python3 .claude/hooks/check-layout-json.py <file>   # one file
```

It runs automatically on every write under `layout/` (see `.claude/` below). It
checks structure, not behavior — a layout that passes can still look wrong on
the canvas, so it does not replace opening the app.

## Layout of the repo

```text
index.html          The dashboard: the project list, its cards and its dialogs
editor.html         The whole editor shell: top bar, left toolbar, left tool
                    panel (Text/Image/Button/Section/Embed panes), canvas,
                    right panel (Layouts/Themes/Assets/Settings), upload dialog
styles/style.css    All styling — editor chrome + canvas page + rendered nodes
styles/dashboard.css  The dashboard's own layer, loaded after style.css
fonts/              Maple Mono, self-hosted (vendored from @fontsource, OFL)
scripts/*.js        ES modules; the editor's are all reached through main.js,
                    the dashboard's through dashboard.js
layout/             The layout library: pages.json + one folder per page
docs/DATA_MODEL.md  The data model (sections → blocks → elements)
README.md           User-facing overview and current status
TODO.md             Task list + phased implementation plan
.claude/            Claude Code configuration — see below
```

**Two entry points, not one.** `main.js` boots the editor and reaches for a
canvas, a tool panel and a right-hand panel; none of those exist on the
dashboard. The two pages share modules, not a boot sequence — specifically
`storage.js` (the same database) and `project-record.js` (the same record
shape). Do not import `project.js` from the dashboard: it pulls in the canvas,
the renderer, the serializer, the theme panel and the asset store, and that
whole graph would be evaluated on a page with nothing to render into. That
split is the entire reason `project-record.js` exists separately.

### `.claude/` vs this file

This file is prose: it is loaded into an assistant's context every session and
is only as binding as the reader's attention. `.claude/` is configuration the
harness executes, so it holds the rules that must not depend on someone
remembering them.

| Path | What it does |
|---|---|
| `.claude/launch.json` | The `editor` run configuration (`python3 -m http.server 4173`) |
| `.claude/settings.json` | Shared permissions, plus the hook registration below |
| `.claude/hooks/check-layout-json.py` | Validates `layout/` JSON after every write |

`settings.json` is checked in and shared; personal overrides go in
`settings.local.json`, which is gitignored. Anything phrased as "always do X"
belongs in `settings.json` as a hook rather than as a sentence here.

The layout hook exists because the failure it catches is invisible. A layout
file that is missing from its folder's `manifest.json` is never fetched — no
error, no card, just a lower count in the accordion header. And a malformed
one is worse than local: `loadPageLayouts()` fetches every manifest and layout
inside one `Promise.all`, so a single bad file rejects the whole chain and all
eight pages collapse into "Couldn't load pages." The hook also checks node
types and `style.base` keys, which it *parses out of `renderer.js`* rather than
duplicating — the style whitelist already lives in two places (see
"Cross-file couplings"), and a third copy hidden in a hook would be the one
nobody updates.

### The modules

`main.js` is the only script `editor.html` loads. It imports everything else and
calls each subsystem's `init*()` in a **specific order** documented at the call
site — that order is the only place the app's boot sequence is stated. Add new
init calls there, in the right place, with a comment saying why.

| Module | Owns |
|---|---|
| `main.js` | Editor boot. Toolbar/tab/device wiring, then every `init*()` in order |
| `dashboard.js` | The dashboard's own boot: the project list, and New/Rename/Delete |
| `storage.js` | IndexedDB. The `projects` and `assets` stores; knows nothing of node trees |
| `project-record.js` | What a stored project *is*, and `createProject()`. Imports nothing |
| `project.js` | The open project: load order, save, change tracking, the top bar's Save |
| `serializer.js` | Canvas DOM → node tree, for saving. The inverse of `renderer.js` |
| `dom.js` | Singleton element accessors + `activateOne()` |
| `renderer.js` | Node tree → canvas DOM. Renders only; wires no interactivity |
| `layouts-panel.js` | The Layouts accordion: loads `/layout`, inserts a card's sections |
| `selection.js` | Click-to-select on the canvas, and the active tool |
| `section-dnd.js` | Section drag-to-reorder and drop-on-trash-to-delete |
| `tool-panel.js` | Opening/closing the left tool panel and syncing its panes |
| `text-panel.js` | Text pane: content, typography, color. Owns `sanitizeInlineHtml()` |
| `button-panel.js` | Button pane: link/button type, target, stored on-click |
| `image-panel.js` | Image pane: source, size, fit, border, shadow, opacity |
| `section-builder.js` | The Section tool's draft tree, its live render, Insert/Cancel |
| `section-panel.js` | The Section pane's controls (DOM wiring only) |
| `link-controls.js` | The link action model + the shared link-target controls |
| `panel-widgets.js` | Generic pane controls: segmented, switch, color field, units |
| `node-style.js` | Per-node style overrides, and the ledger the Themes tab undoes and a save carries |
| `asset-store.js` | Uploaded images: a synchronous in-memory Map over IndexedDB blobs |
| `upload-modal.js` | The `<dialog>` upload window + shared drop-zone wiring |
| `asset-grid.js` | The thumbnail grid, rendered in two places |
| `assets-panel.js` | Assets tab: upload button + library |
| `theme.js` | Themes tab: color presets, font list, applying either, and its saved state |

## The data model

Read `docs/DATA_MODEL.md` before touching anything that produces or consumes a
node tree. The short version:

- Sections, blocks and elements are **one recursive `Node` shape**. Containers
  (`section`/`row`/`column`/`group`) have `children` + `layout`; leaves
  (`heading`/`text`/`image`/`button`/`icon`/`divider`/`embed`) have
  `content`/`src`/etc. A node never mixes the two.
- `type` is what it renders as; `role` is what it means (`title`, `avatar`,
  `cta`, `nav-link`, …). `style.css` keys off some roles, so adding a role is
  cheap and renaming one is not.
- `style.base` is a **whitelist** (`StyleProps`), not free-form CSS. The
  whitelist exists in two places — `STYLE_PROP_TO_JS` in `renderer.js` and the
  `StyleProps` block in `docs/DATA_MODEL.md` — and they must stay in sync.
- **Placeholders are data.** `content: ""` renders the node's `placeholder`
  muted/dashed; `src: null` renders a dashed upload box. Both get `.is-empty`,
  derived at render time. Text leaves also carry `data-placeholder` so the Text
  pane can tell a placeholder apart from typed content.
- `content` is a **sanitized subset of HTML** — `b`, `i`, `u`, `s`, `strong`,
  `em`, `br`, all attributes stripped. `text-panel.js` owns the whitelist
  (`TEXT_INLINE_TAGS` / `sanitizeInlineHtml()`) and `renderer.js` applies it to
  everything reaching the canvas, including layout JSON. Never write untrusted
  markup to `innerHTML` on a canvas path without going through it.

### The single biggest thing to know

**There is still no in-memory project object.** Layout JSON is fetched,
rendered to DOM, and then *the DOM is the only live copy*. Selection is a DOM
reference; section reorder and delete move and remove DOM nodes; every tool
pane writes straight to the element.

What changed is that the DOM is no longer the *only* copy. `serializer.js`
walks the canvas back into a `Node` tree when a project is saved, and
`renderer.js` renders that tree back on open. Work now survives a reload —
but only across a save, and only because the canvas can be read back.

This is still deliberate and still tracked (TODO Phase 1, item 3, the half
that remains). When you add editing behavior, follow the existing pattern —
write the DOM — and leave a comment noting it should address the node in the
project tree once one exists. Do not build a partial parallel model on the
side. `serializer.js` is not one: it holds no state, is never consulted while
editing, and runs only on save. When the real tree lands it is the tree that
gets saved and `serializer.js` goes away.

**Two consequences worth internalizing:**

*Anything a pane writes must be expressible in the model, or it will not
survive a save.* The style whitelist (`STYLE_PROP_TO_JS`) is read in both
directions — the renderer writes through it, the serializer reads through it —
so a pane writing a CSS property the whitelist doesn't name produces a change
that works until the user reloads and then silently vanishes. Adding a
declaration to a pane means adding it to the whitelist and to
`docs/DATA_MODEL.md` in the same change.

*Editor chrome must stay distinguishable from content.* The serializer walks
`[data-node-id]` children only, so drag handles, the drop line and the
blank-canvas placeholder are excluded by construction. The change watcher in
`project.js` filters the same set by class. If you add chrome inside the canvas
frame, it needs no `data-node-id` and should be named in `CHROME_SELECTOR`.

The one exception is the Section builder: its **draft is a real `Node` tree**
and is the single source of truth for the draft, with the canvas as a render
target. A layout value written only to the element would be lost by the next
structural re-render.

## Conventions that matter

These are load-bearing. Breaking one usually produces a subtle bug rather than
an obvious one.

**Theme tokens, never literals, in canvas CSS.** Every color and font under the
"canvas content" section of `style.css` reads a custom property. `theme.js`
writes six color properties plus two font properties onto `.canvas-frame` and
stops there — that one write restyles everything on the canvas *and* everything
added later. Neutrals (border, placeholder, faint text) are derived from the six
via `color-mix()` so they follow light and dark presets. A hex value anywhere in
canvas CSS is a hole a theme can't reach.

**The user-style ledger.** `renderer.js` writes inline styles from a layout's
`style.base`; tool panes also write inline styles. Applying a theme must wipe
the second kind and keep the first. So every pane write goes through
`setNodeStyle()` in `node-style.js`, which records the property in
`data-user-styled` on the element, and `clearNodeStyleOverrides()` removes only
what's listed there. Panes import `node-style.js`; `node-style.js` imports no
pane. A pane that needs to repopulate after a wipe registers via
`onOverridesCleared()`.

**Pane ownership boundary.** `selection.js` decides *what* is selected. Panes
never read `selectedEl` — they receive an element through `syncXPanel(el)`,
called from `openToolPanel()` (the one funnel both entry paths go through) and
nulled from `closeToolPanel()`. Keep that direction.

**`href` is derived, never authored.** A button's or nav-link's action lives in
`dataset` (`actionType`, `linkMode`, `sectionId`, `url`, `onClick`);
`link-controls.js` is the single writer of the rendered `href` via
`renderActionAttributes()`. That's what makes the Link/Button toggle
non-destructive. `onClick` reaches the DOM as `data-on-click`, **never** as an
`onclick` attribute — an attribute would execute user JS inside the editor's own
page. It becomes a real handler only at publish time.

**Draft isolation.** The Section builder's draft renders into the canvas frame
but is not content. The root carries `data-draft`, and every canvas behavior
that walks for *content* uses `COMMITTED_NODE_SELECTOR`
(`[data-node-id]:not([data-draft]):not([data-draft] *)`) instead of a bare
`[data-node-id]`. The draft is never selectable, never gets a drag handle, never
keeps the blank-canvas placeholder from returning, and always sits last in the
frame.

**Unique ids on insert.** `appendSectionsToCanvas()` deep-clones the layout tree
and rewrites ids (`withUniqueIds()`) so the same card can be inserted twice.
Layout JSON is fetched once and kept, so the source tree must stay pristine.

**`is-active` + `activateOne()`.** Every mutually-exclusive group — toolbar,
tabs, panes, device switcher, theme cards — uses the same class and the same
writer in `dom.js`. Segmented controls are the one group with their own writer
(`setSegmentedValue()` in `panel-widgets.js`), because they also carry
`aria-checked`; they still use `is-active` for the visual half.

**Switches keep state in `aria-checked`,** not in a JS variable, so accessible
and visual state can't drift.

**Unit pickers convert, they don't relabel.** `convertFieldUnit()` /
`pxPerUnit()` in `panel-widgets.js`. A 32px heading switched to rem becomes
`2rem`, not `32rem`.

**Singleton elements are accessors, not module constants.** Modules are
evaluated before the DOM is ready, so `const frame = document.querySelector(…)`
at module scope captures `null` forever. See `dom.js`.

**Generic controls go in `panel-widgets.js`.** Panes must not import each other
to borrow a widget — that's exactly the tangle `panel-widgets.js` was extracted
to undo.

**Controls mounted more than once are built in JS,** not written into
`editor.html` (two copies of markup drift, and two mounts can't share an `id`).
`createLinkControls()` and the layout cards follow this.

## Working with the layout library

- `layout/pages.json` — `{ "id", "name" }` per page, in accordion order. `id` is
  the folder name under `layout/`.
- `layout/<page>/manifest.json` — the list of layout files to fetch. Required: a
  browser can't list a folder. An empty `[]` still renders the accordion row.
- `layout/<page>/<name>.json` — `id`, `name`, `description`, `preview`,
  `sections`.

**To add a layout:** drop the JSON in the page folder *and* add its filename to
that folder's `manifest.json`. **To add a page:** create the folder with an
empty `manifest.json` and add an entry to `pages.json`. The `layout/` write hook
catches a forgotten manifest entry either way — but the point is that it is
forgettable, so do both in the same change.

Every layout card is **additive** — clicking appends its `sections` to the
bottom of the canvas; nothing is replaced. Preview block tones are semantic:
`gradient-accent` = image, `gradient-dark` = text, `accent` = links/navbar,
`neutral` = other, `" "` = blank spacer.

Content status: only `home/example.json` and `about/example.json` carry real
copy. Every page has a `blank-test.json` with real structure and unfilled slots.
`minimal.json`, `split-bio.json` and `photo-first.json` have empty `sections`
arrays, so clicking them does nothing.

## Cross-file couplings to keep in sync

- `STYLE_PROP_TO_JS` (`renderer.js`) ↔ `StyleProps` (`docs/DATA_MODEL.md`) ↔ every
  CSS property any pane passes to `setNodeStyle()`. A pane can only write what
  the whitelist names; anything else is dropped by the next save
- `FONT_GROUPS` (`theme.js`) ↔ the Google Fonts `css2` URL in `editor.html`
  (both the `<link>` and the `<noscript>` copy)
- `THEME_COLOR_PROPS` (`theme.js`) ↔ the `--color-*` block on `.canvas-frame`
  in `style.css`
- `TOOL_PANEL_TOOLS` (`tool-panel.js`) ↔ the `data-tool-pane` panes in
  `editor.html` ↔ `NODE_TYPE_PANES` (`selection.js`)
- `IMAGE_CHILD_STYLE_PROPS` (`renderer.js`) — the props routed to an image's
  inner `<img>` — is read by both `renderer.js` and `serializer.js`
- Canvas chrome (`.section-handle`, `.canvas-drop-line`, `.canvas-frame__empty`)
  ↔ `CHROME_SELECTOR` (`project.js`), which decides what is not an edit
- `role` values in `layout/**/*.json` ↔ the `role--*` rules in `style.css`
- The roles list in `docs/DATA_MODEL.md` ↔ what layouts actually use

## Code style

- **4-space indent**, single quotes in JS, semicolons.
- Every module opens with a **banner comment block** (`// ====…`) explaining
  what it owns, why it exists, where its boundaries are, and what is deliberately
  *not* here. This is the house style and it carries most of the design
  rationale — match it when adding a module, and update it when a module's
  responsibility shifts.
- Exported functions carry JSDoc. Non-obvious decisions get an inline comment
  saying *why*, not *what*.
- Comments explain trade-offs and rejected alternatives. Preserve them; they are
  the closest thing this repo has to design docs outside `docs/`.

## Documentation upkeep

`README.md`, `TODO.md` and `docs/DATA_MODEL.md` are actively maintained and
cross-linked. When you land a feature:

- tick the matching `TODO.md` checkbox(es) — both in the per-area list *and* in
  the phased Implementation Plan — and annotate with the file that implements it;
- update `README.md`'s project-structure tree and "Current status" list;
- update `docs/DATA_MODEL.md` if you changed the node shape, the style
  whitelist, roles, or the content-sanitizing rules.

Docs name the module that actually implements a thing (`selection.js`,
`section-dnd.js`, `layouts-panel.js`, …). The pre-split `script.js` no longer
exists — don't reintroduce references to it. Likewise `docs/` holds only
`DATA_MODEL.md`; `docs/specs/` and `docs/plans/` were removed deliberately in
`714f1f2`, so design rationale belongs in a module's banner comment, not in a
new file under `docs/`.

## Git workflow

- Work on the branch you were assigned; never push to `main` directly.
- Commits use conventional-ish prefixes seen in history: `feat:`, `fix:`,
  `refactor:`, `docs:`. Subject lines describe behavior, not files.
- PRs get automated CodeRabbit review — expect docstring and auto-fix follow-up
  commits.
- Do not open a PR unless asked.
