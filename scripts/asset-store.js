// ============================================================
// ASSET STORE
//
// The site's uploaded images, and nothing else — no DOM, no panel, no canvas.
// Both views of the library (the right panel's Assets tab and the Image
// pane's Source grid) render from listAssets() and re-render on subscribe(),
// so neither has to know the other exists.
//
// Two layers, on purpose:
//
//   in memory   a Map of `{ id, name, url, size, width, height }`, where
//               `url` is an object URL. This is what every reader sees, and
//               it is synchronous — the panels index into it while rendering
//               and could not await anything even if they wanted to.
//
//   IndexedDB   the blobs themselves, one row per image, tagged with the
//               project they belong to (storage.js). Object URLs die with the
//               page, so the blob is the only thing worth keeping.
//
// openProjectAssets() bridges them: it reads a project's blobs once when the
// editor opens and mints a fresh object URL for each. Because an object URL
// is different every session, a saved image node cannot store one — it stores
// the asset id, and project.js swaps between the two (see hydrateAssetSrc()).
//
// Writes go both ways at once: addFiles() puts the asset in the Map and
// returns immediately, so the thumbnail appears on the next frame, while the
// blob is written to IndexedDB in the background. A failed write is reported
// through onStorageError() rather than thrown at the caller, which is
// mid-render and has nothing useful to do with it.
//
// Object URLs are revoked in removeAsset() and closeProjectAssets(). Nothing
// else may revoke them — a revoked URL is a broken image everywhere it was
// used, and the caller is responsible for clearing those first (see
// assets-panel.js).
// ============================================================

import { listProjectAssets, putAsset, deleteAsset } from './storage.js';

const assets = new Map();
const subscribers = new Set();
const storageErrorHandlers = new Set();

let nextId = 1;
let currentProjectId = null;

/**
 * Load a project's stored images and make them the live library.
 *
 * Called once, before the canvas renders, so an image node's asset id can be
 * resolved to a URL by the time the renderer asks for it.
 *
 * @param {string} projectId
 * @returns {Promise<void>}
 */
export async function openProjectAssets(projectId) {
    closeProjectAssets();
    currentProjectId = projectId || null;
    if (!currentProjectId) return;

    const rows = await listProjectAssets(currentProjectId);

    rows.forEach(row => {
        assets.set(row.id, {
            id: row.id,
            name: row.name || 'image',
            url: URL.createObjectURL(row.blob),
            size: row.size || 0,
            width: 0,
            height: 0
        });
        measure(assets.get(row.id));
    });

    // Ids are handed out as `asset_<n>`; restarting the counter at 1 would
    // reuse an id that is already in this project's tree and silently point
    // two nodes at the same image.
    nextId = rows.reduce((max, row) => Math.max(max, idNumber(row.id)), 0) + 1;

    notify();
}

/**
 * Drop the in-memory library and release its object URLs. The blobs stay in
 * IndexedDB — this is closing a project, not deleting one.
 */
export function closeProjectAssets() {
    assets.forEach(asset => URL.revokeObjectURL(asset.url));
    assets.clear();
    currentProjectId = null;
    nextId = 1;
}

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
        persist(asset, file);
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
 * without storing an asset id on the node, and how a save turns the object URL
 * on the canvas back into the id it will be stored under.
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

    deleteAsset(id).catch(err => reportStorageError(err, asset));
}

/** Re-render me whenever the library changes. Returns an unsubscribe. */
export function subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
}

/**
 * Be told when an image could not be written to (or removed from) storage —
 * the editor shows it as a failed save rather than letting an upload look
 * like it worked and then vanish on reload. Returns an unsubscribe.
 */
export function onStorageError(fn) {
    storageErrorHandlers.add(fn);
    return () => storageErrorHandlers.delete(fn);
}

/**
 * Write the blob behind an asset. Fire-and-forget: the upload is already on
 * screen, and making the UI wait on a disk write would only add latency to
 * something that has no failure the user can act on mid-upload.
 */
function persist(asset, blob) {
    if (!currentProjectId) return;

    putAsset({
        id: asset.id,
        projectId: currentProjectId,
        name: asset.name,
        size: asset.size,
        blob: blob
    }).catch(err => reportStorageError(err, asset));
}

function reportStorageError(err, asset) {
    storageErrorHandlers.forEach(fn => fn(err, asset));
}

/** The numeric half of an `asset_<n>` id, or 0 for anything else. */
function idNumber(id) {
    const match = /^asset_(\d+)$/.exec(String(id || ''));
    return match ? Number(match[1]) : 0;
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
