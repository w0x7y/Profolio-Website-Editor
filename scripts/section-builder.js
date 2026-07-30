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
// a node in it, and Insert/Cancel land here too — the pane itself lives in
// section-panel.js and knows nothing about this tree's shape.
// ============================================================

import { canvasFrame } from './dom.js';
import { renderNode, applyLayoutProp, applyStyleProp, refreshCanvasEmptyState } from './renderer.js';

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

// `0px` rather than `0`: the browser normalizes the `flex` shorthand's basis to
// a length when it serializes style.flex, so writing `1 1 0` would leave the
// tree holding one string and the element another. Keeping them identical is
// what lets columnWidthMode() read the tree and still describe the element.
const COLUMN_FLEX_EQUAL = '1 1 0px';

/**
 * Column width, expressed as one `flex` declaration:
 *
 *   auto     no declaration — the column takes its natural width
 *   equal    1 1 0px  — every equal column shares the row evenly
 *   percent  0 0 N%   — a fixed share, for a sidebar or a 70/30 split
 *
 * Tree first, same reason as setLayoutProp().
 */
export function setColumnWidth(columnId, mode, pct) {
    const node = draft && findNode(draft, columnId);
    if (!node || node.type !== 'column') return;

    const flex = mode === 'equal' ? COLUMN_FLEX_EQUAL
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
    if (flex === COLUMN_FLEX_EQUAL) return 'equal';
    return 'percent';
}

/** The percentage in a `0 0 N%` flex, or null for the other modes. */
export function columnWidthPct(column) {
    const flex = column && column.style && column.style.base && column.style.base.flex;
    const match = /(\d+(?:\.\d+)?)%/.exec(flex || '');
    return match ? Number(match[1]) : null;
}
