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
import {
    renderNode, applyLayoutProp, applyStyleProp, refreshCanvasEmptyState,
    appendSectionsToCanvas
} from './renderer.js';
import { addSectionDragHandles } from './section-dnd.js';

const DRAFT_ID_PREFIX = 'draft_';

// The content types a column can hold. Deliberately narrower than the model's
// leaf types: `icon`, `divider` and `embed` have no controls in this pane, and
// an embed belongs to the Embed tool.
const CONTENT_SLOT_TYPES = new Set(['heading', 'text', 'image', 'button']);

let idSeq = 0;

/**
 * Creates a unique draft-local identifier for a node type.
 * @param {string} type - The node type to include in the identifier.
 * @return {string} A unique draft-local node identifier.
 */
function draftId(type) {
    idSeq += 1;
    return `${DRAFT_ID_PREFIX}${type}_${idSeq}`;
}

/**
 * Create an empty draft section.
 * @returns {Object} The new draft section node.
 */
export function createDraft() {
    return { id: draftId('section'), type: 'section', children: [] };
}

/**
 * Creates an empty draft column.
 * @returns {Object} The new column node with a draft-local ID.
 */
function buildColumn() {
    return { id: draftId('column'), type: 'column', children: [] };
}

/**
 * Adds a row with one column to the draft section.
 * @param {Object} draft - The draft section to update.
 * @return {Object} The newly added row.
 */
export function addRow(draft) {
    const row = { id: draftId('row'), type: 'row', children: [buildColumn()] };
    draft.children.push(row);
    return row;
}

/**
 * Adds a column to the specified row.
 * @param {Object} draft - The draft tree containing the row.
 * @param {string} rowId - The identifier of the target row.
 * @returns {Object|null} The created column, or `null` if the row is not found.
 */
export function addColumn(draft, rowId) {
    const row = findNode(draft, rowId);
    if (!row || row.type !== 'row') return null;

    const column = buildColumn();
    row.children.push(column);
    return column;
}

/**
 * Add an empty content slot to a column in the draft.
 * @param {Object} draft - The draft tree to modify.
 * @param {string} columnId - The ID of the target column.
 * @param {string} type - The content slot type to add.
 * @return {Object|null} The created slot, or `null` if the type or column is invalid.
 */
export function addContentSlot(draft, columnId, type) {
    if (!CONTENT_SLOT_TYPES.has(type)) return null;

    const column = findNode(draft, columnId);
    if (!column || column.type !== 'column') return null;

    const slot = { id: draftId(type), type };
    column.children.push(slot);
    return slot;
}

/**
 * Remove a row from the draft section.
 * @param {Object} draft - The draft section containing the row.
 * @param {string} rowId - The identifier of the row to remove.
 * @return {boolean} `true` if a row was removed, `false` otherwise.
 */
export function deleteRow(draft, rowId) {
    const before = draft.children.length;
    draft.children = draft.children.filter(row => row.id !== rowId);
    return draft.children.length < before;
}

/**
 * Remove a column while preserving at least one column in its row.
 * @param {Object} draft - The draft section tree.
 * @param {string} columnId - The ID of the column to remove.
 * @return {boolean} `true` if the column was removed, `false` if it was not found or is the row's only column.
 */
export function deleteColumn(draft, columnId) {
    const row = findParent(draft, columnId);
    if (!row || row.children.length <= 1) return false;

    row.children = row.children.filter(column => column.id !== columnId);
    return true;
}

/**
 * Determines whether a column can be deleted.
 * @returns {boolean} `true` if the column's parent row contains more than one column, `false` otherwise.
 */
export function canDeleteColumn(draft, columnId) {
    const row = findParent(draft, columnId);
    return !!row && row.children.length > 1;
}

/**
 * Delete a content slot from its parent column.
 * @param {Object} draft - The draft tree containing the slot.
 * @param {string} slotId - The identifier of the content slot to delete.
 * @return {boolean} `true` if the slot was deleted, `false` if its parent column was not found or the slot did not exist.
 */
export function deleteContentSlot(draft, slotId) {
    const column = findParent(draft, slotId);
    if (!column) return false;

    const before = column.children.length;
    column.children = column.children.filter(slot => slot.id !== slotId);
    return column.children.length < before;
}

/**
 * Finds a node in the draft tree by its identifier.
 * @param {Object|null} node - The tree node from which to begin searching.
 * @param {string} id - The identifier to find.
 * @return {Object|null} The matching node, or `null` if no match exists.
 */
export function findNode(node, id) {
    if (!node || !id) return null;
    if (node.id === id) return node;

    for (const child of node.children || []) {
        const found = findNode(child, id);
        if (found) return found;
    }
    return null;
}

/**
 * Finds the parent node containing a child with the specified ID.
 * @param {Object|null} node - The node from which to start searching.
 * @param {string} id - The child node ID to locate.
 * @returns {Object|null} The parent node, or `null` if no matching child is found.
 */
export function findParent(node, id) {
    if (!node || !node.children) return null;
    if (node.children.some(child => child.id === id)) return node;

    for (const child of node.children) {
        const found = findParent(child, id);
        if (found) return found;
    }
    return null;
}

/**
 * Determines whether a draft contains at least one row.
 * @param {Object|null} draft - The draft section to inspect.
 * @return {boolean} `true` if the draft contains one or more rows, `false` otherwise.
 */
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

/**
 * Registers the callback invoked when the draft changes.
 * @param {Function} fn - Callback used to refresh the pane's controls.
 */
export function onDraftChange(fn) {
    notifyChange = fn;
}

/**
 * Notifies the registered draft-change callback.
 */
function notify() {
    if (notifyChange) notifyChange();
}

/**
 * Gets the current section draft.
 * @returns {Object|null} The current draft tree, or `null` when no draft exists.
 */
export function currentDraft() {
    return draft;
}

/**
 * Retrieves the currently picked node in the draft.
 * @return {Object|null} The picked node, or `null` when no draft or matching node exists.
 */
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

/**
 * Removes the rendered draft from the canvas and refreshes the canvas empty state.
 */
export function removeDraftElement() {
    const frame = canvasFrame();
    if (draftEl) draftEl.remove();
    draftEl = null;
    refreshCanvasEmptyState(frame);
}

/**
 * Clears the current draft and selected node.
 */
export function resetDraft() {
    draft = null;
    pickedId = null;
}

/**
 * Applies the picked styling to the currently selected draft node.
 */
function markPicked() {
    if (!draftEl) return;

    draftEl.classList.remove('is-picked');
    draftEl.querySelectorAll('.is-picked').forEach(el => el.classList.remove('is-picked'));

    const el = elementFor(pickedId);
    if (el) el.classList.add('is-picked');
}

/**
 * Finds the rendered draft element for a node.
 * @param {string} nodeId - The node identifier to locate.
 * @return {Element|null} The matching element, or `null` when no element is found.
 */
function elementFor(nodeId) {
    if (!draftEl || !nodeId) return null;
    if (draftEl.dataset.nodeId === nodeId) return draftEl;
    return draftEl.querySelector(`[data-node-id="${nodeId}"]`);
}

/**
 * Initializes click-to-select behavior for draft container nodes when the Section tool is active.
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
/**
 * Adds a row to the current draft section and refreshes its canvas representation.
 */

export function commandAddRow() {
    addRow(ensureDraft());
    renderDraft();
}

/**
 * Adds a column to the specified row in the current draft.
 * @param {string} rowId - The identifier of the row receiving the column.
 */
export function commandAddColumn(rowId) {
    if (addColumn(draft, rowId)) renderDraft();
}

/**
 * Adds a content slot to a draft column and refreshes the rendered draft when successful.
 * @param {string} columnId - The ID of the column that will receive the content slot.
 * @param {string} type - The content slot type to add.
 */
export function commandAddContentSlot(columnId, type) {
    if (addContentSlot(draft, columnId, type)) renderDraft();
}

/**
 * Deletes a row from the current draft.
 * @param {string} rowId - The ID of the row to delete.
 */
export function commandDeleteRow(rowId) {
    if (deleteRow(draft, rowId)) renderDraft();
}

/**
 * Deletes a column from the draft section.
 * @param {string} columnId - The identifier of the column to delete.
 */
export function commandDeleteColumn(columnId) {
    if (deleteColumn(draft, columnId)) renderDraft();
}

/**
 * Deletes a content slot from the draft and re-renders it when successful.
 * @param {string} slotId - The ID of the content slot to delete.
 */
export function commandDeleteContentSlot(slotId) {
    if (deleteContentSlot(draft, slotId)) renderDraft();
}

// ---- layout-value edits: tree first, then the element ----

/**
 * Update a node's layout property and synchronize its rendered element.
 * @param {string} nodeId - The ID of the node to update.
 * @param {string} prop - The layout property name.
 * @param {*} value - The property value; empty, null, undefined, or false removes the property.
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
 * Set a column's width mode and optional percentage.
 * @param {string} columnId - The identifier of the column to update.
 * @param {'auto'|'equal'|'percent'} mode - The width mode to apply.
 * @param {number} pct - The percentage width used when `mode` is `percent`.
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

/**
 * Determines the width mode represented by a column's stored flex value.
 * @param {Object} column - The column whose width mode to determine.
 * @returns {string} `'auto'` when no flex value is stored, `'equal'` for equal-width flex, or `'percent'` otherwise.
 */
export function columnWidthMode(column) {
    const flex = column && column.style && column.style.base && column.style.base.flex;
    if (!flex) return 'auto';
    if (flex === COLUMN_FLEX_EQUAL) return 'equal';
    return 'percent';
}

/**
 * Extracts the percentage value from a column's flex configuration.
 * @param {Object} column - The column whose flex configuration is inspected.
 * @return {number|null} The percentage value, or `null` when the flex configuration does not specify a percentage.
 */
export function columnWidthPct(column) {
    const flex = column && column.style && column.style.base && column.style.base.flex;
    const match = /(\d+(?:\.\d+)?)%/.exec(flex || '');
    return match ? Number(match[1]) : null;
}

// ---- committing the draft ----

/**
 * Commits the draft section to the canvas.
 * @return {*} The inserted section, or `null` when the draft has no rows.
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

/**
 * Cancels the current draft section and removes it from the canvas.
 */
export function cancelDraft() {
    removeDraftElement();
    resetDraft();
    notify();
}

/**
 * Removes identifiers from a node and its descendants.
 * @param {Object} node - The node whose identifiers should be removed.
 * @return {Object} The modified node.
 */
function stripIds(node) {
    delete node.id;
    (node.children || []).forEach(stripIds);
    return node;
}
