// ============================================================
// UI-ONLY INTERACTIONS
// (no real editing functionality yet — just visual state)
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

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

            tools.forEach(t => t.classList.remove('is-active'));
            tool.classList.add('is-active');
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
            const target = tab.dataset.panel;

            panelTabs.forEach(t => t.classList.remove('is-active'));
            tab.classList.add('is-active');

            panelPanes.forEach(pane => {
                pane.classList.toggle('is-active', pane.dataset.pane === target);
            });
        });
    });

    // ---- Top bar: device switcher (visual resize of canvas frame) ----
    const deviceButtons = document.querySelectorAll('.device-switch__btn');
    const canvasFrame = document.querySelector('.canvas-frame');
    const frameWidths = {
        desktop: '1200px',
        tablet: '768px',
        mobile: '390px'
    };

    deviceButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            deviceButtons.forEach(b => b.classList.remove('is-active'));
            btn.classList.add('is-active');

            const device = btn.dataset.device;
            if (canvasFrame && frameWidths[device]) {
                canvasFrame.style.width = frameWidths[device];
            }
        });
    });

    // ---- Theme cards (visual selection only) ----
    document.querySelectorAll('.theme-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('is-active'));
            card.classList.add('is-active');
        });
    });

    // ---- Font cards (visual selection only) ----
    document.querySelectorAll('.font-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.font-card').forEach(c => c.classList.remove('is-active'));
            card.classList.add('is-active');
        });
    });

    // ---- Canvas: render the initial (empty) state from the data model ----
    renderPageIntoCanvas([], document.querySelector('.canvas-frame'));

    // ---- Canvas: drag sections to reorder them, or onto the trash to delete ----
    initSectionDragAndDrop();

    // ---- Left tool panel: the Text pane's controls ----
    initTextPanel();

    // ---- Canvas: click content to select it (Select tool) ----
    setActiveTool('select');
    initCanvasSelection();

    // ---- Layouts: load automatically from /layout, then wire up selection ----
    loadPages();

});

// ============================================================
// PAGE + LAYOUT LOADING
//
// The Layouts panel is an accordion: one collapsible row per page of
// the site. /layout/pages.json lists those pages in order:
//   [ { "id": "home", "name": "Home" }, ... ]
//
// Each page owns a folder under /layout, and every layout inside it
// lives as its own JSON file:
//   layout/home/minimal.json
//   layout/home/bold-studio.json
//   ...
// layout/<page>/manifest.json simply lists which files to load, since a
// browser can't read a folder's contents by itself. A page with nothing
// built for it yet has an empty manifest ([]) and renders as an empty
// accordion row.
//
// Layout JSON shape:
// {
//   "id": "minimal",
//   "name": "Minimal",
//   "description": "...",
//   "preview": {
//     "direction": "column" | "row",
//     "wrap": true | false,
//     "blocks": [ { "width": "40%", "height": "18%", "tone": "neutral" }, ... ]
//     // tone meanings: gradient-accent = image, gradient-dark = text,
//     // accent = links/navbar, neutral = other
//   }               // or { "blank": true } for the empty-page card
//   "sections": []  // node tree (sections -> blocks -> elements) for the layout
//                   // content — see docs/DATA_MODEL.md. Appended to the
//                   // bottom of the canvas via renderer.js when this
//                   // layout's card is clicked.
// }
//
// Every layout is additive. Clicking a card never replaces the canvas: the
// Home layouts give you a page shell (nav / hero / projects / footer) and
// the other pages' layouts stack their sections underneath, so a site is
// assembled by picking one card after another.
// ============================================================

async function loadPages() {
    const accordion = document.getElementById('pageAccordion');
    if (!accordion) return;

    try {
        const pages = await fetch('layout/pages.json').then(res => res.json());
        const loaded = await Promise.all(pages.map(loadPageLayouts));

        accordion.innerHTML = '';
        // Every row starts collapsed; the user opens the page they want.
        loaded.forEach(page => accordion.appendChild(buildPageSection(page, false)));

        wireLayoutCardInsertion(accordion, loaded);
    } catch (err) {
        accordion.innerHTML = '<p class="panel__hint">Couldn\'t load pages.</p>';
        console.error('Failed to load pages from /layout:', err);
    }
}

async function loadPageLayouts(page) {
    const files = await fetch(`layout/${page.id}/manifest.json`).then(res => res.json());
    const layouts = await Promise.all(
        files.map(file => fetch(`layout/${page.id}/${file}`).then(res => res.json()))
    );
    return { ...page, layouts };
}

function buildPageSection(page, isOpen) {
    const section = document.createElement('div');
    section.className = 'page-section';
    section.classList.toggle('is-open', isOpen);
    section.dataset.pageId = page.id;

    const header = document.createElement('button');
    header.className = 'page-section__header';
    header.type = 'button';
    header.setAttribute('aria-expanded', String(isOpen));
    header.innerHTML =
        '<svg viewBox="0 0 24 24" class="icon icon--sm page-section__chevron"><path d="M9 6l6 6-6 6"/></svg>' +
        `<span class="page-section__name">${escapeHtml(page.name)}</span>` +
        `<span class="page-section__count">${page.layouts.length}</span>`;

    header.addEventListener('click', () => {
        const nowOpen = !section.classList.contains('is-open');
        section.classList.toggle('is-open', nowOpen);
        header.setAttribute('aria-expanded', String(nowOpen));
    });

    const body = document.createElement('div');
    body.className = 'page-section__body';

    const inner = document.createElement('div');
    inner.className = 'page-section__inner';

    if (page.layouts.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'page-section__empty';
        empty.textContent = 'No layouts for this page yet.';
        inner.appendChild(empty);
    } else {
        const grid = document.createElement('div');
        grid.className = 'layout-grid';
        page.layouts.forEach(layout => grid.appendChild(buildLayoutCard(layout)));
        inner.appendChild(grid);
    }

    body.appendChild(inner);
    section.appendChild(header);
    section.appendChild(body);
    return section;
}

function buildLayoutCard(layout) {
    const card = document.createElement('button');
    card.className = 'layout-card';
    card.dataset.layoutId = layout.id;

    const preview = document.createElement('div');
    preview.className = 'layout-card__preview';

    if (layout.preview && layout.preview.blank) {
        preview.classList.add('is-blank');
        preview.innerHTML = '<svg viewBox="0 0 24 24" class="icon"><path d="M12 5v14M5 12h14"/></svg>';
    } else if (layout.preview) {
        preview.style.flexDirection = layout.preview.direction === 'row' ? 'row' : 'column';
        if (layout.preview.wrap) preview.style.flexWrap = 'wrap';

        (layout.preview.blocks || []).forEach(block => {
            const el = document.createElement('span');
            el.className = `preview-block preview-block--${block.tone || 'neutral'}`;
            el.style.width = block.width || '100%';
            el.style.height = block.height || '100%';
            preview.appendChild(el);
        });
    }

    const label = document.createElement('span');
    label.textContent = layout.name;

    card.appendChild(preview);
    card.appendChild(label);
    return card;
}

function wireLayoutCardInsertion(accordion, pages) {
    const canvasFrame = document.querySelector('.canvas-frame');

    accordion.querySelectorAll('.layout-card').forEach(card => {
        card.addEventListener('click', () => {
            // Layout ids are only unique within a page (every page can have
            // its own "blank"), so resolve the page first.
            const pageId = card.closest('.page-section').dataset.pageId;
            const page = pages.find(p => p.id === pageId);
            const layout = page && page.layouts.find(l => l.id === card.dataset.layoutId);
            if (!layout) return;

            // Every card is additive: its sections go at the bottom of the
            // canvas, under whatever is already there. Nothing is replaced,
            // so a card isn't a "current layout" that stays selected — it's
            // an action, and gets a brief confirmation flash instead.
            const added = appendSectionsToCanvas(layout.sections, canvasFrame);
            if (added) {
                addSectionDragHandles(canvasFrame);
                flashCard(card);
                revealOnCanvas(added);
            }
        });
    });
}

/**
 * Scroll the canvas so a freshly appended section is on screen — it lands
 * at the bottom of the page, which is usually below the fold.
 *
 * Done by hand rather than with scrollIntoView(): the canvas scroller is a
 * centered flex container, and scrollIntoView() is unreliable on it.
 */
function revealOnCanvas(el) {
    const scroller = document.querySelector('.canvas-scroll');
    if (!scroller) return;

    const target = el.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();

    // Already fully visible — leave the scroll position alone.
    if (target.top >= view.top && target.bottom <= view.bottom) return;

    // Otherwise line the section's top edge up with the top of the
    // viewport, with a little breathing room above it.
    scroller.scrollTop += target.top - view.top - 24;
}

function flashCard(card) {
    card.classList.remove('is-added');
    // Restart the flash from the top when the same card is clicked twice in
    // a row: without the reflow the class re-add is coalesced into a no-op.
    void card.offsetWidth;
    card.classList.add('is-added');
    setTimeout(() => card.classList.remove('is-added'), 600);
}

// ============================================================
// SECTION DRAG & DROP
//
// Top-level sections on the canvas can be reordered by dragging, and
// removed by dropping them on the trash zone at the bottom of the right
// panel. Two drop targets, one drag source:
//
//   grab handle (top-left of a section, on hover)
//     -> canvas frame : reorder, with an accent line showing where it lands
//     -> trash zone   : delete immediately (no undo yet — see TODO)
//
// The handle is editor chrome, not content: it's added to the DOM after
// rendering and carries no data-node-id, so it stays invisible to
// collectNodeIds() and to anything that walks the node tree.
//
// This reorders the DOM only. Once the canvas is backed by a real in-memory
// project (TODO Phase 1), the drop handlers should move/remove the node in
// that tree and re-render instead.
// ============================================================

let draggedSection = null;
let dropIndicator = null;

function initSectionDragAndDrop() {
    const frame = document.querySelector('.canvas-frame');
    const trash = document.getElementById('canvasTrash');
    if (!frame) return;

    frame.addEventListener('dragover', onCanvasDragOver);
    frame.addEventListener('drop', onCanvasDrop);
    frame.addEventListener('dragleave', e => {
        // dragleave also fires when crossing between children — only clear
        // the indicator once the pointer has actually left the frame.
        if (!frame.contains(e.relatedTarget)) removeDropIndicator();
    });

    if (!trash) return;

    trash.addEventListener('dragover', e => {
        if (!draggedSection) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        trash.classList.add('is-over');
    });
    trash.addEventListener('dragleave', e => {
        if (!trash.contains(e.relatedTarget)) trash.classList.remove('is-over');
    });
    trash.addEventListener('drop', e => {
        if (!draggedSection) return;
        e.preventDefault();

        const frameEl = draggedSection.parentElement;
        draggedSection.remove();
        draggedSection = null;

        trash.classList.remove('is-over');
        removeDropIndicator();
        // The selected element may have been inside the section just deleted.
        clearSelectionIfDetached();
        refreshCanvasEmptyState(frameEl);
    });
}

/**
 * Give every top-level section on the canvas a grab handle. Safe to call
 * after each insert — sections that already have one are skipped.
 */
function addSectionDragHandles(frameEl) {
    if (!frameEl) return;
    frameEl.querySelectorAll(':scope > .node--section').forEach(section => {
        if (section.querySelector(':scope > .section-handle')) return;
        section.appendChild(buildSectionHandle());
    });
}

function buildSectionHandle() {
    const handle = document.createElement('button');
    handle.className = 'section-handle';
    handle.type = 'button';
    handle.draggable = true;
    handle.title = 'Drag to reorder — drop on the trash to delete';
    handle.innerHTML =
        '<svg viewBox="0 0 24 24" class="icon">' +
        '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/>' +
        '<circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/>' +
        '<circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/></svg>';

    handle.addEventListener('dragstart', onHandleDragStart);
    handle.addEventListener('dragend', onHandleDragEnd);
    return handle;
}

function onHandleDragStart(e) {
    const section = e.currentTarget.closest('.node--section');
    if (!section) return;

    draggedSection = section;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', section.dataset.nodeId || '');

    // Drag the whole section, not just the little handle that started it.
    const rect = section.getBoundingClientRect();
    e.dataTransfer.setDragImage(section, e.clientX - rect.left, e.clientY - rect.top);

    // Deferred a frame so the drag image is snapshotted before the section
    // goes translucent.
    requestAnimationFrame(() => section.classList.add('is-dragging'));
}

function onHandleDragEnd() {
    if (draggedSection) draggedSection.classList.remove('is-dragging');
    draggedSection = null;
    removeDropIndicator();

    const trash = document.getElementById('canvasTrash');
    if (trash) trash.classList.remove('is-over');
}

function onCanvasDragOver(e) {
    if (!draggedSection) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    showDropIndicator(e.currentTarget, sectionAfterPoint(e.currentTarget, e.clientY));
}

function onCanvasDrop(e) {
    if (!draggedSection) return;
    e.preventDefault();

    e.currentTarget.insertBefore(draggedSection, sectionAfterPoint(e.currentTarget, e.clientY));
    removeDropIndicator();
}

/**
 * The section a drop at `y` should land above — i.e. the first one whose
 * vertical midpoint is still below the pointer. null means "past the last
 * section", which insertBefore() reads as "append at the end".
 */
function sectionAfterPoint(frameEl, y) {
    const sections = Array.from(frameEl.querySelectorAll(':scope > .node--section'))
        .filter(section => section !== draggedSection);

    return sections.find(section => {
        const rect = section.getBoundingClientRect();
        return y < rect.top + rect.height / 2;
    }) || null;
}

function showDropIndicator(frameEl, before) {
    if (!dropIndicator) {
        dropIndicator = document.createElement('div');
        dropIndicator.className = 'canvas-drop-line';
    }
    // Re-inserting the line where it already sits would restart its
    // transition on every dragover event.
    if (dropIndicator.parentElement === frameEl && dropIndicator.nextElementSibling === before) return;

    frameEl.insertBefore(dropIndicator, before);
}

function removeDropIndicator() {
    if (dropIndicator) dropIndicator.remove();
}

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
const NODE_TYPE_PANES = {
    image: 'image',
    icon: 'image',
    heading: 'text',
    text: 'text',
    button: 'button',
};

const SELECTABLE_NODE_TYPES = new Set(Object.keys(NODE_TYPE_PANES));

let activeTool = 'select';
let selectedEl = null;

function initCanvasSelection() {
    const scroller = document.querySelector('.canvas-scroll');
    if (!scroller) return;

    // One listener on the scroller rather than per element: it covers
    // everything rendered later, and clicks that land on the canvas
    // background (outside any selectable node) come through here too and
    // clear the selection.
    scroller.addEventListener('click', onCanvasClick);

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') clearSelection();
    });
}

function setActiveTool(tool) {
    activeTool = tool || 'select';

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

function clearSelection() {
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
function clearSelectionIfDetached() {
    if (selectedEl && !document.contains(selectedEl)) clearSelection();
}

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
// Every pane holds placeholder text for now; the real per-tool controls go
// into the markup later.
// ============================================================

const TOOL_PANEL_TOOLS = new Set(['text', 'image', 'button', 'section', 'embed']);

function openToolPanel(tool) {
    const panel = document.getElementById('toolPanel');
    if (!panel) return;

    const panes = panel.querySelectorAll('.tool-panel__pane');
    panes.forEach(pane => {
        pane.classList.toggle('is-active', pane.dataset.toolPane === tool);
    });

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

    panel.hidden = false;
}

function closeToolPanel() {
    const panel = document.getElementById('toolPanel');
    if (panel) panel.hidden = true;

    // Mirror of the sync in openToolPanel(). Without it a pane keeps holding
    // the element it was editing after the panel closes — including one that
    // has since been trashed off the canvas.
    syncTextPanel(null);
}

/** Re-clicking the active tool: hide its panel, or bring it back if hidden. */
function toggleToolPanel(tool) {
    if (!TOOL_PANEL_TOOLS.has(tool)) return;

    const panel = document.getElementById('toolPanel');
    if (!panel) return;

    if (panel.hidden) openToolPanel(tool);
    else closeToolPanel();
}
