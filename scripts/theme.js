// ============================================================
// THEMES + TYPOGRAPHY  (right panel -> Themes tab)
//
// A theme is six colors; typography is two font stacks, picked
// independently of the colors. Applying either writes custom properties
// onto `.canvas-frame` and stops there — every canvas rule in style.css
// reads those properties instead of a literal color or font, so a single
// write restyles everything on the canvas, and everything added to it
// later: new sections are rendered inside the same frame and inherit the
// same properties, with no re-theming step on insert.
//
// That is also why themes define so few colors. Hairlines, placeholder
// chrome and the other neutrals are derived from the six in style.css via
// color-mix(), so they follow the page whether it is light or dark rather
// than needing a hand-picked grey per theme.
//
// The one thing that does reach individual nodes is the deliberate wipe:
// applying a theme drops the per-node color overrides a tool panel wrote,
// and picking a font drops its per-node font-family overrides, so the
// canvas ends up uniformly on the new theme instead of keeping islands of
// the old one. node-style.js owns the ledger of those writes and owns
// undoing them — this file only names the properties to drop. Nothing else
// on the canvas is touched, so a section's `background: var(--color-surface)`
// from a layout file survives, and so do the Image pane's borders and
// shadows, which are per-element intent rather than theme-derived.
//
// Like the rest of the editor, none of this persists across a reload yet
// (TODO.md: "Persist selected theme/font with the project data").
// ============================================================

import { canvasFrame, activateOne } from './dom.js';
import { clearNodeStyleOverrides } from './node-style.js';

const THEMES = [
    {
        id: 'ink-violet',
        name: 'Ink & Violet',
        colors: {
            background: '#ffffff',
            surface: '#f4f4f5',
            text: '#111114',
            textMuted: '#55555c',
            accent: '#6366f1',
            onText: '#ffffff'
        }
    },
    {
        id: 'ember',
        name: 'Ember',
        colors: {
            background: '#ffffff',
            surface: '#fafaf9',
            text: '#1c1917',
            textMuted: '#57534e',
            accent: '#f97316',
            onText: '#fafaf9'
        }
    },
    {
        // The dark preset, and the reason the neutrals are derived rather
        // than hardcoded: on this theme every placeholder, hairline and
        // empty-image box has to invert along with the page.
        id: 'cyan-night',
        name: 'Cyan Night',
        colors: {
            background: '#0f172a',
            surface: '#1e293b',
            text: '#f8fafc',
            textMuted: '#94a3b8',
            accent: '#22d3ee',
            onText: '#0f172a'
        }
    },
    {
        id: 'sage-light',
        name: 'Sage Light',
        colors: {
            background: '#ffffff',
            surface: '#f5f5f4',
            text: '#1c2b21',
            textMuted: '#52645a',
            accent: '#16a34a',
            onText: '#ffffff'
        }
    }
];

// Theme color -> the custom property style.css reads it through.
const THEME_COLOR_PROPS = {
    background: '--color-background',
    surface: '--color-surface',
    text: '--color-text',
    textMuted: '--color-text-muted',
    accent: '--color-accent',
    onText: '--color-on-text'
};

// The families offered for headings and body text, and — minus the
// grouping — by the Text pane's per-node font picker, which is filled from
// this same list so the two can't drift apart.
//
// Web-safe stacks resolve against fonts the machine already has, so they
// render with no network at all. The Google families need the stylesheet
// linked in index.html; if that request fails they fall back to the generic
// family at the end of each stack rather than breaking the canvas.
export const FONT_GROUPS = [
    {
        label: 'Web-safe',
        fonts: [
            { name: 'System Sans', stack: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
            { name: 'Helvetica', stack: 'Helvetica, Arial, sans-serif' },
            { name: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
            { name: 'Trebuchet', stack: "'Trebuchet MS', Helvetica, sans-serif" },
            { name: 'Georgia', stack: "Georgia, 'Times New Roman', serif" },
            { name: 'Times', stack: "'Times New Roman', Times, serif" },
            { name: 'Palatino', stack: "'Palatino Linotype', Palatino, Georgia, serif" },
            { name: 'System Mono', stack: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
            { name: 'Courier', stack: "'Courier New', Courier, monospace" },
            // Already loaded for the editor chrome itself, so it costs
            // nothing extra on the canvas.
            { name: 'Maple Mono', stack: "'Maple Mono', monospace" }
        ]
    },
    {
        label: 'Google Fonts',
        fonts: [
            { name: 'Inter', stack: "'Inter', system-ui, sans-serif" },
            { name: 'DM Sans', stack: "'DM Sans', system-ui, sans-serif" },
            { name: 'Poppins', stack: "'Poppins', system-ui, sans-serif" },
            { name: 'Montserrat', stack: "'Montserrat', system-ui, sans-serif" },
            { name: 'Work Sans', stack: "'Work Sans', system-ui, sans-serif" },
            { name: 'Space Grotesk', stack: "'Space Grotesk', system-ui, sans-serif" },
            { name: 'Manrope', stack: "'Manrope', system-ui, sans-serif" },
            { name: 'Outfit', stack: "'Outfit', system-ui, sans-serif" },
            { name: 'Playfair Display', stack: "'Playfair Display', Georgia, serif" },
            { name: 'Lora', stack: "'Lora', Georgia, serif" },
            { name: 'Merriweather', stack: "'Merriweather', Georgia, serif" },
            { name: 'Source Serif 4', stack: "'Source Serif 4', Georgia, serif" },
            { name: 'Libre Baskerville', stack: "'Libre Baskerville', Georgia, serif" },
            { name: 'Fraunces', stack: "'Fraunces', Georgia, serif" },
            { name: 'JetBrains Mono', stack: "'JetBrains Mono', ui-monospace, monospace" },
            { name: 'IBM Plex Mono', stack: "'IBM Plex Mono', ui-monospace, monospace" },
            { name: 'Space Mono', stack: "'Space Mono', ui-monospace, monospace" }
        ]
    }
];

// Both default to System Sans. These have to match an option's `stack`
// exactly or the selects would open on a blank value, and they mirror the
// --font-heading / --font-body fallbacks in style.css.
const DEFAULT_HEADING_FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const DEFAULT_BODY_FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

// The per-node declarations each action wipes. Colors and fonts are wiped
// separately so picking a font doesn't discard hand-picked colors, and
// picking a theme doesn't discard a hand-picked font.
const THEME_OVERRIDE_PROPS = [
    'color',
    'background-color',
    '-webkit-text-stroke-width',
    '-webkit-text-stroke-color'
];
const FONT_OVERRIDE_PROPS = ['font-family'];

let themeEls = null;         // cached refs, null until initThemePanel()
let activeThemeId = THEMES[0].id;

export function initThemePanel() {
    const frame = canvasFrame();
    const list = document.getElementById('themeList');
    if (!frame || !list) return;

    themeEls = {
        frame: frame,
        list: list,
        headingFont: document.getElementById('themeHeadingFont'),
        bodyFont: document.getElementById('themeBodyFont'),
        previewHeading: document.querySelector('#themeFontPreview .type-preview__heading'),
        previewBody: document.querySelector('#themeFontPreview .type-preview__body')
    };

    buildThemeCards();
    buildFontSelects();

    // Put the starting theme on the frame rather than leaning on the
    // defaults in style.css, so there is one source of truth for what is
    // currently applied. Nothing to wipe yet — the canvas is empty.
    applyTheme(activeThemeId, { wipeOverrides: false });
    applyFonts({ wipeOverrides: false });
}

// ---- color themes -----------------------------------------------------

function buildThemeCards() {
    themeEls.list.innerHTML = '';

    THEMES.forEach(theme => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'theme-card';
        card.dataset.theme = theme.id;

        const swatches = document.createElement('div');
        swatches.className = 'theme-card__swatches';
        // Text, accent, background: the three that decide how a page reads
        // at a glance, in an order that stays legible for dark themes too
        // (where the first dot is the light one and the last is the dark).
        [theme.colors.text, theme.colors.accent, theme.colors.background].forEach(color => {
            const dot = document.createElement('span');
            dot.style.background = color;
            swatches.appendChild(dot);
        });

        const name = document.createElement('span');
        name.textContent = theme.name;

        card.appendChild(swatches);
        card.appendChild(name);
        card.addEventListener('click', () => applyTheme(theme.id));

        themeEls.list.appendChild(card);
    });
}

/**
 * Apply a theme's colors to the canvas. Pass `{ wipeOverrides: false }` to
 * set the properties without discarding per-node color overrides — used for
 * the initial apply at startup.
 */
function applyTheme(themeId, options) {
    const theme = THEMES.find(t => t.id === themeId);
    if (!theme || !themeEls) return;

    activeThemeId = theme.id;

    Object.keys(THEME_COLOR_PROPS).forEach(key => {
        themeEls.frame.style.setProperty(THEME_COLOR_PROPS[key], theme.colors[key]);
    });

    activateOne(themeEls.list.querySelectorAll('.theme-card'), card => card.dataset.theme === theme.id);

    if (!options || options.wipeOverrides !== false) {
        clearNodeStyleOverrides(THEME_OVERRIDE_PROPS);
    }
}

// ---- typography -------------------------------------------------------

function buildFontSelects() {
    fillFontSelect(themeEls.headingFont, DEFAULT_HEADING_FONT);
    fillFontSelect(themeEls.bodyFont, DEFAULT_BODY_FONT);

    // The Text pane's per-node font picker offers this same list plus a
    // "Theme default"; it fills itself from fillFontSelect() in
    // initTextPanel(), rather than this file reaching across into a control
    // the Text pane owns and reads back.

    themeEls.headingFont.addEventListener('change', () => applyFonts());
    themeEls.bodyFont.addEventListener('change', () => applyFonts());
}

export function fillFontSelect(select, selectedStack, options) {
    if (!select) return;
    select.innerHTML = '';

    if (options && options.themeDefaultOption) {
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = 'Theme default';
        select.appendChild(blank);
    }

    FONT_GROUPS.forEach(group => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = group.label;

        group.fonts.forEach(font => {
            const option = document.createElement('option');
            option.value = font.stack;
            option.textContent = font.name;
            // Browsers that style dropdown options show each name in its own
            // face; the ones that don't just show the name, so this is a
            // bonus rather than something the picker depends on.
            option.style.fontFamily = font.stack;
            optgroup.appendChild(option);
        });

        select.appendChild(optgroup);
    });

    select.value = selectedStack;
}

/**
 * Push the two font selects onto the canvas. Same `wipeOverrides` escape
 * hatch as applyTheme().
 */
function applyFonts(options) {
    if (!themeEls) return;

    const heading = themeEls.headingFont.value || DEFAULT_HEADING_FONT;
    const body = themeEls.bodyFont.value || DEFAULT_BODY_FONT;

    themeEls.frame.style.setProperty('--font-heading', heading);
    themeEls.frame.style.setProperty('--font-body', body);

    themeEls.previewHeading.style.fontFamily = heading;
    themeEls.previewBody.style.fontFamily = body;

    if (!options || options.wipeOverrides !== false) {
        clearNodeStyleOverrides(FONT_OVERRIDE_PROPS);
    }
}
