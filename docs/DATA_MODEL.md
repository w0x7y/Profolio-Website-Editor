# Data Model

Status: **decided and implemented**, with one caveat below. This is the answer
to TODO Phase 1, item 1 ("Decide on a data model for a site/page"). The canvas
renders layout `sections` through `renderer.js`, selection and the tool panes
edit what it produced, and `Project` records are now written to and read back
from IndexedDB (`storage.js`). Publishing is still future work.

The caveat: there is still **no in-memory project object**. Layout JSON is
fetched, rendered to DOM, and then the DOM is the only *live* copy — section
reordering and trash-deletion in `section-dnd.js` move and remove DOM nodes,
not model nodes, and the panes that edit committed content — Text, Button,
Image — write straight to the element. The Section pane is the exception: it
edits the Section builder's draft `Node` tree and renders that to the canvas,
so the tree is the source of truth until Insert commits it.

What changed is that the DOM is no longer the *only* copy. `serializer.js`
walks the canvas back into a `Node` tree whenever a project is saved, so the
shapes below now exist as stored data even though nothing holds them in memory
while editing. That serializer is a projection of the DOM, not a second model
living beside it: it holds no state and runs only on save. When the real
project tree lands (TODO Phase 1, item 3) the tree becomes the thing that gets
saved, and `serializer.js` goes away — it already produces the shape that tree
will hold.

## Goals

- One structure that can represent a whole site: pages, sections, nested
  containers, and leaf content (text, images, buttons, etc).
- Every node is selectable, editable, movable, and deletable by referencing
  a stable id — no relying on DOM position or array index.
- Templates/layouts can ship with **real placeholder slots** — an image
  element with no image yet, a text element with no copy yet — that render
  as an obvious "click to fill this in" affordance instead of empty space
  or lorem ipsum.
- Style is data (a whitelisted set of properties), not free-form CSS, so the
  editor UI (box-model editor, snapping, breakpoints) can actually reason
  about it.
- Colors/fonts are theme tokens referenced by nodes, not hardcoded per node,
  so the Themes tab can restyle the whole site from one place.
- No breaking migration needed for features already on the roadmap: nesting,
  multi-page, responsive per-breakpoint overrides, undo/redo.

## Non-goals (for now)

- No CMS-style dynamic/repeating collections bound to a data source. Repeated
  content (e.g. a row of project cards) is just literal sibling nodes,
  duplicated by hand (or by a future "duplicate element" action).
- No arbitrary custom CSS in the model. Component-level design (what a
  "button" or "project card" fundamentally looks like) stays in `style.css`,
  keyed off `type`/`role`. The model only carries *per-instance overrides*
  a user makes in the editor.

---

## Top-level shape

Created by `createProject()` in `project-record.js`, written and read by
`storage.js`. Fields marked *(stored, unused)* are written on every save but
nothing reads them yet — they are the shape the Settings tab will fill in.

```js
Project = {
  id: string,
  version: number,     // PROJECT_VERSION — what a future migration branches on
  name: string,
  createdAt: string,   // ISO timestamp
  updatedAt: string,

  theme: {
    id: string,               // e.g. "ink-violet" — matches a Themes tab preset
    colors: {
      background: string,
      surface: string,
      text: string,
      textMuted: string,
      accent: string,
      onText: string            // text drawn on a `text`-colored fill (button, footer)
      // These six are the whole theme — the hairline, placeholder and other
      // neutral tokens are derived from them in style.css rather than stored,
      // so they follow a light or a dark preset without being listed here.
      // Extend deliberately (see TODO: "customize individual colors").
    },
    fonts: {
      heading: string,        // font-family stack
      body: string
    },
    radius: string,           // e.g. "12px" — global corner-radius scale (future)
    spacingScale: number       // base spacing unit in px, e.g. 8 (future)
  },

  settings: {                  // (stored, unused) — see TODO Phase 3, item 19
    title: string,             // Settings tab: "Site title"
    description: string,       // SEO meta description (future)
    favicon: string | null,    // asset id/url
    domain: string | null
  },

  pages: [ Page ]
}

Page = {
  id: string,
  name: string,        // "Home"
  slug: string,         // "/" or "/about"
  isHome: boolean,
  sections: [ Node ]     // every element here has type === "section"
}
```

`pages` is an array of one for the MVP. Costs nothing to model now and avoids
a migration when multi-page support (Phase 10) becomes real.

---

## `Node` — the recursive unit

Sections, blocks, and elements are all the same shape. A "section" is just a
node with `type: "section"` living at the top of a page's tree; a "block" is
a container node (`row` / `column` / `group`) somewhere in the middle; an
"element" is a leaf node with no `children`. One shape, one renderer, one
serializer, one selection/undo mechanism — instead of three schemas to keep
in sync.

```js
Node = {
  // ---------- identity ----------
  id: string,          // stable, unique, generated once, never reused
                        // (e.g. nanoid(8)). This is what click-to-select,
                        // undo/redo, and drag-reorder all key off of.
  type: NodeType,       // see table below
  name?: string,        // human-readable label, e.g. "Hero Section" — not
                        // currently surfaced in any UI
  role?: string,        // semantic tag, independent of `type` — see below
  locked?: boolean,     // if true, can't be deleted/moved (e.g. nav, footer)

  // ---------- structure (containers only) ----------
  children?: Node[],

  layout?: {
    direction: "row" | "column",
    gap?: string,
    align?: string,      // align-items
    justify?: string,    // justify-content
    wrap?: boolean
  },

  // ---------- leaf content ----------
  content?: string,      // sanitized HTML fragment: heading/text/button label
  placeholder?: string,  // shown muted/dashed when content is empty
  src?: string | null,   // image: null = unfilled placeholder slot
  alt?: string,
  href?: string,         // button/link: the *destination*, derived from
                         // `meta` below rather than authored alongside it —
                         // see "Button actions". NOTE: renderer.js only
                         // renders this on `button` nodes today; a `nav-link`
                         // text node's target can be edited in the Text pane
                         // but does not render as a real link yet

  // ---------- style ----------
  style?: {
    base: StyleProps,
    tablet?: Partial<StyleProps>,   // cascades base -> tablet -> mobile
    mobile?: Partial<StyleProps>
  },

  meta?: object          // type-specific extras (e.g. embed provider/url)
}
```

### `NodeType`

| Category  | Types                                                              |
|-----------|---------------------------------------------------------------------|
| Container | `section`, `row`, `column`, `group`                                 |
| Leaf      | `heading`, `text`, `image`, `button`, `icon`, `divider`, `embed`     |

Container types have `children` and `layout`; leaf types have `content`/`src`/etc
and no `children`. A node should never mix the two.

### `role` (semantic tag, separate from `type`)

`type` says **what it renders as** (`<h1>` vs `<p>` vs `<img>`). `role` says
**what it means** (`"title"` vs `"avatar"` vs `"cta"`). Keeping these separate
pulls its weight in a few places already on the roadmap:

- The Themes tab can apply typography rules by role ("every `role: title`
  node uses the heading font") instead of hardcoding per-node fonts.
- A future "paste resume/LinkedIn text to prefill" import can map extracted
  content onto nodes by role instead of by fragile CSS selectors.
- A floating contextual toolbar can decide what controls to show based on
  role (an `avatar` image probably wants a "crop to circle" option a
  `thumbnail` doesn't).

Roles in use across `layout/**/*.json` today (not exhaustive, add as needed):

- Section-level: `nav`, `hero`, `about`, `projects`, `blog`, `contact`,
  `links`, `footer`
- Content-level: `eyebrow`, `title`, `subtitle`, `body`, `tag`, `cta`,
  `cta-secondary`, `nav-link`, `logo`, `portrait`, `thumbnail`,
  `project-card`

`style.css` already keys off some of these (`.node--section.role--nav`,
`role--hero`, `role--about`, `role--footer`, `.node--button.role--cta-secondary`,
and `[data-node-role="nav-link"]` / `[data-node-role="logo"]` inside the
footer), so adding a role is cheap but renaming one is not.

### `StyleProps` (whitelist, not free-form CSS)

Only known properties are allowed — this is what makes the future box-model
editor, snapping/alignment guides, and responsive breakpoints tractable,
since the editor UI needs to reason about specific properties rather than
parse arbitrary CSS strings.

```js
StyleProps = {
  // box model
  padding?: string, margin?: string,
  width?: string, height?: string,
  flex?: string,             // "1 1 0" | "0 0 40%" — a flex child's size in
                             // its container. The Section builder writes this
                             // for column widths; prefer it over `width` for
                             // children of a row.
  // typography
  fontFamily?: string,
  fontSize?: string, fontWeight?: string, lineHeight?: string,
  letterSpacing?: string,
  textAlign?: "left" | "center" | "right",
  textTransform?: "none" | "uppercase",
  webkitTextStroke?: string,       // "2px #000" — a stroke on the letterforms
  webkitTextStrokeWidth?: string,  // the two longhands the Text pane writes
  webkitTextStrokeColor?: string,
  color?: string,           // prefer a theme token, e.g. "var(--color-text)"
  // appearance
  background?: string,       // prefer a theme token
  backgroundColor?: string,  // what the Text pane's background toggle writes
  borderRadius?: string,
  borderWidth?: string,      // the Image pane's border, as three longhands
  borderStyle?: string,
  borderColor?: string,
  boxShadow?: string,
  opacity?: number,
  // image only — applied to the inner <img>, not to the node's own element
  objectFit?: "cover" | "contain" | "fill" | "none",
  objectPosition?: string
}
```

Extend this list deliberately as editor features need new properties —
resist letting it become "any CSS property."

Two rules this list has to obey, both learned the hard way:

1. **Every declaration a tool pane can write must be named here.** A save
   reads a node's styles back through this whitelist (`serializer.js`), so a
   property a pane writes but the whitelist doesn't name is a property that
   silently disappears on reload. The longhands above — `backgroundColor`, the
   two `webkitTextStroke*` parts, the three `border*` parts — are here for
   exactly that reason: the panes write the longhands, not the shorthands.
2. **`objectFit` / `objectPosition` are declared on the image node but land on
   its inner `<img>`.** An `image` node renders as a wrapper plus an `<img>`
   and the model gives it one style bag; these two mean nothing on the
   wrapper. `IMAGE_CHILD_STYLE_PROPS` in `renderer.js` is the list, and both
   the renderer and the serializer route through it. Everything else the Image
   pane writes — size, border, radius, shadow, opacity — belongs on the
   wrapper and stays there.

Note what is *not* here: `fontWeight` and `fontStyle` are listed, but the Text
panel never writes them. Bold/italic/underline/strikethrough are per-selection
formatting, so they live in `content` as `<b>`/`<i>`/`<u>`/`<s>` rather than as
element-level style — see the content rules below.

### Preview block tones

Layout cards use `preview.blocks[*].tone` to draw small semantic thumbnails in
the right panel. The current tone meanings are:

- `gradient-accent` = image
- `gradient-dark` = text
- `accent` = links/navbar
- `neutral` = other
- `" "` (a single space) = blank spacer

These tones are thumbnail-only hints; the actual canvas content is driven by
the `sections` tree. `layouts-panel.js` also still supports a `preview: { "blank":
true }` card that draws a plus icon instead of blocks; no layout file uses it
since `home/blank.json` was removed.

### Placeholders — the actual answer to "templates need fillable slots"

Two rules make this work:

1. **Text-like nodes**: if `content === ""`, the renderer shows `placeholder`
   in a muted/dashed style instead of nothing. Real content and "this slot
   is unfilled" are never ambiguous.
2. **Image nodes**: `src: null` renders an upload-icon placeholder box
   (dashed border, "click to add image" affordance) instead of a broken
   `<img>` or an empty rectangle.

Both states currently render with an `.is-empty` class for CSS styling
(dashed outline, muted color). This is not stored in the model itself; it is
derived at render time from `content`/`src`.

Text leaves also carry their placeholder through to the DOM as
`data-placeholder`. An empty node holds the placeholder *as its text*, so
without the attribute the Text panel would read that placeholder back as
content the user had typed, and would have nothing to restore once the content
was cleared again.

### Inline HTML in `content`

`content` is a **sanitized subset** of HTML: `b`, `i`, `u`, `s`, `strong`,
`em`, `br`, with all attributes stripped. Everything else is unwrapped to its
text on the way in.

This is what makes per-word formatting possible — selecting one word in the
Text panel's Content box and hitting Bold produces
`Product <b>Designer</b> and Developer`, not an element-wide `font-weight`.
`text-panel.js` owns the whitelist (`TEXT_INLINE_TAGS`) and applies it to
every write reaching the canvas.

---

## Worked example

The hero section from `layout/home/example.json`, expressed in the new model
(trimmed to the interesting parts):

```json
{
  "id": "sec_hero",
  "type": "section",
  "role": "hero",
  "name": "Hero",
  "layout": { "direction": "row", "align": "center", "justify": "space-between" },
  "children": [
    {
      "id": "col_hero_text",
      "type": "column",
      "children": [
        {
          "id": "el_tag",
          "type": "text",
          "role": "eyebrow",
          "content": "Available for work",
          "placeholder": "Add a tag"
        },
        {
          "id": "el_h1",
          "type": "heading",
          "role": "title",
          "content": "Product Designer & Frontend Developer",
          "placeholder": "Add a title"
        },
        {
          "id": "el_sub",
          "type": "text",
          "role": "subtitle",
          "content": "",
          "placeholder": "Add a short description"
        },
        {
          "id": "row_actions",
          "type": "row",
          "layout": { "direction": "row", "gap": "12px" },
          "children": [
            { "id": "btn_primary", "type": "button", "role": "cta", "content": "View Work", "href": "#" },
            { "id": "btn_ghost", "type": "button", "role": "cta-secondary", "content": "Get in Touch", "href": "#" }
          ]
        }
      ]
    },
    { "id": "el_avatar", "type": "image", "role": "portrait", "src": null, "alt": "" }
  ]
}
```

`el_sub` has empty `content` but a real `placeholder` — a genuine "type your
description here" slot. `el_avatar` has `src: null` — a genuine "click to
upload" slot. Both are ordinary data, not special-cased markup.

---

## Button actions

A `button` node does one of two things, held in `meta`:

```js
meta?: {
  actionType: "link" | "button",   // default "link"
  linkMode:   "section" | "url",   // link only
  sectionId?: string,              // linkMode "section": target section's node id
  url?: string,                    // linkMode "url"
  onClick?: string                 // button only: JS source
}
```

`href` is **derived** from this, not authored beside it — `#<sectionId>` or
the url. Keeping the two link modes in separate fields is what lets the editor
toggle between Link and Button without discarding whichever value is not
currently in play.

`onClick` is stored as source text and is never executed inside the editor: it
reaches the DOM as `data-on-click`, not as an `onclick` attribute, since an
attribute would run user JS in the editor's own page. It becomes a real
handler at publish time.

The Button tool panel edits all of this (`button-panel.js` /
`link-controls.js`). Text nodes with a link role — `nav-link` — carry the same
link fields and are edited by the same controls mounted in the Text pane.

## The rest of `meta`

Two more fields live in `meta`, both written by a save and read by the load
that follows it. Neither is authored by hand in a layout file.

```js
meta?: {
  assetId?: string,      // image nodes: which uploaded image this shows
  userStyled?: string[]  // which style.base keys were the user's, not the layout's
}
```

**`assetId`** is how an image survives a reload. An uploaded image is held as
a blob behind `URL.createObjectURL()`, and that URL is minted fresh every
session — so it is never what gets stored. A saved image node has `src: null`
and an `assetId`; `project.js` swaps between the two on either side of
storage (`hydrateAssetSrc()` / `dehydrateAssetSrc()`). An id whose image is
gone resolves back to `null`, which renders as the ordinary "click to add
image" placeholder rather than a broken image.

**`userStyled`** is the theme wipe's memory. `renderer.js` writes a layout's
`style.base` as inline styles and the tool panes write inline styles too;
`data-user-styled` on the element is the only thing telling them apart, and it
is what `clearNodeStyleOverrides()` consults when a new theme drops per-node
colors (see `node-style.js`). Persisting it is what stops a reopened project
from handing the user's hand-picked colors to the next theme change as if the
layout had set them. The ledger is stored in the model's camelCase spelling
and converted to CSS property names at the boundary.

One deliberate gap: an image's `objectFit` is written to the inner `<img>`, so
its ledger entry lives on that child and is not carried across a save. The
ledger's only consumer is the theme wipe, and nothing that can land on that
child is theme-derived. The declaration itself still round-trips through
`style.base`.

## Open questions / deliberately deferred

- Exact list of `role` values — expect to grow this organically as more
  layouts get built, rather than trying to enumerate it up front.
- ~~Whether `content` allows any inline HTML (bold/links) or plain text only
  for v1.~~ Decided: a small sanitized subset, see "Inline HTML in `content`"
  above. Links are still excluded.
- Repeating/collection content (e.g. data-bound project grids) — explicitly
  out of scope until there's a real need for it.

## Where this goes next

Phase 1, item 2 is implemented: `renderer.js` walks `Node` trees and produces
the canvas DOM with `data-node-id` (plus `data-node-type` and, when set,
`data-node-role`) on every rendered element. Ids are rewritten on insert
(`withUniqueIds()`) so the same layout can be added twice without colliding.

Click-to-select (Phase 2) is now wired in `selection.js`: clicking canvas content
walks up from the click target to the nearest selectable node and marks it
`.is-selected`. Only content nodes are selectable — `image`/`icon`,
`heading`/`text`, `button` — since those are the ones a user edits; containers
and the remaining leaves (`divider`, `embed`) deselect instead.

Persistence (Phase 1, items 3-6) is implemented on top of that: `storage.js`
holds `Project` records and asset blobs in IndexedDB, `serializer.js` produces
the tree from the canvas, `project.js` owns the open project, and the
dashboard (`index.html` / `dashboard.js`) creates, lists, renames and deletes
them.

Two things still follow, in order:

1. **A real project object** (Phase 1, item 3, the half that remains). Section
   drag-reorder, trash-deletion and selection still work on the DOM directly —
   selection is held as a DOM reference, not a node id. Once the canvas is
   backed by a live `Page.sections` tree, all three should address nodes in
   that tree and re-render. That is what makes undo/redo possible, and it is
   what retires `serializer.js`: the tree becomes the thing that gets saved
   instead of being reconstructed from the DOM at save time.
2. **Acting on the selection**: a contextual toolbar, a properties panel, and
   inline text editing, all reading the selected node out of that tree via its
   `data-node-id`.
