// ============================================================
// DASHBOARD  (index.html)
//
// The front door: every project the browser has stored, and what can be done
// to one — open it, rename it, delete it, or create another. This is TODO
// Phase 1, item 6, and it is a separate page rather than a panel inside the
// editor because it is what you land on before an editor has a project to
// edit at all.
//
// Its own entry point. main.js boots the editor and reaches for a canvas, a
// tool panel and a right-hand panel, none of which exist here; the two pages
// share modules rather than a boot sequence. What they share is storage.js
// (the same database) and project-record.js (the same record shape), so a
// project this page creates is one the editor can open without either of them
// describing the record twice. Note which module that is: project.js owns the
// project the *editor* has open and pulls in the canvas, the renderer and the
// asset store with it — none of which this page has any use for.
//
// Rendering is one function: render() draws the whole list from a fresh read
// of storage, and every action ends by calling it again. The list is short
// and the redraw is cheap, so there is no reconciliation to get wrong — the
// screen is a function of what is in the database, not of what this file
// believes happened.
// ============================================================

import { listProjects, getProject, putProject, deleteProject } from './storage.js';
import { createProject, pageSections } from './project-record.js';

const EDITOR_URL = 'editor.html';

const els = {};

function boot() {
    els.grid = document.getElementById('projectGrid');
    els.empty = document.getElementById('projectsEmpty');
    els.loading = document.getElementById('projectsLoading');

    els.newDialog = document.getElementById('newProjectDialog');
    els.newForm = document.getElementById('newProjectForm');
    els.newName = document.getElementById('newProjectName');

    els.renameDialog = document.getElementById('renameDialog');
    els.renameForm = document.getElementById('renameForm');
    els.renameName = document.getElementById('renameName');

    els.deleteDialog = document.getElementById('deleteDialog');
    els.deleteForm = document.getElementById('deleteForm');
    els.deleteBody = document.getElementById('deleteBody');

    document.getElementById('newProject').addEventListener('click', openNewDialog);
    document.getElementById('newProjectEmpty').addEventListener('click', openNewDialog);

    wireDialog(els.newDialog);
    wireDialog(els.renameDialog);
    wireDialog(els.deleteDialog);

    els.newForm.addEventListener('submit', onCreate);
    els.renameForm.addEventListener('submit', onRename);
    els.deleteForm.addEventListener('submit', onDelete);

    render();
}

/**
 * Every dialog here closes the same three ways: its Cancel button, Escape
 * (native), or a click on the backdrop. The last one needs the check below —
 * the dialog element itself is the whole backdrop, so a click that lands on
 * it rather than on its form is a click outside the window.
 */
function wireDialog(dialog) {
    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
        if (event.target === dialog) dialog.close();
    });
}

// ---- the list ---------------------------------------------------------

async function render() {
    let projects;
    try {
        projects = await listProjects();
    } catch (err) {
        console.error('Could not read saved projects', err);
        showStatus('Your projects couldn’t be loaded. The browser may be blocking storage.');
        return;
    }

    els.loading.hidden = true;
    els.empty.hidden = projects.length > 0;
    els.grid.hidden = projects.length === 0;

    els.grid.replaceChildren(...projects.map(buildCard));
}

function showStatus(message) {
    els.loading.hidden = false;
    els.loading.textContent = message;
    els.empty.hidden = true;
    els.grid.hidden = true;
}

/**
 * One project card. The card itself is the link into the editor, with the
 * two actions as buttons on top of it — a nested <button> inside an <a> is
 * invalid, so the anchor covers the card through a stretched pseudo-element
 * (see .project-card__link in dashboard.css) and the actions sit above it.
 */
function buildCard(project) {
    const item = document.createElement('li');
    item.className = 'project-card';

    const link = document.createElement('a');
    link.className = 'project-card__link';
    link.href = `${EDITOR_URL}?project=${encodeURIComponent(project.id)}`;

    const name = document.createElement('span');
    name.className = 'project-card__name';
    name.textContent = project.name;

    const meta = document.createElement('span');
    meta.className = 'project-card__meta';
    meta.textContent = sectionSummary(project);

    link.appendChild(name);
    link.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'project-card__actions';
    actions.appendChild(buildAction('Rename', () => openRenameDialog(project)));
    actions.appendChild(buildAction('Delete', () => openDeleteDialog(project)));

    item.appendChild(link);
    item.appendChild(actions);
    return item;
}

function buildAction(label, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'project-card__action';
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
}

/** "Empty" or "3 sections" — the only thing a card can say about a project
 *  without rendering it. */
function sectionSummary(project) {
    const count = pageSections(project).length;

    if (count === 0) return 'Empty';
    return count === 1 ? '1 section' : `${count} sections`;
}

// ---- create -----------------------------------------------------------

function openNewDialog() {
    els.newName.value = '';
    els.newDialog.showModal();
    els.newName.focus();
}

/**
 * Create the record, then go straight into the editor on it. Writing it here
 * rather than letting the editor create it on first save is what makes the
 * editor's rule — it only ever opens a project that already exists — hold.
 */
async function onCreate(event) {
    event.preventDefault();

    const project = createProject(els.newName.value);

    try {
        await putProject(project);
    } catch (err) {
        console.error('Could not create the project', err);
        window.alert('The project couldn’t be created. The browser may be blocking storage.');
        return;
    }

    els.newDialog.close();
    window.location.href = `${EDITOR_URL}?project=${encodeURIComponent(project.id)}`;
}

// ---- rename -----------------------------------------------------------

let renaming = null;

function openRenameDialog(project) {
    renaming = project;
    els.renameName.value = project.name;
    els.renameDialog.showModal();
    els.renameName.select();
}

async function onRename(event) {
    event.preventDefault();

    const name = els.renameName.value.trim();
    if (!renaming || !name) return;

    try {
        // Re-read rather than writing the copy this card was drawn from: that
        // copy is a snapshot from page load, and an editor open in another tab
        // may have saved the project since. Writing the snapshot back would
        // undo that save — a rename should only change the name.
        const current = await getProject(renaming.id);
        if (current) await putProject(Object.assign({}, current, { name: name }));
    } catch (err) {
        console.error('Could not rename the project', err);
    }

    renaming = null;
    els.renameDialog.close();
    render();
}

// ---- delete -----------------------------------------------------------

let deleting = null;

function openDeleteDialog(project) {
    deleting = project;
    els.deleteBody.textContent =
        `“${project.name}” and any images uploaded to it will be deleted. This can’t be undone.`;
    els.deleteDialog.showModal();
}

async function onDelete(event) {
    event.preventDefault();
    if (!deleting) return;

    try {
        await deleteProject(deleting.id);
    } catch (err) {
        console.error('Could not delete the project', err);
    }

    deleting = null;
    els.deleteDialog.close();
    render();
}

// Module scripts are deferred, so the document is already parsed — the same
// reasoning as main.js, minus the readyState fallback, since nothing loads
// this file any other way.
boot();
