# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this is

**Profolio Editor** — a browser-based editor for building a personal portfolio
site: pick a starting layout, choose a theme, drag in content, and (eventually)
publish. Think "Webflow/Framer, scoped to portfolio sites."

Today the repo is the **editor UI**, not the product. There is no backend, no
persistence, and no publish step. `README.md` describes what works; `TODO.md`
holds the full task list and a dependency-ordered implementation plan.

## Stack and constraints

- **Vanilla HTML / CSS / ES modules.** No framework, no bundler, no
  `package.json`, no `node_modules`, no build step, no test suite, no linter.
- **Everything is hand-written and hand-verified in a browser.** There is
  nothing to run to prove a change works other than opening the app.
- Only two external network dependencies: the Google Fonts `css2` stylesheet in
  `index.html` (non-blocking, `media=print` + `onload`), and nothing else. The
  editor chrome's own font is vendored under `fonts/`.
- Do not introduce a build step, a dependency, or a framework without being
  asked. `TODO.md` lists "decide on a build step" as an open, deliberate
  question.

## Running it

The layout loader uses `fetch()`, so the app must be served over `http://` —
opening `index.html` as a `file://` path silently breaks layout loading.

```bash
python3 -m http.server 4173    # matches .claude/launch.json
# then open http://localhost:4173/
```

`.claude/launch.json` defines an `editor` configuration that does exactly this.

**Verification is manual.** After a change: serve the app, open it, and exercise
the path you touched (insert a layout card, select a node, apply a theme, upload
an image, build and insert a section). Check the browser console for errors.
There is no automated check that will catch a regression for you — do not claim
a change works without having actually loaded it.

## Layout of the repo

```text
index.html          The whole editor shell: top bar, left toolbar, left tool
                    panel (Text/Image/Button/Section/Embed panes), canvas,
                    right panel (Layouts/Themes/Assets/Settings), upload dialog
styles/style.css    All styling — editor chrome + canvas page + rendered nodes
fonts/              Maple Mono, self-hosted (vendored from @fontsource, OFL)
scripts/*.js        ES modules, all reached through main.js
layout/             The layout library: pages.json + one folder per page
docs/DATA_MODEL.md  The data model (sections → blocks → elements)
README.md           User-facing overview and current status
TODO.md             Task list + phased implementation plan
```

### The modules

`main.js` is the only script `index.html` loads. It imports everything else and
calls each subsystem's `init*()` in a **specific order** documented at the call
site — that order is the only place the app's boot sequence is stated. Add new
init calls there, in the right place, with a comment saying why.

| Module | Owns |
|---|---|
| `main.js` | Boot. Toolbar/tab/device wiring, then every `init*()` in order |
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
| `node-style.js` | Per-node style overrides and the ledger the Themes tab undoes |
| `asset-store.js` | Uploaded images, in memory |
| `upload-modal.js` | The `<dialog>` upload window + shared drop-zone wiring |
| `asset-grid.js` | The thumbnail grid, rendered in two places |
| `assets-panel.js` | Assets tab: upload button + library |
| `theme.js` | Themes tab: color presets, font list, applying either |

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

**There is no in-memory project object.** Layout JSON is fetched, rendered to
DOM, and then *the DOM is the only copy*. Selection is a DOM reference; section
reorder and delete move and remove DOM nodes; every tool pane writes straight to
the element. Nothing survives a reload.

This is deliberate and tracked (TODO Phase 1, item 3). When you add editing
behavior, follow the existing pattern — write the DOM — and leave a comment
noting it should address the node in the project tree once one exists. Do not
build a partial parallel model on the side.

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
`index.html` (two copies of markup drift, and two mounts can't share an `id`).
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
empty `manifest.json` and add an entry to `pages.json`.

Every layout card is **additive** — clicking appends its `sections` to the
bottom of the canvas; nothing is replaced. Preview block tones are semantic:
`gradient-accent` = image, `gradient-dark` = text, `accent` = links/navbar,
`neutral` = other, `" "` = blank spacer.

Content status: every page has a `blank-test.json` — real section structure with
every slot unfilled. `home/example.json` and `about/example.json` are richer
structures (hero; title + portrait + bio) but their copy is unfilled too, so
nothing in the library currently ships real text. `minimal.json`,
`split-bio.json` and `photo-first.json` have empty `sections` arrays, so
clicking them does nothing.

## Cross-file couplings to keep in sync

- `STYLE_PROP_TO_JS` (`renderer.js`) ↔ `StyleProps` (`docs/DATA_MODEL.md`)
- `FONT_GROUPS` (`theme.js`) ↔ the Google Fonts `css2` URL in `index.html`
  (both the `<link>` and the `<noscript>` copy)
- `THEME_COLOR_PROPS` (`theme.js`) ↔ the `--color-*` block on `.canvas-frame`
  in `style.css`
- `TOOL_PANEL_TOOLS` (`tool-panel.js`) ↔ the `data-tool-pane` panes in
  `index.html` ↔ `NODE_TYPE_PANES` (`selection.js`)
- `role` values in `layout/**/*.json` ↔ the `role--*` rules in `style.css`
- The roles list in `docs/DATA_MODEL.md` ↔ what layouts actually use

`python3 .claude/check-sync.py` (or `/check-sync`) verifies the first four
mechanically, plus that every page's `manifest.json` matches the `.json` files
actually in its folder. It is the only automated check in the repo — it does
not test behavior, only that files which state the same fact still agree. The
last two couplings are deliberately not checked: a `role` with no CSS rule is
valid, so there is no failure to detect.

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
