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
import { refreshCanvasEmptyState } from './renderer.js';
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
 * Give every top-level section on the canvas a grab handle. Safe to call
 * after each insert — sections that already have one are skipped.
 */
export function addSectionDragHandles(frameEl) {
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

export function removeDropIndicator() {
    if (dropIndicator) dropIndicator.remove();
}
