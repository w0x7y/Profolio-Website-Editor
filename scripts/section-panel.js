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
    onDraftChange, currentDraft, pickedNode, hasRows, canDeleteColumn,
    commandAddRow, commandAddColumn, commandDeleteRow,
    commandAddContentSlot, commandDeleteColumn, commandDeleteContentSlot,
    setLayoutProp, setColumnWidth, columnWidthMode, columnWidthPct,
    insertDraft, cancelDraft
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

const WIDTH_OPTIONS = [
    { value: 'auto', label: 'Auto' },
    { value: 'equal', label: 'Equal' },
    { value: 'percent', label: '%' }
];

// What a column can hold. The values are node types the renderer already knows
// how to draw as empty placeholders.
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

/**
 * Initializes the section panel controls and subscribes it to draft changes.
 */
export function initSectionPanel() {
    const addRow = document.getElementById('sectionAddRow');
    if (addRow) addRow.addEventListener('click', commandAddRow);

    const insert = document.getElementById('sectionInsert');
    if (insert) insert.addEventListener('click', insertDraft);

    const cancel = document.getElementById('sectionCancel');
    if (cancel) cancel.addEventListener('click', cancelDraft);

    // The builder calls this after any change to the draft or the pick.
    onDraftChange(syncSectionPanel);
}

/**
 * Synchronizes the section panel with the current draft and selected node.
 *
 * Updates panel visibility and insertion controls, and rebuilds the inspector
 * for the selected node when the draft contains rows.
 */
export function syncSectionPanel() {
    const empty = document.getElementById('sectionEmpty');
    const inspector = document.getElementById('sectionInspector');
    const mount = document.getElementById('sectionInspectorMount');
    if (!empty || !inspector || !mount) return;

    const draft = currentDraft();
    const node = pickedNode();
    const showInspector = hasRows(draft) && !!node;

    // Insert needs a row to commit. A row always has at least one column
    // (deleteColumn() guarantees it), so this one check is enough — without that
    // guarantee it would have to scan every row for an empty one.
    const footer = document.getElementById('sectionFooter');
    if (footer) footer.hidden = !draft;

    const insert = document.getElementById('sectionInsert');
    if (insert) insert.disabled = !hasRows(draft);

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
 * Formats the header label for a picked section, row, or column.
 * @param {Object} draft - The section draft containing the picked node.
 * @param {Object} node - The picked section, row, or column node.
 * @returns {string} The node label with positional row and column numbers where applicable.
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

/**
 * Builds the inspector controls for the selected section, row, or column node.
 * @param {Object} node - The selected node whose type determines the controls to include.
 * @returns {DocumentFragment} The inspector controls.
 */
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

    body.appendChild(buildWidthCtrl(node));
    body.appendChild(buildSlotList(node));
    body.appendChild(buildAddContent(node));
    body.appendChild(buildColumnActions(node));
    return body;
}

/**
 * Create a numeric control for editing a node's gap in pixels.
 * @param {Object} node - The layout node whose gap is edited.
 * @param {string} label - The control and input label.
 * @returns {HTMLElement} The gap control element.
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

/**
 * Extracts the numeric gap value from a node's layout.
 * @param {Object} node - The node whose layout gap is read.
 * @returns {number} The gap value, or `0` when no numeric value is present.
 */
function parseGapPx(node) {
    const gap = node.layout && node.layout.gap;
    const match = /(\d+(?:\.\d+)?)/.exec(gap || '');
    return match ? Number(match[1]) : 0;
}

/**
 * Clamps a gap value to zero or greater.
 * @param {*} raw - The value to parse as a gap.
 * @return {number|null} The clamped gap, or `null` when the value is empty or not finite.
 */
function clampGap(raw) {
    if (String(raw).trim() === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, n);
}

/**
 * Build a segmented control for a node layout property.
 * @param {Object} node - The node whose layout property is controlled.
 * @param {string} label - The control label.
 * @param {string} prop - The layout property to update.
 * @param {Array} options - The available segmented control options.
 * @param {*} fallback - The value displayed when the property is unset.
 * @return {HTMLElement} The configured control element.
 */
function buildSegmentedCtrl(node, label, prop, options, fallback) {
    const ctrl = buildCtrl(label);
    const group = buildSegmented(options, label, value => setLayoutProp(node.id, prop, value));

    setSegmentedValue(group, (node.layout && node.layout[prop]) || fallback);
    ctrl.appendChild(group);
    return ctrl;
}

/**
 * Build a control for toggling row content wrapping.
 * @param {Object} node - The row node whose wrapping setting is controlled.
 * @returns {HTMLElement} The wrapping toggle control.
 */
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

/**
 * Creates row action buttons for adding a column or deleting the row.
 * @param {Object} row - The row whose identifier is used by the action handlers.
 * @return {HTMLDivElement} The container holding the row action buttons.
 */
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

/**
 * Build controls for selecting a column's width mode and percentage.
 * @param {Object} column - The column whose width settings are edited.
 * @returns {HTMLElement} The assembled width control.
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

/**
 * Constrain a column width percentage to the supported range.
 * @param {*} raw - The value to convert and clamp.
 * @returns {number|null} A value from 1 through 100, or `null` when the input is empty or not a finite number.
 */
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

/**
 * Build controls for adding content slots to a column.
 * @param {Object} column - The column to receive the selected content slot.
 * @return {HTMLElement} The assembled add-content control.
 */
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
 * Build controls for deleting a column.
 * @param {Object} column - The column to delete.
 * @return {HTMLDivElement} A container with the delete-column control.
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
