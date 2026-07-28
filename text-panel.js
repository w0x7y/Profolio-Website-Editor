// ============================================================
// TEXT TOOL PANEL
//
// The controls inside the left tool panel's Text pane. They edit the
// currently selected heading/text node on the canvas: its content, font,
// size, character styling and colors.
//
// Everything is written straight to the DOM element, exactly like section
// drag-reorder and trash-deletion in script.js — there is no in-memory
// project object yet (see docs/DATA_MODEL.md), so none of it survives a
// reload. Once one exists, these writes should update the node in that tree
// and re-render instead.
//
// Ownership boundary: script.js decides *what* is selected and calls
// syncTextPanel() with the element; this file never reads script.js's
// `selectedEl`. The seams are openToolPanel() — already the one funnel both
// entry paths (tool click, canvas selection) go through — and its mirror in
// closeToolPanel(), which points the pane back at nothing.
//
// Character styling is content, not style: Bold/Italic/Underline/Strike
// wrap the selection inside the Content box in <b>/<i>/<u>/<s>, so
// font-weight, font-style and text-decoration are never written here.
// ============================================================

// The tags allowed to reach the canvas from the Content box. Everything else
// is unwrapped to its text — this is the "sanitized subset" the content
// field is documented as accepting in docs/DATA_MODEL.md.
const TEXT_INLINE_TAGS = new Set(['B', 'I', 'U', 'S', 'STRONG', 'EM', 'BR']);

// Block tags a contenteditable produces for new lines. Unwrapped like
// anything else, but they leave a <br> behind so the line break survives.
const TEXT_BLOCK_TAGS = new Set(['DIV', 'P']);

const TEXT_PANEL_NODE_TYPES = new Set(['heading', 'text']);

let textTarget = null;   // the canvas element the controls are editing
let textEls = null;      // cached control refs, null until initTextPanel()

function initTextPanel() {
    const content = document.getElementById('textContent');
    if (!content) return;

    textEls = {
        empty: document.getElementById('textPanelEmpty'),
        body: document.getElementById('textPanelBody'),
        content: content,
        inlineToggles: Array.from(document.querySelectorAll('#textInlineToggles .toggle-btn')),
        fontFamily: document.getElementById('textFontFamily'),
        fontSize: document.getElementById('textFontSize'),
        fontSizeUnit: document.getElementById('textFontSizeUnit'),
        letterSpacing: document.getElementById('textLetterSpacing'),
        uppercase: document.getElementById('textUppercase'),
        colorSwatch: document.getElementById('textColorSwatch'),
        colorHex: document.getElementById('textColorHex'),
        bgCtrl: document.getElementById('textBgCtrl'),
        bgToggle: document.getElementById('textBgToggle'),
        bgSwatch: document.getElementById('textBgSwatch'),
        bgHex: document.getElementById('textBgHex'),
        strokeCtrl: document.getElementById('textStrokeCtrl'),
        strokeToggle: document.getElementById('textStrokeToggle'),
        strokeWidth: document.getElementById('textStrokeWidth'),
        strokeSwatch: document.getElementById('textStrokeSwatch'),
        strokeHex: document.getElementById('textStrokeHex')
    };

    // Emit <b>/<i>/<u>/<s> rather than <span style="font-weight:bold">.
    // A document-level setting, so it's re-asserted before each command too.
    document.execCommand('styleWithCSS', false, false);

    wireContentBox();
    wireInlineToggles();
    wireTypographyControls();
    wireColorControls();
}

/**
 * Point the controls at a canvas element, or at nothing. Called from
 * openToolPanel() every time the Text pane is revealed, so re-selecting the
 * same node after dismissing the panel repopulates it.
 */
function syncTextPanel(el) {
    if (!textEls) return;

    textTarget = el && TEXT_PANEL_NODE_TYPES.has(el.dataset.nodeType) ? el : null;
    textEls.empty.hidden = !!textTarget;
    textEls.body.hidden = !textTarget;
    if (!textTarget) return;

    syncContentBox();

    const computed = getComputedStyle(textTarget);

    textEls.fontFamily.value = matchFontFamily(computed.fontFamily);

    const size = readFontSize(computed);
    textEls.fontSize.value = size.value;
    textEls.fontSizeUnit.value = size.unit;
    textEls.fontSizeUnit.dataset.unit = size.unit;

    // Computed letter-spacing is "normal" when untouched, which parses to NaN.
    const spacing = parseFloat(computed.letterSpacing);
    textEls.letterSpacing.value = isFinite(spacing) ? round3(spacing) : '';

    setSwitch(textEls.uppercase, computed.textTransform === 'uppercase');

    setColorField(textEls.colorSwatch, textEls.colorHex, rgbToHex(computed.color) || '#000000');

    // A transparent background reads as "off" rather than as a color.
    const background = rgbToHex(computed.backgroundColor);
    setSwitch(textEls.bgToggle, !!background);
    setColorField(textEls.bgSwatch, textEls.bgHex, background || '#ffffff');
    setCtrlOff(textEls.bgCtrl, !background);

    const strokeWidth = parseFloat(computed.getPropertyValue('-webkit-text-stroke-width')) || 0;
    setSwitch(textEls.strokeToggle, strokeWidth > 0);
    textEls.strokeWidth.value = strokeWidth > 0 ? round3(strokeWidth) : 1;
    setColorField(
        textEls.strokeSwatch,
        textEls.strokeHex,
        rgbToHex(computed.getPropertyValue('-webkit-text-stroke-color')) || '#000000'
    );
    setCtrlOff(textEls.strokeCtrl, strokeWidth <= 0);
}

// ---- content ----------------------------------------------------------

function wireContentBox() {
    textEls.content.addEventListener('input', applyTextContent);

    // Paste as plain text, so foreign markup never enters the editable in
    // the first place. sanitizeInlineHtml() is still the backstop on the way
    // out, but keeping the box clean avoids surprising the user with content
    // that silently loses its formatting a keystroke later.
    textEls.content.addEventListener('paste', e => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, text);
    });

    // The toggles read the caret, so their state has to follow it.
    document.addEventListener('selectionchange', refreshInlineToggles);
}

function syncContentBox() {
    const placeholder = textPlaceholderFor(textTarget);
    // An empty node holds its *placeholder* as text (see renderTextLeaf), so
    // showing textTarget.innerHTML here would load the placeholder into the
    // box as if the user had typed it.
    const isEmpty = textTarget.classList.contains('is-empty');

    textEls.content.dataset.placeholder = placeholder;
    textEls.content.innerHTML = isEmpty ? '' : textTarget.innerHTML;
    textEls.content.classList.toggle('is-empty', isEmpty);
    refreshInlineToggles();
}

function applyTextContent() {
    if (!textTarget) return;

    const clean = sanitizeInlineHtml(textEls.content.innerHTML);
    const hasContent = !!clean.text.trim();

    textTarget.classList.toggle('is-empty', !hasContent);
    if (hasContent) textTarget.innerHTML = clean.html;
    else textTarget.textContent = textPlaceholderFor(textTarget);

    textEls.content.classList.toggle('is-empty', !hasContent);
}

/** The placeholder renderTextLeaf() stamped, with its own fallback. */
function textPlaceholderFor(el) {
    return el.dataset.placeholder ||
        (el.dataset.nodeType === 'heading' ? 'Empty heading' : 'Empty text');
}

/**
 * Reduce a fragment to the whitelisted inline tags, dropping every attribute
 * and unwrapping everything else to its text.
 *
 * Parsed in an inert document rather than a detached <div>: a detached div
 * still loads resources, so `<img src=x onerror=...>` can fire before the
 * strip pass reaches it. An inert document never runs anything.
 */
function sanitizeInlineHtml(html) {
    const doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML = html;
    stripToInlineTags(doc.body);
    return { html: doc.body.innerHTML, text: doc.body.textContent };
}

function stripToInlineTags(root) {
    // Snapshot: unwrapping moves children up into this same list.
    Array.from(root.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) return;
        if (node.nodeType !== Node.ELEMENT_NODE) {
            node.remove();
            return;
        }

        // Depth first, so an unwrapped node's children are already clean.
        stripToInlineTags(node);

        if (TEXT_INLINE_TAGS.has(node.tagName)) {
            Array.from(node.attributes).forEach(attr => node.removeAttribute(attr.name));
            return;
        }

        const kids = Array.from(node.childNodes);
        // A contenteditable wraps each new line in its own block. Unwrapping
        // that would silently join the lines, so leave the break behind.
        if (TEXT_BLOCK_TAGS.has(node.tagName) && node.previousSibling) {
            kids.unshift(node.ownerDocument.createElement('br'));
        }
        node.replaceWith(...kids);
    });
}

// ---- inline character styling -----------------------------------------

function wireInlineToggles() {
    textEls.inlineToggles.forEach(btn => {
        // Without this the button steals focus on mousedown and the browser
        // drops the selection the command is about to act on.
        btn.addEventListener('mousedown', e => e.preventDefault());
        btn.addEventListener('click', () => runInlineCommand(btn.dataset.command));
    });
}

function runInlineCommand(command) {
    if (!textTarget || !command) return;

    const content = textEls.content;
    content.focus();

    // No selection (or just a caret) reads as "style the whole element".
    if (!selectionInsideContent() || window.getSelection().isCollapsed) {
        selectAllOf(content);
    }

    document.execCommand('styleWithCSS', false, false);
    document.execCommand(command, false, null);

    applyTextContent();
    refreshInlineToggles();
}

function refreshInlineToggles() {
    if (!textEls || !textTarget) return;

    // queryCommandState reports on the document selection, so it only means
    // anything while that selection is inside the Content box. Unfocused, the
    // toggles sit neutral rather than reporting someone else's caret.
    const active = selectionInsideContent();

    textEls.inlineToggles.forEach(btn => {
        const on = active && document.queryCommandState(btn.dataset.command);
        btn.classList.toggle('is-active', !!on);
        btn.setAttribute('aria-pressed', String(!!on));
    });
}

function selectionInsideContent() {
    const sel = window.getSelection();
    return !!sel && sel.rangeCount > 0 &&
        textEls.content.contains(sel.anchorNode) &&
        textEls.content.contains(sel.focusNode);
}

function selectAllOf(el) {
    const range = document.createRange();
    range.selectNodeContents(el);

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

// ---- typography -------------------------------------------------------

function wireTypographyControls() {
    textEls.fontFamily.addEventListener('change', () => {
        setTargetStyle('font-family', textEls.fontFamily.value);
    });

    textEls.fontSize.addEventListener('input', applyFontSize);
    textEls.fontSizeUnit.addEventListener('change', changeFontSizeUnit);

    textEls.letterSpacing.addEventListener('input', () => {
        const value = parseFloat(textEls.letterSpacing.value);
        setTargetStyle('letter-spacing', isFinite(value) ? value + 'px' : '');
    });

    textEls.uppercase.addEventListener('click', () => {
        const on = toggleSwitch(textEls.uppercase);
        setTargetStyle('text-transform', on ? 'uppercase' : '');
    });
}

function applyFontSize() {
    const value = parseFloat(textEls.fontSize.value);
    setTargetStyle('font-size', isFinite(value) ? value + textEls.fontSizeUnit.value : '');
}

/**
 * Switching units converts rather than relabelling: a 32px heading becomes
 * 2rem, not 32rem. Relabelling would blow the text up to 512px and read as
 * broken.
 */
function changeFontSizeUnit() {
    const next = textEls.fontSizeUnit.value;
    const previous = textEls.fontSizeUnit.dataset.unit || 'px';
    const value = parseFloat(textEls.fontSize.value);

    if (isFinite(value) && next !== previous) {
        textEls.fontSize.value = round3(value * pxPerUnit(previous) / pxPerUnit(next));
    }

    textEls.fontSizeUnit.dataset.unit = next;
    applyFontSize();
}

function pxPerUnit(unit) {
    if (unit === 'px') return 1;
    if (unit === 'rem') return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

    // em and % are both relative to the parent's font size.
    const parent = (textTarget && textTarget.parentElement) || document.documentElement;
    const base = parseFloat(getComputedStyle(parent).fontSize) || 16;
    return unit === '%' ? base / 100 : base;
}

/**
 * The inline value wins, because it's the only place the *unit* the user
 * picked survives — computed style always reports px.
 */
function readFontSize(computed) {
    const match = /^(-?\d*\.?\d+)(px|rem|em|%)$/.exec(textTarget.style.fontSize.trim());
    if (match) return { value: round3(parseFloat(match[1])), unit: match[2] };

    const px = parseFloat(computed.fontSize);
    return { value: isFinite(px) ? round3(px) : '', unit: 'px' };
}

/**
 * Computed style reports `"Maple Mono", monospace` where the option value
 * reads `'Maple Mono', monospace`, so both sides are normalized before
 * comparing. No match falls back to "Theme default".
 */
function matchFontFamily(computedFamily) {
    const wanted = normalizeFontStack(computedFamily);
    const match = Array.from(textEls.fontFamily.options)
        .find(option => option.value && normalizeFontStack(option.value) === wanted);

    return match ? match.value : '';
}

function normalizeFontStack(stack) {
    return String(stack).toLowerCase().replace(/["']/g, '').replace(/\s*,\s*/g, ',').trim();
}

// ---- color ------------------------------------------------------------

function wireColorControls() {
    wireColorField(textEls.colorSwatch, textEls.colorHex, hex => setTargetStyle('color', hex));

    wireColorField(textEls.bgSwatch, textEls.bgHex, applyBackground);
    textEls.bgToggle.addEventListener('click', () => {
        const on = toggleSwitch(textEls.bgToggle);
        setCtrlOff(textEls.bgCtrl, !on);
        applyBackground();
    });

    wireColorField(textEls.strokeSwatch, textEls.strokeHex, applyStroke);
    textEls.strokeWidth.addEventListener('input', applyStroke);
    textEls.strokeToggle.addEventListener('click', () => {
        const on = toggleSwitch(textEls.strokeToggle);
        setCtrlOff(textEls.strokeCtrl, !on);
        applyStroke();
    });
}

/**
 * Keep a swatch and its hex field in step, calling back with a valid
 * `#rrggbb` whenever one of them produces a usable value. A half-typed hex
 * is marked invalid and applies nothing, so the element never blanks out
 * mid-keystroke.
 */
function wireColorField(swatch, hex, onChange) {
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

function applyBackground() {
    const on = isSwitchOn(textEls.bgToggle);
    setTargetStyle('background-color', on ? (normalizeHex(textEls.bgHex.value) || '#ffffff') : '');
}

function applyStroke() {
    if (!isSwitchOn(textEls.strokeToggle)) {
        setTargetStyle('-webkit-text-stroke-width', '');
        setTargetStyle('-webkit-text-stroke-color', '');
        return;
    }

    const width = parseFloat(textEls.strokeWidth.value);
    setTargetStyle('-webkit-text-stroke-width', (isFinite(width) ? width : 1) + 'px');
    setTargetStyle('-webkit-text-stroke-color', normalizeHex(textEls.strokeHex.value) || '#000000');
}

function setColorField(swatch, hex, value) {
    swatch.value = value;
    hex.value = value;
    hex.classList.remove('is-invalid');
}

/** Accepts `#f00`, `f00`, `#ff0000`, `ff0000`. Returns null for anything else. */
function normalizeHex(input) {
    const raw = String(input).trim().replace(/^#/, '');
    if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return null;

    const full = raw.length === 3 ? raw.split('').map(char => char + char).join('') : raw;
    return '#' + full.toLowerCase();
}

/** `rgb(17, 17, 20)` -> `#111114`. Fully transparent returns null. */
function rgbToHex(value) {
    const parts = String(value).match(/-?\d*\.?\d+/g);
    if (!parts || parts.length < 3) return null;
    if (parts.length >= 4 && parseFloat(parts[3]) === 0) return null;

    return '#' + parts.slice(0, 3).map(part => {
        const channel = Math.max(0, Math.min(255, Math.round(parseFloat(part))));
        return channel.toString(16).padStart(2, '0');
    }).join('');
}

// ---- shared helpers ---------------------------------------------------

function setTargetStyle(property, value) {
    if (!textTarget) return;

    if (value === '' || value == null) textTarget.style.removeProperty(property);
    else textTarget.style.setProperty(property, value);
}

function setSwitch(btn, on) {
    btn.setAttribute('aria-checked', String(!!on));
    btn.classList.toggle('is-on', !!on);
}

function isSwitchOn(btn) {
    return btn.getAttribute('aria-checked') === 'true';
}

function toggleSwitch(btn) {
    const on = !isSwitchOn(btn);
    setSwitch(btn, on);
    return on;
}

/** Dim and disable a control's body while its switch is off. */
function setCtrlOff(ctrl, off) {
    ctrl.classList.toggle('is-off', off);
    ctrl.querySelectorAll('.ctrl__body input').forEach(input => {
        input.disabled = off;
    });
}

function round3(value) {
    return Math.round(value * 1000) / 1000;
}
