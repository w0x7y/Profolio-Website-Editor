// ============================================================
// BOOT
//
// The one entry point index.html loads. Everything else is a module this
// file wires together as soon as the DOM is parsed (see the bottom of this
// file); the order of the init calls below is the order the app expects,
// and is the only place it is stated.
// ============================================================

import { canvasFrame, activateOne } from './dom.js';
import { renderSectionsIntoCanvas } from './renderer.js';
import { initThemePanel } from './theme.js';
import { initTextPanel } from './text-panel.js';
import { initButtonPanel } from './button-panel.js';
import { initImagePanel } from './image-panel.js';
import { initSectionBuilder } from './section-builder.js';
import { initSectionPanel } from './section-panel.js';
import { initUploadModal } from './upload-modal.js';
import { initAssetsPanel } from './assets-panel.js';
import { initSectionDragAndDrop } from './section-dnd.js';
import { initCanvasSelection, setActiveTool, activeTool } from './selection.js';
import { closeToolPanel, toggleToolPanel } from './tool-panel.js';
import { loadPages } from './layouts-panel.js';

function boot() {

    // ---- Left toolbar: tool selection ----
    const tools = document.querySelectorAll('.tool');
    tools.forEach(tool => {
        tool.addEventListener('click', () => {
            // Clicking the tool that's already active toggles its extended
            // panel instead of re-selecting the tool. Either way the tool
            // stays active — see closeToolPanel().
            if (tool.dataset.tool === activeTool) {
                toggleToolPanel(activeTool);
                return;
            }

            // setActiveTool() owns every representation of the active tool,
            // including this button's highlight.
            setActiveTool(tool.dataset.tool);
        });
    });

    // ---- Left tool panel: close button ----
    const toolPanelClose = document.getElementById('toolPanelClose');
    if (toolPanelClose) toolPanelClose.addEventListener('click', closeToolPanel);

    // ---- Right panel: tab switching ----
    const panelTabs = document.querySelectorAll('.panel__tab');
    const panelPanes = document.querySelectorAll('.panel__pane');
    panelTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            activateOne(panelTabs, t => t === tab);
            activateOne(panelPanes, pane => pane.dataset.pane === tab.dataset.panel);
        });
    });

    // ---- Top bar: device switcher (visual resize of canvas frame) ----
    const deviceButtons = document.querySelectorAll('.device-switch__btn');
    const frameWidths = {
        desktop: '1200px',
        tablet: '768px',
        mobile: '390px'
    };

    deviceButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            activateOne(deviceButtons, b => b === btn);

            const width = frameWidths[btn.dataset.device];
            if (canvasFrame() && width) canvasFrame().style.width = width;
        });
    });

    // ---- Right panel: the Themes tab's colors and fonts ----
    // Builds the theme cards and the two font pickers, then puts the
    // starting theme on the canvas. See theme.js.
    initThemePanel();

    // ---- Canvas: render the initial (empty) state from the data model ----
    renderSectionsIntoCanvas([], canvasFrame());

    // ---- Canvas: drag sections to reorder them, or onto the trash to delete ----
    initSectionDragAndDrop();

    // ---- Assets: the upload window, then the Assets tab that opens it ----
    // The modal first: the Assets tab wires its own drop zone with helpers
    // from it, and the Image pane's Upload button opens the same dialog.
    initUploadModal();
    initAssetsPanel();

    // ---- Left tool panel: the Text, Button, Image and Section panes ----
    initTextPanel();
    initButtonPanel();
    initImagePanel();

    // The builder owns the draft and the canvas pick; the pane is its controls,
    // and registers its re-sync callback with the builder, so the builder goes
    // first.
    initSectionBuilder();
    initSectionPanel();

    // ---- Canvas: click content to select it (Select tool) ----
    setActiveTool('select');
    initCanvasSelection();

    // ---- Layouts: load automatically from /layout, then wire up selection ----
    loadPages();

}

// `type="module"` scripts are deferred, so the document is already parsed by
// the time this file runs and every element boot() reaches for exists.
// Waiting for DOMContentLoaded on top of that bought nothing and cost a lot:
// that event also waits on any stylesheet still in flight, which put the
// whole editor behind a third-party font request. Boot as soon as the DOM is
// there; the readyState check is only for the case where this module is ever
// loaded in a way that isn't deferred.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
    boot();
}
