// ============================================================
// UPLOAD MODAL
//
// The centered window the Assets tab's upload button opens: one big box that
// takes images two ways — drop them on it, or click it and pick them in the
// file manager.
//
// A native <dialog> opened with showModal(), not a hand-rolled overlay. That
// buys the backdrop, Escape-to-close, the focus trap and making the rest of
// the page inert, all of which would otherwise be code here that has to stay
// correct as the editor grows.
//
// It only knows how to collect files. Where they go is asset-store.js's
// problem, and what happens to the panels afterwards is theirs — both grids
// are subscribed to the store, so they repaint on their own.
//
// The drop-zone handlers are shared with the Assets tab, which is a drop
// target in its own right: dropping straight onto the panel skips the modal
// entirely. One wireDropZone() rather than two copies of the same three
// listeners.
// ============================================================

import { addFiles } from './asset-store.js';

let dialog = null;

export function initUploadModal() {
    dialog = document.getElementById('uploadDialog');
    if (!dialog) return;

    const zone = document.getElementById('uploadDropZone');
    const input = document.getElementById('uploadFileInput');
    const close = document.getElementById('uploadDialogClose');

    // Clicking the box is the second of the two ways in: it opens the file
    // manager through a hidden input, since a file picker can only be opened
    // by a real user gesture on an <input type="file">.
    zone.addEventListener('click', () => input.click());

    input.addEventListener('change', () => {
        acceptFiles(input.files);
        // Reset, or picking the same file twice in a row fires no change event
        // the second time and the upload silently does nothing.
        input.value = '';
    });

    wireDropZone(zone, acceptFiles);

    close.addEventListener('click', () => dialog.close());

    // Clicking the backdrop closes it. The click lands on the <dialog> itself
    // rather than on any of its children, which is the only way to tell the
    // two apart — the backdrop is a pseudo-element and can't have a listener.
    dialog.addEventListener('click', e => {
        if (e.target === dialog) dialog.close();
    });
}

export function openUploadModal() {
    if (dialog) dialog.showModal();
}

/**
 * Make an element accept dropped files.
 *
 * `dragover` must preventDefault() on every event or the browser treats the
 * drop as navigation and replaces the editor with the dropped image.
 * `dragleave` fires when the pointer crosses into a child too, so the
 * highlight is cleared on `drop` as well to avoid it sticking on.
 */
export function wireDropZone(el, onFiles) {
    el.addEventListener('dragover', e => {
        e.preventDefault();
        el.classList.add('is-dragging');
    });

    el.addEventListener('dragleave', () => el.classList.remove('is-dragging'));

    el.addEventListener('drop', e => {
        e.preventDefault();
        el.classList.remove('is-dragging');
        onFiles(e.dataTransfer ? e.dataTransfer.files : []);
    });
}

/** Close on success only — nothing accepted means the window stays up. */
function acceptFiles(files) {
    const added = addFiles(files);
    if (added.length && dialog.open) dialog.close();
}
