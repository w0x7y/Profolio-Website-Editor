#!/usr/bin/env python3
# ============================================================
# LAYOUT JSON VALIDATOR
#
# This repo has no build step, no test suite and no linter, so a broken
# layout file has nothing to catch it before the browser does — and the
# browser fails loudly but unhelpfully: loadPageLayouts() in
# scripts/layouts-panel.js fetches every manifest and every layout inside
# one Promise.all, so a single malformed or missing file rejects the whole
# chain and the entire Layouts accordion renders "Couldn't load pages."
# One typo takes out all eight pages, not just its own card.
#
# The other half is quieter and worse: a layout file that exists but is not
# listed in its folder's manifest.json is simply never fetched. Nothing
# errors. The card just isn't there, and the only symptom is a count in the
# accordion header that is one lower than you expected.
#
# Both are mechanical checks, which is why they live here as a hook rather
# than as another paragraph in CLAUDE.md: prose asks an assistant to
# remember, a hook runs every time.
#
# Two modes, selected by `--hook` rather than by sniffing stdin — a tty test
# is wrong under a hook runner, where stdin is a pipe that may simply be empty:
#   * `--hook` (see .claude/settings.json) reads the PostToolUse payload on
#     stdin, checks only the file that was just written, and exits 2 with the
#     problem on stderr so Claude is told to fix it;
#   * otherwise `python3 .claude/hooks/check-layout-json.py` checks the whole
#     layout/ tree, or pass paths to check specific files.
#
# Whitelists are *parsed out of the source* (STYLE_PROP_TO_JS and
# NODE_TAG_BY_TYPE in scripts/renderer.js) rather than copied here. The repo
# already has two copies of the style whitelist to keep in sync (renderer.js
# and docs/DATA_MODEL.md); a third, hidden inside a hook, would be the copy
# nobody remembers to update.
# ============================================================

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
LAYOUT_DIR = REPO / 'layout'
RENDERER = REPO / 'scripts' / 'renderer.js'

# Layout card keys that layouts-panel.js reads when it builds a card.
REQUIRED_LAYOUT_KEYS = ('id', 'name', 'description', 'preview', 'sections')

# Preview block tones are semantic, not decorative — see the header comment
# in scripts/layouts-panel.js. An unknown tone renders as an unstyled block.
PREVIEW_TONES = {'gradient-accent', 'gradient-dark', 'accent', 'neutral', ' '}

CONTAINER_TYPES = {'section', 'row', 'column', 'group'}

# Leaf-only keys, used to catch a node that mixes container and leaf shapes.
LEAF_CONTENT_KEYS = ('content', 'src', 'alt')


def parse_js_object_keys(source, name):
    """Pull the keys of a flat `const <name> = { ... };` object literal."""
    match = re.search(r'const\s+' + name + r'\s*=\s*\{(.*?)\n\};', source, re.S)
    if not match:
        return set()
    return set(re.findall(r'^\s*([A-Za-z][\w]*)\s*:', match.group(1), re.M))


def whitelists():
    """Style props and node types, read from renderer.js so they can't drift."""
    try:
        source = RENDERER.read_text(encoding='utf-8')
    except OSError:
        # Without renderer.js there is nothing to check against; the
        # structural checks below still run.
        return set(), set()
    return parse_js_object_keys(source, 'STYLE_PROP_TO_JS'), parse_js_object_keys(source, 'NODE_TAG_BY_TYPE')


STYLE_PROPS, NODE_TYPES = whitelists()


def rel(path):
    try:
        return str(Path(path).resolve().relative_to(REPO))
    except ValueError:
        return str(path)


def load_json(path, errors):
    try:
        return json.loads(Path(path).read_text(encoding='utf-8'))
    except json.JSONDecodeError as err:
        errors.append(f'{rel(path)}: not valid JSON — {err}')
    except OSError as err:
        errors.append(f'{rel(path)}: could not be read — {err}')
    return None


def check_node(node, path, errors, where):
    if not isinstance(node, dict):
        errors.append(f'{rel(path)}: {where} is not an object')
        return

    node_id = node.get('id')
    label = f'{where} ("{node_id}")' if node_id else where
    if not node_id:
        errors.append(f'{rel(path)}: {where} has no "id"')

    node_type = node.get('type')
    if not node_type:
        errors.append(f'{rel(path)}: {label} has no "type"')
    elif NODE_TYPES and node_type not in NODE_TYPES:
        errors.append(
            f'{rel(path)}: {label} has unknown type "{node_type}" — '
            f'renderer.js knows {", ".join(sorted(NODE_TYPES))}'
        )

    # A node is a container or a leaf, never both (see docs/DATA_MODEL.md).
    children = node.get('children')
    if node_type in CONTAINER_TYPES:
        if children is None:
            errors.append(f'{rel(path)}: {label} is a container with no "children"')
        mixed = [key for key in LEAF_CONTENT_KEYS if key in node]
        if mixed:
            errors.append(
                f'{rel(path)}: {label} is a container but also carries leaf '
                f'content ({", ".join(mixed)}) — a node never mixes the two'
            )
    else:
        # `layout` is container-only too: renderer.js only reads it inside
        # applyNodeLayout(), which returns early for a leaf, so a layout on a
        # leaf is silently ignored rather than rejected.
        container_only = [key for key in ('children', 'layout') if node.get(key) is not None]
        if container_only:
            errors.append(
                f'{rel(path)}: {label} is a leaf ("{node_type}") but carries '
                f'container field(s) ({", ".join(container_only)})'
            )

    style_base = (node.get('style') or {}).get('base')
    if style_base is not None:
        if not isinstance(style_base, dict):
            errors.append(f'{rel(path)}: {label} has a non-object "style.base"')
        elif STYLE_PROPS:
            unknown = sorted(set(style_base) - STYLE_PROPS)
            if unknown:
                errors.append(
                    f'{rel(path)}: {label} sets style props outside the whitelist '
                    f'({", ".join(unknown)}) — renderer.js drops these silently. '
                    f'Add them to STYLE_PROP_TO_JS *and* docs/DATA_MODEL.md, or remove them'
                )

    if isinstance(children, list):
        for index, child in enumerate(children):
            check_node(child, path, errors, f'{label} > child[{index}]')


def check_preview(preview, path, errors):
    if not isinstance(preview, dict):
        errors.append(f'{rel(path)}: "preview" is not an object')
        return
    if preview.get('blank'):
        return
    blocks = preview.get('blocks')
    if not isinstance(blocks, list):
        errors.append(f'{rel(path)}: "preview" needs a "blocks" array (or "blank": true)')
        return
    for index, block in enumerate(blocks):
        if not isinstance(block, dict):
            errors.append(f'{rel(path)}: preview block[{index}] is not an object')
            continue
        tone = block.get('tone')
        if tone is not None and tone not in PREVIEW_TONES:
            errors.append(
                f'{rel(path)}: preview block[{index}] has unknown tone "{tone}" — '
                f'expected one of gradient-accent, gradient-dark, accent, neutral, " "'
            )


def check_layout_file(path, errors):
    data = load_json(path, errors)
    if data is None:
        return
    if not isinstance(data, dict):
        errors.append(f'{rel(path)}: a layout file must be an object')
        return

    missing = [key for key in REQUIRED_LAYOUT_KEYS if key not in data]
    if missing:
        errors.append(f'{rel(path)}: missing required key(s): {", ".join(missing)}')

    stem = Path(path).stem
    if data.get('id') and data['id'] != stem:
        errors.append(f'{rel(path)}: "id" is "{data["id"]}" but the filename says "{stem}"')

    if 'preview' in data:
        check_preview(data['preview'], path, errors)

    sections = data.get('sections')
    if sections is None:
        pass  # already reported as a missing key
    elif not isinstance(sections, list):
        errors.append(f'{rel(path)}: "sections" must be an array')
    else:
        for index, section in enumerate(sections):
            check_node(section, path, errors, f'sections[{index}]')

    # The quiet failure: present on disk, absent from the manifest, never fetched.
    folder = Path(path).parent
    manifest_path = folder / 'manifest.json'
    if not manifest_path.exists():
        errors.append(
            f'{rel(path)}: {rel(folder)} has no manifest.json, so nothing in it is '
            f'ever fetched. Create one listing "{Path(path).name}"'
        )
    else:
        manifest = load_json(manifest_path, errors)
        if isinstance(manifest, list) and Path(path).name not in manifest:
            errors.append(
                f'{rel(path)}: not listed in {rel(manifest_path)}, so the browser never '
                f'fetches it and no card appears. Add "{Path(path).name}" to that manifest'
            )
    check_page_registered(folder, errors)


def declared_page_ids():
    """The page ids pages.json actually declares, or None if it can't be read."""
    try:
        data = json.loads((LAYOUT_DIR / 'pages.json').read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return None  # pages.json has its own checker; don't report it twice
    if not isinstance(data, list):
        return None
    return {page['id'] for page in data if isinstance(page, dict) and isinstance(page.get('id'), str)}


def check_page_registered(folder, errors):
    """A page folder missing from pages.json is never walked, so never rendered."""
    folder = Path(folder).resolve()
    if folder == LAYOUT_DIR.resolve():
        return
    declared = declared_page_ids()
    if declared is not None and folder.name not in declared:
        errors.append(
            f'{rel(folder)}: not listed in layout/pages.json, so the accordion never '
            f'shows it. Add {{ "id": "{folder.name}", "name": "..." }} to pages.json'
        )


def check_manifest(path, errors):
    data = load_json(path, errors)
    if data is None:
        return
    if not isinstance(data, list):
        errors.append(f'{rel(path)}: a manifest must be an array of filenames')
        return

    folder = Path(path).parent
    check_page_registered(folder, errors)
    for entry in data:
        if not isinstance(entry, str):
            errors.append(f'{rel(path)}: entry {entry!r} is not a filename string')
        elif not (folder / entry).exists():
            errors.append(f'{rel(path)}: lists "{entry}", which does not exist in {rel(folder)}')

    unlisted = sorted(
        item.name for item in folder.glob('*.json')
        if item.name != 'manifest.json' and item.name not in data
    )
    if unlisted:
        errors.append(
            f'{rel(path)}: {rel(folder)} also holds {", ".join(unlisted)}, which no '
            f'manifest entry loads. Add them here or delete them'
        )


def check_pages(path, errors):
    data = load_json(path, errors)
    if data is None:
        return
    if not isinstance(data, list):
        errors.append(f'{rel(path)}: pages.json must be an array of {{ "id", "name" }} objects')
        return
    for index, page in enumerate(data):
        # Both must be *strings*, not merely present: `LAYOUT_DIR / 1` raises
        # a TypeError, which would crash the hook instead of reporting the file.
        if not isinstance(page, dict) or not isinstance(page.get('id'), str) \
                or not isinstance(page.get('name'), str):
            errors.append(f'{rel(path)}: entry[{index}] needs both "id" and "name" as strings')
            continue
        manifest = LAYOUT_DIR / page['id'] / 'manifest.json'
        if not manifest.exists():
            errors.append(
                f'{rel(path)}: page "{page["id"]}" has no {rel(manifest)} — '
                f'a browser cannot list a folder, so the manifest is required '
                f'even when it is empty ([])'
            )

    # And the other direction: a folder nobody declared is never rendered.
    for folder in sorted(item for item in LAYOUT_DIR.iterdir() if item.is_dir()):
        check_page_registered(folder, errors)


def check_path(path, errors):
    """Route one file to the right checker. Non-layout paths are ignored."""
    path = Path(path)
    if path.suffix != '.json' or not path.exists():
        return
    try:
        relative = path.resolve().relative_to(LAYOUT_DIR)
    except ValueError:
        return  # not part of the layout library

    if relative == Path('pages.json'):
        check_pages(path, errors)
    elif path.name == 'manifest.json':
        check_manifest(path, errors)
    else:
        check_layout_file(path, errors)


def all_layout_paths():
    if not LAYOUT_DIR.exists():
        return []
    return sorted(LAYOUT_DIR.rglob('*.json'))


def main():
    errors = []

    args = sys.argv[1:]

    if args and args[0] == '--hook':
        # PostToolUse payload: { "tool_input": { "file_path": "..." }, ... }
        try:
            payload = json.load(sys.stdin)
        except (json.JSONDecodeError, ValueError):
            return 0  # not a payload we understand; stay out of the way
        file_path = (payload.get('tool_input') or {}).get('file_path')
        if not file_path:
            return 0
        paths = [Path(file_path)]
        # A manifest edit can only be judged against its folder, and a layout
        # edit against its manifest, so pull in the sibling either way.
        sibling = Path(file_path).parent / 'manifest.json'
        if sibling.exists() and sibling != Path(file_path):
            paths.append(sibling)
    elif args:
        paths = [Path(arg) for arg in args]
    else:
        paths = all_layout_paths()

    for path in paths:
        check_path(path, errors)

    if errors:
        print('Layout library check failed:', file=sys.stderr)
        for error in dict.fromkeys(errors):  # de-duplicate, keep order
            print(f'  - {error}', file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
