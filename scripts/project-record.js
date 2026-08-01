// ============================================================
// THE PROJECT RECORD
//
// What a stored project *is* — the shape in docs/DATA_MODEL.md, and the one
// function that mints a new one.
//
// Split out from project.js, which owns the project the *editor* has open,
// because the dashboard needs to create records without needing an editor.
// project.js reaches the canvas, the renderer, the serializer, the theme
// panel and the asset store; importing it from index.html would evaluate that
// whole graph on a page that has no canvas to render into. This file imports
// nothing.
//
// It is also the natural home for a migration when the shape changes:
// PROJECT_VERSION is stamped on every record written, and both pages read
// records through here.
// ============================================================

// Bumped when a stored record's shape changes in a way a reader has to know
// about. Nothing branches on it yet — it is here so that the first migration
// has something to read rather than having to infer a record's age.
export const PROJECT_VERSION = 1;

const DEFAULT_NAME = 'Untitled Portfolio';

/**
 * A brand-new project, ready to be written to storage.
 *
 * `pages` is an array of one, as docs/DATA_MODEL.md describes: real
 * multi-page support (TODO Phase 10) then costs a push rather than a
 * migration of every stored project.
 *
 * @param {string} [name] - What the user typed; blank falls back to "Untitled Portfolio".
 * @returns {Object} The project record.
 */
export function createProject(name) {
    const now = new Date().toISOString();

    return {
        id: 'proj_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        version: PROJECT_VERSION,
        name: (name || '').trim() || DEFAULT_NAME,
        createdAt: now,
        updatedAt: now,
        // Filled by the first save, from whatever the Themes tab has applied.
        // Null rather than a copy of the defaults so there is one place that
        // decides what "no theme chosen" resolves to (theme.js).
        theme: null,
        settings: { title: '', description: '', favicon: null, domain: null },
        pages: [{ id: 'page_home', name: 'Home', slug: '/', isHome: true, sections: [] }]
    };
}

/**
 * The sections of the page being edited — the only page a project has today.
 * @param {Object} record
 * @returns {Array}
 */
export function pageSections(record) {
    const page = ((record && record.pages) || [])[0];
    return (page && page.sections) || [];
}
