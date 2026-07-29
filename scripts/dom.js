// ============================================================
// SHARED DOM HANDLES
//
// The app's singleton elements, and the one class-toggling idiom every
// group of mutually-exclusive controls uses.
//
// The elements are written into index.html once and never replaced, so each
// lookup is done once and kept. They are accessors rather than module-level
// constants because these modules are evaluated before the DOM is ready —
// a `const frame = document.querySelector(...)` at module scope would
// capture null forever.
// ============================================================

let _canvasFrame = null;
let _toolPanel = null;
let _canvasTrash = null;

/** The canvas frame every rendered node lives in. */
export function canvasFrame() {
    if (!_canvasFrame) _canvasFrame = document.querySelector('.canvas-frame');
    return _canvasFrame;
}

/** The left tool panel. */
export function toolPanel() {
    if (!_toolPanel) _toolPanel = document.getElementById('toolPanel');
    return _toolPanel;
}

/** The right panel's drop-to-delete zone. */
export function canvasTrash() {
    if (!_canvasTrash) _canvasTrash = document.getElementById('canvasTrash');
    return _canvasTrash;
}

/**
 * Mark exactly one element in `nodes` active, clearing `is-active` from the
 * rest. The toolbar, the right panel's tabs and panes, the device switcher,
 * the tool panel's panes and the theme cards are all this same operation.
 */
export function activateOne(nodes, isActive) {
    nodes.forEach(node => node.classList.toggle('is-active', !!isActive(node)));
}
