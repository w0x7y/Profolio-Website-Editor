// ============================================================
// THE OPEN PROJECT
//
// Which project the editor has open, how it gets onto the canvas, and how it
// gets back to storage. This is the answer to TODO Phase 1, items 3-5.
//
// The editor never opens without a project: editor.html is reached as
// `editor.html?project=<id>`, and an id that names nothing — a stale bookmark,
// a project deleted from another tab — sends the user back to the dashboard
// rather than opening an editor whose Save would have nowhere to go.
//
// Load order matters and is enforced in openProject():
//
//   1. the record          from IndexedDB, or bail out to the dashboard
//   2. the project's images so an image node's asset id can resolve to a URL
//      (asset-store.js)     by the time the renderer asks for its `src`
//   3. the saved theme     applied with wipeOverrides:false, because the
//                          per-node colors it would normally clear are the
//                          ones step 4 is about to render
//   4. the sections        rendered, then given their drag handles
//   5. the change watcher  started last, so the load itself isn't an edit
//
// Saving is the same four in reverse: serializer.js reads the canvas back into
// a tree, the object URLs in it are swapped for asset ids, theme.js hands over
// its state, and storage.js writes the record.
//
// **Why a MutationObserver and not a markDirty() call in every pane.** The
// canvas DOM is still the only copy of a page (docs/DATA_MODEL.md), so every
// edit in the editor is, definitionally, a mutation of it — a layout card
// inserting sections, a drag reordering them, the trash removing one, and
// every tool pane writing to an element. Watching the frame catches all of
// them in one place, including the paths that don't exist yet. The alternative
// was a dirty call at each of a dozen write sites, where the failure mode is a
// missing call: an edit that silently isn't saved, discovered by a user losing
// work. Editor chrome is the noise this has to filter out — see isRealEdit().
//
// The asset id / object URL swap lives here rather than in the renderer or the
// serializer, so both of those stay unaware that an asset store exists.
// ============================================================

import { canvasFrame } from './dom.js';
import { renderSectionsIntoCanvas } from './renderer.js';
import { serializeCanvas } from './serializer.js';
import { addSectionDragHandles } from './section-dnd.js';
import { getThemeState, applyThemeState } from './theme.js';
import { getProject, putProject } from './storage.js';
import { PROJECT_VERSION, pageSections } from './project-record.js';
import {
    openProjectAssets, findAssetByUrl, getAsset, onStorageError
} from './asset-store.js';

const DASHBOARD_URL = 'index.html';

let openRecord = null;      // the record as loaded; the canvas is the live copy
let saveState = 'saved';    // 'saved' | 'unsaved' | 'saving' | 'error'
let observer = null;

const saveStateHandlers = new Set();

// ---- the record -------------------------------------------------------

/** The id in `?project=`, or '' when there isn't one. */
export function projectIdFromUrl() {
    return new URLSearchParams(window.location.search).get('project') || '';
}

/** The name of the project currently open, or '' when none is. */
export function openProjectName() {
    return openRecord ? openRecord.name : '';
}

// ---- opening ----------------------------------------------------------

/**
 * Load the project named in the URL onto the canvas.
 *
 * Resolves to true once a project is open and being watched for changes, and
 * to false when the editor is on its way back to the dashboard instead — in
 * which case the caller should stop setting things up.
 *
 * @returns {Promise<boolean>}
 */
export async function openProject() {
    const id = projectIdFromUrl();

    let record;
    try {
        record = await getProject(id);
    } catch (err) {
        // Storage that can't even be read is not something the editor can
        // work around, and opening an empty canvas over the top of a project
        // that may exist risks saving that emptiness back over it.
        console.error('Could not read saved projects', err);
        record = null;
    }

    if (!record) {
        goToDashboard();
        return false;
    }

    openRecord = record;

    await openProjectAssets(record.id);
    applyThemeState(record.theme);

    const frame = canvasFrame();
    renderSectionsIntoCanvas(hydrateAssetSrc(pageSections(record)), frame);
    addSectionDragHandles(frame);

    watchForChanges(frame);
    setSaveState('saved');

    // An upload that never reached storage would come back as an empty slot
    // on the next open, so it is surfaced the same way a failed save is.
    onStorageError(err => {
        console.error('An image could not be stored', err);
        setSaveState('error');
    });

    return true;
}

/** Send the browser to the dashboard, replacing this entry in history. */
export function goToDashboard() {
    window.location.replace(DASHBOARD_URL);
}

// ---- saving -----------------------------------------------------------

/**
 * Write the canvas, the theme and the project name back to storage.
 * @returns {Promise<boolean>} Whether the write succeeded.
 */
export async function saveProject() {
    if (!openRecord) return false;

    setSaveState('saving');

    const sections = dehydrateAssetSrc(serializeCanvas(canvasFrame()));
    const record = Object.assign({}, openRecord, {
        version: PROJECT_VERSION,
        updatedAt: new Date().toISOString(),
        theme: getThemeState(),
        pages: [Object.assign({}, openRecord.pages[0], { sections: sections })]
    });

    try {
        await putProject(record);
    } catch (err) {
        console.error('Could not save the project', err);
        setSaveState('error');
        return false;
    }

    openRecord = record;

    // Only clean if nothing was edited *while* the write was in flight —
    // otherwise those edits would be marked saved without ever having been
    // written. Edits during a save leave the state where the observer put it.
    if (saveState === 'saving') setSaveState('saved');
    return true;
}

/** Rename the open project. The new name is written on the next save. */
export function renameOpenProject(name) {
    const title = (name || '').trim();
    if (!openRecord || !title || title === openRecord.name) return;

    openRecord = Object.assign({}, openRecord, { name: title });
    setSaveState('unsaved');
}

// ---- assets on the way in and out -------------------------------------

/**
 * Resolve every image node's stored asset id into this session's object URL.
 *
 * An object URL is minted fresh each time a blob is loaded, so it means
 * nothing across a reload and is never what gets stored — `meta.assetId` is.
 * An id whose image is gone resolves to null, which renders as the node's
 * "click to add image" placeholder: the slot goes back to being unfilled
 * rather than showing a broken image.
 */
function hydrateAssetSrc(sections) {
    walkNodes(sections, node => {
        if (node.type !== 'image') return;

        const assetId = node.meta && node.meta.assetId;
        if (!assetId) return;

        const asset = getAsset(assetId);
        node.src = asset ? asset.url : null;
    });

    return sections;
}

/**
 * The inverse: replace the object URL on each image node with the id of the
 * asset it came from. A `src` that isn't one of ours — an ordinary URL — is
 * left alone.
 *
 * An unresolvable `blob:` URL is cleared rather than stored. Object URLs mean
 * nothing outside the session that minted them, so writing one out would save
 * a node that renders as a broken image next time instead of as the empty slot
 * hydrateAssetSrc() describes. Deleting an asset already resets the nodes
 * showing it (`assets-panel.js`), so this is a guard on the invariant rather
 * than a path with a known way in — but a blob URL is never a correct thing to
 * persist, whichever edit path produced it.
 */
function dehydrateAssetSrc(sections) {
    walkNodes(sections, node => {
        if (node.type !== 'image' || !node.src) return;

        const asset = findAssetByUrl(node.src);
        if (!asset) {
            if (String(node.src).startsWith('blob:')) node.src = null;
            return;
        }

        node.src = null;
        node.meta = Object.assign({}, node.meta, { assetId: asset.id });
    });

    return sections;
}

/** Depth-first walk of a sections tree, visiting every node once. */
function walkNodes(nodes, visit) {
    (nodes || []).forEach(node => {
        visit(node);
        walkNodes(node.children, visit);
    });
}

// ---- change tracking --------------------------------------------------

// Canvas elements that are editor chrome rather than content. A mutation that
// only adds, removes or retargets one of these is not an edit.
const CHROME_SELECTOR = '.section-handle, .canvas-drop-line, .canvas-frame__empty';

/**
 * Start marking the project dirty on every real edit to the canvas. Called
 * once, after the project has rendered, so the load itself isn't an edit.
 */
function watchForChanges(frame) {
    if (!frame || observer) return;

    observer = new MutationObserver(mutations => {
        if (mutations.some(isRealEdit)) setSaveState('unsaved');
    });

    observer.observe(frame, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        // `class` is left out because it is how the editor shows state on top
        // of content — is-selected, is-dragging, is-over. The one class that
        // does track content, `is-empty`, is only ever toggled alongside the
        // content change that caused it, which is a childList mutation of its
        // own and marks the project dirty anyway.
        attributeFilter: ['style', 'data-user-styled', 'data-placeholder', 'href',
            'src', 'alt', 'data-action-type', 'data-link-mode', 'data-section-id',
            'data-url', 'data-on-click']
    });
}

/**
 * Whether a mutation represents a change to the *content*, as opposed to the
 * editor drawing on top of it.
 */
function isRealEdit(mutation) {
    if (isChrome(mutation.target) || inDraft(mutation.target)) return false;

    if (mutation.type !== 'childList') return true;

    // A childList mutation that only shuffled chrome — a drag handle being
    // added to a section, the drop line moving between sections during a
    // drag — changed nothing that gets saved.
    const touched = [...mutation.addedNodes, ...mutation.removedNodes];
    return touched.some(node => !isChrome(node));
}

/** Whether a node is one of the editor's own decorations on the canvas. */
function isChrome(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    return node.matches(CHROME_SELECTOR);
}

/** The Section builder's draft is never content — see renderer.js. */
function inDraft(node) {
    const el = node && node.nodeType === Node.ELEMENT_NODE ? node : node && node.parentElement;
    return !!(el && el.closest('[data-draft]'));
}

// ---- save state -------------------------------------------------------

/** The current save state: 'saved' | 'unsaved' | 'saving' | 'error'. */
export function currentSaveState() {
    return saveState;
}

/** Be told when the save state changes. Called immediately with the current one. */
export function onSaveStateChange(fn) {
    saveStateHandlers.add(fn);
    fn(saveState);
    return () => saveStateHandlers.delete(fn);
}

/** Move to a new save state and tell everyone showing it. */
function setSaveState(state) {
    if (state === saveState) return;

    saveState = state;
    saveStateHandlers.forEach(fn => fn(state));
}

/**
 * Warn before leaving with unsaved work. There is no undo and no autosave, so
 * a closed tab is the one way to lose an afternoon.
 */
function guardUnsavedChanges() {
    window.addEventListener('beforeunload', event => {
        if (saveState === 'saved') return;

        // Both halves are required: the modern browsers honour
        // preventDefault(), older ones need returnValue set to something.
        event.preventDefault();
        event.returnValue = '';
    });
}

// ---- the top bar's project name, Save button and state ----------------
//
// The controls that belong to the open project rather than to the canvas.
// They are here, and not in main.js with the device switcher, because all
// three are views of state this file owns; a separate module for two buttons
// would only move the coupling somewhere it is harder to see.

const SAVE_STATE_LABELS = {
    saved: 'All changes saved',
    unsaved: 'Unsaved changes',
    saving: 'Saving…',
    error: 'Couldn’t save'
};

/**
 * Wire the top bar to the open project. Call after openProject() resolves
 * true, so the name field has something to show.
 */
export function initProjectBar() {
    const nameInput = document.getElementById('projectName');
    const saveButton = document.getElementById('saveProject');
    const indicator = document.getElementById('saveState');

    if (nameInput) {
        nameInput.value = openProjectName();
        // Commit on blur and on Enter, not per keystroke: a rename is one
        // decision, and marking the project dirty on every letter would make
        // the indicator flicker through a word being typed.
        nameInput.addEventListener('change', () => renameOpenProject(nameInput.value));
        nameInput.addEventListener('keydown', event => {
            if (event.key === 'Enter') nameInput.blur();
            if (event.key === 'Escape') {
                nameInput.value = openProjectName();
                nameInput.blur();
            }
        });
        // A name emptied and committed falls back to the one still stored,
        // since renameOpenProject() refuses blanks.
        nameInput.addEventListener('blur', () => { nameInput.value = openProjectName(); });
    }

    if (saveButton) saveButton.addEventListener('click', () => saveProject());

    if (indicator) {
        onSaveStateChange(state => {
            indicator.textContent = SAVE_STATE_LABELS[state] || '';
            indicator.dataset.state = state;
        });
    }

    // The shortcut every editor has. Without it the browser offers to save
    // the editor's own HTML, which is never what was meant.
    window.addEventListener('keydown', event => {
        if (!(event.metaKey || event.ctrlKey) || event.key !== 's') return;
        event.preventDefault();
        saveProject();
    });

    guardUnsavedChanges();
}
