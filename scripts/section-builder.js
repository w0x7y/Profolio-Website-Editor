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
