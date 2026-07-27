// ============================================================
// CANVAS RENDERER
//
// Turns a `sections` node tree (see docs/DATA_MODEL.md) into real DOM
// inside the canvas frame. This replaces hardcoded markup entirely: every
// element on the canvas exists because a node in the data model says it
// should, not because it was written into index.html.
//
// Content reaches the canvas two ways: renderPageIntoCanvas() replaces
// everything (used for the initial empty state), and
// appendSectionsToCanvas() adds sections below what's already there (used
// by every layout card).
//
// Every rendered element carries data-node-id (+ data-node-type /
// data-node-role) so later work (click-to-select, drag-reorder, the
// layers panel, undo/redo, ...) can map a DOM node back to its place in
// the tree. None of that interactivity is wired up yet — this file only
// renders.
// ============================================================

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
    shape: 'div',
    divider: 'hr',
    embed: 'div'
};

const CONTAINER_NODE_TYPES = new Set(['section', 'row', 'column', 'group']);

// Whitelisted style props from Node.style.base -> el.style.<jsProp>.
// Keep this in sync with the StyleProps whitelist in docs/DATA_MODEL.md.
const STYLE_PROP_TO_JS = {
    padding: 'padding',
    margin: 'margin',
    width: 'width',
    height: 'height',
    fontSize: 'fontSize',
    fontWeight: 'fontWeight',
    lineHeight: 'lineHeight',
    textAlign: 'textAlign',
    color: 'color',
    background: 'background',
    borderRadius: 'borderRadius',
    opacity: 'opacity'
};

/**
 * Render an array of section nodes into a DocumentFragment.
 */
function renderSections(sections) {
    const fragment = document.createDocumentFragment();
    (sections || []).forEach(section => fragment.appendChild(renderNode(section)));
    return fragment;
}

/**
 * Render a single node (and, recursively, its children) into a DOM element.
 */
function renderNode(node) {
    const tag = NODE_TAG_BY_TYPE[node.type] || 'div';
    const el = document.createElement(tag);

    el.classList.add('node', `node--${node.type}`);
    el.dataset.nodeId = node.id;
    el.dataset.nodeType = node.type;
    if (node.role) {
        el.dataset.nodeRole = node.role;
        el.classList.add(`role--${node.role}`);
    }
    if (node.locked) el.dataset.locked = 'true';

    applyNodeLayout(el, node);
    applyNodeStyle(el, node);

    if (CONTAINER_NODE_TYPES.has(node.type)) {
        (node.children || []).forEach(child => el.appendChild(renderNode(child)));
    } else {
        renderLeafContent(el, node);
    }

    return el;
}

function applyNodeLayout(el, node) {
    if (!CONTAINER_NODE_TYPES.has(node.type)) return;

    const layout = node.layout || {};
    const direction = layout.direction || (node.type === 'row' ? 'row' : 'column');

    el.style.display = 'flex';
    el.style.flexDirection = direction;
    if (layout.wrap) el.style.flexWrap = 'wrap';
    if (layout.gap) el.style.gap = layout.gap;
    if (layout.align) el.style.alignItems = layout.align;
    if (layout.justify) el.style.justifyContent = layout.justify;
}

function applyNodeStyle(el, node) {
    if (!node.style) return;
    applyStyleProps(el, node.style.base);
    // node.style.tablet / node.style.mobile are intentionally unused for
    // now — they'll come into play once the device switcher drives real
    // per-breakpoint rendering instead of just resizing the frame.
}

function applyStyleProps(el, props) {
    if (!props) return;
    Object.keys(props).forEach(key => {
        const jsProp = STYLE_PROP_TO_JS[key];
        if (jsProp) el.style[jsProp] = props[key];
    });
}

function renderLeafContent(el, node) {
    switch (node.type) {
        case 'heading':
        case 'text':
            renderTextLeaf(el, node);
            break;
        case 'button':
            renderButtonLeaf(el, node);
            break;
        case 'image':
            renderImageLeaf(el, node);
            break;
        case 'icon':
            el.classList.add('is-empty');
            break;
        case 'shape':
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

function renderTextLeaf(el, node) {
    const hasContent = !!(node.content && node.content.trim());
    el.classList.toggle('is-empty', !hasContent);
    el.innerHTML = hasContent
        ? node.content
        : (node.placeholder || (node.type === 'heading' ? 'Empty heading' : 'Empty text'));
}

function renderButtonLeaf(el, node) {
    const hasContent = !!(node.content && node.content.trim());
    el.classList.toggle('is-empty', !hasContent);
    el.textContent = hasContent ? node.content : (node.placeholder || 'Button');
    el.href = node.href || '#';
    // No real navigation inside the editor canvas.
    el.addEventListener('click', e => e.preventDefault());
}

function renderImageLeaf(el, node) {
    const hasSrc = !!node.src;
    el.classList.toggle('is-empty', !hasSrc);

    if (hasSrc) {
        const img = document.createElement('img');
        img.src = node.src;
        img.alt = node.alt || '';
        el.appendChild(img);
    } else {
        el.innerHTML =
            '<svg viewBox="0 0 24 24" class="node-image__icon">' +
            '<rect x="3" y="4" width="18" height="16" rx="2"/>' +
            '<circle cx="8.5" cy="9.5" r="1.5"/>' +
            '<path d="M21 16l-5.5-5.5L4 21"/></svg>' +
            `<span>${escapeHtml(node.placeholder || 'Add an image')}</span>`;
    }
}

function renderEmbedLeaf(el, node) {
    el.classList.add('is-empty');
    el.textContent = node.placeholder || 'Embed';
}

function escapeHtml(str) {
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
function renderPageIntoCanvas(sections, frameEl) {
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
function appendSectionsToCanvas(sections, frameEl) {
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
function refreshCanvasEmptyState(frameEl) {
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

function buildCanvasEmptyState() {
    const wrap = document.createElement('div');
    wrap.className = 'canvas-frame__empty';
    wrap.innerHTML =
        '<svg viewBox="0 0 24 24" class="icon"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h6"/></svg>' +
        '<span>Blank canvas</span>';
    return wrap;
}
