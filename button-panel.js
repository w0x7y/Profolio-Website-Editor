// ============================================================
// BUTTON TOOL PANEL
//
// The controls inside the left tool panel's Button pane. They edit the
// currently selected `button` node on the canvas: what it is (a link or a
// button), where it goes, and what it runs.
//
// The label itself is not edited here — "Edit Text" hands off to the Text
// pane, which already owns content, typography and color for every node type
// that carries copy.
//
// Ownership boundary, same as text-panel.js: script.js decides *what* is
// selected and calls syncButtonPanel() with the element; this file never
// reads script.js's `selectedEl`. The seams are openToolPanel() and its
// mirror in closeToolPanel().
//
// The action state itself (readAction / writeAction / applyAction) lives in
// link-controls.js — this file is only the pane around it.
//
// Everything is written straight to the DOM element, exactly like the Text
// pane, so none of it survives a reload (see docs/DATA_MODEL.md).
// ============================================================

let buttonTarget = null;   // the canvas element the controls are editing
let buttonEls = null;      // cached control refs, null until initButtonPanel()
let buttonTypeSwitch = null;
let buttonLinkControls = null;

function initButtonPanel() {
    const body = document.getElementById('buttonPanelBody');
    if (!body) return;

    buttonEls = {
        empty: document.getElementById('buttonPanelEmpty'),
        body: body,
        editText: document.getElementById('buttonEditText'),
        typeMount: document.getElementById('buttonTypeMount'),
        linkGroup: document.getElementById('buttonLinkGroup'),
        linkMount: document.getElementById('buttonLinkMount'),
        scriptGroup: document.getElementById('buttonScriptGroup'),
        onClick: document.getElementById('buttonOnClick')
    };

    // Swaps the *pane*, not the tool. setActiveTool('text') would run
    // clearSelection() and blank the pane it just opened — selection is a
    // Select-tool concept and has to stay one.
    buttonEls.editText.addEventListener('click', () => openToolPanel('text'));

    buttonTypeSwitch = buildSegmented(
        [{ value: 'link', label: 'Link' }, { value: 'button', label: 'Button' }],
        'Button type',
        type => {
            showActionType(type);
            writeAction(buttonTarget, { actionType: type });
        }
    );
    buttonEls.typeMount.appendChild(buttonTypeSwitch);

    buttonLinkControls = createLinkControls();
    buttonEls.linkMount.appendChild(buttonLinkControls.root);

    // Stored, never executed. See the note on data-on-click below.
    buttonEls.onClick.addEventListener('input', () => {
        writeAction(buttonTarget, { onClick: buttonEls.onClick.value });
    });
}

/**
 * Point the controls at a canvas element, or at nothing. Called from
 * openToolPanel() every time the Button pane is revealed, so re-selecting the
 * same node after dismissing the panel repopulates it.
 */
function syncButtonPanel(el) {
    if (!buttonEls) return;

    buttonTarget = el && el.dataset.nodeType === 'button' ? el : null;
    buttonEls.empty.hidden = !!buttonTarget;
    buttonEls.body.hidden = !buttonTarget;

    buttonLinkControls.sync(buttonTarget);
    if (!buttonTarget) return;

    const action = readAction(buttonTarget);
    setSegmentedValue(buttonTypeSwitch, action.type);
    showActionType(action.type);

    // The JS is held in data-on-click and never in an onclick *attribute*: an
    // attribute would be executed by the browser on click, inside the
    // editor's own page. It becomes a real handler at publish time instead.
    buttonEls.onClick.value = action.onClick;
}

function showActionType(type) {
    buttonEls.linkGroup.hidden = type !== 'link';
    buttonEls.scriptGroup.hidden = type !== 'button';
}
