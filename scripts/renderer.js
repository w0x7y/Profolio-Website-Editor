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

const CONTAINER_NODE_TYPES = new Set(['section', 'row', 'column', 'group']);

// What an empty copy leaf says when its node names no placeholder of its own.
// Shared with text-panel.js, which needs the same answer when the Text pane
// restores a placeholder after the user clears the Content box.
const DEFAULT_PLACEHOLDER = {
    heading: 'Empty heading',
    button: 'Button'
};

export function fallbackPlaceholder(nodeType) {
    return DEFAULT_PLACEHOLDER[nodeType] || 'Empty text';
}

// The same answer for an image node, which has no copy to fall back to.
const DEFAULT_IMAGE_PLACEHOLDER = 'Add an image';

// Whitelisted style props from Node.style.base -> el.style.<jsProp>.
// Keep this in sync with the StyleProps whitelist in docs/DATA_MODEL.md.
const STYLE_PROP_TO_JS = {
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
    color: 'color',
    background: 'background',
    borderRadius: 'borderRadius',
    opacity: 'opacity'
};

/**
 * Render an array of section nodes into a DocumentFragment.
 */
export function renderSections(sections) {
    const fragment = document.createDocumentFragment();
    (sections || []).forEach(section => fragment.appendChild(renderNode(section)));
    return fragment;
}

/**
 * Render a single node (and, recursively, its children) into a DOM element.
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

    if (CONTAINER_NODE_TYPES.has(node.type)) {
        (node.children || []).forEach(child => el.appendChild(renderNode(child)));
    } else {
        renderLeafContent(el, node);
    }

    return el;
}

// Layout values are named after the model, not after CSS — the model says
// `direction` and `wrap`, flexbox says `flex-direction` and `flex-wrap`.
const LAYOUT_PROP_TO_JS = {
    direction: 'flexDirection',
    wrap: 'flexWrap',
    gap: 'gap',
    align: 'alignItems',
    justify: 'justifyContent'
};

/**
 * The one writer of a layout value onto the DOM.
 *
 * applyNodeLayout() below renders a whole node through this, and the Section
 * builder's live edits write single properties through the same function, so a
 * container the builder just edited and the same container re-rendered from its
 * node cannot end up with different CSS.
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
 * The same, for a whitelisted style prop. Unknown props are ignored, which is
 * what keeps StyleProps a whitelist rather than free-form CSS — see the
 * StyleProps block in docs/DATA_MODEL.md.
 */
export function applyStyleProp(el, prop, value) {
    const jsProp = STYLE_PROP_TO_JS[prop];
    if (!jsProp) return;

    el.style[jsProp] = value == null ? '' : value;
}

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
 * node.style.tablet / node.style.mobile are intentionally unused for now —
 * they'll come into play once the device switcher drives real per-breakpoint
 * rendering instead of just resizing the frame.
 */
function applyNodeStyle(el, node) {
    const props = node.style && node.style.base;
    if (!props) return;

    Object.keys(props).forEach(key => applyStyleProp(el, key, props[key]));
}

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

function renderImageLeaf(el, node) {
    // Stamped like data-node-id/type/role, and on every image node rather than
    // only the empty ones — the same reason renderCopyLeaf() stamps it for
    // text. Once the Image pane can remove a filled image, the node's own
    // wording is the only thing that can be restored underneath it, and by
    // then `node` is long gone.
    el.dataset.placeholder = node.placeholder || DEFAULT_IMAGE_PLACEHOLDER;

    setImageLeafSrc(el, node.src, node.alt);
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

function renderEmbedLeaf(el, node) {
    el.classList.add('is-empty');
    el.textContent = node.placeholder || 'Embed';
}

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
 * Append a sections tree to the bottom of the canvas, keeping whatever is
 * already there. This is how layout cards insert content: every layout is
 * additive, so picking Home then About stacks the About sections under the
 * Home ones instead of replacing them.
 *
 * The incoming tree is cloned and its node ids are rewritten so they stay
 * unique against what's already on the canvas — the same layout can be
 * added twice, and some layout files reuse ids internally (repeated project
 * cards, say). data-node-id is the handle later features will use to map a
 * DOM node back to the tree, so duplicates can't be allowed to reach it.
 *
 * Returns the first appended element, or null when the layout had no
 * sections to add.
 */
export function appendSectionsToCanvas(sections, frameEl) {
    if (!frameEl || !sections || sections.length === 0) return null;

    // The empty state is a placeholder, not content — the first real
    // section replaces it.
    const emptyState = frameEl.querySelector('.canvas-frame__empty');
    if (emptyState) emptyState.remove();

    const fragment = renderSections(withUniqueIds(sections, collectNodeIds(frameEl)));
    const firstAdded = fragment.firstElementChild;
    frameEl.appendChild(fragment);
    return firstAdded;
}

/**
 * Put the blank-canvas placeholder back once the last section is gone (e.g.
 * every section has been dragged onto the trash), so an emptied canvas reads
 * as "start here" instead of as a broken, zero-height page.
 */
export function refreshCanvasEmptyState(frameEl) {
    if (!frameEl) return;
    if (frameEl.querySelector('[data-node-id]')) return;
    if (frameEl.querySelector('.canvas-frame__empty')) return;

    frameEl.innerHTML = '';
    frameEl.appendChild(buildCanvasEmptyState());
}

function collectNodeIds(frameEl) {
    const ids = new Set();
    frameEl.querySelectorAll('[data-node-id]').forEach(el => ids.add(el.dataset.nodeId));
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

function assignUniqueIds(node, usedIds) {
    node.id = nextFreeId(node.id || node.type || 'node', usedIds);
    usedIds.add(node.id);
    (node.children || []).forEach(child => assignUniqueIds(child, usedIds));
}

function nextFreeId(base, usedIds) {
    if (!usedIds.has(base)) return base;

    let n = 2;
    while (usedIds.has(`${base}_${n}`)) n++;
    return `${base}_${n}`;
}

export function buildCanvasEmptyState() {
    const wrap = document.createElement('div');
    wrap.className = 'canvas-frame__empty';
    wrap.innerHTML =
        '<svg viewBox="0 0 24 24" class="icon"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h6"/></svg>' +
        '<span>Blank canvas</span>';
    return wrap;
}
