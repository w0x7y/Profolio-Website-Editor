# Section tool: GUI custom section builder

Status: **designed, not yet implemented**.

This replaces the Section tool described in `TODO.md:42` ("insert a new
full-width section, with layout presets: 1 col, 2 col, grid") with a GUI
builder: the user composes a section's structure themselves, sees it live on
the canvas as they go, and commits it when it looks right.

## Why this instead of presets

Presets answer "which of these five shapes do you want". A builder answers
"what shape do you want", which is the actual question for a portfolio site
where every page wants a slightly different split. The data model already
supports the general case — `section` / `row` / `column` / `group` are
container types with `children[]` and a flexbox `layout` (see
`docs/DATA_MODEL.md`) — so a builder is a UI over a schema that already
exists, not a new schema.

The preset gallery is dropped entirely. Every section starts empty. This is a
deliberate divergence from the TODO wording and should be reflected there.

## Scope

In scope for v1:

- A section holding rows; rows holding columns; columns holding content slots.
  The section is a `column`-direction container (so its gap is the spacing
  between rows), each row is a `row`-direction container, and each column is a
  `column`-direction container. These are the defaults `applyNodeLayout()`
  already derives from `node.type` (`renderer.js:123`), so no node needs an
  explicit `direction` unless the user changes it.
- Layout control per container: gap, vertical align, horizontal distribution,
  wrap, and per-column width.
- Content slots inserted as unfilled placeholders (heading, text, image,
  button) to be filled after insertion via the existing Text/Image/Button
  panes.
- A live draft rendered on the canvas while composing, committed with Insert
  or thrown away with Cancel.

Out of scope for v1, with reasons:

- **Re-editing an inserted section's structure.** Requires reconstructing a
  node tree from DOM, which is blocked on the missing in-memory project
  object (`docs/DATA_MODEL.md:8-11`, TODO Phase 1 item 3). Content in an
  inserted section stays editable through the existing panes, and the section
  can still be reordered or trashed.
- **Drag-and-drop inside the builder.** Reparenting by drag needs nested drop
  targets on two axes, which `section-dnd.js` does not do (TODO items 34, 35,
  both `Hard`). Structure is built with click-to-add instead.
- **Per-container styling** beyond layout — padding, background, border,
  min-height. Overlaps what a future box-model editor (TODO item 33) should
  own, and would require several additions to the renderer's style whitelist.
- **Nesting deeper than section → row → column.** The model permits arbitrary
  depth; the UI deliberately does not, to keep the pane a flat inspector
  rather than a tree editor.
- **Grid layout.** `applyNodeLayout()` hardcodes `display: flex`. Row wrap
  covers the grid-like cases v1 needs. Adding `display` to the layout model is
  future work.

## Architecture

The draft is a plain `Node` tree held in a module variable in
`section-builder.js`, and it is the single source of truth. The canvas is only
a render target for it.

```
  user clicks control                      user clicks draft on canvas
          │                                          │
          ▼                                          ▼
  section-panel.js ──calls──► section-builder.js ◄──pick(section|row|column)
                                    │
                    ┌───────────────┴───────────────┐
           structural edit                  layout-value edit
        (add/delete row, column,         (gap, align, justify,
         content slot)                    wrap, column width)
                    │                                │
                    ▼                                ▼
          renderNode(draft) →            applyLayoutProp(el, prop, value)
          swap draft element                 on the existing element
                    └───────────────┬───────────────┘
                                    ▼
                      draft <section data-draft> on canvas
                                    │
                      ┌─────────────┴─────────────┐
                   Insert                      Cancel
                      │                            │
        strip ids + data-draft,            remove element,
        appendSectionsToCanvas(),          draft = null
        addSectionDragHandles()
```

### Hybrid update strategy

Structural edits re-render the draft through `renderNode()`. Layout-value
edits write straight to the existing element. This mirrors the pattern the
existing panes already use: `text-panel.js` and `image-panel.js` do not
re-render, they write styles onto the selected element via `setNodeStyle()` in
`node-style.js`, and only content changes rebuild markup.

The alternative — full re-render on every change — was rejected because
typing into the gap field would rebuild the subtree on every keystroke and
destroy the picked element each time. Pure DOM patching for everything was
rejected because the structural cases would become a second hand-written
renderer that drifts from `applyNodeLayout()`.

**One writer per layout value.** `applyLayoutProp(el, prop, value)` is
extracted from `applyNodeLayout()` (`renderer.js:119-131`) and exported. Both
the initial render and every live edit go through it, so the two paths cannot
disagree. This is the same discipline `node-style.js` enforces for styles and
`link-controls.js` enforces for `href`.

### Draft identity and insertion

Draft node ids are prefixed `draft_` and are temporary. On Insert the tree is
deep-cloned, every `id` is deleted, and `appendSectionsToCanvas()` regenerates
them through its existing `withUniqueIds()` path (`renderer.js:360-378`), which
falls back to `node.type` when a node has no id. Inserted sections therefore
get the same clean `section` / `row` / `column` ids a layout file would
produce, and no `draft_` id ever reaches committed content.

### Draft lifetime

The draft persists until Insert or Cancel, including across tool switches —
switching to the Text tool and back resumes it. Discarding on tool switch
would either lose work silently or require a confirm dialog. A persistent
draft marked with a dashed outline and a "Draft" badge is self-explanatory,
and it cannot be mistaken for content because it is excluded from every
canvas behavior listed below.

### Node fields the builder sets, and the ones it deliberately does not

Content slots are created with no `content`, no `src` and no explicit
`placeholder`. The renderer already supplies the right placeholder text for an
empty leaf — `fallbackPlaceholder()` for copy leaves and
`DEFAULT_IMAGE_PLACEHOLDER` for images (`renderer.js:53-58`, `:235`) — so the
builder must not invent placeholder strings of its own, or the two would
drift.

The builder sets no `role` on anything it creates. `role` is semantic
("hero", "footer") and drives real CSS — `.node--section.role--hero` gets 90px
padding, `.role--footer` inverts the page (`styles/style.css:1203-1219`). A
user-built section has no meaningful role to guess at, so it gets none and
falls back to the base `.node--section` padding of `64px 56px`
(`styles/style.css:1044`). A role picker is plausible future work, but
guessing a role from structure would produce wrong styling silently.

It sets no `name` either — `DATA_MODEL.md:115-116` notes `name` is not
surfaced in any UI yet, and the pane refers to picked nodes positionally
("Row 2") rather than by a stored label.

## Modules

### New

**`scripts/section-builder.js`** — owns the draft. The tree, the picked node
id, the operations on them, rendering the draft into the canvas, and
`insertDraft()` / `cancelDraft()`. It also owns the delegated click listener
that turns a click on the draft into a pick. Knows nothing about control
markup.

Operations, all pure functions over the draft object except where they touch
the canvas:

| Function | Effect |
|---|---|
| `addRow(draft)` | appends a row with one empty column |
| `addColumn(draft, rowId)` | appends an empty column to that row |
| `addContentSlot(draft, columnId, type)` | appends an unfilled leaf, with no `content` / `src` and no explicit `placeholder` |
| `deleteRow(draft, rowId)` | removes the row and its subtree |
| `deleteColumn(draft, columnId)` | removes the column and its subtree |
| `deleteContentSlot(draft, slotId)` | removes one leaf |
| `setLayoutProp(draft, nodeId, prop, value)` | writes `node.layout[prop]` |
| `setColumnWidth(draft, columnId, mode, pct)` | writes `node.style.base.flex` |

**`scripts/section-panel.js`** — owns the pane. Builds controls with
`panel-widgets.js`, calls builder operations, re-syncs when the picked node
changes. Exports `initSectionPanel()` and `syncSectionPanel()` to match how
`tool-panel.js:46-48` already calls the other panes. Knows nothing about the
tree's shape beyond what the builder hands it.

This split is what keeps both files small: tree operations are pure functions
over a plain object, and the pane is pure DOM wiring. Neither needs the other
to be understood.

### Modified

| File | Change |
|---|---|
| `renderer.js` | export `applyLayoutProp()` extracted from `applyNodeLayout()`; add `flex` to `STYLE_PROP_TO_JS`; exclude `[data-draft]` from `collectNodeIds()` and `refreshCanvasEmptyState()`; `appendSectionsToCanvas()` inserts before the draft when one exists |
| `section-dnd.js` | exclude `[data-draft]` from both `:scope > .node--section` queries (`:74`, `:144`); `sectionAfterPoint()` returns the draft element instead of `null` when a draft exists |
| `selection.js` | `selectableTargetFrom()` bails inside `[data-draft]` |
| `tool-panel.js` | `if (tool === 'section') syncSectionPanel()`; drop the stale header comment at `:18-19` |
| `main.js` | `initSectionPanel()` in the boot sequence |
| `index.html` | real markup for `data-tool-pane="section"`, replacing the placeholder at `:520-521` |
| `styles/style.css` | draft outline and badge, `.is-picked`, empty-container affordance, pane control styles |
| `TODO.md` | mark the Section tool done; record that presets were dropped |
| `README.md` | feature list and the `scripts/` file tree |
| `docs/DATA_MODEL.md` | document `flex` in the StyleProps whitelist; note the builder as a producer of node trees |

`selection.js` needs no change to its tool handling. `onCanvasClick` already
returns early when `activeTool !== 'select'` (`selection.js:103`), so while
the Section tool is active normal selection is off and the builder's listener
has the canvas to itself. The two never compete. `selectableTargetFrom()` is
touched only for the case where a draft is on the canvas and the user has
switched back to the Select tool.

### Renderer whitelist addition

Column width uses `flex`, which `STYLE_PROP_TO_JS` (`renderer.js:62-79`) does
not currently allow:

| Width mode | `style.base.flex` |
|---|---|
| auto | unset — natural width |
| equal | `1 1 0` |
| explicit % | `0 0 <pct>%` |

`renderer.js:61` requires this whitelist to stay in sync with the StyleProps
list in `docs/DATA_MODEL.md`, so both change together. This is the only
renderer capability this feature adds; gap, align, justify and wrap already
render.

## Pane UI

Three things are pickable in the draft: the **section** (its gap is the
spacing between rows), a **row**, and a **column**.

```
┌────────────────────────────┐
│ Section              ✕     │   tool-panel header, existing chrome
├────────────────────────────┤
│ Picked: Row 2              │
│                            │
│ Gap          [ 16 ] [px ▾] │   buildCtrl + number + unit select
│ Align        [ ⊤ ⊙ ⊥ ]     │   buildSegmented (align-items)
│ Distribute   [ ⊣ ⊙ ⊢ ⇔ ]   │   buildSegmented (justify-content)
│ Wrap         [   off  ]    │   switch widget
│                            │
│ + Add column               │
│ ✕ Delete row               │
├────────────────────────────┤
│ + Add row                  │   always available
├────────────────────────────┤
│ Cancel            Insert   │
└────────────────────────────┘
```

Per picked type:

- **Section** — gap between rows.
- **Row** — gap, align, distribute, wrap, `+ Add column`, `✕ Delete row`.
- **Column** — width (`auto | equal | %`, with a number field revealed only
  for `%`), the content-slot list with a `✕` on each, `+ Add content`
  (Heading / Text / Image / Button), `✕ Delete column`.

With nothing picked and no rows yet, the pane shows an empty state and a
single `+ Add row`.

### Interaction decisions

**Clicking a content placeholder picks its parent column.** Content slots are
not individually pickable — they have no properties to edit at this stage, and
their copy and images are filled after insertion. They are removed from the
column's slot list. Resolving a click to the nearest ancestor of a known type
is the same idiom `selectableTargetFrom()` (`selection.js:122-130`) already
uses, with a different target set.

**Empty containers are visible inside the draft.** A flex column with no
children collapses to zero height and cannot be clicked, so within
`[data-draft]` only, empty containers get a `min-height` and a dashed border.
This styling never applies to committed content.

**Structural edits preserve the pick.** Re-rendering destroys the picked
element, so the builder re-resolves the picked node by id afterward. Deleting
the picked row or column moves the pick to the section rather than leaving the
pane inspecting a detached node — the problem `clearSelectionIfDetached()`
(`selection.js:161`) solves for real selection.

## Canvas interaction fixes

A draft on the canvas touches four existing behaviors. Two are handled by the
`[data-draft]` exclusions above; two need real fixes.

**Insert position.** `appendSectionsToCanvas()` appends to the end of the
frame, but the draft is at the end. It gains one rule: insert before
`[data-draft]` if one exists, else append. This solves two problems at once —
a layout card clicked mid-draft lands above the draft rather than below it,
and the builder's own Insert lands exactly where the draft was standing before
the draft is removed.

**Reorder drop past the last section.** `sectionAfterPoint()` returns `null`
for "past the end", which `insertBefore(null)` turns into append, landing a
dragged section after the draft. It returns the draft element instead when one
exists, so the drop lands before it.

**Empty state.** `refreshCanvasEmptyState()` returns early if any
`[data-node-id]` is present. Without excluding the draft, trashing the last
real section while a draft exists would fail to restore the empty state, and
cancelling the draft afterward would leave a blank frame with no placeholder.

**Drag handles.** `addSectionDragHandles()` matches every
`:scope > .node--section`, so without exclusion the draft would become
draggable and trashable before it was ever committed.

## Error handling

No network, no async, no persistence in this feature. Error handling reduces
to input validation on two number fields:

- Gap clamped to `>= 0`.
- Width percentage clamped to `1–100`.
- Non-numeric input rejected, reverting to the last good value.

`panel-widgets.js` already establishes this idiom with `normalizeHex()` and
`round3()`.

Insert is disabled while the draft has no rows, which removes the only way to
commit a meaningless section.

## Testing

Manual QA checklist, consistent with how every existing panel in this repo was
verified. The repo has no test runner, no `package.json` and no build step,
and adding one is out of scope for this feature.

Checklist:

1. Section tool opens the pane with the empty state; `+ Add row` creates a
   row with one empty column, visible as a dashed box on the canvas.
2. Picking the section, a row, and a column each shows the right controls.
3. Gap, align, distribute and wrap visibly change the draft without rebuilding
   it (the picked outline stays put).
4. Column width `auto` / `equal` / `%` behave, and `%` clamps outside `1–100`.
5. Adding each content type renders the correct placeholder.
6. Deleting the picked row or column moves the pick to the section.
7. Insert commits the section, gives it a drag handle, and clears the pane
   back to its empty state; the committed section has no `draft_` ids and no
   `data-draft`.
8. Cancel removes the draft and leaves the canvas untouched.
9. Inserted content is selectable and editable via the Text/Image/Button
   panes.
10. With a draft present: clicking a layout card inserts above the draft;
    dragging a section past the last one lands above the draft; the draft
    itself has no drag handle; trashing the last real section still restores
    the empty state.
11. Switching tools and back resumes the draft; switching to Select and
    clicking inside the draft selects nothing.
12. Insert is disabled with zero rows.

## Follow-on work this unblocks or defers to

- Re-editing an inserted section's structure, once the in-memory project
  object lands (TODO Phase 1 item 3).
- Nested drag-and-drop (TODO items 34, 35), which would replace click-to-add
  with direct manipulation inside the draft.
- Per-container styling, once a box-model editor exists (TODO item 33).
- Grid layout, requiring `display` in the layout model.
- The Embed tool (`TODO.md:43`), which can reuse this pane's shape: a draft
  leaf, a live preview, Insert/Cancel.
