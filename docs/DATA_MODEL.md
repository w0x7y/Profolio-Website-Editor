# Data Model

Status: **decided and partially implemented**. This is the answer to TODO
Phase 1, item 1 ("Decide on a data model for a site/page"). The canvas now
renders layout `sections` through `renderer.js`; selection, editing, saving,
and publishing are still future work.

One important caveat: there is **no in-memory project object yet**. Layout JSON
is fetched, rendered to DOM, and then the DOM is the only copy — section
reordering and trash-deletion in `script.js` move and remove DOM nodes, not
model nodes. The shapes below describe where the model is going; only `Node`
(and only the fields `renderer.js` reads) exists in running code today.

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

```js
Project = {
  id: string,
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
      accent: string
      // extend as the Themes tab grows (see TODO: "customize individual colors")
    },
    fonts: {
      heading: string,        // font-family stack
      body: string
    },
    radius: string,           // e.g. "12px" — global corner-radius scale
    spacingScale: number       // base spacing unit in px, e.g. 8
  },

  settings: {
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
  // typography
  fontFamily?: string,
  fontSize?: string, fontWeight?: string, lineHeight?: string,
  letterSpacing?: string,
  textAlign?: "left" | "center" | "right",
  textTransform?: "none" | "uppercase",
  webkitTextStroke?: string,  // "2px #000" — a stroke on the letterforms
  color?: string,           // prefer a theme token, e.g. "var(--color-text)"
  // appearance
  background?: string,       // prefer a theme token
  borderRadius?: string,
  opacity?: number
}
```

Extend this list deliberately as editor features need new properties —
resist letting it become "any CSS property."

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
the `sections` tree. `script.js` also still supports a `preview: { "blank":
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

Click-to-select (Phase 2) is now wired in `script.js`: clicking canvas content
walks up from the click target to the nearest selectable node and marks it
`.is-selected`. Only content nodes are selectable — `image`/`icon`,
`heading`/`text`, `button` — since those are the ones a user edits; containers
and the remaining leaves (`divider`, `embed`) deselect instead.

Two things follow from that, in order:

1. **A real project object** (Phase 1, item 3). Section drag-reorder,
   trash-deletion and selection currently work on the DOM directly — selection
   is held as a DOM reference, not a node id. Once the canvas is backed by a
   `Page.sections` tree, all three should address nodes in that tree and
   re-render, which is also what makes undo/redo and autosave possible.
2. **Acting on the selection**: a contextual toolbar, a properties panel, and
   inline text editing, all reading the selected node out of that tree via its
   `data-node-id`.
