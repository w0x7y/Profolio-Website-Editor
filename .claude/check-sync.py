#!/usr/bin/env python3
"""Check the cross-file couplings listed in CLAUDE.md.

This repo has no build step, no test suite and no linter, so nothing catches
the one failure mode its structure invites: two files that have to agree
silently drifting apart. Every check below is a pair (or triple) of places
that state the same fact, where the code keeps working and just quietly does
the wrong thing when they disagree — a style prop the renderer drops, a font
the canvas can't load, a layout card that never appears.

Deliberately stdlib-only and read-only: the project ships no package.json and
adding a dependency to lint it would cost more than it saves. The parsing is
regex over narrow, known shapes rather than a real JS/CSS parse, which is
enough for these and fails loudly rather than silently if a shape changes.

Usage:  python3 .claude/check-sync.py
Exit:   0 = everything agrees, 1 = at least one coupling has drifted
"""

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

failures = []
notes = []


def read(relative_path):
    return (ROOT / relative_path).read_text(encoding='utf-8')


def strip_line_comments(text):
    """Drop // comments so their contents can't be mistaken for code."""
    return re.sub(r'//[^\n]*', '', text)


def block_after(text, marker, opener='{', closer='}', containing=None):
    """The brace-balanced block that follows `marker`.

    A selector can appear more than once (`.canvas-frame` has both a layout
    rule and the token block), so `containing` picks the occurrence that holds
    a given substring rather than blindly taking the first.
    """
    searched_from = 0
    while True:
        found = text.index(marker, searched_from) + len(marker)
        searched_from = found
        start = text.index(opener, found)
        depth = 0
        for i in range(start, len(text)):
            if text[i] == opener:
                depth += 1
            elif text[i] == closer:
                depth -= 1
                if depth == 0:
                    block = text[start:i + 1]
                    if containing is None or containing in block:
                        return block
                    break
        else:
            raise ValueError(f'unbalanced block after {marker!r}')


def compare(label, left_name, left, right_name, right):
    """Report the symmetric difference between two sets."""
    only_left = sorted(left - right)
    only_right = sorted(right - left)
    if only_left or only_right:
        detail = []
        if only_left:
            detail.append(f'only in {left_name}: {", ".join(only_left)}')
        if only_right:
            detail.append(f'only in {right_name}: {", ".join(only_right)}')
        failures.append(f'{label}\n    ' + '\n    '.join(detail))
    else:
        notes.append(f'{label}: {len(left)} entries agree')


# ---- 1. STYLE_PROP_TO_JS (renderer.js) <-> StyleProps (docs/DATA_MODEL.md) ----

def check_style_props():
    renderer = strip_line_comments(read('scripts/renderer.js'))
    block = block_after(renderer, 'const STYLE_PROP_TO_JS =')
    code_props = set(re.findall(r'(\w+)\s*:', block))

    doc = strip_line_comments(read('docs/DATA_MODEL.md'))
    doc_block = block_after(doc, 'StyleProps = ')
    doc_props = set(re.findall(r'(\w+)\??\s*:', doc_block))

    compare('STYLE_PROP_TO_JS <-> StyleProps',
            'renderer.js', code_props, 'DATA_MODEL.md', doc_props)


# ---- 2. FONT_GROUPS (theme.js) <-> the Google Fonts URL (index.html) ----

def check_fonts():
    theme = read('scripts/theme.js')
    groups = block_after(theme, 'export const FONT_GROUPS =', '[', ']')
    google = groups[groups.index("label: 'Google Fonts'"):]
    declared = set(re.findall(r"name: '([^']+)'", google))

    html = read('index.html')
    urls = re.findall(r'href="(https://fonts\.googleapis\.com/css2\?[^"]+)"', html)
    if len(urls) != 2:
        failures.append(f'Google Fonts URL: expected 2 (<link> + <noscript>), found {len(urls)}')
        return
    if urls[0] != urls[1]:
        failures.append('Google Fonts URL: the <link> and <noscript> copies differ')
        return

    linked = {f.replace('+', ' ') for f in re.findall(r'family=([^:&]+)', urls[0])}
    compare('FONT_GROUPS <-> Google Fonts URL',
            'theme.js', declared, 'index.html', linked)


# ---- 3. THEME_COLOR_PROPS (theme.js) <-> the --color-* block (style.css) ----

def check_theme_colors():
    theme = read('scripts/theme.js')
    block = block_after(theme, 'const THEME_COLOR_PROPS =')
    declared = set(re.findall(r"'(--color-[\w-]+)'", block))

    css = read('styles/style.css')
    # The trailing colon matters: it distinguishes the block that *declares*
    # the token from the earlier rule that merely reads var(--color-background).
    frame = block_after(css, '\n.canvas-frame ', containing='--color-background:')
    # The base tokens are the ones a theme actually writes; the neutrals are
    # derived from them with color-mix() and are not a theme's to define.
    base = {name for name, value in re.findall(r'(--color-[\w-]+)\s*:\s*([^;]+);', frame)
            if 'color-mix' not in value}

    compare('THEME_COLOR_PROPS <-> .canvas-frame base tokens',
            'theme.js', declared, 'style.css', base)

    # Every preset must define all six, or a theme pick writes "undefined"
    # into the custom property and the canvas falls back mid-theme.
    expected = set(re.findall(r'(\w+)\s*:', block))
    themes = block_after(theme, 'const THEMES =', '[', ']')
    presets = re.findall(r"id: '([^']+)'[^{]*?colors: (\{[^}]*\})", themes, re.S)
    if not presets:
        failures.append('THEMES: no presets parsed — the shape probably changed')
    for name, colors in presets:
        missing = expected - set(re.findall(r'(\w+)\s*:', colors))
        if missing:
            failures.append(f'theme {name!r} is missing colors: {", ".join(sorted(missing))}')
    if presets and not failures:
        notes.append(f'THEMES presets: {len(presets)} each define all {len(expected)} colors')


# ---- 4. TOOL_PANEL_TOOLS <-> data-tool-pane panes <-> NODE_TYPE_PANES ----

def check_tool_panes():
    tool_panel = read('scripts/tool-panel.js')
    line = re.search(r'TOOL_PANEL_TOOLS = new Set\(\[([^\]]+)\]\)', tool_panel).group(1)
    tools = set(re.findall(r"'([^']+)'", line))

    html = read('index.html')
    panes = set(re.findall(r'data-tool-pane="([^"]+)"', html))
    compare('TOOL_PANEL_TOOLS <-> data-tool-pane panes',
            'tool-panel.js', tools, 'index.html', panes)

    selection = strip_line_comments(read('scripts/selection.js'))
    block = block_after(selection, 'const NODE_TYPE_PANES =')
    targets = set(re.findall(r":\s*'([^']+)'", block))
    orphans = sorted(targets - tools)
    if orphans:
        failures.append('NODE_TYPE_PANES points at panes that are not in '
                        f'TOOL_PANEL_TOOLS: {", ".join(orphans)}')
    else:
        notes.append(f'NODE_TYPE_PANES -> TOOL_PANEL_TOOLS: {len(targets)} targets resolve')


# ---- 5. the layout library: pages.json, manifests, files on disk ----

def check_layouts():
    pages = json.loads(read('layout/pages.json'))
    listed = {page['id'] for page in pages}
    folders = {p.name for p in (ROOT / 'layout').iterdir() if p.is_dir()}
    compare('pages.json <-> layout/ folders', 'pages.json', listed, 'disk', folders)

    for page_id in sorted(listed & folders):
        folder = ROOT / 'layout' / page_id
        manifest_path = folder / 'manifest.json'
        if not manifest_path.exists():
            failures.append(f'layout/{page_id}/ has no manifest.json — its card list cannot load')
            continue

        manifest = set(json.loads(manifest_path.read_text(encoding='utf-8')))
        on_disk = {p.name for p in folder.glob('*.json')} - {'manifest.json'}

        missing = sorted(manifest - on_disk)
        unlisted = sorted(on_disk - manifest)
        if missing:
            failures.append(f'layout/{page_id}/manifest.json lists files that do not '
                            f'exist: {", ".join(missing)}')
        if unlisted:
            failures.append(f'layout/{page_id}/ has layouts missing from manifest.json '
                            f'(they will never appear in the panel): {", ".join(unlisted)}')


CHECKS = [
    check_style_props,
    check_fonts,
    check_theme_colors,
    check_tool_panes,
    check_layouts,
]


def main():
    for check in CHECKS:
        try:
            check()
        except Exception as exc:                     # noqa: BLE001 - report, don't crash
            failures.append(f'{check.__name__} could not run ({exc.__class__.__name__}: {exc}) '
                            '— the shape it parses probably changed')

    for note in notes:
        print(f'  ok  {note}')

    if failures:
        print()
        for failure in failures:
            print(f'DRIFT  {failure}')
        print(f'\n{len(failures)} coupling(s) have drifted. See "Cross-file couplings" in CLAUDE.md.')
        return 1

    print('\nAll documented couplings agree.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
