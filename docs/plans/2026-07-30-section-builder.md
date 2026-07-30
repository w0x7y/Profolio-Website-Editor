# GUI Custom Section Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Section tool from an inert placeholder pane into a GUI builder where the user composes a section's rows, columns and content slots, sees a live draft on the canvas, and commits it with Insert.

**Architecture:** The draft is a plain `Node` tree (see `docs/DATA_MODEL.md`) held in a module variable in `section-builder.js`, and it is the single source of truth. Every edit writes the tree; the canvas is only a render target. Structural edits re-render the draft through `renderNode()`, while layout-value edits write the one changed property onto the existing element so the picked outline survives. The draft carries `data-draft`, which excludes it from every canvas behavior that walks committed content.

**Tech Stack:** Vanilla ES modules, no build step, no dependencies. Static files served over HTTP. Existing helpers: `panel-widgets.js` (controls), `renderer.js` (node → DOM), `node-style.js` (tracked style writes).

**Spec:** `docs/specs/2026-07-30-section-builder-design.md` — read it before starting. This plan implements it; where the two disagree, the spec wins and the plan is wrong.

## Global Constraints

- **No new dependencies, no `package.json`, no build step.** The repo is deliberately dependency-free.
- **No test runner.** Per the approved spec's Testing section, verification is manual in the browser. Each task below therefore replaces the usual write-failing-test/run/implement/run cycle with an explicit, reproducible browser check that must be run and must produce the stated result before committing. The check is not optional — it is that task's gate.
- **Serve over HTTP, never `file://`.** ES modules fail on `file://`. Run `python3 -m http.server 8000` from the repo root and open `http://localhost:8000`.
- **ES module syntax throughout**, matching every file in `scripts/`.
- **Comment style:** this codebase explains *why*, not *what*, in a block header per module and prose comments at decision points. Match it. Do not add narration comments (`// loop over rows`).
- **The draft never becomes content until Insert.** No code path may write a `draft_` id, a `data-draft` attribute, or draft-only styling into a committed section.
- **Every layout edit writes the tree before the DOM.** A DOM-only write is a bug — it is reverted by the next re-render and dropped by Insert.
- **Style props are a whitelist.** `STYLE_PROP_TO_JS` in `renderer.js` and the `StyleProps` block in `docs/DATA_MODEL.md` must stay in sync (`renderer.js:61` says so).
- **Commit after each task**, with the message given in that task's final step.

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `scripts/section-builder.js` | The draft: the tree, operations on it, rendering it to the canvas, the pick, and Insert/Cancel. Knows nothing about control markup. |
| `scripts/section-panel.js` | The Section pane: builds controls, calls builder commands, re-syncs on change. Knows nothing about the tree's shape. |

**Modified:**

| File | Change |
|---|---|
| `scripts/renderer.js` | Export `applyLayoutProp()` and `applyStyleProp()`; add `flex` to the style whitelist; exclude the draft from `collectNodeIds()` and `refreshCanvasEmptyState()`; export `draftElementIn()`; `appendSectionsToCanvas()` inserts above the draft |
| `scripts/section-dnd.js` | Exclude the draft from both `:scope > .node--section` queries; `sectionAfterPoint()` returns the draft instead of `null` |
| `scripts/selection.js` | `selectableTargetFrom()` bails inside `[data-draft]` |
| `scripts/tool-panel.js` | Sync the Section pane on open; drop the stale header comment |
| `scripts/main.js` | `initSectionBuilder()` and `initSectionPanel()` in the boot sequence |
| `index.html` | Real markup for `data-tool-pane="section"` |
| `styles/style.css` | Draft outline and badge, `.is-picked`, empty-container affordance, pane footer |
| `docs/DATA_MODEL.md` | Document `flex` in `StyleProps` |
| `TODO.md`, `README.md` | Record the feature and the dropped presets |

**Task order rationale:** Tasks 1–2 make the existing canvas machinery draft-aware and are verifiable on their own with a hand-injected element, before any builder code exists. Task 3 is the pure tree, testable in the console with no UI. Task 4 puts the draft on screen. Tasks 5–6 build the pane. Task 7 closes the loop with Insert/Cancel and the docs.

---

### Task 1: Extract the single DOM writers, and allow `flex`

The renderer currently writes layout and style values inline inside two loops, so there is no way for the builder to change one property without rebuilding the element. This task extracts one writer per destination family and adds the single style property column widths need.

**Files:**
- Modify: `scripts/renderer.js:60-79` (whitelist), `:119-146` (the two apply functions)
- Modify: `docs/DATA_MODEL.md:199-215` (`StyleProps` block)

**Interfaces:**
- Consumes: nothing.
- Produces: `applyLayoutProp(el, prop, value)` and `applyStyleProp(el, prop, value)`, both exported from `renderer.js`. `prop` is a **model** name (`direction`, `wrap`, `gap`, `align`, `justify` for layout; any `StyleProps` key for style), not a CSS name. A falsy/nullish `value` removes the declaration. Unknown props are ignored.

- [ ] **Step 1: Add `flex` to the style whitelist**

In `scripts/renderer.js`, in `STYLE_PROP_TO_JS`, add `flex` to the box-model group at the top (after `height`):

```js
const STYLE_PROP_TO_JS = {
    padding: 'padding',
    margin: 'margin',
    width: 'width',
    height: 'height',
    flex: 'flex',
    fontFamily: 'fontFamily',
```

- [ ] **Step 2: Add the two per-prop writers**

In `scripts/renderer.js`, directly above `function applyNodeLayout(el, node) {` (currently `:119`), insert:

```js
// Layout values are named after the model, not after CSS — the model says
// `direction` and `wrap`, flexbox says `flex-direction` and `flex-wrap`.
const LAYOUT_PROP_TO_JS = {
    direction: 'flexDirection',
    wrap: 'flexWrap',
    gap: 'gap',
    align: 'alignItems',
    justify: 'justifyContent'
};

/**
 * The one writer of a layout value onto the DOM.
 *
 * applyNodeLayout() below renders a whole node through this, and the Section
 * builder's live edits write single properties through the same function, so a
 * container the builder just edited and the same container re-rendered from its
 * node cannot end up with different CSS.
 */
export function applyLayoutProp(el, prop, value) {
    const jsProp = LAYOUT_PROP_TO_JS[prop];
    if (!jsProp) return;

    // `wrap` is a boolean in the model and a keyword in CSS.
    if (prop === 'wrap') {
        el.style.flexWrap = value ? 'wrap' : '';
        return;
    }

    // '' removes the declaration, which is what an unset layout value means.
    el.style[jsProp] = value || '';
}

/**
 * The same, for a whitelisted style prop. Unknown props are ignored, which is
 * what keeps StyleProps a whitelist rather than free-form CSS — see the
 * StyleProps block in docs/DATA_MODEL.md.
 */
export function applyStyleProp(el, prop, value) {
    const jsProp = STYLE_PROP_TO_JS[prop];
    if (!jsProp) return;

    el.style[jsProp] = value == null ? '' : value;
}
```

- [ ] **Step 3: Route both apply functions through the new writers**

Replace the body of `applyNodeLayout()` (`renderer.js:119-131`) with:

```js
function applyNodeLayout(el, node) {
    if (!CONTAINER_NODE_TYPES.has(node.type)) return;

    const layout = node.layout || {};

    el.style.display = 'flex';
    applyLayoutProp(el, 'direction', layout.direction || (node.type === 'row' ? 'row' : 'column'));
    applyLayoutProp(el, 'wrap', layout.wrap);
    applyLayoutProp(el, 'gap', layout.gap);
    applyLayoutProp(el, 'align', layout.align);
    applyLayoutProp(el, 'justify', layout.justify);
}
```

Then replace the `Object.keys` loop in `applyNodeStyle()` (`renderer.js:142-145`) with:

```js
    Object.keys(props).forEach(key => applyStyleProp(el, key, props[key]));
```

Behavior is unchanged: the old code set `wrap`/`gap`/`align`/`justify` only when truthy, and the new code passes them always but writes `''` for falsy — which produces no declaration either way.

- [ ] **Step 4: Document `flex`**

In `docs/DATA_MODEL.md`, in the `StyleProps` block, add `flex` to the box-model group:

```js
StyleProps = {
  // box model
  padding?: string, margin?: string,
  width?: string, height?: string,
  flex?: string,             // "1 1 0" | "0 0 40%" — a flex child's size in
                             // its container. The Section builder writes this
                             // for column widths; prefer it over `width` for
                             // children of a row.
```

- [ ] **Step 5: Verify nothing regressed and `flex` now renders**

Serve the site (`python3 -m http.server 8000`, open `http://localhost:8000`) and:

1. Open the Layouts tab → Home → click **Example**. The hero must render exactly as before: portrait beside the copy, normal gaps, no collapsed or stacked layout.
2. Click About → **Example**. Same check.
3. In the console, confirm the new writers are exported and that `flex` is whitelisted:

```js
const { renderNode, applyLayoutProp, applyStyleProp } = await import('./scripts/renderer.js');

// flex now reaches the DOM from style.base
renderNode({ id: 't1', type: 'column', style: { base: { flex: '0 0 40%' } } }).style.flex;
// expected: "0 0 40%"

// layout props are addressable one at a time, by model name
const el = renderNode({ id: 't2', type: 'row' });
applyLayoutProp(el, 'gap', '24px'); el.style.gap;        // expected: "24px"
applyLayoutProp(el, 'wrap', true);  el.style.flexWrap;   // expected: "wrap"
applyLayoutProp(el, 'wrap', false); el.style.flexWrap;   // expected: ""
applyLayoutProp(el, 'nope', 'x');                        // expected: no throw
applyStyleProp(el, 'notAProp', 'x'); el.style.length;     // unchanged — whitelist held
```

Every expectation above must hold before committing.

- [ ] **Step 6: Commit**

```bash
git add scripts/renderer.js docs/DATA_MODEL.md
git commit -m "refactor: one DOM writer per layout and style prop, and allow flex

Extracts applyLayoutProp() and applyStyleProp() out of the renderer's two
apply loops so a single property can be written without rebuilding the
element — what the Section builder needs to edit a container live. Both are
now the only path to the DOM for their prop family, so the initial render and
a live edit cannot produce different CSS.

Adds flex to the style whitelist for column widths, kept in sync with the
StyleProps block in docs/DATA_MODEL.md as renderer.js requires."
```

---

### Task 2: Make the canvas machinery draft-aware

Four existing behaviors walk the canvas and would treat a draft as committed content: id collection, empty-state restoration, drag handles, and reorder drops. This task fixes all four before any draft exists, so each can be verified against a hand-injected element.

**Files:**
- Modify: `scripts/renderer.js:321-353` (`appendSectionsToCanvas`, `refreshCanvasEmptyState`, `collectNodeIds`)
- Modify: `scripts/section-dnd.js:72-78` (`addSectionDragHandles`), `:143-151` (`sectionAfterPoint`), `:21-23` (imports)
- Modify: `scripts/selection.js:122-130` (`selectableTargetFrom`)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `draftElementIn(frameEl)` exported from `renderer.js`, returning the frame's direct-child `[data-draft]` element or `null`. The `data-draft` attribute contract: the builder sets it on the draft's root section only; descendants are matched via `[data-draft] *`.

- [ ] **Step 1: Add the committed-content selector and the draft lookup**

In `scripts/renderer.js`, above `function collectNodeIds(frameEl) {` (currently `:349`), insert:

```js
// The Section builder's draft renders into the canvas frame but is not
// committed content: its ids are temporary, it must not get a drag handle, and
// it must not keep the blank-canvas placeholder from coming back. Everything
// that walks the canvas looking for *content* matches this instead of a bare
// [data-node-id]. The second clause is what excludes the draft's descendants,
// which carry node ids of their own.
const COMMITTED_NODE_SELECTOR = '[data-node-id]:not([data-draft]):not([data-draft] *)';

/** The draft section being composed in this frame, or null. */
export function draftElementIn(frameEl) {
    return frameEl ? frameEl.querySelector(':scope > [data-draft]') : null;
}
```

- [ ] **Step 2: Exclude the draft from id collection**

Replace the `querySelectorAll` line in `collectNodeIds()` with:

```js
    frameEl.querySelectorAll(COMMITTED_NODE_SELECTOR).forEach(el => ids.add(el.dataset.nodeId));
```

- [ ] **Step 3: Make the empty state draft-safe**

Replace `refreshCanvasEmptyState()` (`renderer.js:340-347`) with:

```js
export function refreshCanvasEmptyState(frameEl) {
    if (!frameEl) return;
    if (frameEl.querySelector(COMMITTED_NODE_SELECTOR)) return;
    if (frameEl.querySelector('.canvas-frame__empty')) return;

    // Clearing by innerHTML would take the builder's draft with it. The draft
    // renders into this same frame and outlives an emptied canvas — trashing
    // the last committed section while composing is exactly when this runs.
    Array.from(frameEl.children)
        .filter(child => !child.hasAttribute('data-draft'))
        .forEach(child => child.remove());

    // Above the draft, which always sits last.
    frameEl.insertBefore(buildCanvasEmptyState(), frameEl.firstChild);
}
```

The placeholder and a draft can therefore be on screen together, which is accurate: the placeholder means "no committed sections", and that is true while a draft is uncommitted.

- [ ] **Step 4: Insert committed content above the draft**

In `appendSectionsToCanvas()`, replace `frameEl.appendChild(fragment);` (`renderer.js:331`) with:

```js
    // The draft always sits last in the frame, so committed content lands above
    // it. With no draft this is a plain append — insertBefore(null) appends.
    frameEl.insertBefore(fragment, draftElementIn(frameEl));
```

- [ ] **Step 5: Keep drag handles and reorder drops off the draft**

In `scripts/section-dnd.js`, extend the import at `:22`:

```js
import { refreshCanvasEmptyState, draftElementIn } from './renderer.js';
```

In `addSectionDragHandles()`, change the selector at `:74`:

```js
    frameEl.querySelectorAll(':scope > .node--section:not([data-draft])').forEach(section => {
```

Replace `sectionAfterPoint()` (`:143-151`) with:

```js
function sectionAfterPoint(frameEl, y) {
    const sections = Array.from(frameEl.querySelectorAll(':scope > .node--section:not([data-draft])'))
        .filter(section => section !== draggedSection);

    const before = sections.find(section => {
        const rect = section.getBoundingClientRect();
        return y < rect.top + rect.height / 2;
    });
    if (before) return before;

    // Past the last committed section. The draft always sits at the end of the
    // frame, so returning null here would land the drop *after* it; returning
    // the draft keeps committed sections above it. Null when there is no draft,
    // which insertBefore() reads as "append" exactly as before.
    return draftElementIn(frameEl);
}
```

- [ ] **Step 6: Keep selection out of the draft**

In `scripts/selection.js`, add the guard as the first statement of `selectableTargetFrom()` (`:122`):

```js
function selectableTargetFrom(target) {
    // The Section builder's draft is not content. Nothing inside it is
    // selectable, including after the user switches back to the Select tool
    // with a draft still on the canvas.
    if (target.closest('[data-draft]')) return null;

    let el = target.closest('[data-node-id]');
```

- [ ] **Step 7: Verify all four behaviors against an injected draft**

Reload, then paste this into the console to stand in for the builder:

```js
const frame = document.querySelector('.canvas-frame');
const fake = document.createElement('section');
fake.className = 'node node--section';
fake.dataset.nodeId = 'draft_section_1';
fake.dataset.nodeType = 'section';
fake.dataset.draft = '';
fake.style.minHeight = '90px';
fake.style.outline = '2px dashed red';
fake.innerHTML = '<p class="node node--text" data-node-id="draft_text_1" data-node-type="text">draft text</p>';
frame.appendChild(fake);
```

Then confirm each, in order:

1. **Insert position.** Layouts → Home → **Example**. The hero appears **above** the red-dashed box, not below it.
2. **No drag handle.** Hover the red-dashed box. No grab handle appears on it (hover a real section to confirm handles still do appear).
3. **Reorder past the end.** Add a second layout, then drag the first section's handle below the last real section. It lands above the red-dashed box, never after it.
4. **Empty state.** Drag every real section onto the right panel's trash. The "Blank canvas" placeholder returns **and** the red-dashed box is still there.
5. **Selection.** Confirm the Select tool is active, then click "draft text" inside the red-dashed box. Nothing is selected and no tool panel opens. Clicking real text still selects it.
6. **Ids.** `Array.from(frame.querySelectorAll('[data-node-id]:not([data-draft]):not([data-draft] *)')).map(el => el.dataset.nodeId)` — the list contains no `draft_` id.

All six must hold. Reload to clear the fake.

- [ ] **Step 8: Commit**

```bash
git add scripts/renderer.js scripts/section-dnd.js scripts/selection.js
git commit -m "feat: make canvas behaviors skip the Section builder's draft

A draft section renders into the canvas frame while it is being composed, and
four behaviors would otherwise treat it as committed content: id collection
would reserve its temporary ids, the blank-canvas placeholder would never come
back, it would get a drag handle and be trashable before it existed, and
clicking into it would select its contents.

Adds data-draft as the exclusion marker and a draftElementIn() lookup, and
fixes the two ordering bugs a trailing draft causes — committed content now
inserts above it, and a reorder drop past the last section lands above it
rather than after it."
```

---

### Task 3: The draft tree

The pure model: a `section > row[] > column[] > content` tree and the operations on it. No DOM, no rendering, so it is verifiable in isolation.

**Files:**
- Create: `scripts/section-builder.js`

**Interfaces:**
- Consumes: nothing.
- Produces, all from `scripts/section-builder.js`:
  - `createDraft()` → a `section` node with `children: []`
  - `addRow(draft)` → the new row node (always with one column)
  - `addColumn(draft, rowId)` → the new column node, or `null`
  - `addContentSlot(draft, columnId, type)` → the new leaf node, or `null`; `type` ∈ `heading | text | image | button`
  - `deleteRow(draft, rowId)` → `boolean`
  - `deleteColumn(draft, columnId)` → `boolean`; `false` when it is the row's last column
  - `deleteContentSlot(draft, slotId)` → `boolean`
  - `canDeleteColumn(draft, columnId)` → `boolean`
  - `findNode(node, id)` → node or `null`
  - `findParent(node, id)` → node or `null`
  - `hasRows(draft)` → `boolean`

- [ ] **Step 1: Create the file with its header and the tree operations**

Create `scripts/section-builder.js`:

```js
// ============================================================
// SECTION BUILDER
//
// The Section tool composes a new section here before it reaches the canvas.
// The draft is a plain Node tree (see docs/DATA_MODEL.md) and it is the single
// source of truth: every edit writes the tree, and the canvas is only a render
// target for it. A layout value that lived on the element alone would be
// reverted by the next structural re-render and dropped by Insert, which
// clones the tree.
//
// Structure is fixed at two levels — section > row[] > column[] > content —
// which is narrower than the model allows, on purpose: it keeps the pane a
// flat inspector rather than a tree editor. See
// docs/specs/2026-07-30-section-builder-design.md.
//
// This file is the tree and the operations on it. Rendering the draft, picking
// a node in it, and Insert/Cancel land here too (Task 4 onward) — the pane
// itself lives in section-panel.js and knows nothing about this tree's shape.
// ============================================================

const DRAFT_ID_PREFIX = 'draft_';

// The content types a column can hold. Deliberately narrower than the model's
// leaf types: `icon`, `divider` and `embed` have no controls in this pane, and
// an embed belongs to the Embed tool.
const CONTENT_SLOT_TYPES = new Set(['heading', 'text', 'image', 'button']);

let idSeq = 0;

/**
 * Draft-local node ids. Unique within a draft and never committed — insertDraft()
 * strips them so appendSectionsToCanvas() can mint clean ones from node.type.
 * The prefix is what makes a leak obvious if one ever happens.
 */
function draftId(type) {
    idSeq += 1;
    return `${DRAFT_ID_PREFIX}${type}_${idSeq}`;
}

export function createDraft() {
    return { id: draftId('section'), type: 'section', children: [] };
}

function buildColumn() {
    return { id: draftId('column'), type: 'column', children: [] };
}

/** A new row, with the one column every row is guaranteed to have. */
export function addRow(draft) {
    const row = { id: draftId('row'), type: 'row', children: [buildColumn()] };
    draft.children.push(row);
    return row;
}

export function addColumn(draft, rowId) {
    const row = findNode(draft, rowId);
    if (!row || row.type !== 'row') return null;

    const column = buildColumn();
    row.children.push(column);
    return column;
}

/**
 * An unfilled content slot: no `content`, no `src`, and no `placeholder`.
 *
 * renderLeafContent() already supplies the right placeholder for an empty leaf
 * (fallbackPlaceholder() and DEFAULT_IMAGE_PLACEHOLDER in renderer.js), so a
 * second copy of those strings here would be the thing that drifts from it.
 */
export function addContentSlot(draft, columnId, type) {
    if (!CONTENT_SLOT_TYPES.has(type)) return null;

    const column = findNode(draft, columnId);
    if (!column || column.type !== 'column') return null;

    const slot = { id: draftId(type), type };
    column.children.push(slot);
    return slot;
}

export function deleteRow(draft, rowId) {
    const before = draft.children.length;
    draft.children = draft.children.filter(row => row.id !== rowId);
    return draft.children.length < before;
}

/**
 * Remove a column, unless it is the last one in its row.
 *
 * A row with no columns renders as a zero-height invisible strip, and
 * committing one would put it on the published page where nobody can see or
 * select it. Deleting the row is the action the user wants there, so the pane
 * disables this control at one column rather than letting the draft reach that
 * state — which is also what lets Insert get away with checking only for zero
 * rows instead of scanning every row.
 */
export function deleteColumn(draft, columnId) {
    const row = findParent(draft, columnId);
    if (!row || row.children.length <= 1) return false;

    row.children = row.children.filter(column => column.id !== columnId);
    return true;
}

/** Whether deleteColumn() would succeed. The pane disables its control on false. */
export function canDeleteColumn(draft, columnId) {
    const row = findParent(draft, columnId);
    return !!row && row.children.length > 1;
}

export function deleteContentSlot(draft, slotId) {
    const column = findParent(draft, slotId);
    if (!column) return false;

    const before = column.children.length;
    column.children = column.children.filter(slot => slot.id !== slotId);
    return column.children.length < before;
}

/** Depth-first search by id. A draft is small enough that no index is worth it. */
export function findNode(node, id) {
    if (!node || !id) return null;
    if (node.id === id) return node;

    for (const child of node.children || []) {
        const found = findNode(child, id);
        if (found) return found;
    }
    return null;
}

/** The node whose `children` array holds `id`. */
export function findParent(node, id) {
    if (!node || !node.children) return null;
    if (node.children.some(child => child.id === id)) return node;

    for (const child of node.children) {
        const found = findParent(child, id);
        if (found) return found;
    }
    return null;
}

export function hasRows(draft) {
    return !!draft && draft.children.length > 0;
}
```

- [ ] **Step 2: Verify the tree operations in the console**

Reload the page, then paste this whole block. Every line is asserted, so any `false` or thrown error is a failure:

```js
const b = await import('./scripts/section-builder.js');
const ok = [];
const d = b.createDraft();

ok.push(['starts empty',            d.type === 'section' && d.children.length === 0]);
const r = b.addRow(d);
ok.push(['row has one column',      d.children.length === 1 && r.children.length === 1]);

const c1 = r.children[0];
ok.push(['last column protected',   b.canDeleteColumn(d, c1.id) === false]);
ok.push(['delete refused',          b.deleteColumn(d, c1.id) === false && r.children.length === 1]);

b.addColumn(d, r.id);
ok.push(['second column added',     r.children.length === 2]);
ok.push(['now deletable',           b.canDeleteColumn(d, c1.id) === true]);
ok.push(['delete succeeds',         b.deleteColumn(d, c1.id) === true && r.children.length === 1]);

const col = r.children[0];
const slot = b.addContentSlot(d, col.id, 'heading');
ok.push(['slot added, unfilled',    slot.type === 'heading' && !('content' in slot) && !('placeholder' in slot)]);
ok.push(['slot type whitelisted',   b.addContentSlot(d, col.id, 'embed') === null]);
ok.push(['column rejects a row id', b.addContentSlot(d, r.id, 'text') === null]);

ok.push(['findNode',                b.findNode(d, slot.id) === slot]);
ok.push(['findParent',              b.findParent(d, slot.id) === col]);
ok.push(['ids are draft-scoped',    [d, r, col, slot].every(n => n.id.startsWith('draft_'))]);

ok.push(['slot removed',            b.deleteContentSlot(d, slot.id) === true && col.children.length === 0]);
ok.push(['hasRows true',            b.hasRows(d) === true]);
ok.push(['row removed',             b.deleteRow(d, r.id) === true && b.hasRows(d) === false]);

console.table(ok.map(([name, pass]) => ({ check: name, pass })));
ok.every(([, pass]) => pass);   // must print true
```

The final expression must print `true`.

- [ ] **Step 3: Commit**

```bash
git add scripts/section-builder.js
git commit -m "feat: the Section builder's draft tree

The model half of the Section tool: a section > row[] > column[] > content
tree and the operations on it, with no DOM involvement.

Two invariants live here. A row always has at least one column, because an
empty row renders as an invisible zero-height strip that must never reach the
page — so deleteColumn() refuses the last one. And content slots carry no
placeholder of their own, since the renderer already supplies the right text
for an empty leaf and a copy here is what would drift."
```

---

### Task 4: Render the draft and pick a node in it

Puts the draft on the canvas, makes rows and columns clickable, and adds the two dual-writers that keep a layout edit in the tree as well as the DOM.

**Files:**
- Modify: `scripts/section-builder.js` (append the canvas half)
- Modify: `styles/style.css` (append a draft section at the end of the file)

**Interfaces:**
- Consumes: `renderNode`, `applyLayoutProp`, `applyStyleProp` from `renderer.js` (Task 1); the tree operations from Task 3.
- Produces, from `scripts/section-builder.js`:
  - `initSectionBuilder()` — registers the canvas pick listener. Call once at boot.
  - `onDraftChange(fn)` — register the pane's re-sync callback; called after any change to the draft or the pick.
  - `currentDraft()` → the draft node or `null`
  - `pickedNode()` → the picked node or `null`
  - `commandAddRow()`, `commandAddColumn(rowId)`, `commandAddContentSlot(columnId, type)`, `commandDeleteRow(rowId)`, `commandDeleteColumn(columnId)`, `commandDeleteContentSlot(slotId)` — structural edits; each mutates the tree then re-renders.
  - `setLayoutProp(nodeId, prop, value)` — tree then DOM, no re-render.
  - `setColumnWidth(columnId, mode, pct)` — `mode` ∈ `auto | equal | percent`; tree then DOM, no re-render.
  - `columnWidthMode(column)` → `auto | equal | percent`
  - `columnWidthPct(column)` → number or `null`

- [ ] **Step 1: Extend the imports at the top of `section-builder.js`**

Immediately below the block header comment, above `const DRAFT_ID_PREFIX`, add:

```js
import { canvasFrame } from './dom.js';
import { renderNode, applyLayoutProp, applyStyleProp, refreshCanvasEmptyState } from './renderer.js';
```

- [ ] **Step 2: Append the canvas half to `section-builder.js`**

Add at the end of the file:

```js
// ---- the draft on the canvas ----

// Only containers are pickable. A content slot resolves to its parent column:
// slots have no properties to edit at this stage, and they are removed from the
// column's own slot list.
const PICKABLE_TYPES = new Set(['section', 'row', 'column']);

let draft = null;
let draftEl = null;
let pickedId = null;
let notifyChange = null;

/** Register the pane's "repopulate your controls" callback. Called at init. */
export function onDraftChange(fn) {
    notifyChange = fn;
}

function notify() {
    if (notifyChange) notifyChange();
}

export function currentDraft() {
    return draft;
}

export function pickedNode() {
    return draft ? findNode(draft, pickedId) : null;
}

/** Start a draft if there isn't one already, and return it. */
export function ensureDraft() {
    if (!draft) {
        draft = createDraft();
        pickedId = draft.id;
    }
    return draft;
}

/**
 * Rebuild the draft's element from the tree, replacing the previous one.
 *
 * Every structural edit goes through here. Layout-value edits deliberately do
 * not — see setLayoutProp() — so that editing a gap does not destroy the
 * element the pick points at on every keystroke.
 */
export function renderDraft() {
    const frame = canvasFrame();
    if (!frame || !draft) return;

    const next = renderNode(draft);
    // The isolation marker every canvas behavior checks. Root only; descendants
    // are matched with `[data-draft] *`.
    next.dataset.draft = '';

    if (draftEl && draftEl.parentElement) draftEl.replaceWith(next);
    else frame.appendChild(next);
    draftEl = next;

    // The re-render destroyed whatever the pick pointed at. Re-resolve it by id,
    // falling back to the section when the picked node is gone — the same
    // problem clearSelectionIfDetached() solves for real selection.
    if (!findNode(draft, pickedId)) pickedId = draft.id;
    markPicked();
    notify();
}

/** Drop the draft from the canvas. Shared by Insert and Cancel. */
export function removeDraftElement() {
    const frame = canvasFrame();
    if (draftEl) draftEl.remove();
    draftEl = null;
    refreshCanvasEmptyState(frame);
}

export function resetDraft() {
    draft = null;
    pickedId = null;
}

function markPicked() {
    if (!draftEl) return;

    draftEl.classList.remove('is-picked');
    draftEl.querySelectorAll('.is-picked').forEach(el => el.classList.remove('is-picked'));

    const el = elementFor(pickedId);
    if (el) el.classList.add('is-picked');
}

function elementFor(nodeId) {
    if (!draftEl || !nodeId) return null;
    if (draftEl.dataset.nodeId === nodeId) return draftEl;
    return draftEl.querySelector(`[data-node-id="${nodeId}"]`);
}

/**
 * Click a row or column in the draft to edit it.
 *
 * This listens on the same scroller as selection.js, and the two never both act
 * on a click: selection.js returns early unless the Select tool is active
 * (selection.js:103), and this returns early unless the Section tool is. The
 * active tool is read off `data-active-tool`, which setActiveTool() already
 * publishes on the canvas area — importing it from selection.js would close an
 * import cycle through tool-panel.js.
 */
export function initSectionBuilder() {
    const scroller = document.querySelector('.canvas-scroll');
    if (!scroller) return;

    scroller.addEventListener('click', e => {
        const area = document.querySelector('.canvas-area');
        if (!area || area.dataset.activeTool !== 'section') return;
        if (!draftEl || !draftEl.contains(e.target)) return;

        const el = pickableFrom(e.target);
        if (!el) return;

        pickedId = el.dataset.nodeId;
        markPicked();
        notify();
    });
}

/** The nearest ancestor-or-self inside the draft that is a pickable container. */
function pickableFrom(target) {
    let el = target.closest('[data-node-id]');

    while (el && draftEl.contains(el)) {
        if (PICKABLE_TYPES.has(el.dataset.nodeType)) return el;
        el = el.parentElement ? el.parentElement.closest('[data-node-id]') : null;
    }
    return null;
}

// ---- structural commands ----
// The pane calls these rather than the tree functions directly, so a structural
// edit cannot reach the tree without the canvas catching up.

export function commandAddRow() {
    addRow(ensureDraft());
    renderDraft();
}

export function commandAddColumn(rowId) {
    if (addColumn(draft, rowId)) renderDraft();
}

export function commandAddContentSlot(columnId, type) {
    if (addContentSlot(draft, columnId, type)) renderDraft();
}

export function commandDeleteRow(rowId) {
    if (deleteRow(draft, rowId)) renderDraft();
}

export function commandDeleteColumn(columnId) {
    if (deleteColumn(draft, columnId)) renderDraft();
}

export function commandDeleteContentSlot(slotId) {
    if (deleteContentSlot(draft, slotId)) renderDraft();
}

// ---- layout-value edits: tree first, then the element ----

/**
 * Write a layout value to the tree, then catch the element up without
 * rebuilding it.
 *
 * Tree first, always. A value written only to the element would be reverted by
 * the next structural edit — renderDraft() rebuilds from the tree — and dropped
 * entirely by insertDraft(), which clones the tree and throws the element away.
 */
export function setLayoutProp(nodeId, prop, value) {
    const node = draft && findNode(draft, nodeId);
    if (!node) return;

    node.layout = node.layout || {};
    const unset = value === '' || value == null || value === false;
    if (unset) delete node.layout[prop];
    else node.layout[prop] = value;

    const el = elementFor(nodeId);
    if (el) applyLayoutProp(el, prop, node.layout[prop]);
}

/**
 * Column width, expressed as one `flex` declaration:
 *
 *   auto     no declaration — the column takes its natural width
 *   equal    1 1 0    — every equal column shares the row evenly
 *   percent  0 0 N%   — a fixed share, for a sidebar or a 70/30 split
 *
 * Tree first, same reason as setLayoutProp().
 */
export function setColumnWidth(columnId, mode, pct) {
    const node = draft && findNode(draft, columnId);
    if (!node || node.type !== 'column') return;

    const flex = mode === 'equal' ? '1 1 0'
        : mode === 'percent' ? `0 0 ${pct}%`
        : '';

    node.style = node.style || {};
    node.style.base = node.style.base || {};
    if (flex) node.style.base.flex = flex;
    else delete node.style.base.flex;

    const el = elementFor(columnId);
    if (el) applyStyleProp(el, 'flex', node.style.base.flex);
}

/** Which width mode a column's stored flex represents. */
export function columnWidthMode(column) {
    const flex = column && column.style && column.style.base && column.style.base.flex;
    if (!flex) return 'auto';
    if (flex === '1 1 0') return 'equal';
    return 'percent';
}

/** The percentage in a `0 0 N%` flex, or null for the other modes. */
export function columnWidthPct(column) {
    const flex = column && column.style && column.style.base && column.style.base.flex;
    const match = /(\d+(?:\.\d+)?)%/.exec(flex || '');
    return match ? Number(match[1]) : null;
}
```

- [ ] **Step 3: Style the draft**

Append to the end of `styles/style.css`:

```css
/* ---------- Section builder draft (see scripts/section-builder.js) ----------
   The draft renders into the canvas frame but is not committed content, and has
   to read that way. Everything here is scoped to [data-draft], so none of it
   can reach a section once it has been inserted. */

.canvas-frame > .node--section[data-draft] {
    /* the shadow on a committed section is what makes it look like real page
       content — the draft trades it for a dashed accent outline */
    box-shadow: none;
    outline: 2px dashed var(--accent);
    outline-offset: -2px;
}

.canvas-frame > .node--section[data-draft]::after {
    content: 'Draft';
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 5;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    background: var(--accent);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.3px;
}

/* An empty flex container collapses to zero height and cannot be clicked, so
   inside the draft only, containers announce themselves as pick targets. */
[data-draft] .node--row,
[data-draft] .node--column {
    min-height: 48px;
    outline: 1px dashed var(--border-subtle);
    outline-offset: -1px;
}

/* What the pane is currently editing. Deliberately not .is-selected — that
   belongs to selection.js, and the two must never fight over one element. */
.canvas-frame > .node--section[data-draft].is-picked,
[data-draft] .is-picked {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
}

[data-draft] .node--row.is-picked,
[data-draft] .node--column.is-picked {
    background: var(--accent-soft);
}
```

- [ ] **Step 4: Verify rendering, picking, and that layout edits persist**

Reload, then drive the builder directly from the console (the pane does not exist yet):

```js
const b = await import('./scripts/section-builder.js');
b.initSectionBuilder();
document.querySelector('.canvas-area').dataset.activeTool = 'section';   // stand in for the tool

b.commandAddRow();
b.commandAddRow();
const d = b.currentDraft();
const row = d.children[0];
b.commandAddColumn(row.id);
b.commandAddContentSlot(row.children[0].id, 'heading');
b.commandAddContentSlot(row.children[1].id, 'image');
```

On screen: a dashed-outlined section with a "Draft" badge at top right, containing two rows; the first row has two columns side by side holding an "Empty heading" placeholder and an image placeholder. Then confirm:

1. **Picking.** Click the second column on the canvas. It gets a solid accent outline and a tinted background. `b.pickedNode().id` matches that column's id. Click the heading placeholder in the first column — the pick moves to **its parent column**, not the heading.
2. **Layout edit reaches the DOM without a rebuild.** With a row picked:

```js
b.setLayoutProp(row.id, 'gap', '40px');
```

The gap widens visibly and the picked outline stays exactly where it was (nothing flickered or re-rendered).

3. **Layout edit is in the tree, not just the DOM** — this is the bug this design exists to prevent:

```js
b.currentDraft().children[0].layout.gap;   // expected: "40px"
b.commandAddColumn(row.id);                // structural edit → full re-render
b.currentDraft().children[0].layout.gap;   // expected: still "40px"
document.querySelector(`[data-node-id="${row.id}"]`).style.gap;   // expected: "40px"
```

The gap must survive the re-render. If it reverts, the tree write is missing.

4. **Column width.**

```js
b.setColumnWidth(row.children[0].id, 'percent', 70);
b.currentDraft().children[0].children[0].style.base.flex;   // expected: "0 0 70%"
b.columnWidthMode(b.currentDraft().children[0].children[0]);  // expected: "percent"
b.columnWidthPct(b.currentDraft().children[0].children[0]);   // expected: 70
```

The first column visibly takes ~70% of the row.

5. **Pick falls back when its node is deleted.**

```js
b.commandDeleteRow(row.id);
b.pickedNode().type;   // expected: "section"
```

6. **Still isolated.** The draft has no drag handle, and clicking a layout card inserts above it.

- [ ] **Step 5: Commit**

```bash
git add scripts/section-builder.js styles/style.css
git commit -m "feat: render the Section builder's draft and pick nodes in it

Puts the draft on the canvas as a dashed, badged section and makes its rows and
columns clickable, with content slots resolving to their parent column.

Structural edits rebuild the draft from the tree; layout-value edits write the
one changed property to the tree and then to the element, so editing a gap does
not destroy the picked outline on every keystroke — and, because the tree is
written first, the value survives the next rebuild and reaches the canvas on
Insert.

The pick listener reads the active tool off data-active-tool rather than
importing it from selection.js, which would close an import cycle through
tool-panel.js."
```

---

### Task 5: The pane, with the section and row inspectors

Builds the Section pane and wires the controls for the two container kinds that need no content handling. Columns come in Task 6, Insert/Cancel in Task 7.

**Files:**
- Create: `scripts/section-panel.js`
- Modify: `index.html:520-521` (the Section pane placeholder)
- Modify: `scripts/tool-panel.js:18-19` (comment), `:23-26` (imports), `:46-48` (sync)
- Modify: `scripts/main.js:14-21` (imports), `:88-92` (init calls)
- Modify: `styles/style.css` (append the pane's own rules)

**Interfaces:**
- Consumes: `onDraftChange`, `currentDraft`, `pickedNode`, `commandAddRow`, `commandAddColumn`, `commandDeleteRow`, `setLayoutProp`, `hasRows` from `section-builder.js`; `buildCtrl`, `buildSegmented`, `setSegmentedValue`, `setSwitch`, `isSwitchOn` from `panel-widgets.js`.
- Produces: `initSectionPanel()` and `syncSectionPanel()` from `scripts/section-panel.js`.

- [ ] **Step 1: Replace the pane placeholder markup**

In `index.html`, replace:

```html
                        <div class="tool-panel__pane" data-tool-pane="section">
                            <p class="tool-panel__empty">Section controls aren't built yet.</p>
                        </div>
```

with:

```html
                        <div class="tool-panel__pane" data-tool-pane="section">

                            <!-- Shown until the draft has a row. -->
                            <p class="tool-panel__empty" id="sectionEmpty">Add a row to start building a section.</p>

                            <!-- Controls for whatever is picked in the draft on
                                 the canvas. Built by section-panel.js, which
                                 swaps the body per picked node type. -->
                            <section class="panel-group" id="sectionInspector" hidden>
                                <h3 class="panel-group__title" id="sectionPickedLabel">Section</h3>
                                <div id="sectionInspectorMount"></div>
                            </section>

                            <div class="panel-group">
                                <button class="panel-btn" type="button" id="sectionAddRow">
                                    <svg viewBox="0 0 24 24" class="icon icon--sm"><path d="M12 5v14M5 12h14"/></svg>
                                    Add row
                                </button>
                            </div>
                        </div>
```

- [ ] **Step 2: Create `scripts/section-panel.js`**

```js
// ============================================================
// SECTION TOOL PANEL
//
// The controls for the Section builder's draft. Everything here is DOM wiring:
// the draft tree and the rules about it live in section-builder.js, and this
// file only reads what it is handed and calls commands back.
//
// The pane is canvas-driven. Rather than listing the whole draft, it shows the
// controls for whichever container the user picked on the canvas, so a section
// with several rows does not turn the pane into a long scroll. The inspector
// body is rebuilt per pick — the controls for a row and for a column have
// almost nothing in common, and rebuilding is cheaper to follow than showing
// and hiding two fixed sets.
// ============================================================

import { buildCtrl, buildSegmented, setSegmentedValue, setSwitch, isSwitchOn } from './panel-widgets.js';
import {
    onDraftChange, currentDraft, pickedNode, hasRows,
    commandAddRow, commandAddColumn, commandDeleteRow,
    setLayoutProp
} from './section-builder.js';

const ALIGN_OPTIONS = [
    { value: 'flex-start', label: 'Top' },
    { value: 'center', label: 'Middle' },
    { value: 'flex-end', label: 'Bottom' }
];

const JUSTIFY_OPTIONS = [
    { value: 'flex-start', label: 'Left' },
    { value: 'center', label: 'Center' },
    { value: 'flex-end', label: 'Right' },
    { value: 'space-between', label: 'Spread' }
];

export function initSectionPanel() {
    const addRow = document.getElementById('sectionAddRow');
    if (addRow) addRow.addEventListener('click', commandAddRow);

    // The builder calls this after any change to the draft or the pick.
    onDraftChange(syncSectionPanel);
}

/**
 * Point the pane at the current draft and pick. Called on every draft change,
 * and by openToolPanel() when the pane is revealed — the same funnel the Text,
 * Button and Image panes use.
 */
export function syncSectionPanel() {
    const empty = document.getElementById('sectionEmpty');
    const inspector = document.getElementById('sectionInspector');
    const mount = document.getElementById('sectionInspectorMount');
    if (!empty || !inspector || !mount) return;

    const draft = currentDraft();
    const node = pickedNode();
    const showInspector = hasRows(draft) && !!node;

    empty.hidden = showInspector;
    inspector.hidden = !showInspector;
    if (!showInspector) {
        mount.replaceChildren();
        return;
    }

    document.getElementById('sectionPickedLabel').textContent = labelFor(draft, node);
    mount.replaceChildren(buildInspectorBody(node));
}

/**
 * What the picked node is called in the header. Rows and columns are named
 * positionally rather than from `node.name`, which nothing in the editor
 * surfaces yet (docs/DATA_MODEL.md).
 */
function labelFor(draft, node) {
    if (node.type === 'section') return 'Section';

    if (node.type === 'row') {
        return `Row ${draft.children.indexOf(node) + 1}`;
    }

    const row = draft.children.find(candidate => candidate.children.includes(node));
    const rowIndex = draft.children.indexOf(row) + 1;
    return `Row ${rowIndex} · Column ${row.children.indexOf(node) + 1}`;
}

function buildInspectorBody(node) {
    const body = document.createDocumentFragment();

    if (node.type === 'section') {
        body.appendChild(buildGapCtrl(node, 'Space between rows'));
        return body;
    }

    if (node.type === 'row') {
        body.appendChild(buildGapCtrl(node, 'Gap'));
        body.appendChild(buildSegmentedCtrl(node, 'Align', 'align', ALIGN_OPTIONS, 'flex-start'));
        body.appendChild(buildSegmentedCtrl(node, 'Distribute', 'justify', JUSTIFY_OPTIONS, 'flex-start'));
        body.appendChild(buildWrapCtrl(node));
        body.appendChild(buildRowActions(node));
        return body;
    }

    // Columns are Task 6.
    return body;
}

/**
 * Gap, in px. Stored as a CSS length string because that is what `layout.gap`
 * is; the field edits the number and this owns the unit.
 */
function buildGapCtrl(node, label) {
    const ctrl = buildCtrl(label);

    const input = document.createElement('input');
    input.className = 'input';
    input.type = 'number';
    input.min = '0';
    input.value = String(parseGapPx(node));
    input.setAttribute('aria-label', label);

    input.addEventListener('input', () => {
        const px = clampGap(input.value);
        if (px === null) return;          // mid-edit garbage: leave the last good value
        setLayoutProp(node.id, 'gap', `${px}px`);
    });

    // A field left empty or negative snaps back rather than committing nonsense.
    input.addEventListener('blur', () => {
        const px = clampGap(input.value);
        input.value = String(px === null ? parseGapPx(node) : px);
    });

    ctrl.appendChild(input);
    return ctrl;
}

function parseGapPx(node) {
    const gap = node.layout && node.layout.gap;
    const match = /(\d+(?:\.\d+)?)/.exec(gap || '');
    return match ? Number(match[1]) : 0;
}

/** A gap in px, or null when the field does not hold a usable number. */
function clampGap(raw) {
    if (String(raw).trim() === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, n);
}

function buildSegmentedCtrl(node, label, prop, options, fallback) {
    const ctrl = buildCtrl(label);
    const group = buildSegmented(options, label, value => setLayoutProp(node.id, prop, value));

    setSegmentedValue(group, (node.layout && node.layout[prop]) || fallback);
    ctrl.appendChild(group);
    return ctrl;
}

function buildWrapCtrl(node) {
    const ctrl = buildCtrl('Wrap');
    ctrl.classList.add('ctrl--inline');

    const btn = document.createElement('button');
    btn.className = 'switch';
    btn.type = 'button';
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-label', 'Wrap');
    setSwitch(btn, !!(node.layout && node.layout.wrap));

    btn.addEventListener('click', () => {
        const on = !isSwitchOn(btn);
        setSwitch(btn, on);
        setLayoutProp(node.id, 'wrap', on);
    });

    ctrl.appendChild(btn);
    return ctrl;
}

function buildRowActions(row) {
    const wrap = document.createElement('div');
    wrap.className = 'btn-row';

    const addColumn = document.createElement('button');
    addColumn.className = 'panel-btn';
    addColumn.type = 'button';
    addColumn.textContent = 'Add column';
    addColumn.addEventListener('click', () => commandAddColumn(row.id));

    const deleteRow = document.createElement('button');
    deleteRow.className = 'panel-btn panel-btn--danger';
    deleteRow.type = 'button';
    deleteRow.textContent = 'Delete row';
    deleteRow.addEventListener('click', () => commandDeleteRow(row.id));

    wrap.append(addColumn, deleteRow);
    return wrap;
}
```

- [ ] **Step 3: Wire the pane into the tool panel**

In `scripts/tool-panel.js`, replace the stale note in the header comment:

```js
// The Section and Embed panes still hold placeholder text; their real
// controls go into the markup later.
```

with:

```js
// The Embed pane still holds placeholder text; its real controls go into the
// markup later.
```

Add to the imports (after the `image-panel.js` line at `:25`):

```js
import { syncSectionPanel } from './section-panel.js';
```

And add to the sync block at `:46-48`:

```js
    if (tool === 'section') syncSectionPanel();
```

- [ ] **Step 4: Boot the builder and the pane**

In `scripts/main.js`, add to the imports after the `image-panel.js` line:

```js
import { initSectionBuilder } from './section-builder.js';
import { initSectionPanel } from './section-panel.js';
```

Then replace the panel init block at `:91-94`:

```js
    // ---- Left tool panel: the Text, Button, Image and Section panes ----
    initTextPanel();
    initButtonPanel();
    initImagePanel();

    // The builder owns the draft and the canvas pick; the pane is its controls,
    // and registers its re-sync callback with the builder, so the builder goes
    // first.
    initSectionBuilder();
    initSectionPanel();
```

- [ ] **Step 5: Add the pane's CSS**

Append to `styles/style.css`:

```css
/* a destructive action in a pane — deleting a row or a column */
.panel-btn--danger {
    color: var(--danger);
}

.panel-btn--danger:hover {
    background: var(--danger-soft);
}
```

- [ ] **Step 6: Verify the pane end to end in the UI**

Reload. No console driving from here on — this is the real feature.

1. Click the **Section** tool in the left rail. The pane opens titled "Section" and reads "Add a row to start building a section."
2. Click **Add row**. A dashed draft section with a "Draft" badge appears on the canvas holding one row with one column. The pane switches to the inspector.
3. Click the row on the canvas. The header reads **Row 1**; controls are Gap, Align, Distribute, Wrap, Add column, Delete row.
4. Click **Add column**, twice. The row holds three columns.
5. Set **Gap** to `40`. The columns visibly separate. Type garbage (`abc`) — nothing breaks and the layout does not change; on blur the field snaps back to `40`. Type `-5` — on blur it becomes `0`.
6. **Align** → Middle, **Distribute** → Spread, **Wrap** on. Each visibly changes the row. The picked outline never flickers.
7. Click the section's own padding (not a row). Header reads **Section**, with a single "Space between rows" control. Set it to `60` — with two rows present the rows separate.
8. Click a column. The header reads **Row 1 · Column 2** and the body is empty (Task 6).
9. **Layout values survive a rebuild:** with a gap of `40` on Row 1, click **Add column** again. The gap is still 40 after the re-render.
10. Click **Delete row** on Row 1. The row goes and the pane falls back to the Section inspector.
11. Delete every row. The pane returns to "Add a row to start building a section."
12. Switch to the **Text** tool and back to **Section**. The draft is still on the canvas and the pane still shows it.

- [ ] **Step 7: Commit**

```bash
git add index.html scripts/section-panel.js scripts/tool-panel.js scripts/main.js styles/style.css
git commit -m "feat: Section pane with the section and row inspectors

Replaces the Section pane's placeholder text with real controls. The pane is
canvas-driven: it shows the controls for whichever container was picked in the
draft, so a section with several rows does not become a long scroll in a narrow
panel.

Rows get gap, align, distribute, wrap, add-column and delete-row; the section
itself gets the spacing between its rows. Number fields keep their last good
value rather than committing an empty or negative gap. Columns are next."
```

---

### Task 6: The column inspector

Adds width control and content slots — the half of the pane that fills a column.

**Files:**
- Modify: `scripts/section-panel.js` (imports, `buildInspectorBody`, new builders)

**Interfaces:**
- Consumes: `commandAddContentSlot`, `commandDeleteColumn`, `commandDeleteContentSlot`, `canDeleteColumn`, `setColumnWidth`, `columnWidthMode`, `columnWidthPct` from `section-builder.js`.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Extend the imports in `section-panel.js`**

Replace the `section-builder.js` import block with:

```js
import {
    onDraftChange, currentDraft, pickedNode, hasRows, canDeleteColumn,
    commandAddRow, commandAddColumn, commandDeleteRow,
    commandAddContentSlot, commandDeleteColumn, commandDeleteContentSlot,
    setLayoutProp, setColumnWidth, columnWidthMode, columnWidthPct
} from './section-builder.js';
```

- [ ] **Step 2: Add the column option tables**

Below `JUSTIFY_OPTIONS`, add:

```js
const WIDTH_OPTIONS = [
    { value: 'auto', label: 'Auto' },
    { value: 'equal', label: 'Equal' },
    { value: 'percent', label: '%' }
];

// What a column can hold. Labels are the pane's; the values are node types the
// renderer already knows how to draw as empty placeholders.
const CONTENT_OPTIONS = [
    { type: 'heading', label: 'Heading' },
    { type: 'text', label: 'Text' },
    { type: 'image', label: 'Image' },
    { type: 'button', label: 'Button' }
];

const CONTENT_LABELS = {
    heading: 'Heading',
    text: 'Text',
    image: 'Image',
    button: 'Button'
};

const DEFAULT_WIDTH_PCT = 50;
```

- [ ] **Step 3: Build the column body**

In `buildInspectorBody()`, replace:

```js
    // Columns are Task 6.
    return body;
```

with:

```js
    body.appendChild(buildWidthCtrl(node));
    body.appendChild(buildSlotList(node));
    body.appendChild(buildAddContent(node));
    body.appendChild(buildColumnActions(node));
    return body;
```

- [ ] **Step 4: Add the column builders**

Append to `scripts/section-panel.js`:

```js
/**
 * Column width. The percentage field only exists in `percent` mode — an
 * inactive number box next to an Auto/Equal choice reads as though it still
 * applies.
 */
function buildWidthCtrl(column) {
    const ctrl = buildCtrl('Width');
    const mode = columnWidthMode(column);

    const pct = document.createElement('input');
    pct.className = 'input';
    pct.type = 'number';
    pct.min = '1';
    pct.max = '100';
    pct.value = String(columnWidthPct(column) || DEFAULT_WIDTH_PCT);
    pct.setAttribute('aria-label', 'Width percentage');
    pct.hidden = mode !== 'percent';

    const group = buildSegmented(WIDTH_OPTIONS, 'Width', value => {
        pct.hidden = value !== 'percent';
        setColumnWidth(column.id, value, clampPct(pct.value) || DEFAULT_WIDTH_PCT);
    });
    setSegmentedValue(group, mode);

    pct.addEventListener('input', () => {
        const value = clampPct(pct.value);
        if (value === null) return;
        setColumnWidth(column.id, 'percent', value);
    });

    pct.addEventListener('blur', () => {
        const value = clampPct(pct.value);
        pct.value = String(value === null ? (columnWidthPct(column) || DEFAULT_WIDTH_PCT) : value);
    });

    ctrl.append(group, pct);
    return ctrl;
}

/** A width percentage in 1–100, or null when the field holds no usable number. */
function clampPct(raw) {
    if (String(raw).trim() === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.min(100, Math.max(1, n));
}

/**
 * The column's content slots, each removable. Slots are managed from here
 * rather than by picking one on the canvas: they carry nothing to edit at this
 * stage, so clicking one picks this column instead.
 */
function buildSlotList(column) {
    const ctrl = buildCtrl('Content');

    if (!column.children.length) {
        const note = document.createElement('p');
        note.className = 'ctrl__note';
        note.textContent = 'Empty. Add content below, or leave it as a spacer.';
        ctrl.appendChild(note);
        return ctrl;
    }

    column.children.forEach(slot => {
        const row = document.createElement('div');
        row.className = 'ctrl__row';

        const name = document.createElement('span');
        name.className = 'ctrl__label';
        name.textContent = CONTENT_LABELS[slot.type] || slot.type;

        const remove = document.createElement('button');
        remove.className = 'panel-btn panel-btn--danger';
        remove.type = 'button';
        remove.textContent = 'Remove';
        remove.setAttribute('aria-label', `Remove ${name.textContent}`);
        remove.addEventListener('click', () => commandDeleteContentSlot(slot.id));

        row.append(name, remove);
        ctrl.appendChild(row);
    });

    return ctrl;
}

function buildAddContent(column) {
    const ctrl = buildCtrl('Add content');
    const wrap = document.createElement('div');
    wrap.className = 'btn-row';

    CONTENT_OPTIONS.forEach(option => {
        const btn = document.createElement('button');
        btn.className = 'panel-btn';
        btn.type = 'button';
        btn.textContent = option.label;
        btn.addEventListener('click', () => commandAddContentSlot(column.id, option.type));
        wrap.appendChild(btn);
    });

    ctrl.appendChild(wrap);
    return ctrl;
}

/**
 * Delete column, disabled at a row's last column.
 *
 * deleteColumn() refuses that case anyway — an empty row is an invisible
 * zero-height strip that must not reach the page — so the control says so
 * rather than looking broken when clicking it does nothing.
 */
function buildColumnActions(column) {
    const wrap = document.createElement('div');
    wrap.className = 'btn-row';

    const remove = document.createElement('button');
    remove.className = 'panel-btn panel-btn--danger';
    remove.type = 'button';
    remove.textContent = 'Delete column';

    if (canDeleteColumn(currentDraft(), column.id)) {
        remove.addEventListener('click', () => commandDeleteColumn(column.id));
    } else {
        remove.disabled = true;
        remove.title = 'A row keeps at least one column — delete the row instead';
    }

    wrap.appendChild(remove);
    return wrap;
}
```

- [ ] **Step 5: Verify the column inspector**

Reload, pick the Section tool, **Add row**, then click the column.

1. Header reads **Row 1 · Column 1**. Controls: Width (Auto/Equal/%), Content (empty note), Add content (four buttons), Delete column.
2. **Delete column is disabled**, with the tooltip "A row keeps at least one column — delete the row instead". Clicking it does nothing.
3. Click **Add column** on the row, then re-pick Column 1. Delete column is now **enabled**; clicking it removes the column.
4. Add a column back. Set Column 1's **Width** to `%` — the number field appears, defaulting to 50, and the column takes half the row. Set it to `70`; the column widens. Enter `500` and blur — it clamps to `100`. Enter `0` and blur — it clamps to `1`. Clear the field and blur — it snaps back to the last good value.
5. Switch Width to **Equal** — the percentage field disappears and the columns share the row evenly. Switch to **Auto** — the column shrinks to its content.
6. **Add content** → Heading. An "Empty heading" placeholder appears in that column on the canvas, and the Content list gains a removable "Heading" row. Add Text, Image and Button; all four render as placeholders.
7. **Remove** the Image row. It disappears from both the list and the canvas.
8. **Clicking a placeholder on the canvas picks its parent column**, not the placeholder — the header still reads `Row 1 · Column N`.
9. **Width survives a rebuild:** set Column 1 to `%` `70`, then click **Add content** → Text (a structural edit). The column is still 70% afterward.

- [ ] **Step 6: Commit**

```bash
git add scripts/section-panel.js
git commit -m "feat: column inspector — width and content slots

Adds the other half of the Section pane: a column's width as auto, equal or an
explicit percentage, and its content slots as a removable list plus four add
buttons.

The percentage field only exists in percent mode, since an inactive number box
beside an Auto/Equal choice reads as though it still applies, and it clamps to
1-100 rather than accepting a width that cannot render. Delete column is
disabled at a row's last column and says why — deleteColumn() refuses that case
regardless, so the control would otherwise look broken."
```

---

### Task 7: Insert, Cancel, and the docs

Closes the loop: commit the draft to the canvas or throw it away, and record the feature.

**Files:**
- Modify: `scripts/section-builder.js` (append `insertDraft`, `cancelDraft`)
- Modify: `scripts/section-panel.js` (footer wiring, Insert enablement)
- Modify: `index.html` (footer markup in the Section pane)
- Modify: `styles/style.css` (footer layout)
- Modify: `TODO.md`, `README.md`

**Interfaces:**
- Consumes: everything from Tasks 3–6, plus `appendSectionsToCanvas` from `renderer.js` and `addSectionDragHandles` from `section-dnd.js`.
- Produces: `insertDraft()` → the inserted section element or `null`; `cancelDraft()` → `void`.

- [ ] **Step 1: Add Insert and Cancel to `section-builder.js`**

Extend the `renderer.js` import to include `appendSectionsToCanvas`:

```js
import { renderNode, applyLayoutProp, applyStyleProp, refreshCanvasEmptyState, appendSectionsToCanvas } from './renderer.js';
```

Add a new import:

```js
import { addSectionDragHandles } from './section-dnd.js';
```

Then append to the end of the file:

```js
// ---- committing the draft ----

/**
 * Commit the draft to the canvas.
 *
 * The tree is cloned and every id deleted, so appendSectionsToCanvas() mints
 * fresh ones from `node.type` through withUniqueIds() — the inserted section
 * ends up with the same clean `section` / `row` / `column` ids a layout file
 * would produce, and no draft_ id or data-draft ever reaches committed content.
 *
 * The clone is also why every edit has to write the tree: what is cloned here
 * is the tree, never the element on screen.
 */
export function insertDraft() {
    if (!hasRows(draft)) return null;

    const committed = stripIds(JSON.parse(JSON.stringify(draft)));

    // Insert first, then drop the draft: appendSectionsToCanvas() inserts above
    // the draft, so the new section lands exactly where the draft was standing.
    const frame = canvasFrame();
    const inserted = appendSectionsToCanvas([committed], frame);
    removeDraftElement();
    resetDraft();
    addSectionDragHandles(frame);
    notify();

    return inserted;
}

export function cancelDraft() {
    removeDraftElement();
    resetDraft();
    notify();
}

function stripIds(node) {
    delete node.id;
    (node.children || []).forEach(stripIds);
    return node;
}
```

- [ ] **Step 2: Add the footer markup**

In `index.html`, inside the Section pane, after the Add row `panel-group`, add:

```html
                            <!-- Commit the draft, or throw it away. Hidden
                                 until there is something to commit. -->
                            <div class="panel-group section-footer" id="sectionFooter" hidden>
                                <button class="btn btn--ghost" type="button" id="sectionCancel">Cancel</button>
                                <button class="btn btn--primary" type="button" id="sectionInsert">Insert</button>
                            </div>
```

- [ ] **Step 3: Wire the footer**

In `scripts/section-panel.js`, extend the builder import with `insertDraft` and `cancelDraft`:

```js
    setLayoutProp, setColumnWidth, columnWidthMode, columnWidthPct,
    insertDraft, cancelDraft
} from './section-builder.js';
```

In `initSectionPanel()`, after the Add row wiring:

```js
    const insert = document.getElementById('sectionInsert');
    if (insert) insert.addEventListener('click', insertDraft);

    const cancel = document.getElementById('sectionCancel');
    if (cancel) cancel.addEventListener('click', cancelDraft);
```

In `syncSectionPanel()`, after `const showInspector = ...`, add the footer:

```js
    // Insert needs a row to commit. A row always has at least one column
    // (deleteColumn() guarantees it), so this one check is enough — without
    // that guarantee it would have to scan every row for an empty one.
    const footer = document.getElementById('sectionFooter');
    if (footer) footer.hidden = !hasRows(draft);

    const insert = document.getElementById('sectionInsert');
    if (insert) insert.disabled = !hasRows(draft);
```

- [ ] **Step 4: Style the footer**

Append to `styles/style.css`:

```css
/* Section pane's commit row — Cancel beside Insert, Insert carrying the weight */
.section-footer {
    display: flex;
    gap: 8px;
}

.section-footer .btn {
    flex: 1 1 0;
}
```

- [ ] **Step 5: Verify the full loop**

Reload. Build a section: Section tool → **Add row** → pick the row → **Add column** → pick Column 1 → Width `%` `60` → **Add content** → Heading → pick Column 2 → **Add content** → Image. Set the row's Gap to `32`.

1. **Insert.** Click **Insert**. The dashed draft becomes a normal section — solid shadow, no "Draft" badge, no dashed outlines on its rows or columns. The pane returns to "Add a row to start building a section." and the footer disappears.
2. **No draft residue.** In the console:

```js
const frame = document.querySelector('.canvas-frame');
frame.querySelectorAll('[data-draft]').length;                                    // expected: 0
Array.from(frame.querySelectorAll('[data-node-id]')).filter(el => el.dataset.nodeId.startsWith('draft_')).length;   // expected: 0
Array.from(frame.querySelectorAll('[data-node-id]')).map(el => el.dataset.nodeId);  // expect section / row / column / heading / image
```

3. **Layout values survived Insert** — the failure this design exists to prevent. The committed row still has a 32px gap and its first column is still 60% wide. Confirm in the console:

```js
const row = frame.querySelector('.node--row');
row.style.gap;                                     // expected: "32px"
row.querySelector('.node--column').style.flex;     // expected: "0 0 60%"
```

4. **It is real content now.** The inserted section has a drag handle on hover, can be reordered, and can be dropped on the trash. With the **Select** tool, its heading and image are selectable and the Text and Image panes edit them.
5. **Insert twice.** Build a second section and Insert. Ids stay unique (`section_2`, `row_2`, …) and both sections are intact.
6. **Cancel.** Build a third draft, then click **Cancel**. The draft vanishes and the previously inserted sections are untouched.
7. **Insert disabled with no rows.** Pick the Section tool with no draft — the footer is hidden. Add a row, delete it: the footer hides again.
8. **Empty canvas.** Trash every section, then build and Insert one. The "Blank canvas" placeholder is replaced by the new section.

- [ ] **Step 6: Update `TODO.md`**

Replace line 42:

```
- [ ] Section tool: insert a new full-width section (with layout presets: 1 col, 2 col, grid, etc.) `Medium` `P1`
```

with:

```
- [x] Section tool: GUI section builder `Medium` `P1` — see `section-builder.js` / `section-panel.js` and [docs/specs/2026-07-30-section-builder-design.md](./docs/specs/2026-07-30-section-builder-design.md). Compose a section as rows → columns → unfilled content slots, with a live draft on the canvas you pick into, then Insert. Layout presets were dropped: every section starts empty, since a builder answers "what shape do you want" rather than "which of these five". Structure can't be re-edited after Insert — that needs the project object (item 3) — but content is editable through the Text/Image/Button panes
```

Replace line 209:

```
36. Section tool: insert a new full-width section with layout presets `Medium` `P1`
```

with:

```
36. ~~Section tool: insert a new full-width section with layout presets~~ — done as a GUI section builder instead; presets dropped `Medium` `P1`
```

- [ ] **Step 7: Update `README.md`**

In the `scripts/` file tree, after the `image-panel.js` line, add:

```
│   ├── section-builder.js The Section tool's draft: the tree, the live draft on canvas, Insert/Cancel
│   ├── section-panel.js  Section tool panel: the picked row/column's layout and content
```

In the feature checklist, after the Image panel line (`:152`), add:

```
- [x] Section tool is a GUI section builder (`section-builder.js` / `section-panel.js`): compose a section as rows → columns → unfilled content slots, watching a live draft on the canvas and clicking into it to pick what the pane edits. Rows carry gap, align, distribute and wrap; columns carry a width (auto / equal / explicit %) and their content slots. Insert commits it as a real section — reorderable, trashable, and editable through the Text/Image/Button panes — and Cancel throws it away. Structure can't be re-edited after Insert yet (see [TODO.md](./TODO.md))
```

Then update the paragraph at `:19-21` describing what the Select tool reaches, appending after "opens the matching left tool panel.":

```
The Section tool composes a brand-new section instead of editing an existing
one: rows, columns and unfilled content slots, drafted live on the canvas and
committed with Insert.
```

- [ ] **Step 8: Verify the docs match the build**

- `README.md`'s `scripts/` tree lists every file actually in `scripts/`: `ls scripts/` and compare.
- `TODO.md:42` is checked and mentions the dropped presets.
- Reload the page once more and re-run verification steps 1 and 3 from Step 5 — the docs edits must not have touched behavior.

- [ ] **Step 9: Commit**

```bash
git add scripts/section-builder.js scripts/section-panel.js index.html styles/style.css TODO.md README.md
git commit -m "feat: commit or discard a built section, and document the tool

Insert clones the draft tree, strips its temporary ids so
appendSectionsToCanvas() mints clean ones, inserts above the draft so the new
section lands where the draft stood, then drops the draft and gives the result
a drag handle. Cancel just drops it. Insert needs one row, which is sufficient
because a row is guaranteed to keep a column.

Records the feature in README.md and closes the TODO item, noting that layout
presets were dropped in favour of starting empty and that structure cannot be
re-edited after Insert until the in-memory project object exists."
```

---

## Self-Review

**1. Spec coverage.** Every section of `docs/specs/2026-07-30-section-builder-design.md` maps to a task:

| Spec section | Task |
|---|---|
| Architecture / hybrid update strategy | 1 (writers), 4 (dual-write) |
| One writer per destination | 1 |
| Draft identity and insertion | 7 |
| Draft lifetime (persists across tool switches) | 4 (module state), verified 5 step 6.12 |
| Node fields set / not set | 3 (no placeholder), 3 + `labelFor()` in 5 (no name), no `role` written anywhere |
| Modules — `section-builder.js` | 3, 4, 7 |
| Modules — `section-panel.js` | 5, 6 |
| Modified files table | 1, 2, 5, 7 |
| Renderer whitelist addition (`flex`) | 1 |
| Pane UI (three pickable kinds, per-type controls) | 5, 6 |
| Content slots pick parent column | 4 (`pickableFrom`), verified 6 step 5.8 |
| Empty containers visible in draft | 4 (CSS) |
| Structural edits preserve the pick | 4 (`renderDraft`) |
| Row always keeps a column | 3 (`deleteColumn`), 6 (disabled control) |
| Canvas fixes: insert position, reorder drop, empty state, drag handles | 2 |
| Error handling (gap ≥ 0, pct 1–100, non-numeric revert) | 5 (`clampGap`), 6 (`clampPct`) |
| Testing checklist items 1–15 | Distributed: 1–4 → Task 5/6 checks; 5–6 → Task 4 step 4.3 and Task 7 step 5.3; 7–9 → Task 6, Task 7; 10–13 → Task 2 step 7, Task 5 step 6.12; 14–15 → Task 7 step 5.7, Task 6 step 5.2 |

Two deliberate refinements of the spec, both noted where they occur:

- **`applyStyleProp()` is extracted alongside `applyLayoutProp()`** (Task 1). The spec names only the latter, but column width is a *style* prop, so without this there would be two writers of `flex` — the renderer's loop and the builder — which is the exact drift the spec's "one writer per destination" rule exists to prevent.
- **The blank-canvas placeholder and a draft can coexist** (Task 2, Step 3). The spec doesn't say either way. Allowing it needs no special-casing and is accurate: the placeholder means "no committed sections", which is true while a draft is uncommitted.

**2. Placeholder scan.** No `TBD`, no "add error handling", no "similar to Task N". Every code step carries the actual code; every verification step carries the actual commands and their expected output.

**3. Type consistency.** Checked across tasks:

- `commandAddRow` / `commandAddColumn` / `commandAddContentSlot` / `commandDeleteRow` / `commandDeleteColumn` / `commandDeleteContentSlot` — same names in Task 4 (defined), 5 and 6 (consumed).
- `setLayoutProp(nodeId, prop, value)` — Task 4 defines the 3-arg form on module state, and Tasks 5–6 call it with 3 args. (The spec sketched a 4-arg `setLayoutProp(draft, …)`; the draft is module state, so the plan's signature drops it. Consistent within the plan.)
- `setColumnWidth(columnId, mode, pct)`, `columnWidthMode(column)`, `columnWidthPct(column)` — defined Task 4, consumed Task 6.
- `canDeleteColumn(draft, columnId)` — defined Task 3 taking a draft, called in Task 6 as `canDeleteColumn(currentDraft(), column.id)`. Consistent.
- `hasRows(draft)` — defined Task 3, consumed Tasks 5 and 7.
- `draftElementIn(frameEl)` — defined Task 2, consumed Task 2 (`appendSectionsToCanvas`, `sectionAfterPoint`).
- `applyLayoutProp` / `applyStyleProp` — defined Task 1, consumed Task 4.
- `onDraftChange(fn)` / `syncSectionPanel()` — the callback registered in Task 5 is the function `tool-panel.js` also calls; one name, both paths.
- `removeDraftElement()` / `resetDraft()` — defined Task 4, consumed Task 7 by both `insertDraft()` and `cancelDraft()`.

**4. Import cycle check.** Task 7 does introduce one cycle:

```
section-builder → section-dnd → selection → tool-panel → section-panel → section-builder
```

This is safe, and consistent with the codebase, which already contains
`selection ↔ tool-panel` (`selection.js:31` imports `openToolPanel`,
`tool-panel.js:26` imports `selectedEl`). Everything crossing the cycle is a
hoisted `function` declaration called after boot, so the binding always exists
by the time it is used.

The cycle the plan does avoid is the fragile one: `section-builder.js`
deliberately does **not** import `activeTool` from `selection.js`, reading
`data-active-tool` off the canvas area instead (Task 4, Step 2). That would
close the same loop around a mutable `let` export, where initialization order
and temporal-dead-zone timing decide whether the read works — unlike a function
declaration, a `let` binding across a cycle can genuinely be unset when read.
`setActiveTool()` already publishes the attribute, so nothing is lost.

If the implementer would rather have no new cycle at all, the alternative is to
drop the `addSectionDragHandles` import from `section-builder.js` and have
`insertDraft()`'s caller add the handle — `layouts-panel.js:43-44` already pairs
`appendSectionsToCanvas` with `addSectionDragHandles` that way. Either is
acceptable; the plan takes the in-builder version so that Insert is complete in
one call.
