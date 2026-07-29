// ============================================================
// ASSET STORE
//
// The site's uploaded images, and nothing else — no DOM, no panel, no canvas.
// Both views of the library (the right panel's Assets tab and the Image
// pane's Source grid) render from listAssets() and re-render on subscribe(),
// so neither has to know the other exists.
//
// Storage is **in memory only**: a Map of blobs behind URL.createObjectURL.
// Nothing survives a reload, which is where the rest of the editor is too —
// there is no project object and no backend yet (docs/DATA_MODEL.md), so the
// canvas doesn't survive one either. This file is the single seam that
// changes when there is somewhere real to put them: the four functions below
// keep their shape and grow a promise.
//
// Object URLs are revoked in removeAsset(). Nothing else may revoke them —
// a revoked URL is a broken image everywhere it was used, and the caller is
// responsible for clearing those first (see assets-panel.js).
// ============================================================

const assets = new Map();
const subscribers = new Set();

let nextId = 1;

/**
 * Take in files, keep the images, hand back the ones that were accepted.
 *
 * Non-images are dropped silently. The file input carries accept="image/*",
 * so the only way one arrives is a drag-and-drop, where an error message for
 * something the user obviously didn't mean to add would be noise.
 */
export function addFiles(files) {
    const added = [];

    Array.from(files || []).forEach(file => {
        if (!file || !file.type || !file.type.startsWith('image/')) return;

        const asset = {
            id: 'asset_' + nextId++,
            name: file.name || 'image',
            url: URL.createObjectURL(file),
            size: file.size || 0,
            width: 0,
            height: 0
        };

        assets.set(asset.id, asset);
        added.push(asset);
        measure(asset);
    });

    if (added.length) notify();
    return added;
}

/** Every asset, in the order they were added. */
export function listAssets() {
    return Array.from(assets.values());
}

export function getAsset(id) {
    return assets.get(id) || null;
}

/**
 * The asset a canvas image is showing, or null if it isn't showing one of
 * ours. This is how a pane syncs its Source grid to the selected element
 * without storing an asset id on the node — there is no model to store it in
 * yet, so the rendered `src` is the only record.
 */
export function findAssetByUrl(url) {
    if (!url) return null;
    return listAssets().find(asset => asset.url === url) || null;
}

/**
 * Forget an asset and release its blob. Anything still pointing at its URL
 * breaks, so callers clear those references first.
 */
export function removeAsset(id) {
    const asset = assets.get(id);
    if (!asset) return;

    URL.revokeObjectURL(asset.url);
    assets.delete(id);
    notify();
}

/** Re-render me whenever the library changes. Returns an unsubscribe. */
export function subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
}

/**
 * Fill in an asset's natural dimensions once the browser has decoded it. The
 * asset is usable and on screen before this resolves — the size is only shown
 * as a caption, so it isn't worth making every upload wait on a decode.
 */
function measure(asset) {
    const probe = new Image();
    probe.addEventListener('load', () => {
        asset.width = probe.naturalWidth;
        asset.height = probe.naturalHeight;
        notify();
    }, { once: true });
    probe.src = asset.url;
}

function notify() {
    subscribers.forEach(fn => fn());
}
