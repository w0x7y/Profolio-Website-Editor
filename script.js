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

    // ---- Layout cards (visual selection only) ----
    document.querySelectorAll('.layout-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.layout-card').forEach(c => c.classList.remove('is-active'));
            card.classList.add('is-active');
        });
    });

});
