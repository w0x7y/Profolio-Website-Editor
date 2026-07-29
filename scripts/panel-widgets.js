// ============================================================
// PANEL WIDGETS
//
// The generic controls a tool panel's pane is built out of, and the small
// helpers that read and write them. Nothing here knows what it is editing —
// no pane, no node type, no canvas element — so a pane can reach for a
// switch or a color field without depending on the pane that happened to
// need one first.
//
// They were previously split across the two files that first used them:
// the segmented control and the labelled wrapper in link-controls.js, the
// switches and color fields in text-panel.js. That put button-panel.js in
// the position of importing from *link*-controls purely to build its
// Link/Button type switch, which has nothing to do with link targets.
//
// Two conventions the panes rely on:
//
//   `is-active` marks the chosen item in a group (segmented buttons, tabs,
//   panes, cards). activateOne() in dom.js is the shared writer.
//
//   A switch keeps its state in `aria-checked`, not in a JS variable, so
//   the accessible state and the visual state cannot drift apart.
// ============================================================

// ---- segmented control (Link|Button, Section|Address) -----------------

/**
 * A segmented control: one button per option, exactly one active.
 *
 * @param {{value: string, label: string}[]} options
 * @param {string}   label     the group's aria-label
 * @param {Function} onChange  called with the picked value
 * @returns {HTMLElement} the group's root — pass it to setSegmentedValue()
 */
export function buildSegmented(options, label, onChange) {
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

export function setSegmentedValue(root, value) {
    root.querySelectorAll('.segmented__btn').forEach(btn => {
        const on = btn.dataset.value === value;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-checked', String(on));
    });
}

// ---- labelled control wrapper -----------------------------------------

/** A labelled control wrapper, matching the markup the Text pane uses. */
export function buildCtrl(label) {
    const ctrl = document.createElement('div');
    ctrl.className = 'ctrl';

    const text = document.createElement('span');
    text.className = 'ctrl__label';
    text.textContent = label;

    ctrl.appendChild(text);
    return ctrl;
}

/** Dim and disable a control's body while its switch is off. */
export function setCtrlOff(ctrl, off) {
    ctrl.classList.toggle('is-off', off);
    ctrl.querySelectorAll('.ctrl__body input').forEach(input => {
        input.disabled = off;
    });
}

// ---- on/off switch ----------------------------------------------------

export function setSwitch(btn, on) {
    btn.setAttribute('aria-checked', String(!!on));
    btn.classList.toggle('is-on', !!on);
}

export function isSwitchOn(btn) {
    return btn.getAttribute('aria-checked') === 'true';
}

export function toggleSwitch(btn) {
    const on = !isSwitchOn(btn);
    setSwitch(btn, on);
    return on;
}

// ---- color swatch + hex field -----------------------------------------

/**
 * Keep a swatch and its hex field in step, calling back with a valid
 * `#rrggbb` whenever one of them produces a usable value. A half-typed hex
 * is marked invalid and applies nothing, so the element never blanks out
 * mid-keystroke.
 */
export function wireColorField(swatch, hex, onChange) {
    swatch.addEventListener('input', () => {
        hex.value = swatch.value;
        hex.classList.remove('is-invalid');
        onChange(swatch.value);
    });

    hex.addEventListener('input', () => {
        const value = normalizeHex(hex.value);
        hex.classList.toggle('is-invalid', !value && hex.value.trim() !== '');
        if (!value) return;

        swatch.value = value;
        onChange(value);
    });
}

export function setColorField(swatch, hex, value) {
    swatch.value = value;
    hex.value = value;
    hex.classList.remove('is-invalid');
}

/** Accepts `#f00`, `f00`, `#ff0000`, `ff0000`. Returns null for anything else. */
export function normalizeHex(input) {
    const raw = String(input).trim().replace(/^#/, '');
    if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return null;

    const full = raw.length === 3 ? raw.split('').map(char => char + char).join('') : raw;
    return '#' + full.toLowerCase();
}

/**
 * `rgb(17, 17, 20)` -> `#111114`. Fully transparent returns null.
 *
 * Computed colors normally read `rgb(r, g, b)` with 0-255 channels, but one
 * that came out of color-mix() is reported as `color(srgb r g b)` with 0-1
 * channels instead — and every derived theme neutral is a color-mix (see the
 * token block in style.css), so a placeholder or a footer link hits this
 * branch. Both forms are read here; without the scale those 0-1 channels
 * round to 0 and every such node's swatch reads as black.
 */
export function rgbToHex(value) {
    const text = String(value).trim();
    const parts = text.match(/-?\d*\.?\d+/g);
    if (!parts || parts.length < 3) return null;
    if (parts.length >= 4 && parseFloat(parts[3]) === 0) return null;

    const scale = text.startsWith('color(') ? 255 : 1;

    return '#' + parts.slice(0, 3).map(part => {
        const channel = Math.max(0, Math.min(255, Math.round(parseFloat(part) * scale)));
        return channel.toString(16).padStart(2, '0');
    }).join('');
}

// ---- length units -----------------------------------------------------

/**
 * How many pixels one `unit` is worth, for the element it would be written on.
 *
 * This is what lets a unit picker *convert* rather than relabel: a 32px
 * heading switched to rem becomes 2rem, not 32rem. Relabelling would blow the
 * value up by a factor of 16 and read as broken. Both the Text pane's font
 * size and the Image pane's width/height need the same answer.
 *
 * `em` is always the parent's font size. `%` is not — what it is a percentage
 * *of* depends on the property, so the caller passes it: a font size is a
 * percentage of the parent's font size, a width is a percentage of the
 * parent's content width. Omitting `percentBasisPx` falls back to the font
 * size, which is the font-size meaning.
 *
 * `vh` resolves against the real viewport because that is what the browser
 * does here — the canvas frame is a div on this page, not an iframe.
 */
/**
 * Move a number field to a new unit without changing what it means: read the
 * unit it was in, convert through px, write the equivalent value back, and
 * record the new unit for next time.
 *
 * The "convert, don't relabel" rule has one definition here because both
 * panes that offer a unit picker need it and both would read as broken
 * without it — a 32px heading relabelled to rem is 512px of text, a 260px
 * image is 4160px wide.
 *
 * Call it from the select's `change` handler, then apply the field as usual;
 * this only touches the field and `dataset.unit`, never the canvas.
 *
 * @param {HTMLInputElement}  input           the number field
 * @param {HTMLSelectElement} unitSelect      the unit picker, already on its new value
 * @param {Element}           el              what `em`/`%` resolve against
 * @param {number}           [percentBasisPx] see pxPerUnit(); omit for font-size
 */
export function convertFieldUnit(input, unitSelect, el, percentBasisPx) {
    const next = unitSelect.value;
    const previous = unitSelect.dataset.unit || 'px';
    const value = parseFloat(input.value);

    if (isFinite(value) && next !== previous) {
        const px = value * pxPerUnit(previous, el, percentBasisPx);
        input.value = round3(px / pxPerUnit(next, el, percentBasisPx));
    }

    unitSelect.dataset.unit = next;
}

export function pxPerUnit(unit, el, percentBasisPx) {
    if (unit === 'px') return 1;
    if (unit === 'rem') return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    if (unit === 'vh') return window.innerHeight / 100;

    const parent = (el && el.parentElement) || document.documentElement;
    const parentFontSize = parseFloat(getComputedStyle(parent).fontSize) || 16;

    if (unit === 'em') return parentFontSize;

    const basis = isFinite(percentBasisPx) && percentBasisPx > 0 ? percentBasisPx : parentFontSize;
    return basis / 100;
}

// ---- misc -------------------------------------------------------------

export function round3(value) {
    return Math.round(value * 1000) / 1000;
}
