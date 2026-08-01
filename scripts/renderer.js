// ============================================================
// CANVAS RENDERER
//
// Turns a `sections` node tree (see docs/DATA_MODEL.md) into real DOM
// inside the canvas frame. This replaces hardcoded markup entirely: every
// element on the canvas exists because a node in the data model says it
// should, not because it was written into index.html.
//
// Content reaches the canvas two ways: renderSectionsIntoCanvas() replaces
// everything (used for the initial empty state), and
// appendSectionsToCanvas() adds sections below what's already there (used
// by every layout card).
//
// Every rendered element carries data-node-id (+ data-node-type /
// data-node-role) so later work (click-to-select, drag-reorder, the
// layers panel, undo/redo, ...) can map a DOM node back to its place in
// the tree. Section drag-reorder and click-to-select read those
// attributes today (selection.js / section-dnd.js); the rest is still ahead. This
// file only renders — no interactivity is wired up here.
//
// One outward call: leaves that can carry a link target hand off to
// stampActionFromNode() in link-controls.js, which owns that state and is the
// single writer of a node's href.
// ============================================================

import { sanitizeInlineHtml } from './text-panel.js';
import { stampActionFromNode } from './link-controls.js';
import { stampUserStyleLedger } from './node-style.js';

const NODE_TAG_BY_TYPE = {
    section: 'section',
    row: 'div',
    column: 'div',
    group: 'div',
    heading: 'h2',
    text: 'p',
    image: 'div',
    button: 'a',
    icon: 'span',
    divider: 'hr',
    embed: 'div'
};

export const CONTAINER_NODE_TYPES = new Set(['section', 'row', 'column', 'group']);

// What an empty copy leaf says when its node names no placeholder of its own.
// Shared with text-panel.js, which needs the same answer when the Text pane
// restores a placeholder after the user clears the Content box.
const DEFAULT_PLACEHOLDER = {
    heading: 'Empty heading',
    button: 'Button'
};

/**
 * The placeholder a copy leaf shows when its node names none of its own.
 * Shared with text-panel.js, which needs the same answer when restoring a
 * placeholder after the Content box is cleared.
 * @param {string} nodeType
 * @returns {string}
 */
export function fallbackPlaceholder(nodeType) {
    return DEFAULT_PLACEHOLDER[nodeType] || 'Empty text';
}

// The same answer for an image node, which has no copy to fall back to.
const DEFAULT_IMAGE_PLACEHOLDER = 'Add an image';

// Whitelisted style props from Node.style.base -> el.style.<jsProp>.
// Keep this in sync with the StyleProps whitelist in docs/DATA_MODEL.md.
//
// The list has to cover every declaration a tool pane can write, not just the
// ones layout files use. Saving a project reads these back off the canvas
// (serializer.js), so a property a pane writes but this table doesn't name is
// a property that silently disappears on reload. That is what the longhands
// below are doing here: the Text pane writes `background-color` and the two
// `-webkit-text-stroke-*` parts rather than the shorthands, and the Image pane
// writes the three `border-*` parts, `box-shadow`, and object-fit/position.
// Exported so serializer.js can read the same properties back off the canvas.
// A second copy of the list there would be the one that drifts, and the
// symptom — a style that saves but never comes back — is invisible until a
// user reopens a project.
export const STYLE_PROP_TO_JS = {
    padding: 'padding',
    margin: 'margin',
    width: 'width',
    height: 'height',
    flex: 'flex',
    fontFamily: 'fontFamily',
    fontSize: 'fontSize',
    fontWeight: 'fontWeight',
    lineHeight: 'lineHeight',
    letterSpacing: 'letterSpacing',
    textAlign: 'textAlign',
    textTransform: 'textTransform',
    webkitTextStroke: 'webkitTextStroke',
    webkitTextStrokeWidth: 'webkitTextStrokeWidth',
    webkitTextStrokeColor: 'webkitTextStrokeColor',
    color: 'color',
    background: 'background',
    backgroundColor: 'backgroundColor',
    borderRadius: 'borderRadius',
    borderWidth: 'borderWidth',
    borderStyle: 'borderStyle',
    borderColor: 'borderColor',
    boxShadow: 'boxShadow',
    objectFit: 'objectFit',
    objectPosition: 'objectPosition',
    opacity: 'opacity'
};

/**
 * The two style props that belong to an image node's inner `<img>` rather than
 * to the node's own element.
 *
 * An `image` node renders as a wrapper *plus* an `<img>`, but the model gives
 * it one style bag — so these two are declared on the node like any other
 * property and routed to the child on the way out (and read back off it in
 * serializer.js). object-fit and object-position do nothing on the wrapper;
 * everything else the Image pane writes — size, border, radius, shadow,
 * opacity — means something there and stays.
 */
export const IMAGE_CHILD_STYLE_PROPS = new Set(['objectFit', 'objectPosition']);

/**
 * Render an array of section nodes into a DocumentFragment.
 */
export function renderSections(sections) {
    const fragment = document.createDocumentFragment();
    (sections || []).forEach(section => fragment.appendChild(renderNode(section)));
    return fragment;
}

/**
 * Render a node and its descendants into a DOM element.
 * @param {Object} node - The node definition to render.
 * @returns {HTMLElement} The rendered DOM element.
 */
export function renderNode(node) {
    const tag = NODE_TAG_BY_TYPE[node.type] || 'div';
    const el = document.createElement(tag);

    el.classList.add('node', `node--${node.type}`);
    el.dataset.nodeId = node.id;
    el.dataset.nodeType = node.type;
    // Model data the editor needs back, like the ids above: the Button pane's
    // section dropdown labels its options with this.
    if (node.name) el.dataset.nodeName = node.name;
    if (node.role) {
        el.dataset.nodeRole = node.role;
        el.classList.add(`role--${node.role}`);
    }
    applyNodeLayout(el, node);
    applyNodeStyle(el, node);
    // Which of those declarations were the user's rather than the layout's.
    // Re-stamped from the model so a reopened project still knows what a
    // theme change is allowed to wipe — see node-style.js.
    stampUserStyleLedger(el, node.meta && node.meta.userStyled);

    if (CONTAINER_NODE_TYPES.has(node.type)) {
        (node.children || []).forEach(child => el.appendChild(renderNode(child)));
    } else {
        renderLeafContent(el, node);
    }

    return el;
}

// Layout values are named after the model, not after CSS — the model says
// `direction` and `wrap`, flexbox says `flex-direction` and `flex-wrap`.
export const LAYOUT_PROP_TO_JS = {
    direction: 'flexDirection',
    wrap: 'flexWrap',
    gap: 'gap',
    align: 'alignItems',
    justify: 'justifyContent'
};

/**
 * Applies a supported layout property to an element.
 * @param {HTMLElement} el - The element whose layout style to update.
 * @param {string} prop - The model layout property name.
 * @param {*} value - The property value; falsy values clear the corresponding style.
 */
export function applyLayoutProp(el, prop, value) {
    const jsProp = LAYOUT_PROP_TO_JS[prop];
    if (!jsProp) return;

    // `wrap` is a boolean in the model and a keyword in CSS.
    if (prop === 'wrap') {
        el.style.flexWrap = value ? 'wrap' : '';
        return;
    }

    // '' removes the declaration, which is what an unset layout value means.
    el.style[jsProp] = value || '';
}

/**
 * Apply a whitelisted style property to a DOM element.
 * @param {HTMLElement} el - The element to style.
 * @param {string} prop - The model style property name.
 * @param {*} value - The style value, or nullish to clear the property.
 */
export function applyStyleProp(el, prop, value) {
    const jsProp = STYLE_PROP_TO_JS[prop];
    if (!jsProp) return;

    el.style[jsProp] = value == null ? '' : value;
}

/** Put a container's `layout` onto its element as flex declarations. */
function applyNodeLayout(el, node) {
    if (!CONTAINER_NODE_TYPES.has(node.type)) return;

    const layout = node.layout || {};

    el.style.display = 'flex';
    applyLayoutProp(el, 'direction', layout.direction || (node.type === 'row' ? 'row' : 'column'));
    applyLayoutProp(el, 'wrap', layout.wrap);
    applyLayoutProp(el, 'gap', layout.gap);
    applyLayoutProp(el, 'align', layout.align);
    applyLayoutProp(el, 'justify', layout.justify);
}

/**
 * Applies base style overrides defined on a node to its DOM element.
 *
 * The image-only props are held back: their target — the inner `<img>` — does
 * not exist yet at this point in renderNode(), so renderImageLeaf() applies
 * them once it has built one.
 */
function applyNodeStyle(el, node) {
    const props = node.style && node.style.base;
    if (!props) return;

    Object.keys(props)
        .filter(key => !IMAGE_CHILD_STYLE_PROPS.has(key))
        .forEach(key => applyStyleProp(el, key, props[key]));
}

/**
 * Apply an image node's inner-`<img>` style props, if it has an `<img>` to
 * apply them to. An unfilled slot renders the placeholder box instead, and
 * has nothing for object-fit to act on.
 */
function applyImageChildStyle(el, node) {
    const props = (node.style && node.style.base) || {};
    const img = el.querySelector('img');
    if (!img) return;

    IMAGE_CHILD_STYLE_PROPS.forEach(key => {
        if (props[key] != null) applyStyleProp(img, key, props[key]);
    });
}

/** Fill in a leaf, dispatching on the one thing each type carries. */
function renderLeafContent(el, node) {
    switch (node.type) {
        case 'heading':
        case 'text':
        case 'button':
            renderCopyLeaf(el, node);
            break;
        case 'image':
            renderImageLeaf(el, node);
            break;
        case 'icon':
            el.classList.add('is-empty');
            break;
        case 'divider':
            // <hr>, nothing further to render
            break;
        case 'embed':
            renderEmbedLeaf(el, node);
            break;
    }
}

/**
 * Write a leaf's copy — the node's content, or its placeholder when empty.
 *
 * The two are written through different sinks on purpose:
 *
 *   content     markup, but only the inline subset. A label or paragraph can
 *               hold the <b>/<i>/<u>/<s> the Text pane's toggles produce, so
 *               it can't be plain text — but `content` is documented as a
 *               *sanitized* fragment (docs/DATA_MODEL.md) and nothing on this
 *               path used to enforce that. sanitizeInlineHtml() is the same
 *               whitelist the Text pane applies on the way in, so a layout
 *               file, a saved project or an import can't smuggle a script,
 *               an <img onerror> or an event-handler attribute onto the canvas.
 *
 *   placeholder copy, never markup. textContent, so there is no sink at all.
 *
 * @param {Element} el
 * @param {string}  html        already sanitized — see renderCopyLeaf
 * @param {boolean} hasContent  false -> fall back to el.dataset.placeholder
 */
function setLeafCopy(el, html, hasContent) {
    if (hasContent) el.innerHTML = html;
    else el.textContent = el.dataset.placeholder;
}

/**
 * Render a leaf that carries copy — `heading`, `text` and `button`, which
 * differ only in their placeholder fallback and are otherwise the same node
 * as far as content, emptiness and link target are concerned.
 *
 * "Empty" is decided by the *sanitized* text rather than the raw content, the
 * same way applyTextContent() decides it in text-panel.js. Content that
 * survives sanitizing as nothing at all — markup with no whitelisted tag and
 * no text — is empty, and falls back to the placeholder instead of rendering
 * as a blank node the user can't see or select.
 */
function renderCopyLeaf(el, node) {
    const clean = sanitizeInlineHtml(node.content || '');
    const hasContent = !!clean.text.trim();

    // Stamped like data-node-id/type/role: model data the editor needs back.
    // An empty node holds its placeholder as text, so without this the Text
    // panel would read that placeholder as content the user had typed — and
    // would have nothing to restore once the content is cleared again.
    el.dataset.placeholder = node.placeholder || fallbackPlaceholder(node.type);

    el.classList.toggle('is-empty', !hasContent);
    // `clean` from above, not node.content — sanitizing once per leaf rather
    // than twice. Each pass builds a whole inert document.
    setLeafCopy(el, clean.html, hasContent);

    // Leaves that can point somewhere stamp their target here — buttons, and
    // the navbar/footer `nav-link` text nodes. A nav-link's target is stored
    // but not yet rendered as a real link (TODO.md:21); stamping it is what
    // lets the Text pane's Link group edit it. href itself is derived from
    // that state by the one writer of it in link-controls.js.
    stampActionFromNode(el, node);
}

/** An image node: its `<img>` or its dashed upload box, plus the child styles. */
function renderImageLeaf(el, node) {
    // Stamped like data-node-id/type/role, and on every image node rather than
    // only the empty ones — the same reason renderCopyLeaf() stamps it for
    // text. Once the Image pane can remove a filled image, the node's own
    // wording is the only thing that can be restored underneath it, and by
    // then `node` is long gone.
    el.dataset.placeholder = node.placeholder || DEFAULT_IMAGE_PLACEHOLDER;

    setImageLeafSrc(el, node.src, node.alt);
    applyImageChildStyle(el, node);
}

/**
 * Move an image node between its two states: showing an image, or showing the
 * dashed "click to add image" placeholder. `src` of null (or '') is the
 * placeholder.
 *
 * Three callers need this — the renderer above, the Image pane's asset picker
 * and Remove button, and asset deletion resetting the images that used a
 * deleted asset. It lives here so the placeholder's markup and the `is-empty`
 * class have exactly one definition; a copy in the panel would drift the first
 * time either changed.
 */
export function setImageLeafSrc(el, src, alt) {
    const hasSrc = !!src;
    el.classList.toggle('is-empty', !hasSrc);

    if (hasSrc) {
        // An existing <img> is reused rather than rebuilt, so the object-fit
        // and object-position the Image pane wrote on it survive swapping
        // which asset it shows.
        const img = el.querySelector('img') || document.createElement('img');
        img.src = src;
        img.alt = alt || '';

        // Also clears the placeholder's svg + span when coming from empty.
        el.replaceChildren(img);
        return;
    }

    el.innerHTML =
        '<svg viewBox="0 0 24 24" class="node-image__icon">' +
        '<rect x="3" y="4" width="18" height="16" rx="2"/>' +
        '<circle cx="8.5" cy="9.5" r="1.5"/>' +
        '<path d="M21 16l-5.5-5.5L4 21"/></svg>' +
        `<span>${escapeHtml(el.dataset.placeholder || DEFAULT_IMAGE_PLACEHOLDER)}</span>`;
}

/** Embeds have no renderer yet — they draw as a labelled empty box. */
function renderEmbedLeaf(el, node) {
    el.classList.add('is-empty');
    el.textContent = node.placeholder || 'Embed';
}

/**
 * Escape a string for interpolation into markup. The placeholder inside the
 * empty-image box is the one caller — copy that is never allowed to be markup.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ---- wiring into the canvas frame ----

/**
 * Render a sections tree into the given canvas frame element, replacing
 * whatever was there before. Falls back to the blank-canvas empty state
 * when there are no sections (e.g. the "Blank" layout).
 */
export function renderSectionsIntoCanvas(sections, frameEl) {
    if (!frameEl) return;
    frameEl.innerHTML = '';

    if (!sections || sections.length === 0) {
        frameEl.appendChild(buildCanvasEmptyState());
        return;
    }

    frameEl.appendChild(renderSections(sections));
}

/**
 * Append sections to the canvas while preserving existing committed content.
 * New node IDs are made unique, and sections are inserted before any draft element.
 * @param {Array} sections - The section nodes to append.
 * @param {HTMLElement} frameEl - The canvas frame receiving the sections.
 * @return {HTMLElement|null} The first inserted element, or `null` when no sections are added.
 */
export function appendSectionsToCanvas(sections, frameEl) {
    if (!frameEl || !sections || sections.length === 0) return null;

    // The empty state is a placeholder, not content — the first real
    // section replaces it.
    const emptyState = frameEl.querySelector('.canvas-frame__empty');
    if (emptyState) emptyState.remove();

    const fragment = renderSections(withUniqueIds(sections, collectNodeIds(frameEl)));
    const firstAdded = fragment.firstElementChild;

    // The draft always sits last in the frame, so committed content lands above
    // it. With no draft this is a plain append — insertBefore(null) appends.
    frameEl.insertBefore(fragment, draftElementIn(frameEl));
    return firstAdded;
}

/**
 * Restores the blank-canvas placeholder when the frame has no committed content.
 * Preserves draft content and inserts the placeholder at the beginning of the frame.
 * @param {HTMLElement} frameEl - The canvas frame to update.
 */
export function refreshCanvasEmptyState(frameEl) {
    if (!frameEl) return;
    if (frameEl.querySelector(COMMITTED_NODE_SELECTOR)) return;
    if (frameEl.querySelector('.canvas-frame__empty')) return;

    // Clearing by innerHTML would take the builder's draft with it. The draft
    // renders into this same frame and outlives an emptied canvas — trashing
    // the last committed section while composing is exactly when this runs.
    Array.from(frameEl.children)
        .filter(child => !child.hasAttribute('data-draft'))
        .forEach(child => child.remove());

    // Above the draft, which always sits last.
    frameEl.insertBefore(buildCanvasEmptyState(), frameEl.firstChild);
}

// The Section builder's draft renders into the canvas frame but is not
// committed content: its ids are temporary, it must not get a drag handle, and
// it must not keep the blank-canvas placeholder from coming back. Everything
// that walks the canvas looking for *content* matches this instead of a bare
// [data-node-id]. The second clause is what excludes the draft's descendants,
// which carry node ids of their own.
const COMMITTED_NODE_SELECTOR = '[data-node-id]:not([data-draft]):not([data-draft] *)';

/** The draft section being composed in this frame, or null. */
export function draftElementIn(frameEl) {
    return frameEl ? frameEl.querySelector(':scope > [data-draft]') : null;
}

/**
 * Collects identifiers from committed nodes within a canvas frame.
 * @param {HTMLElement} frameEl - The canvas frame to inspect.
 * @returns {Set<string>} The set of committed node identifiers.
 */
function collectNodeIds(frameEl) {
    const ids = new Set();
    frameEl.querySelectorAll(COMMITTED_NODE_SELECTOR).forEach(el => ids.add(el.dataset.nodeId));
    return ids;
}

/**
 * Deep-clone a sections tree, giving every node an id that isn't in
 * `usedIds` yet. The clone matters: layout JSON is fetched once and kept in
 * memory, so the source tree has to stay pristine for the next insert.
 */
function withUniqueIds(sections, usedIds) {
    const clone = JSON.parse(JSON.stringify(sections));
    clone.forEach(node => assignUniqueIds(node, usedIds));
    return clone;
}

/** Walk a cloned subtree giving every node an id not already in `usedIds`. */
function assignUniqueIds(node, usedIds) {
    node.id = nextFreeId(node.id || node.type || 'node', usedIds);
    usedIds.add(node.id);
    (node.children || []).forEach(child => assignUniqueIds(child, usedIds));
}

/** `base`, or `base_2`, `base_3`… — the first one not already taken. */
function nextFreeId(base, usedIds) {
    if (!usedIds.has(base)) return base;

    let n = 2;
    while (usedIds.has(`${base}_${n}`)) n++;
    return `${base}_${n}`;
}

/**
 * The "Blank canvas" placeholder. Chrome, not content: it carries no node id,
 * so nothing that walks the canvas for content ever sees it.
 * @returns {HTMLElement}
 */
export function buildCanvasEmptyState() {
    const wrap = document.createElement('div');
    wrap.className = 'canvas-frame__empty';
    wrap.innerHTML =
        '<svg viewBox="0 0 24 24" class="icon"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h6"/></svg>' +
        '<span>Blank canvas</span>';
    return wrap;
}
