// ============================================================
// CANVAS SELECTION
//
// Click content on the canvas to select it. Only *content* is
// selectable — the three categories a user actually edits:
//
//   images   image, icon      (an <img>, the inline SVG placeholder, ...)
//   text     heading, text    (h1..h6, p — anything carrying copy)
//   actions  button           (links/buttons, rendered as <a>)
//
// Containers (section / row / column / group) and non-content leaves
// (divider, embed) are deliberately not selectable: clicking one
// reads as "click the background", i.e. deselect. Sections are still
// manipulated through their drag handle, not through selection.
//
// Selection is a Select-tool concept. Any other tool in the left rail
// turns click-to-select off and drops the current selection.
//
// Selecting opens the left tool panel on the pane for that node's type, and
// deselecting closes it again — the panel is the one thing acting on the
// selection so far. Inline text editing and the contextual toolbar hang off
// `selectedEl` later; when the canvas is backed by a real project tree
// (TODO Phase 1), selection should be stored as a node id rather than as a
// DOM reference.
// ============================================================

// Which tool panel pane each selectable node type belongs to — the three
// content categories above, named after the tool that will eventually edit
// them. SELECTABLE_NODE_TYPES derives from this map rather than repeating it,
// so a type cannot become selectable without declaring a pane to show for it.
import { openToolPanel, closeToolPanel, TOOL_PANEL_TOOLS } from './tool-panel.js';

const NODE_TYPE_PANES = {
    image: 'image',
    icon: 'image',
    heading: 'text',
    text: 'text',
    button: 'button',
};

const SELECTABLE_NODE_TYPES = new Set(Object.keys(NODE_TYPE_PANES));

export let activeTool = 'select';
export let selectedEl = null;

export function initCanvasSelection() {
    const scroller = document.querySelector('.canvas-scroll');
    if (!scroller) return;

    // One listener on the scroller rather than per element: it covers
    // everything rendered later, and clicks that land on the canvas
    // background (outside any selectable node) come through here too and
    // clear the selection.
    scroller.addEventListener('click', onCanvasClick);

    // No real navigation inside the editor canvas. Delegated rather than a
    // listener per rendered button: this covers everything added later too,
    // and keeps the renderer free of interactivity.
    scroller.addEventListener('click', e => {
        if (e.target.closest('a.node--button')) e.preventDefault();
    });

    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;

        // Escape inside the tool panel belongs to the field the user is typing
        // in, not to the canvas selection. Without this, dismissing a hex field
        // or a paste in the Content box closes the panel and drops the
        // selection mid-edit — and nothing persists, so there is no way back.
        if (e.target.closest && e.target.closest('.tool-panel')) return;

        clearSelection();
    });
}

/**
 * The single writer of the active tool. It lives in three places — this
 * variable, the toolbar button's highlight, and `data-active-tool` on the
 * canvas area — and all three are set here so a programmatic tool change
 * can't leave the toolbar highlighting a tool that isn't active.
 */
export function setActiveTool(tool) {
    activeTool = tool || 'select';

    document.querySelectorAll('.tool').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.tool === activeTool);
    });

    // Drives the hover affordance in CSS — content only looks clickable
    // while the Select tool is the active one.
    const area = document.querySelector('.canvas-area');
    if (area) area.dataset.activeTool = activeTool;

    if (activeTool !== 'select') clearSelection();

    // Tools with a pane open the extended panel; Select and Settings have
    // none, so switching to them closes it.
    if (TOOL_PANEL_TOOLS.has(activeTool)) openToolPanel(activeTool);
    else closeToolPanel();
}

function onCanvasClick(e) {
    if (activeTool !== 'select') return;

    // The drag handle is editor chrome layered over a section, not content.
    if (e.target.closest('.section-handle')) return;

    selectNode(selectableTargetFrom(e.target));
}

/**
 * Resolve a clicked DOM node to the element that should be selected: the
 * nearest ancestor-or-self that is a selectable node.
 *
 * Walking up matters because a rendered node isn't always the click target
 * — an image node's real target is the inner <img> or the placeholder
 * <svg>/<span>, none of which carry a data-node-id.
 *
 * Returns null when the click landed on a container, a non-content leaf, or
 * the canvas background — all of which mean "deselect".
 */
function selectableTargetFrom(target) {
    // The Section builder's draft is not content. Nothing inside it is
    // selectable, including after the user switches back to the Select tool
    // with a draft still on the canvas.
    if (target.closest('[data-draft]')) return null;

    let el = target.closest('[data-node-id]');

    while (el) {
        if (SELECTABLE_NODE_TYPES.has(el.dataset.nodeType)) return el;
        el = el.parentElement ? el.parentElement.closest('[data-node-id]') : null;
    }
    return null;
}

function selectNode(el) {
    if (el !== selectedEl) {
        clearSelection();
        selectedEl = el;
        if (el) el.classList.add('is-selected');
    }

    // Synced on every call rather than only when the selection changes, so
    // re-clicking the selected element brings back a panel closed with ✕.
    if (el) openToolPanel(NODE_TYPE_PANES[el.dataset.nodeType]);
}

export function clearSelection() {
    if (!selectedEl) return;
    selectedEl.classList.remove('is-selected');
    selectedEl = null;

    // The panel mirrors the selection only while Select is the active tool.
    // setActiveTool() reassigns `activeTool` before calling this, so switching
    // to another tool clears the selection without closing the panel it is
    // about to open for that tool.
    if (activeTool === 'select') closeToolPanel();
}

/**
 * Drop the selection when the selected element is no longer on the canvas
 * (its section was dragged onto the trash), so nothing keeps pointing at a
 * detached node.
 */
export function clearSelectionIfDetached() {
    if (selectedEl && !document.contains(selectedEl)) clearSelection();
}
