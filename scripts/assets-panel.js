// ============================================================
// ASSETS TAB  (right panel -> Assets)
//
// The upload button and the library grid under it. The button opens the
// upload modal; the box is also a drop target in its own right, so dropping
// files straight onto the panel skips the modal entirely — the faster path
// once you know it's there.
//
// The grid is subscribed to asset-store.js rather than repainted by whoever
// happened to add a file, so an upload started from the Image pane's Upload
// button shows up here too. Neither panel imports the other; the store is the
// only thing they have in common.
//
// This file also owns the one place asset deletion touches the canvas: an
// asset's blob URL is revoked when it is removed, and any image still
// pointing at it would silently become a broken image with no way back. So
// the nodes using it are reset to their dashed placeholder first.
// ============================================================

import { canvasFrame } from './dom.js';
import { addFiles, removeAsset, subscribe } from './asset-store.js';
import { openUploadModal, wireDropZone } from './upload-modal.js';
import { renderAssetGrid } from './asset-grid.js';
import { setImageLeafSrc } from './renderer.js';

let grid = null;

export function initAssetsPanel() {
    grid = document.getElementById('assetGrid');
    const upload = document.getElementById('assetUpload');
    if (!grid || !upload) return;

    upload.addEventListener('click', openUploadModal);
    wireDropZone(upload, addFiles);

    subscribe(render);
    render();
}

function render() {
    renderAssetGrid(grid, {
        emptyText: 'No images yet.',
        onDelete: deleteAsset
    });
}

/**
 * Drop an asset, after taking it off the canvas.
 *
 * Order matters: removeAsset() revokes the object URL, and an <img> whose src
 * has been revoked renders as a broken image rather than as an empty slot. So
 * every node showing it goes back to its placeholder first, while the url is
 * still something to match on.
 *
 * The Image pane repaints itself off the same store change — it may have been
 * editing one of the nodes just emptied — so nothing here reaches into it.
 *
 * Not undoable, like every other canvas write in the editor today.
 */
function deleteAsset(asset) {
    const frame = canvasFrame();

    if (frame) {
        frame.querySelectorAll('.node--image img').forEach(img => {
            // `img.src` is the resolved absolute URL; a blob: url already is
            // one, so this compares like with like.
            if (img.src !== asset.url) return;
            setImageLeafSrc(img.parentElement, null);
        });
    }

    removeAsset(asset.id);
}
