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

import { canvasFrame, canvasTrash } from './dom.js';
import { refreshCanvasEmptyState, draftElementIn } from './renderer.js';
import { clearSelectionIfDetached } from './selection.js';

let draggedSection = null;
let dropIndicator = null;

export function initSectionDragAndDrop() {
    const frame = canvasFrame();
    const trash = canvasTrash();
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
 * Add drag handles to each committed top-level section in the canvas.
 * @param {Element} frameEl - The canvas frame containing the sections.
 */
export function addSectionDragHandles(frameEl) {
    if (!frameEl) return;
    frameEl.querySelectorAll(':scope > .node--section:not([data-draft])').forEach(section => {
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

    const trash = canvasTrash();
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
 * Determines which committed section should precede a drop position.
 * @param {Element} frameEl - The canvas frame containing the sections.
 * @param {number} y - The pointer's vertical coordinate.
 * @return {Element|null} The section or draft element to insert before, or `null` when no insertion target exists.
 */
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

/**
 * Displays the insertion indicator at the prospective section drop position.
 * @param {HTMLElement} frameEl - The canvas frame containing the indicator.
 * @param {Element|null} before - The element before which to place the indicator.
 */
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

export function removeDropIndicator() {
    if (dropIndicator) dropIndicator.remove();
}
