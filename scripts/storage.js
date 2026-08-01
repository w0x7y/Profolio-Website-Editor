// ============================================================
// PERSISTENCE  (IndexedDB)
//
// Where a project and its uploaded images actually live between sessions.
// Two object stores in one database:
//
//   projects   the Project records themselves (see docs/DATA_MODEL.md), keyed
//              by id. Plain JSON — structured-clonable, nothing derived.
//   assets     one row per uploaded image, holding the File/Blob itself and
//              indexed by projectId so a project's images can be fetched as a
//              set, and deleted with it.
//
// IndexedDB rather than localStorage for both halves. Images are the reason —
// localStorage stores strings, so blobs would have to be base64'd into the
// project JSON and would blow past its ~5MB cap after two or three photos.
// Once the database exists for the images there is nothing left for
// localStorage to be better at, and one store means saving a project and its
// assets is one mechanism rather than two that can disagree.
//
// This file knows nothing about node trees, canvases or panels: it takes
// objects with an `id` and gives them back. serializer.js decides what a
// project record *contains*; project.js decides *when* one is written.
//
// Every export returns a promise. IndexedDB has no synchronous mode, which is
// why asset-store.js loads a project's images once up front and keeps them in
// memory — the panels that read it stayed synchronous.
// ============================================================

const DB_NAME = 'profolio';
const DB_VERSION = 1;

const PROJECT_STORE = 'projects';
const ASSET_STORE = 'assets';
const ASSET_PROJECT_INDEX = 'byProject';

// One connection for the page, opened lazily. Kept as the *promise* rather
// than the database, so concurrent first callers share a single open instead
// of racing two of them.
let dbPromise = null;

function openDb() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;

            if (!db.objectStoreNames.contains(PROJECT_STORE)) {
                db.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
            }

            if (!db.objectStoreNames.contains(ASSET_STORE)) {
                const assets = db.createObjectStore(ASSET_STORE, { keyPath: 'id' });
                // What makes "every image in this project" a lookup rather
                // than a full scan, and what deleteProject() deletes through.
                assets.createIndex(ASSET_PROJECT_INDEX, 'projectId', { unique: false });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        // Fires when another tab holds an older version open. Nothing to
        // resolve with, so surface it rather than hanging forever.
        request.onblocked = () => reject(new Error('The database is open in another tab'));
    });

    // A failed open must not be cached as the answer for the rest of the
    // session — the next caller should get to try again.
    dbPromise.catch(() => { dbPromise = null; });

    return dbPromise;
}

/**
 * Run `work` inside one transaction and resolve with whatever it returns,
 * once the transaction has actually committed.
 *
 * Resolving on `oncomplete` rather than on the request is the point: a write
 * whose request succeeded but whose transaction later aborted did not happen,
 * and a save that reported success in that case would be lying.
 *
 * @param {string|string[]} storeNames - Store(s) the transaction covers.
 * @param {IDBTransactionMode} mode - 'readonly' or 'readwrite'.
 * @param {(tx: IDBTransaction) => *} work - Given the transaction; its return
 *   value (or the value of any request it returns) becomes the result.
 * @returns {Promise<*>}
 */
async function withTransaction(storeNames, mode, work) {
    const db = await openDb();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeNames, mode);
        let result;

        try {
            result = work(tx);
        } catch (err) {
            tx.abort();
            reject(err);
            return;
        }

        tx.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
}

// ---- projects ---------------------------------------------------------

/**
 * Every saved project, newest edit first — the order the dashboard lists them
 * in. Sorting here rather than in the dashboard keeps "what order are
 * projects in" one answer instead of one per caller.
 * @returns {Promise<Object[]>}
 */
export async function listProjects() {
    const projects = await withTransaction(PROJECT_STORE, 'readonly',
        tx => tx.objectStore(PROJECT_STORE).getAll());

    return projects.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

/**
 * One project by id, or null when there is no such record. Null rather than a
 * rejection: "this project is gone" is an ordinary case the editor handles by
 * sending the user back to the dashboard, not an error.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getProject(id) {
    if (!id) return null;

    const project = await withTransaction(PROJECT_STORE, 'readonly',
        tx => tx.objectStore(PROJECT_STORE).get(id));

    return project || null;
}

/**
 * Write a project record, creating or replacing it.
 * @param {Object} project - Must carry an `id`.
 * @returns {Promise<void>}
 */
export function putProject(project) {
    return withTransaction(PROJECT_STORE, 'readwrite', tx => {
        tx.objectStore(PROJECT_STORE).put(project);
    });
}

/**
 * Delete a project and every asset belonging to it.
 *
 * Both stores are in one transaction on purpose: a project removed while its
 * images survived would leave blobs nothing can ever reach or free again.
 * @param {string} id
 * @returns {Promise<void>}
 */
export function deleteProject(id) {
    return withTransaction([PROJECT_STORE, ASSET_STORE], 'readwrite', tx => {
        tx.objectStore(PROJECT_STORE).delete(id);

        const index = tx.objectStore(ASSET_STORE).index(ASSET_PROJECT_INDEX);
        // openKeyCursor: the keys are all that's needed to delete, and it
        // avoids deserializing every image blob just to throw it away.
        const cursorRequest = index.openKeyCursor(IDBKeyRange.only(id));

        cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;

            tx.objectStore(ASSET_STORE).delete(cursor.primaryKey);
            cursor.continue();
        };
    });
}

// ---- assets -----------------------------------------------------------

/**
 * Every stored image belonging to a project, as `{ id, projectId, name, size,
 * blob }` rows. asset-store.js turns these back into object URLs on load.
 * @param {string} projectId
 * @returns {Promise<Object[]>}
 */
export function listProjectAssets(projectId) {
    if (!projectId) return Promise.resolve([]);

    return withTransaction(ASSET_STORE, 'readonly',
        tx => tx.objectStore(ASSET_STORE).index(ASSET_PROJECT_INDEX).getAll(IDBKeyRange.only(projectId)));
}

/**
 * Store one uploaded image.
 * @param {Object} row - `{ id, projectId, name, size, blob }`.
 * @returns {Promise<void>}
 */
export function putAsset(row) {
    return withTransaction(ASSET_STORE, 'readwrite', tx => {
        tx.objectStore(ASSET_STORE).put(row);
    });
}

/**
 * Forget one stored image. Releasing its object URL is the caller's job —
 * this file holds no URLs (see asset-store.js).
 * @param {string} id
 * @returns {Promise<void>}
 */
export function deleteAsset(id) {
    return withTransaction(ASSET_STORE, 'readwrite', tx => {
        tx.objectStore(ASSET_STORE).delete(id);
    });
}
