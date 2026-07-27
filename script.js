// ============================================================
// UI-ONLY INTERACTIONS
// (no real editing functionality yet — just visual state)
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

    // ---- Left toolbar: tool selection ----
    const tools = document.querySelectorAll('.tool');
    tools.forEach(tool => {
        tool.addEventListener('click', () => {
            tools.forEach(t => t.classList.remove('is-active'));
            tool.classList.add('is-active');
        });
    });

    // ---- Right panel: tab switching ----
    const panelTabs = document.querySelectorAll('.panel__tab');
    const panelPanes = document.querySelectorAll('.panel__pane');
    panelTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.panel;

            panelTabs.forEach(t => t.classList.remove('is-active'));
            tab.classList.add('is-active');

            panelPanes.forEach(pane => {
                pane.classList.toggle('is-active', pane.dataset.pane === target);
            });
        });
    });

    // ---- Top bar: device switcher (visual resize of canvas frame) ----
    const deviceButtons = document.querySelectorAll('.device-switch__btn');
    const canvasFrame = document.querySelector('.canvas-frame');
    const frameWidths = {
        desktop: '1200px',
        tablet: '768px',
        mobile: '390px'
    };

    deviceButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            deviceButtons.forEach(b => b.classList.remove('is-active'));
            btn.classList.add('is-active');

            const device = btn.dataset.device;
            if (canvasFrame && frameWidths[device]) {
                canvasFrame.style.width = frameWidths[device];
            }
        });
    });

    // ---- Theme cards (visual selection only) ----
    document.querySelectorAll('.theme-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('is-active'));
            card.classList.add('is-active');
        });
    });

    // ---- Font cards (visual selection only) ----
    document.querySelectorAll('.font-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.font-card').forEach(c => c.classList.remove('is-active'));
            card.classList.add('is-active');
        });
    });

    // ---- Canvas: render the initial (empty) state from the data model ----
    renderPageIntoCanvas([], document.querySelector('.canvas-frame'));

    // ---- Layouts: load automatically from /layout, then wire up selection ----
    loadPages();

});

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
//                   // content — see docs/DATA_MODEL.md. Rendered onto the
//                   // canvas via renderer.js when this layout's card is clicked.
// }
// ============================================================

async function loadPages() {
    const accordion = document.getElementById('pageAccordion');
    if (!accordion) return;

    try {
        const pages = await fetch('layout/pages.json').then(res => res.json());
        const loaded = await Promise.all(pages.map(loadPageLayouts));

        accordion.innerHTML = '';
        // The first page (Home) starts expanded; the rest start collapsed.
        loaded.forEach((page, i) => accordion.appendChild(buildPageSection(page, i === 0)));

        wireLayoutCardSelection(accordion, loaded);
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

function wireLayoutCardSelection(accordion, pages) {
    const canvasFrame = document.querySelector('.canvas-frame');

    accordion.querySelectorAll('.layout-card').forEach(card => {
        card.addEventListener('click', () => {
            // The canvas holds one page at a time, so selection is global
            // across the accordion — picking a layout on any page clears
            // the selection everywhere else.
            accordion.querySelectorAll('.layout-card').forEach(c => c.classList.remove('is-active'));
            card.classList.add('is-active');

            // Layout ids are only unique within a page (every page can have
            // its own "blank"), so resolve the page first.
            const pageId = card.closest('.page-section').dataset.pageId;
            const page = pages.find(p => p.id === pageId);
            const layout = page && page.layouts.find(l => l.id === card.dataset.layoutId);

            // NOTE: this swaps the canvas immediately with no confirmation
            // prompt yet — that's TODO Phase 9 item 38 ('confirmation
            // prompt when applying a layout over existing content').
            if (layout) renderPageIntoCanvas(layout.sections, canvasFrame);
        });
    });
}
