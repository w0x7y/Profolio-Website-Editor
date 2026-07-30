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
