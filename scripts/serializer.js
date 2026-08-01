// ============================================================
// CANVAS SERIALIZER  (DOM -> node tree)
//
// The exact inverse of renderer.js: it walks what is on the canvas and
// rebuilds the `sections` tree that would render it again. This is what a
// save is made of.
//
// It exists because the canvas DOM is still the only copy of a page — there is
// no in-memory project object (docs/DATA_MODEL.md), so there is nothing else
// to serialize. That makes this file a *projection* of the DOM, not a second
// model living alongside it: it holds no state, is never consulted while
// editing, and runs only when a project is saved. When the real project tree
// lands (TODO Phase 1, item 3) the tree becomes the thing that is saved and
// this file goes away — nothing else needs to change for that, because the
// shape it produces is already the shape that tree will hold.
//
// Three things are deliberately *not* serialized:
//
//   the Section builder's draft   [data-draft] is a composition in progress,
//                                 not content. Its ids are temporary.
//   the blank-canvas placeholder  chrome, restored by the renderer when a
//                                 project turns out to be empty.
//   editor chrome inside a node   drag handles, drop indicators. Everything
//                                 here walks `[data-node-id]` children only,
//                                 so these are skipped by construction rather
//                                 than by a list of class names to maintain.
//
// The whitelists come from renderer.js rather than being restated here; the
// action model comes from link-controls.js and the user-style ledger from
// node-style.js. Every one of those is somebody else's single source of truth
// and reading it back is not a reason to make a second one. Assets are the
// one thing left out: an image's `src` is serialized exactly as it sits on the
// canvas, and project.js swaps blob URLs for asset ids on the way to storage.
// ============================================================

import {
    STYLE_PROP_TO_JS, LAYOUT_PROP_TO_JS, CONTAINER_NODE_TYPES, IMAGE_CHILD_STYLE_PROPS
} from './renderer.js';
import { sanitizeInlineHtml } from './text-panel.js';
import { readActionFromEl } from './link-controls.js';
import { readUserStyleLedger } from './node-style.js';

// Leaves whose copy lives in `content`, mirroring renderCopyLeaf().
const COPY_LEAF_TYPES = new Set(['heading', 'text', 'button']);

/**
 * Serialize a canvas frame's committed content into a `sections` array.
 * @param {Element} frameEl - The canvas frame to read.
 * @returns {Array} Section nodes, in document order.
 */
export function serializeCanvas(frameEl) {
    if (!frameEl) return [];

    return Array.from(frameEl.children)
        .filter(isCommittedNode)
        .map(serializeNode);
}

/**
 * Serialize one rendered element and its descendants back into a node.
 * @param {Element} el - An element carrying data-node-id.
 * @returns {Object} The node.
 */
export function serializeNode(el) {
    const type = el.dataset.nodeType || 'group';
    const node = { id: el.dataset.nodeId, type: type };

    if (el.dataset.nodeName) node.name = el.dataset.nodeName;
    if (el.dataset.nodeRole) node.role = el.dataset.nodeRole;

    if (CONTAINER_NODE_TYPES.has(type)) {
        const layout = readLayout(el);
        if (layout) node.layout = layout;

        node.children = Array.from(el.children).filter(isCommittedNode).map(serializeNode);
    } else {
        readLeafContent(node, el, type);
    }

    const base = readStyle(el, type);
    if (base) node.style = { base: base };

    const meta = readMeta(el, type);
    if (meta) node.meta = meta;

    return node;
}

/**
 * A rendered content node, as opposed to editor chrome (a drag handle, the
 * blank-canvas placeholder) or the Section builder's draft.
 */
function isCommittedNode(el) {
    return !!el.dataset.nodeId && !el.hasAttribute('data-draft');
}

// ---- leaves -----------------------------------------------------------

function readLeafContent(node, el, type) {
    if (COPY_LEAF_TYPES.has(type)) {
        // An empty leaf renders its placeholder *as its text*, so reading the
        // element back without this check would save the placeholder as
        // content the user had typed — and the slot would stop being a slot.
        // `is-empty` is the same signal renderCopyLeaf() derived on the way in.
        node.content = el.classList.contains('is-empty')
            ? ''
            : sanitizeInlineHtml(el.innerHTML).html;
        node.placeholder = el.dataset.placeholder || '';
        return;
    }

    if (type === 'image') {
        const img = el.querySelector('img');
        // getAttribute rather than .src: the property resolves to an absolute
        // URL, which would rewrite a relative path into one tied to whatever
        // address the editor happened to be served from.
        node.src = img ? img.getAttribute('src') : null;
        node.alt = img ? img.getAttribute('alt') || '' : '';
        node.placeholder = el.dataset.placeholder || '';
        return;
    }

    if (type === 'embed') {
        node.placeholder = el.dataset.placeholder || el.textContent || '';
    }

    // `icon` and `divider` carry no content of their own — their node is
    // identity, role and style, all of which are read above.
}

// ---- layout and style -------------------------------------------------

/**
 * Read a container's layout back off its flex declarations. Returns null when
 * nothing but the renderer's own `display: flex` was set, so an unstyled
 * container serializes without an empty `layout` object.
 */
function readLayout(el) {
    const layout = {};

    Object.keys(LAYOUT_PROP_TO_JS).forEach(prop => {
        const value = el.style[LAYOUT_PROP_TO_JS[prop]];
        if (!value) return;

        // `wrap` is a keyword in CSS and a boolean in the model.
        layout[prop] = prop === 'wrap' ? value === 'wrap' : value;
    });

    return Object.keys(layout).length ? layout : null;
}

/**
 * Read a node's whitelisted inline styles into a `style.base` object, or null
 * when it has none.
 *
 * Properties are read by name rather than by walking el.style, because a
 * shorthand the editor writes as a shorthand — `flex: 0 0 40%` for a column
 * width — enumerates as its longhands, none of which the whitelist names. It
 * would have vanished on save.
 */
function readStyle(el, type) {
    const base = {};

    Object.keys(STYLE_PROP_TO_JS).forEach(prop => {
        if (IMAGE_CHILD_STYLE_PROPS.has(prop)) return;

        const value = el.style[STYLE_PROP_TO_JS[prop]];
        if (value) base[prop] = value;
    });

    // The two that live on the inner <img> — the wrapper is where every other
    // image declaration lands, so these have to be fetched from the child the
    // renderer put them on.
    if (type === 'image') {
        const img = el.querySelector('img');
        if (img) {
            IMAGE_CHILD_STYLE_PROPS.forEach(prop => {
                const value = img.style[STYLE_PROP_TO_JS[prop]];
                if (value) base[prop] = value;
            });
        }
    }

    return Object.keys(base).length ? base : null;
}

/**
 * A node's `meta`: its link action, plus the record of which style
 * declarations were the user's rather than the layout's.
 *
 * The ledger is read off the node's own element only. An image's object-fit is
 * written to the inner `<img>`, so its ledger entry lives there and is not
 * carried across a save — deliberately, because the ledger's only consumer is
 * the Themes tab's wipe, and no property that can land on that child is
 * theme-derived. The declaration itself still round-trips through `style.base`.
 */
function readMeta(el, type) {
    const meta = COPY_LEAF_TYPES.has(type) || el.dataset.nodeRole === 'nav-link'
        ? readActionFromEl(el) || {}
        : {};

    const userStyled = readUserStyleLedger(el);
    if (userStyled.length) meta.userStyled = userStyled;

    return Object.keys(meta).length ? meta : null;
}
