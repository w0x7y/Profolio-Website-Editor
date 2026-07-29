// ============================================================
// ASSET GRID
//
// One thumbnail grid, rendered in two places: the right panel's Assets tab
// and the Image pane's Source group. They are the same list of the same
// images and differ only in what a tile does — the Assets tab deletes,
// the Image pane assigns to the selected element — so they share the markup
// and differ by callback rather than by being two grids that have to be kept
// looking alike.
//
// Rebuilt wholesale on every store change rather than diffed. The library is
// a handful of images a user picked by hand; a keyed diff would be more code
// than the thing it optimizes.
// ============================================================

import { listAssets } from './asset-store.js';

/**
 * Fill `container` with a tile per asset.
 *
 * @param {Element}  container
 * @param {object}   options
 * @param {string}   options.emptyText  shown instead of tiles when there are none
 * @param {string}  [options.activeUrl] the asset showing this url gets `is-active`
 * @param {Function}[options.onPick]    called with the asset when a tile is clicked
 * @param {Function}[options.onDelete]  when given, each tile gets a remove button
 */
export function renderAssetGrid(container, options) {
    if (!container) return;

    const assets = listAssets();
    container.replaceChildren();

    if (!assets.length) {
        const empty = document.createElement('p');
        empty.className = 'asset-grid__empty';
        empty.textContent = options.emptyText;
        container.appendChild(empty);
        return;
    }

    assets.forEach(asset => container.appendChild(buildTile(asset, options)));
}

function buildTile(asset, options) {
    const tile = document.createElement('div');
    tile.className = 'asset-tile';
    tile.dataset.assetId = asset.id;

    // A button, not a div with a click handler: the tile is the primary
    // action in both grids, so it has to be reachable and pressable from the
    // keyboard like any other control in the panels.
    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'asset-tile__pick';
    pick.title = asset.name;
    pick.setAttribute('aria-label', asset.name);

    if (options.activeUrl && asset.url === options.activeUrl) {
        tile.classList.add('is-active');
        pick.setAttribute('aria-current', 'true');
    }

    const img = document.createElement('img');
    img.src = asset.url;
    img.alt = '';
    pick.appendChild(img);

    if (options.onPick) pick.addEventListener('click', () => options.onPick(asset));
    tile.appendChild(pick);

    if (options.onDelete) tile.appendChild(buildRemoveButton(asset, options.onDelete));

    return tile;
}

function buildRemoveButton(asset, onDelete) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'asset-tile__remove';
    remove.title = `Remove ${asset.name}`;
    remove.setAttribute('aria-label', `Remove ${asset.name}`);
    remove.innerHTML =
        '<svg viewBox="0 0 24 24" class="icon"><path d="M6 6l12 12M18 6L6 18"/></svg>';

    remove.addEventListener('click', e => {
        // The remove button sits on top of the pick button. Without this the
        // click assigns the asset on its way to deleting it.
        e.stopPropagation();
        onDelete(asset);
    });

    return remove;
}
