// ============================================================
// LEFT TOOL PANEL
//
// The extended panel next to the left toolbar. Each tool listed in
// TOOL_PANEL_TOOLS has a pane in index.html; opening the panel reveals that
// tool's pane and titles the header from the tool's own tooltip label.
//
// Two things open the panel: picking a tool that has a pane, and selecting
// content on the canvas (see selectNode(), which maps the selected node's
// type to a pane). Select and Settings have no pane of their own — Select
// shows the pane for whatever is selected instead, and the Settings tool's
// UX is still undecided (see TODO.md).
//
// Panel visibility is deliberately independent of tool state: closing the
// panel leaves the tool active and the selection intact, so it never
// silently changes what clicking on the canvas does.
//
// The Embed pane still holds placeholder text; its real controls go into the
// markup later.
// ============================================================

import { toolPanel, activateOne } from './dom.js';
import { syncTextPanel } from './text-panel.js';
import { syncButtonPanel } from './button-panel.js';
import { syncImagePanel } from './image-panel.js';
import { syncSectionPanel } from './section-panel.js';
import { selectedEl } from './selection.js';

export const TOOL_PANEL_TOOLS = new Set(['text', 'image', 'button', 'section', 'embed']);

/**
 * Opens the pane associated with a tool and synchronizes its controls with the current selection.
 * @param {string} tool - The identifier of the tool whose pane should be opened.
 */
export function openToolPanel(tool) {
    const panel = toolPanel();
    if (!panel) return;

    activateOne(panel.querySelectorAll('.tool-panel__pane'), pane => pane.dataset.toolPane === tool);

    // Read the title off the tool button's existing tooltip label rather than
    // duplicating the name, so the two can't drift apart.
    const title = document.getElementById('toolPanelTitle');
    const label = document.querySelector(`.tool[data-tool="${tool}"] .tool__label`);
    if (title) title.textContent = label ? label.textContent : '';

    // Panes with real controls point themselves at the current selection.
    // This is the one funnel both entry paths reach — picking the tool, and
    // selectNode() mapping a node type to its pane — so it also covers
    // re-selecting a node after the panel was dismissed with ✕.
    if (tool === 'text') syncTextPanel(selectedEl);
    if (tool === 'button') syncButtonPanel(selectedEl);
    if (tool === 'image') syncImagePanel(selectedEl);
    if (tool === 'section') syncSectionPanel();

    panel.hidden = false;
}

export function closeToolPanel() {
    const panel = toolPanel();
    if (panel) panel.hidden = true;

    // Mirror of the sync in openToolPanel(). Without it a pane keeps holding
    // the element it was editing after the panel closes — including one that
    // has since been trashed off the canvas.
    syncTextPanel(null);
    syncButtonPanel(null);
    syncImagePanel(null);
}

/** Re-clicking the active tool: hide its panel, or bring it back if hidden. */
export function toggleToolPanel(tool) {
    if (!TOOL_PANEL_TOOLS.has(tool)) return;

    const panel = toolPanel();
    if (!panel) return;

    if (panel.hidden) openToolPanel(tool);
    else closeToolPanel();
}
