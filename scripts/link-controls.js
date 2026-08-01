// ============================================================
// LINK ACTION MODEL + LINK TARGET CONTROLS
//
// Two things live here, because the second is only a UI over the first:
//
//   1. The action model — what a button or link *does*. Held on the canvas
//      element as dataset (there is still no in-memory project object, see
//      docs/DATA_MODEL.md), read by readAction() and written by
//      writeAction(). renderActionAttributes() is the one place that turns
//      that state into rendered attributes.
//
//   2. createLinkControls() — the "where does this go" controls: a
//      Section/Address toggle, a section dropdown and an address field.
//
// The controls are built in JS rather than written into index.html because
// the same group is mounted twice — in the Button pane, and in the Text pane
// for link-role text nodes (nav-links). Two copies of the markup would drift
// apart. This is the pattern buildLayoutCard()/buildPageSection() already
// follow in layouts-panel.js. It also means the group carries no ids, only
// aria-labels: two mounts can't share an id.
//
// The dataset is the model and href is *derived* from it. That's what makes
// the Link/Button toggle non-destructive: flipping to Button and back
// restores the address that was typed, because it was never stored in href
// in the first place.
// ============================================================

import { buildSegmented, setSegmentedValue, buildCtrl } from './panel-widgets.js';
import { canvasFrame } from './dom.js';

const ACTION_TYPES = new Set(['link', 'button']);
const LINK_MODES = new Set(['section', 'url']);

/**
 * Read an element's action state, resolving every default so callers never
 * have to. An element straight out of a layout JSON has its dataset stamped
 * by stampActionFromNode(); the href fallback below covers anything that reaches
 * the panel without having gone through the renderer.
 */
export function readAction(el) {
    const data = el.dataset;
    const fallback = resolveLinkFromHref(el.getAttribute && el.getAttribute('href'));

    return {
        type: ACTION_TYPES.has(data.actionType) ? data.actionType : 'link',
        mode: LINK_MODES.has(data.linkMode) ? data.linkMode : (fallback.mode || 'section'),
        sectionId: data.sectionId || fallback.sectionId,
        url: data.url || fallback.url,
        onClick: data.onClick || ''
    };
}

/**
 * Merge a partial action into the element and re-derive its attributes.
 * Empty values are removed rather than stored as "", so readAction()'s
 * defaults stay in charge of what an unset field means.
 */
export function writeAction(el, patch) {
    if (!el) return;

    Object.keys(patch).forEach(key => setActionField(el, key, patch[key]));
    renderActionAttributes(el);
}

/**
 * One field of the action state. Empty values are removed rather than stored
 * as "", so readAction()'s defaults stay in charge of what an unset field
 * means.
 */
function setActionField(el, key, value) {
    if (value === '' || value == null) delete el.dataset[key];
    else el.dataset[key] = String(value);
}

/**
 * Derive the element's rendered attributes from its action state. The single
 * writer of href on a canvas node.
 *
 * A nav-link is a <p> — there is nowhere to hang an href, so its target is
 * stored in the dataset and stops there. Rendering those as real links is the
 * other half of TODO.md:21; when that lands, they start deriving an href
 * through this same path with no change to the panels.
 */
export function renderActionAttributes(el) {
    if (!el || el.tagName !== 'A') return;

    const action = readAction(el);

    if (action.type === 'button') {
        // Not a destination any more. An <a> without an href is also no
        // longer focusable, hence the explicit role and tabindex.
        el.removeAttribute('href');
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        return;
    }

    el.removeAttribute('role');
    el.removeAttribute('tabindex');
    el.setAttribute('href', linkHref(action));
}

// The schemes a portfolio link is allowed to point at. Anything else — most
// of all `javascript:` — is refused and falls back to the `#` stub.
const SAFE_LINK_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * `#` — the layouts' stub — means "a link with no target chosen yet", and is
 * also where an address we won't render lands.
 *
 * The scheme is checked on the *resolved* URL rather than on the raw text.
 * Browsers strip tabs, newlines and control characters out of an href before
 * acting on it, so a pattern match against the typed string is bypassed by
 * `java\nscript:alert(1)`; the URL parser strips them exactly the same way and
 * reports the scheme the browser will actually use. Resolving against the page
 * is also what lets relative paths, bare hosts and `#anchor` through — they
 * inherit the document's own scheme.
 */
function linkHref(action) {
    if (action.mode === 'section') return action.sectionId ? '#' + action.sectionId : '#';

    const url = action.url.trim();
    if (!url) return '#';

    let resolved;
    try {
        resolved = new URL(url, document.baseURI);
    } catch (err) {
        return '#';
    }

    // The user's own text is returned, not the normalized form — the address
    // field should keep rendering what they typed.
    return SAFE_LINK_SCHEMES.has(resolved.protocol) ? url : '#';
}

/**
 * Stamp an element's action state from its node, called by the renderer for
 * every leaf that can carry a target. Values in `node.meta` win; `node.href`
 * is the fallback, which is what every layout file ships today.
 */
export function stampActionFromNode(el, node) {
    const meta = node.meta || {};
    const fromHref = resolveLinkFromHref(node.href);

    writeAction(el, {
        actionType: meta.actionType,
        linkMode: meta.linkMode || fromHref.mode,
        sectionId: meta.sectionId || fromHref.sectionId,
        url: meta.url || fromHref.url,
        onClick: meta.onClick
    });
}

/**
 * The inverse of stampActionFromNode(): an element's action state as the
 * `meta` object a node carries it in, ready to be saved.
 *
 * Only fields that were actually set come back. readAction() resolves every
 * default, which is right for a panel populating its controls and wrong for a
 * save — writing the resolved defaults out would turn "this button never had
 * an action chosen" into "this button is explicitly a section link to
 * nowhere", and that difference is what stampActionFromNode() leans on when it
 * falls back to the layout's `href`.
 *
 * @param {Element} el
 * @returns {Object|null} The node's `meta`, or null when nothing is set.
 */
export function readActionFromEl(el) {
    if (!el) return null;

    const data = el.dataset;
    const meta = {};

    if (ACTION_TYPES.has(data.actionType)) meta.actionType = data.actionType;
    if (LINK_MODES.has(data.linkMode)) meta.linkMode = data.linkMode;
    if (data.sectionId) meta.sectionId = data.sectionId;
    if (data.url) meta.url = data.url;
    if (data.onClick) meta.onClick = data.onClick;

    return Object.keys(meta).length ? meta : null;
}

/**
 * Read a plain href back into {mode, sectionId, url}. A bare `#` is the stub
 * every layout file ships — a link with no target picked yet, not a link to a
 * section whose id is the empty string.
 */
function resolveLinkFromHref(href) {
    const value = String(href == null ? '' : href).trim();

    if (value.startsWith('#')) {
        return { mode: 'section', sectionId: value.slice(1), url: '' };
    }
    if (value) {
        return { mode: 'url', sectionId: '', url: value };
    }
    return { mode: '', sectionId: '', url: '' };
}

// ---- the controls -----------------------------------------------------

/**
 * Build one link-target group.
 *
 * Returns `{ root, sync }` — mount `root` wherever the group belongs, and
 * call `sync(el)` to point it at a canvas element (or at nothing).
 */
export function createLinkControls() {
    let target = null;

    const root = document.createElement('div');
    root.className = 'link-controls';

    const modeSwitch = buildSegmented(
        [{ value: 'section', label: 'Section' }, { value: 'url', label: 'Address' }],
        'Link target',
        mode => {
            showMode(mode);
            writeAction(target, { linkMode: mode });
        }
    );

    const sectionCtrl = buildCtrl('Section');
    const sectionSelect = document.createElement('select');
    sectionSelect.className = 'select';
    sectionSelect.setAttribute('aria-label', 'Link section');
    sectionSelect.addEventListener('change', () => {
        writeAction(target, { sectionId: sectionSelect.value });
    });
    sectionCtrl.appendChild(sectionSelect);

    const urlCtrl = buildCtrl('Address');
    const urlInput = document.createElement('input');
    urlInput.className = 'input';
    urlInput.type = 'text';
    urlInput.spellcheck = false;
    urlInput.placeholder = 'https://example.com';
    urlInput.setAttribute('aria-label', 'Link address');
    // Stored raw and trimmed on the way out — trimming per keystroke would
    // fight the user mid-paste.
    urlInput.addEventListener('input', () => {
        writeAction(target, { url: urlInput.value });
    });
    urlCtrl.appendChild(urlInput);

    root.appendChild(modeSwitch);
    root.appendChild(sectionCtrl);
    root.appendChild(urlCtrl);

    function showMode(mode) {
        sectionCtrl.hidden = mode !== 'section';
        urlCtrl.hidden = mode === 'section';
    }

    function sync(el) {
        target = el || null;
        if (!target) return;

        const action = readAction(target);
        fillSectionOptions(sectionSelect, action.sectionId);
        setSegmentedValue(modeSwitch, action.mode);
        showMode(action.mode);
        urlInput.value = action.url;
    }

    return { root, sync };
}

/**
 * Rebuild the dropdown from the sections currently on the canvas. Done on
 * every sync rather than once, because layout cards and trash-deletion change
 * that list constantly.
 */
function fillSectionOptions(select, selectedId) {
    const sections = canvasSections();
    select.innerHTML = '';

    if (sections.length === 0) {
        select.appendChild(new Option('No sections on the canvas', ''));
        select.disabled = true;
        return;
    }

    select.disabled = false;
    select.appendChild(new Option('Choose a section…', ''));
    sections.forEach(section => select.appendChild(new Option(section.label, section.id)));

    // The target may not be on the canvas: its section was dragged onto the
    // trash, or the href never resolved in the first place (the navbar
    // fixtures ship placeholder anchors like `#Section-1`). Either way, keep
    // it listed and selected rather than silently snapping to whichever
    // section happens to be first — that would rewrite a target the user
    // never touched, without telling them.
    if (selectedId && !sections.some(section => section.id === selectedId)) {
        const unresolved = new Option(`${selectedId} (not on canvas)`, selectedId);
        unresolved.disabled = true;
        select.appendChild(unresolved);
    }

    select.value = selectedId || '';
}

/** The top-level sections on the canvas, in document order. */
function canvasSections() {
    const frame = canvasFrame();
    if (!frame) return [];

    return Array.from(frame.querySelectorAll(':scope > .node--section')).map(el => ({
        id: el.dataset.nodeId,
        label: el.dataset.nodeName || humanizeRole(el.dataset.nodeRole) || el.dataset.nodeId
    }));
}

/** `nav-link` -> `Nav link`, for sections whose node carries no name. */
function humanizeRole(role) {
    if (!role) return '';
    const words = role.replace(/-/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
}

// buildSegmented() / setSegmentedValue() / buildCtrl() used to live here.
// They are generic panel widgets, not link controls — see panel-widgets.js.
