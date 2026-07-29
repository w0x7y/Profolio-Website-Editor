// ============================================================
// IMAGE TOOL PANEL
//
// The controls inside the left tool panel's Image pane. They edit the
// currently selected `image` node on the canvas: which uploaded asset it
// shows, its size, how the image fits its box, its border, its shadow and
// its opacity.
//
// Writes go straight to the DOM through node-style.js, exactly like the Text
// pane — there is no in-memory project object yet (docs/DATA_MODEL.md), so
// none of it survives a reload.
//
// Ownership boundary, same as text-panel.js: selection.js decides *what* is
// selected and openToolPanel() calls syncImagePanel() with the element. This
// file never reads selection.js's `selectedEl`.
//
// ---- the wrapper / <img> split ----
//
// An image node renders as a wrapper div holding an <img> (renderer.js), and
// that split decides where each declaration goes:
//
//   wrapper   width, height, border, radius, box-shadow, opacity — the box
//   <img>     object-fit, object-position — which do nothing on the wrapper
//
// ---- reading values back ----
//
// Two rules, and they differ on purpose:
//
//   Groups with an on/off switch (Border, Shadow) read the **inline** style,
//   because the switch means "is there an override here", not "does this node
//   have a border right now". Reading computed style would show the switch on
//   for every empty placeholder, since `.node--image.is-empty` carries a
//   dashed border from style.css that isn't the user's and can't be turned
//   off from here.
//
//   Plain values (size, fit, radius, opacity) read computed style, falling
//   back to the inline value where the *unit* matters — computed style always
//   reports px, so it's the only place the unit the user picked survives.
// ============================================================

import {
    setSwitch, isSwitchOn, toggleSwitch, setCtrlOff,
    wireColorField, setColorField, normalizeHex, rgbToHex, round3, convertFieldUnit
} from './panel-widgets.js';
import { setNodeStyle, onOverridesCleared } from './node-style.js';
import { setImageLeafSrc } from './renderer.js';
import { subscribe } from './asset-store.js';
import { renderAssetGrid } from './asset-grid.js';
import { openUploadModal } from './upload-modal.js';

// Only `image` nodes. `icon` routes to this pane too (selection.js) but has
// no src and no <img>, so it gets the empty state rather than controls that
// would silently do nothing.
const IMAGE_PANEL_NODE_TYPES = new Set(['image']);

// What the Shadow group starts from the first time it is switched on, so the
// flick of the switch shows something rather than an invisible 0 0 0 shadow.
// Opaque black: the color field speaks `#rrggbb` and has no alpha channel, so
// the softness has to come from the blur.
const DEFAULT_SHADOW = { x: 0, y: 4, blur: 12, spread: 0, color: '#000000' };

let imageTarget = null;   // the canvas wrapper element being edited
let imageEls = null;      // cached control refs, null until initImagePanel()

export function initImagePanel() {
    const grid = document.getElementById('imageSourceGrid');
    if (!grid) return;

    imageEls = {
        empty: document.getElementById('imagePanelEmpty'),
        body: document.getElementById('imagePanelBody'),

        sourceGrid: grid,
        upload: document.getElementById('imageUpload'),
        remove: document.getElementById('imageRemove'),
        alt: document.getElementById('imageAlt'),

        width: document.getElementById('imageWidth'),
        widthUnit: document.getElementById('imageWidthUnit'),
        height: document.getElementById('imageHeight'),
        heightUnit: document.getElementById('imageHeightUnit'),

        fitGroup: document.getElementById('imageFitGroup'),
        fit: document.getElementById('imageFit'),
        position: document.getElementById('imagePosition'),

        borderCtrl: document.getElementById('imageBorderCtrl'),
        borderToggle: document.getElementById('imageBorderToggle'),
        borderWidth: document.getElementById('imageBorderWidth'),
        borderStyle: document.getElementById('imageBorderStyle'),
        borderSwatch: document.getElementById('imageBorderSwatch'),
        borderHex: document.getElementById('imageBorderHex'),
        radius: document.getElementById('imageRadius'),

        shadowCtrl: document.getElementById('imageShadowCtrl'),
        shadowToggle: document.getElementById('imageShadowToggle'),
        shadowX: document.getElementById('imageShadowX'),
        shadowY: document.getElementById('imageShadowY'),
        shadowBlur: document.getElementById('imageShadowBlur'),
        shadowSpread: document.getElementById('imageShadowSpread'),
        shadowSwatch: document.getElementById('imageShadowSwatch'),
        shadowHex: document.getElementById('imageShadowHex'),

        opacity: document.getElementById('imageOpacity')
    };

    wireSourceControls();
    wireSizeControls();
    wireFitControls();
    wireBorderControls();
    wireShadowControls();
    wireAppearanceControls();

    // The Source grid is a second view of the same library the Assets tab
    // shows. Subscribing rather than being repainted by that panel keeps the
    // two from importing each other; it also covers an asset being deleted
    // out from under the node this pane is editing.
    subscribe(() => syncImagePanel(imageTarget));

    // Applying a theme drops overrides out from under the controls.
    onOverridesCleared(() => {
        if (imageTarget) syncImagePanel(imageTarget);
    });
}

/**
 * Point the controls at a canvas element, or at nothing. Called from
 * openToolPanel() every time the Image pane is revealed.
 */
export function syncImagePanel(el) {
    if (!imageEls) return;

    imageTarget = el && IMAGE_PANEL_NODE_TYPES.has(el.dataset.nodeType) ? el : null;
    imageEls.empty.hidden = !!imageTarget;
    imageEls.body.hidden = !imageTarget;

    if (!imageTarget) return;

    const img = targetImage();
    const computed = getComputedStyle(imageTarget);

    syncSource(img);
    syncSize(computed);
    syncFit(img);
    syncBorder(computed);
    syncShadow();
    syncAppearance(computed);
}

/** The <img> inside the selected node, or null while it's a placeholder. */
function targetImage() {
    return imageTarget ? imageTarget.querySelector('img') : null;
}

// ---- source -----------------------------------------------------------

function wireSourceControls() {
    imageEls.upload.addEventListener('click', openUploadModal);

    imageEls.remove.addEventListener('click', () => {
        if (!imageTarget) return;
        setImageLeafSrc(imageTarget, null);
        syncImagePanel(imageTarget);
    });

    imageEls.alt.addEventListener('input', () => {
        const img = targetImage();
        if (img) img.alt = imageEls.alt.value;
    });
}

function syncSource(img) {
    renderAssetGrid(imageEls.sourceGrid, {
        emptyText: 'Nothing uploaded yet — use Upload.',
        activeUrl: img ? img.src : '',
        onPick: asset => {
            setImageLeafSrc(imageTarget, asset.url, imageEls.alt.value);
            syncImagePanel(imageTarget);
        }
    });

    // Both are meaningless without an image: there is nothing to describe and
    // nothing to remove.
    imageEls.remove.disabled = !img;
    imageEls.alt.disabled = !img;
    imageEls.alt.value = img ? img.alt : '';
}

// ---- size -------------------------------------------------------------

function wireSizeControls() {
    wireLength(imageEls.width, imageEls.widthUnit, 'width');
    wireLength(imageEls.height, imageEls.heightUnit, 'height');
}

function wireLength(input, unitSelect, property) {
    const apply = () => {
        const value = parseFloat(input.value);
        // Blank clears the declaration, which is the "auto" state — the node
        // goes back to whatever style.css sizes it as.
        setNodeStyle(imageTarget, property, isFinite(value) ? value + unitSelect.value : '');
    };

    input.addEventListener('input', apply);

    // Switching units converts rather than relabelling: a 260px portrait
    // becomes 16.25rem, not 16.25px worth of nothing. Same helper the Text
    // pane's font size uses, given a percent basis it doesn't need.
    unitSelect.addEventListener('change', () => {
        convertFieldUnit(input, unitSelect, imageTarget, percentBasis(property));
        apply();
    });
}

/**
 * What 100% is worth for this property. A width is a percentage of the
 * parent's content width, a height of its content height — not of a font
 * size, which is what pxPerUnit() assumes when nothing is passed.
 */
function percentBasis(property) {
    const parent = imageTarget && imageTarget.parentElement;
    if (!parent) return 0;
    return property === 'width' ? parent.clientWidth : parent.clientHeight;
}

function syncSize(computed) {
    setLengthFields(imageEls.width, imageEls.widthUnit, computed, 'width');
    setLengthFields(imageEls.height, imageEls.heightUnit, computed, 'height');
}

function setLengthFields(input, unitSelect, computed, property) {
    const length = readLength(computed, property);
    input.value = length.value;
    unitSelect.value = length.unit;
    unitSelect.dataset.unit = length.unit;
}

/**
 * The inline value wins, because it's the only place the *unit* the user
 * picked survives — computed style always reports px. Same precedence
 * readFontSize() uses in the Text pane.
 */
function readLength(computed, property) {
    const match = /^(-?\d*\.?\d+)(px|rem|%|vh)$/.exec(imageTarget.style.getPropertyValue(property).trim());
    if (match) return { value: round3(parseFloat(match[1])), unit: match[2] };

    const px = parseFloat(computed.getPropertyValue(property));
    return { value: isFinite(px) ? round3(px) : '', unit: 'px' };
}

// ---- fit --------------------------------------------------------------

function wireFitControls() {
    imageEls.fit.addEventListener('change', () => setImageStyle('object-fit', imageEls.fit.value));
    imageEls.position.addEventListener('change', () => {
        setImageStyle('object-position', imageEls.position.value);
    });
}

/** object-fit and object-position only mean anything on the <img> itself. */
function setImageStyle(property, value) {
    setNodeStyle(targetImage(), property, value);
}

function syncFit(img) {
    // Nothing to fit while the node is an empty placeholder.
    imageEls.fitGroup.hidden = !img;
    if (!img) return;

    const computed = getComputedStyle(img);

    imageEls.fit.value = computed.objectFit || 'cover';
    imageEls.position.value = matchOption(imageEls.position, computed.objectPosition) || '50% 50%';
}

/** The option whose value the browser's computed string equals, or null. */
function matchOption(select, value) {
    const wanted = String(value).trim();
    const match = Array.from(select.options).find(option => option.value === wanted);
    return match ? match.value : null;
}

// ---- border -----------------------------------------------------------

function wireBorderControls() {
    imageEls.borderToggle.addEventListener('click', () => {
        const on = toggleSwitch(imageEls.borderToggle);
        setCtrlOff(imageEls.borderCtrl, !on);
        applyBorder();
    });

    imageEls.borderWidth.addEventListener('input', applyBorder);
    imageEls.borderStyle.addEventListener('change', applyBorder);
    wireColorField(imageEls.borderSwatch, imageEls.borderHex, applyBorder);

    imageEls.radius.addEventListener('input', () => {
        const value = parseFloat(imageEls.radius.value);
        setNodeStyle(imageTarget, 'border-radius', isFinite(value) ? value + 'px' : '');
    });
}

/**
 * Off clears all three longhands rather than writing `0` or `none`, so the
 * node falls back to whatever style.css gives it — which for an empty
 * placeholder is the dashed box that says "add an image".
 *
 * Longhands rather than the `border` shorthand so each is tracked separately
 * in the ledger, the same way the Text pane writes its stroke.
 */
function applyBorder() {
    if (!isSwitchOn(imageEls.borderToggle)) {
        setNodeStyle(imageTarget, 'border-width', '');
        setNodeStyle(imageTarget, 'border-style', '');
        setNodeStyle(imageTarget, 'border-color', '');
        return;
    }

    const width = parseFloat(imageEls.borderWidth.value);
    setNodeStyle(imageTarget, 'border-width', (isFinite(width) ? width : 1) + 'px');
    setNodeStyle(imageTarget, 'border-style', imageEls.borderStyle.value);
    setNodeStyle(imageTarget, 'border-color', normalizeHex(imageEls.borderHex.value) || '#000000');
}

function syncBorder(computed) {
    // Inline, not computed — see the note at the top of the file.
    const style = imageTarget.style.borderStyle;
    const on = !!style && style !== 'none';

    setSwitch(imageEls.borderToggle, on);
    setCtrlOff(imageEls.borderCtrl, !on);

    const width = parseFloat(imageTarget.style.borderWidth);
    imageEls.borderWidth.value = on && isFinite(width) ? round3(width) : 1;
    imageEls.borderStyle.value = on ? style : 'solid';
    setColorField(
        imageEls.borderSwatch,
        imageEls.borderHex,
        (on && rgbToHex(imageTarget.style.borderColor)) || '#000000'
    );

    // Radius has no switch: the wrapper already carries a radius from
    // style.css, so "off" isn't a state — only a value is.
    const radius = parseFloat(computed.borderTopLeftRadius);
    imageEls.radius.value = isFinite(radius) ? round3(radius) : 0;
}

// ---- shadow -----------------------------------------------------------

function wireShadowControls() {
    imageEls.shadowToggle.addEventListener('click', () => {
        const on = toggleSwitch(imageEls.shadowToggle);
        setCtrlOff(imageEls.shadowCtrl, !on);
        applyShadow();
    });

    [imageEls.shadowX, imageEls.shadowY, imageEls.shadowBlur, imageEls.shadowSpread]
        .forEach(input => input.addEventListener('input', applyShadow));

    wireColorField(imageEls.shadowSwatch, imageEls.shadowHex, applyShadow);
}

function applyShadow() {
    if (!isSwitchOn(imageEls.shadowToggle)) {
        setNodeStyle(imageTarget, 'box-shadow', '');
        return;
    }

    const lengths = [imageEls.shadowX, imageEls.shadowY, imageEls.shadowBlur, imageEls.shadowSpread]
        .map(input => {
            const value = parseFloat(input.value);
            return (isFinite(value) ? value : 0) + 'px';
        })
        .join(' ');

    const color = normalizeHex(imageEls.shadowHex.value) || '#000000';
    setNodeStyle(imageTarget, 'box-shadow', `${lengths} ${color}`);
}

function syncShadow() {
    const shadow = parseShadow(imageTarget.style.boxShadow);
    const on = !!shadow;
    const values = shadow || DEFAULT_SHADOW;

    setSwitch(imageEls.shadowToggle, on);
    setCtrlOff(imageEls.shadowCtrl, !on);

    imageEls.shadowX.value = values.x;
    imageEls.shadowY.value = values.y;
    imageEls.shadowBlur.value = values.blur;
    imageEls.shadowSpread.value = values.spread;
    setColorField(imageEls.shadowSwatch, imageEls.shadowHex, values.color);
}

/**
 * Read back a shadow this pane wrote. Returns null for anything else —
 * a multi-shadow value, an inset one, or a layout file's own — which reads as
 * "off" and leaves those alone rather than mangling them into four numbers.
 *
 * The color is pulled out first for two reasons: the browser reserializes
 * `box-shadow` with the color leading (`rgb(0, 0, 0) 0px 4px 12px 0px`), so
 * it can't be matched positionally — and it is also full of commas, so the
 * multi-shadow check has to run on what is left after removing it rather than
 * on the whole string.
 */
function parseShadow(value) {
    const text = String(value || '').trim();
    if (!text || text.includes('inset')) return null;

    const colorMatch = /rgba?\([^)]*\)|#[0-9a-f]{3,8}/i.exec(text);
    if (!colorMatch) return null;

    const rest = text.replace(colorMatch[0], '').trim();
    if (rest.includes(',')) return null;   // more than one shadow

    const lengths = rest.split(/\s+/);
    if (lengths.length !== 4) return null;

    const numbers = lengths.map(parseFloat);
    if (numbers.some(number => !isFinite(number))) return null;

    return {
        x: round3(numbers[0]),
        y: round3(numbers[1]),
        blur: round3(numbers[2]),
        spread: round3(numbers[3]),
        color: rgbToHex(colorMatch[0]) || normalizeHex(colorMatch[0]) || '#000000'
    };
}

// ---- appearance -------------------------------------------------------

function wireAppearanceControls() {
    imageEls.opacity.addEventListener('input', () => {
        const percent = parseFloat(imageEls.opacity.value);
        // 100% is the default, so it clears rather than writing `opacity: 1`
        // and leaving a pointless override in the ledger.
        setNodeStyle(imageTarget, 'opacity', percent >= 100 ? '' : String(round3(percent / 100)));
    });
}

function syncAppearance(computed) {
    const opacity = parseFloat(computed.opacity);
    imageEls.opacity.value = isFinite(opacity) ? Math.round(opacity * 100) : 100;
}
