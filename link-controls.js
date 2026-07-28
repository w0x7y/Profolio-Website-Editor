// ============================================================
// LINK ACTION MODEL + LINK TARGET CONTROLS
//
// Two things live here, because the second is only a UI over the first:
//
//   1. The action model — what a button or link *does*. Held on the canvas
//      element as dataset (there is still no in-memory project object, see
//      docs/DATA_MODEL.md), read by readAction() and written by
//      writeAction(). applyAction() is the one place that turns that state
//      into rendered attributes.
//
//   2. createLinkControls() — the "where does this go" controls: a
//      Section/Address toggle, a section dropdown and an address field.
//
// The controls are built in JS rather than written into index.html because
// the same group is mounted twice — in the Button pane, and in the Text pane
// for link-role text nodes (nav-links). Two copies of the markup would drift
// apart. This is the pattern buildLayoutCard()/buildPageSection() already
// follow in script.js. It also means the group carries no ids, only
// aria-labels: two mounts can't share an id.
//
// The dataset is the model and href is *derived* from it. That's what makes
// the Link/Button toggle non-destructive: flipping to Button and back
// restores the address that was typed, because it was never stored in href
// in the first place.
// ============================================================

const ACTION_TYPES = new Set(['link', 'button']);
const LINK_MODES = new Set(['section', 'url']);

/**
 * Read an element's action state, resolving every default so callers never
 * have to. An element straight out of a layout JSON has its dataset stamped
 * by applyNodeAction(); the href fallback below covers anything that reaches
 * the panel without having gone through the renderer.
 */
function readAction(el) {
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
function writeAction(el, patch) {
    if (!el) return;

    Object.keys(patch).forEach(key => {
        const value = patch[key];
        if (value === '' || value == null) delete el.dataset[key];
        else el.dataset[key] = String(value);
    });

    applyAction(el);
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
function applyAction(el) {
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

/** `#` — the layouts' stub — means "a link with no target chosen yet". */
function linkHref(action) {
    if (action.mode === 'section') return action.sectionId ? '#' + action.sectionId : '#';
    return action.url.trim() || '#';
}

/**
 * Stamp an element's action state from its node, called by the renderer for
 * every leaf that can carry a target. Values in `node.meta` win; `node.href`
 * is the fallback, which is what every layout file ships today.
 */
function applyNodeAction(el, node) {
    const meta = node.meta || {};
    const fromHref = resolveLinkFromHref(node.href);

    setNodeAction(el, 'actionType', meta.actionType);
    setNodeAction(el, 'linkMode', meta.linkMode || fromHref.mode);
    setNodeAction(el, 'sectionId', meta.sectionId || fromHref.sectionId);
    setNodeAction(el, 'url', meta.url || fromHref.url);
    setNodeAction(el, 'onClick', meta.onClick);

    applyAction(el);
}

function setNodeAction(el, key, value) {
    if (value === '' || value == null) delete el.dataset[key];
    else el.dataset[key] = String(value);
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
function createLinkControls() {
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
    const frame = document.querySelector('.canvas-frame');
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

// ---- shared widgets ---------------------------------------------------

/**
 * A segmented control: one button per option, exactly one active. Used for
 * Link/Button and for Section/Address.
 */
function buildSegmented(options, label, onChange) {
    const root = document.createElement('div');
    root.className = 'segmented';
    root.setAttribute('role', 'radiogroup');
    root.setAttribute('aria-label', label);

    options.forEach(option => {
        const btn = document.createElement('button');
        btn.className = 'segmented__btn';
        btn.type = 'button';
        btn.dataset.value = option.value;
        btn.textContent = option.label;
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', 'false');

        btn.addEventListener('click', () => {
            setSegmentedValue(root, option.value);
            onChange(option.value);
        });

        root.appendChild(btn);
    });

    return root;
}

function setSegmentedValue(root, value) {
    root.querySelectorAll('.segmented__btn').forEach(btn => {
        const on = btn.dataset.value === value;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-checked', String(on));
    });
}

/** A labelled control wrapper, matching the markup the Text pane uses. */
function buildCtrl(label) {
    const ctrl = document.createElement('div');
    ctrl.className = 'ctrl';

    const text = document.createElement('span');
    text.className = 'ctrl__label';
    text.textContent = label;

    ctrl.appendChild(text);
    return ctrl;
}
