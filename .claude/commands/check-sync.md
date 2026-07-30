---
description: Check the cross-file couplings documented in CLAUDE.md for drift
allowed-tools: Bash(python3 .claude/check-sync.py)
---

Run the coupling checker:

```bash
python3 .claude/check-sync.py
```

It verifies the pairs of files listed under "Cross-file couplings to keep in
sync" in `CLAUDE.md` — the places where two files state the same fact and the
app keeps running, wrongly, when they disagree.

If it reports drift, fix the **source of the mismatch**, not the checker.
Each one has a right answer rather than a symmetric "make them match":

- `STYLE_PROP_TO_JS` / `StyleProps` — a prop in the renderer but not the doc is
  undocumented; a prop in the doc but not the renderer is silently ignored at
  render time. Decide which one is intended, then align the other.
- `FONT_GROUPS` / the Google Fonts URL — a family offered in the picker but not
  in the URL falls back to the generic family and looks broken. Add it to the
  URL **and** its `<noscript>` copy, which must stay byte-identical.
- `THEME_COLOR_PROPS` / `.canvas-frame` — only the base tokens count here; the
  neutrals are derived with `color-mix()` and are not a theme's to define.
- `TOOL_PANEL_TOOLS` / `data-tool-pane` / `NODE_TYPE_PANES` — a tool with no
  pane in the markup opens an empty panel; a selectable node type pointing at
  a pane that isn't registered opens nothing.
- layout manifests — a `.json` in a page folder that isn't in that folder's
  `manifest.json` never appears in the panel, since a browser can't list a
  folder.

Report what drifted and what you changed. If everything agrees, say so briefly
without restating each check.
