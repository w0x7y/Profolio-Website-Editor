// ============================================================
// PAGE + LAYOUT LOADING
//
// The Layouts panel is an accordion: one collapsible row per page of
// the site. /layout/pages.json lists those pages in order:
//   [ { "id": "home", "name": "Home" }, ... ]
//
// Each page owns a folder under /layout, and every layout inside it
// lives as its own JSON file:
//   layout/home/minimal.json
//   layout/home/bold-studio.json
//   ...
// layout/<page>/manifest.json simply lists which files to load, since a
// browser can't read a folder's contents by itself. A page with nothing
// built for it yet has an empty manifest ([]) and renders as an empty
// accordion row.
//
// Layout JSON shape:
// {
//   "id": "minimal",
//   "name": "Minimal",
//   "description": "...",
//   "preview": {
//     "direction": "column" | "row",
//     "wrap": true | false,
//     "blocks": [ { "width": "40%", "height": "18%", "tone": "neutral" }, ... ]
//     // tone meanings: gradient-accent = image, gradient-dark = text,
//     // accent = links/navbar, neutral = other
//   }               // or { "blank": true } for the empty-page card
//   "sections": []  // node tree (sections -> blocks -> elements) for the layout
//                   // content — see docs/DATA_MODEL.md. Appended to the
//                   // bottom of the canvas via renderer.js when this
//                   // layout's card is clicked.
// }
//
// Every layout is additive. Clicking a card never replaces the canvas: the
// Home layouts give you a page shell (nav / hero / projects / footer) and
// the other pages' layouts stack their sections underneath, so a site is
// assembled by picking one card after another.
// ============================================================

import { canvasFrame } from './dom.js';
import { escapeHtml, appendSectionsToCanvas } from './renderer.js';
import { addSectionDragHandles } from './section-dnd.js';

export async function loadPages() {
    const accordion = document.getElementById('pageAccordion');
    if (!accordion) return;

    try {
        const pages = await fetch('layout/pages.json').then(res => res.json());
        const loaded = await Promise.all(pages.map(loadPageLayouts));

        accordion.innerHTML = '';
        // Every row starts collapsed; the user opens the page they want.
        loaded.forEach(page => accordion.appendChild(buildPageSection(page, false)));

        wireLayoutCardInsertion(accordion, loaded);
    } catch (err) {
        accordion.innerHTML = '<p class="panel__hint">Couldn\'t load pages.</p>';
        console.error('Failed to load pages from /layout:', err);
    }
}

async function loadPageLayouts(page) {
    const files = await fetch(`layout/${page.id}/manifest.json`).then(res => res.json());
    const layouts = await Promise.all(
        files.map(file => fetch(`layout/${page.id}/${file}`).then(res => res.json()))
    );
    return { ...page, layouts };
}

function buildPageSection(page, isOpen) {
    const section = document.createElement('div');
    section.className = 'page-section';
    section.classList.toggle('is-open', isOpen);
    section.dataset.pageId = page.id;

    const header = document.createElement('button');
    header.className = 'page-section__header';
    header.type = 'button';
    header.setAttribute('aria-expanded', String(isOpen));
    header.innerHTML =
        '<svg viewBox="0 0 24 24" class="icon icon--sm page-section__chevron"><path d="M9 6l6 6-6 6"/></svg>' +
        `<span class="page-section__name">${escapeHtml(page.name)}</span>` +
        `<span class="page-section__count">${page.layouts.length}</span>`;

    header.addEventListener('click', () => {
        const nowOpen = !section.classList.contains('is-open');
        section.classList.toggle('is-open', nowOpen);
        header.setAttribute('aria-expanded', String(nowOpen));
    });

    const body = document.createElement('div');
    body.className = 'page-section__body';

    const inner = document.createElement('div');
    inner.className = 'page-section__inner';

    if (page.layouts.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'page-section__empty';
        empty.textContent = 'No layouts for this page yet.';
        inner.appendChild(empty);
    } else {
        const grid = document.createElement('div');
        grid.className = 'layout-grid';
        page.layouts.forEach(layout => grid.appendChild(buildLayoutCard(layout)));
        inner.appendChild(grid);
    }

    body.appendChild(inner);
    section.appendChild(header);
    section.appendChild(body);
    return section;
}

function buildLayoutCard(layout) {
    const card = document.createElement('button');
    card.className = 'layout-card';
    card.dataset.layoutId = layout.id;

    const preview = document.createElement('div');
    preview.className = 'layout-card__preview';

    if (layout.preview && layout.preview.blank) {
        preview.classList.add('is-blank');
        preview.innerHTML = '<svg viewBox="0 0 24 24" class="icon"><path d="M12 5v14M5 12h14"/></svg>';
    } else if (layout.preview) {
        preview.style.flexDirection = layout.preview.direction === 'row' ? 'row' : 'column';
        if (layout.preview.wrap) preview.style.flexWrap = 'wrap';

        (layout.preview.blocks || []).forEach(block => {
            const el = document.createElement('span');
            el.className = `preview-block preview-block--${block.tone || 'neutral'}`;
            el.style.width = block.width || '100%';
            el.style.height = block.height || '100%';
            preview.appendChild(el);
        });
    }

    const label = document.createElement('span');
    label.textContent = layout.name;

    card.appendChild(preview);
    card.appendChild(label);
    return card;
}

function wireLayoutCardInsertion(accordion, pages) {
    accordion.querySelectorAll('.layout-card').forEach(card => {
        card.addEventListener('click', () => {
            // Layout ids are only unique within a page (every page can have
            // its own "blank"), so resolve the page first.
            const pageId = card.closest('.page-section').dataset.pageId;
            const page = pages.find(p => p.id === pageId);
            const layout = page && page.layouts.find(l => l.id === card.dataset.layoutId);
            if (!layout) return;

            // Every card is additive: its sections go at the bottom of the
            // canvas, under whatever is already there. Nothing is replaced,
            // so a card isn't a "current layout" that stays selected — it's
            // an action, and gets a brief confirmation flash instead.
            const added = appendSectionsToCanvas(layout.sections, canvasFrame());
            if (added) {
                addSectionDragHandles(canvasFrame());
                flashCard(card);
                revealOnCanvas(added);
            }
        });
    });
}

/**
 * Scroll the canvas so a freshly appended section is on screen — it lands
 * at the bottom of the page, which is usually below the fold.
 *
 * Done by hand rather than with scrollIntoView(): the canvas scroller is a
 * centered flex container, and scrollIntoView() is unreliable on it.
 */
function revealOnCanvas(el) {
    const scroller = document.querySelector('.canvas-scroll');
    if (!scroller) return;

    const target = el.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();

    // Already fully visible — leave the scroll position alone.
    if (target.top >= view.top && target.bottom <= view.bottom) return;

    // Otherwise line the section's top edge up with the top of the
    // viewport, with a little breathing room above it.
    scroller.scrollTop += target.top - view.top - 24;
}

function flashCard(card) {
    card.classList.remove('is-added');
    // Restart the flash from the top when the same card is clicked twice in
    // a row: without the reflow the class re-add is coalesced into a no-op.
    void card.offsetWidth;
    card.classList.add('is-added');
    setTimeout(() => card.classList.remove('is-added'), 600);
}
