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
    loadLayouts();

});

// ============================================================
// LAYOUT LOADING
//
// Each layout lives as its own JSON file inside /layout, e.g:
//   layout/minimal.json
//   layout/bold-studio.json
//   ...
// /layout/manifest.json simply lists which files to load, since a
// browser can't read a folder's contents by itself.
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

async function loadLayouts() {
    const grid = document.getElementById('layoutGrid');
    if (!grid) return;

    try {
        const manifestRes = await fetch('layout/manifest.json');
        const files = await manifestRes.json();

        const layouts = await Promise.all(
            files.map(file => fetch(`layout/${file}`).then(res => res.json()))
        );

        grid.innerHTML = '';
        layouts.forEach(layout => grid.appendChild(buildLayoutCard(layout)));

        wireLayoutCardSelection(grid, layouts);
    } catch (err) {
        grid.innerHTML = '<p class="panel__hint">Couldn\'t load layouts.</p>';
        console.error('Failed to load layouts from /layout:', err);
    }
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

function wireLayoutCardSelection(grid, layouts) {
    const canvasFrame = document.querySelector('.canvas-frame');

    grid.querySelectorAll('.layout-card').forEach(card => {
        card.addEventListener('click', () => {
            grid.querySelectorAll('.layout-card').forEach(c => c.classList.remove('is-active'));
            card.classList.add('is-active');

            // NOTE: this swaps the canvas immediately with no confirmation
            // prompt yet — that's TODO Phase 9 item 38 ('confirmation
            // prompt when applying a layout over existing content').
            const layout = layouts.find(l => l.id === card.dataset.layoutId);
            if (layout) renderPageIntoCanvas(layout.sections, canvasFrame);
        });
    });
}
