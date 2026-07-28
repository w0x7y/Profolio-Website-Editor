# Left toolbar — extended tool panel (UI shell)

**Date:** 2026-07-27
**Status:** Approved, not yet implemented

## Goal

Give the left toolbar's tools an extended panel that opens when a tool is
clicked, so each tool has somewhere to put its own controls later. This stage
is UI only: every panel holds placeholder text (`the text tool panel`, etc.).
No tool gains real editing behavior here.

## Layout

A new `<aside class="tool-panel">` sits between `.toolbar` and `.canvas-area`,
making `.workspace` a four-column flex row:

```
toolbar (64px) │ tool-panel (240px) │ canvas (flex) │ panel (300px)
```

The panel is a real column, not an overlay: opening it shrinks the canvas
rather than covering it. This matches how the right panel already behaves, so
canvas content is never hidden behind editor chrome.

## Which tools open a panel

| Tool       | Panel |
| ---------- | ----- |
| `select`   | no — closes the panel |
| `text`     | yes |
| `image`    | yes |
| `link`     | yes |
| `button`   | yes |
| `section`  | yes |
| `embed`    | yes |
| `settings` | no — closes the panel |

`select` is excluded because selection properties belong on the contextual
toolbar (TODO Phase 8 #31), not here. `settings` is excluded because its own
UX is still undecided (TODO Phase 13 #91) — it currently duplicates the right
panel's Settings tab.

Since the editor boots with `setActiveTool('select')`, the panel starts closed
on page load.

## Markup

```html
<aside class="tool-panel" id="toolPanel" hidden>
  <div class="tool-panel__header">
    <h2 class="tool-panel__title">Text</h2>
    <button class="tool-panel__close" type="button" aria-label="Close panel">…</button>
  </div>
  <div class="tool-panel__content">
    <div class="tool-panel__pane" data-tool-pane="text">the text tool panel</div>
    <div class="tool-panel__pane" data-tool-pane="image">the image tool panel</div>
    <div class="tool-panel__pane" data-tool-pane="link">the link tool panel</div>
    <div class="tool-panel__pane" data-tool-pane="button">the button tool panel</div>
    <div class="tool-panel__pane" data-tool-pane="section">the section tool panel</div>
    <div class="tool-panel__pane" data-tool-pane="embed">the embed tool panel</div>
  </div>
</aside>
```

One pane per tool, declared in HTML and toggled with `is-active` — the same
pattern the right panel's `.panel__pane` elements already use. The alternative
considered was a single empty panel with content injected from a JS config
map; it was rejected because each tool's eventual content diverges sharply
(Text needs font controls, Image needs upload, Link needs a URL field), and
that content belongs in markup rather than JS strings.

Only one pane carries `is-active` at a time. The header title is *not*
hardcoded per pane — see below.

## Styles

- New `--tool-panel-w: 240px` in `:root`.
- New `TOOL PANEL` section in `style.css`, placed after the `LEFT TOOLBAR`
  block.
- Reuses `--bg-panel`, `--border-subtle`, and the existing radius variables,
  so the panel reads as a sibling of the right panel.
- The header's height matches `.panel__tabs` so the two side panels align.
- Closed state is the `hidden` attribute. No width transition — animating the
  width would fight the canvas reflow for no real benefit.

## Behavior

`setActiveTool()` in `script.js` is already the single funnel for tool changes,
so the panel hangs off it.

- `TOOL_PANEL_TOOLS = new Set(['text', 'image', 'link', 'button', 'section', 'embed'])`
- `setActiveTool(tool)` calls `openToolPanel(tool)` when the tool is in that
  set, and `closeToolPanel()` otherwise.
- `openToolPanel(tool)` clears `hidden`, activates the matching pane, and sets
  the title from that tool button's existing `.tool__label` text. Reading the
  label rather than duplicating the name means the panel title cannot drift
  out of sync with the tooltip.
- The toolbar click handler gains a re-click toggle: clicking the already-active
  tool closes the panel.
- The `✕` button closes the panel the same way.

### Closing does not deactivate the tool

Closing the panel — by `✕` or by re-click — leaves the tool active: its button
keeps `is-active`, `activeTool` is unchanged, and `.canvas-area`'s
`data-active-tool` attribute is untouched. Clicking that same tool again
reopens the panel.

Panel visibility is deliberately a separate concern from tool state. Closing a
panel must not silently change what clicking on the canvas does.

The existing behavior in `setActiveTool()` where switching away from `select`
clears the canvas selection stays exactly as it is.

## Testing

Manual verification in the browser preview — the repo has no test
infrastructure yet, and this change is pure UI state with no logic to unit
test.

1. On load, the panel is closed and the canvas spans its current width.
2. Each of the six panel tools opens the panel with the correct title and the
   correct placeholder text.
3. Switching directly between two panel tools swaps the pane without closing
   the panel.
4. `✕` closes the panel and the tool stays active; clicking that tool reopens it.
5. Re-clicking the active tool closes the panel; clicking it again reopens it.
6. `select` and `settings` close the panel.
7. The canvas shrinks when the panel opens and restores when it closes, with
   all four columns visible and no horizontal overflow.
8. No console errors.

## Out of scope

- Any real functionality inside the panels — every pane is placeholder text.
- Click-to-place behavior on the canvas for any tool (TODO Phase 2 #12–13).
- A panel for `select` or `settings`.
- Resizable or collapsible panel width.
- The open `link` vs `button` node-type question in `TODO.md` — that only
  matters once these panels do real work.

## Notes

`section` and `embed` are `P1`/`P2` in `TODO.md` while `text`/`image`/`link`/
`button` are `P0`, so those two panes will hold placeholder text longer than
the rest. Harmless, but worth knowing they are the least urgent part of this
change.
