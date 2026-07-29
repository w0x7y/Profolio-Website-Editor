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

function recordUserStyle(el, property, isSet) {
    const props = new Set((el.dataset.userStyled || '').split(',').filter(Boolean));

    if (isSet) props.add(property);
    else props.delete(property);

    if (props.size) el.dataset.userStyled = Array.from(props).join(',');
    else delete el.dataset.userStyled;
}
