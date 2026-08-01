// ============================================================
// PER-NODE STYLE OVERRIDES
//
// How a tool panel writes an inline style onto a canvas node, and how the
// Themes tab takes those writes back off again.
//
// The two halves have to live together. Applying a theme wipes per-node
// overrides so the canvas ends up uniformly on the new theme, and it needs to
// know which declarations are the user's to remove. An inline style alone
// isn't enough to go on: the renderer writes inline styles too, straight from
// the layout file's `style.base` (a section's `background: var(--color-surface)`,
// say), and those are the layout's, not the user's — wiping them would tear the
// page apart. So every write a pane makes is recorded on the node itself as
// `data-user-styled="color,font-family"`, and only what is listed there is ever
// removed.
//
// This started out private to text-panel.js, which was the only pane writing
// styles. Nothing in it is text-specific — it is how *any* pane writes a
// tracked declaration — so the Image pane shares it rather than keeping a
// second copy of the ledger the Themes tab would then have to know about.
//
// The dependency runs one way: panes import this file, this file imports no
// pane. A pane that needs to repopulate its controls after a clear registers
// a callback through onOverridesCleared().
//
// The ledger also has to survive a reload, or a reopened project would hand
// the user's colors to the next theme change as if they were the layout's.
// readUserStyleLedger()/stampUserStyleLedger() are that round trip — read by
// serializer.js on save, written back by renderer.js on render. They are here
// rather than in either of those files for the same reason as everything
// else: this attribute has exactly one writer.
//
// None of it is undoable, like every other canvas write in the editor today.
// ============================================================

const resyncCallbacks = [];

/**
 * Write (or clear) one declaration on a canvas node and record it as the
 * user's. An empty or null value removes the property instead of setting it,
 * which is also what drops it from the ledger.
 */
export function setNodeStyle(el, property, value) {
    if (!el) return;

    const clearing = value === '' || value == null;

    if (clearing) el.style.removeProperty(property);
    else el.style.setProperty(property, value);

    recordUserStyle(el, property, !clearing);
}

/**
 * Drop the panes' overrides for `properties` from every node on the canvas
 * that has them, handing those nodes back to the theme. Called by the Themes
 * tab (theme.js) — colors when a theme is picked, font-family when a font is.
 *
 * Only the named properties go. Everything else a pane wrote — an image's
 * border, its shadow, its size — is per-element intent rather than something
 * derived from the theme, and survives.
 */
export function clearNodeStyleOverrides(properties) {
    const wanted = new Set(properties);

    document.querySelectorAll('.canvas-frame [data-user-styled]').forEach(el => {
        (el.dataset.userStyled || '').split(',').filter(Boolean).forEach(property => {
            if (!wanted.has(property)) return;
            el.style.removeProperty(property);
            recordUserStyle(el, property, false);
        });
    });

    // Whichever pane is open is now showing values that just stopped being true.
    resyncCallbacks.forEach(fn => fn());
}

/** Register a pane's "repopulate your controls" callback. Called at init. */
export function onOverridesCleared(fn) {
    resyncCallbacks.push(fn);
}

/**
 * Every property currently recorded as the user's on this element, as the
 * model-side (camelCase) names the style whitelist uses. This is how a save
 * captures the ledger — see serializer.js.
 */
export function readUserStyleLedger(el) {
    if (!el || !el.dataset.userStyled) return [];
    return el.dataset.userStyled.split(',').filter(Boolean).map(toModelProp);
}

/**
 * Put a saved ledger back on a freshly rendered element, called by the
 * renderer for every node.
 *
 * The renderer writes a node's `style.base` as inline styles, and so do the
 * panes — the ledger is the only thing that tells the two apart, so a project
 * reopened without it would have the user's colors treated as the layout's and
 * left behind by the next theme change. Nothing else may write this attribute;
 * that is why the renderer calls in here rather than setting it itself.
 *
 * @param {Element} el
 * @param {string[]|undefined} properties - Model-side property names.
 */
export function stampUserStyleLedger(el, properties) {
    if (!el || !Array.isArray(properties) || properties.length === 0) return;

    properties.forEach(prop => recordUserStyle(el, toCssProp(prop), true));
}

// The ledger is stored in CSS property names because that is what
// el.style.removeProperty() takes; the model names its style props in
// camelCase. These two convert between them at the boundary rather than
// letting either spelling leak into the other side.
//
// The vendor prefix is the case a plain camel/kebab swap gets wrong in both
// directions: `webkitTextStrokeColor` is `-webkit-text-stroke-color` with a
// *leading* dash, and converting back has to drop it again rather than
// producing `WebkitTextStrokeColor`.
function toCssProp(prop) {
    const kebab = String(prop).replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
    return kebab.startsWith('webkit-') ? '-' + kebab : kebab;
}

function toModelProp(prop) {
    return String(prop)
        .replace(/^-/, '')
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/** Add or remove one property from an element's `data-user-styled` ledger. */
function recordUserStyle(el, property, isSet) {
    const props = new Set((el.dataset.userStyled || '').split(',').filter(Boolean));

    if (isSet) props.add(property);
    else props.delete(property);

    if (props.size) el.dataset.userStyled = Array.from(props).join(',');
    else delete el.dataset.userStyled;
}
