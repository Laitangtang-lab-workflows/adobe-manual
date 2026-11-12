---
name: adobe-manual
description: >-
  Adobe Illustrator / Photoshop operations handbook (MCP tools + COM DoJavaScript + JSX scripting). Use when the user mentions "Illustrator", "Photoshop", ".ai files", "JSX", "COM", contour-panel layout, batch image swaps, in-place replacement, relinking images, experiment-photo color grading, "LUT", or typesetting, or when reading/writing .ai documents, batch-placing or replacing embedded images, or exporting previews. Iron rules: the MCP server's process elevation must match the Adobe process (else every tool times out); the MCP has no delete/execute-script tool — batch jobs go through COM DoJavaScript; and the two coordinate systems (artboard-web vs document) are easily confused. Chinese companion: SKILL.zh-CN.md.
---

# Adobe MCP — automating Illustrator / Photoshop

A field manual for Illustrator (illustrator-mcp-server) + Photoshop (photoshop-mcp): environment prerequisites (elevation alignment), tool capability boundaries, coordinate systems, the JSX scripting channel, and batch image-swap / layout / color-grading workflows.

## Four iron rules (memorize first)

1. **Elevation alignment (violated = every MCP tool times out with -32001)**: the server (node) and the Illustrator/Photoshop process must run at the same elevation (admin-vs-admin, user-vs-user). If Adobe is already running, "Run as administrator" merely focuses the old instance — you must fully exit first, then relaunch.
2. **Batch jobs go through COM DoJavaScript** (far faster than `--run`, and the return value is printable for verification):

   ```powershell
   $ai = New-Object -ComObject Illustrator.Application   # PS: Photoshop.Application
   $jsx = [System.IO.File]::ReadAllText('C:\path\script.jsx', [System.Text.Encoding]::UTF8)
   $result = $ai.DoJavaScript($jsx, @(), 1)              # 1 = execute synchronously
   ```

3. **Illustrator's two coordinate systems**: artboard-web (origin at the artboard's top-left, Y down; used by place_image / modify_object) vs document (origin at the artboard's bottom-left, Y up; used by the bounds returned from get_layers etc.); conversion `artboard_y = artboard_height − document_y(top)`. **The sturdiest batch-swap recipe = reuse the old image's left/top/width/height and do no coordinate conversion at all**.
4. **Known MCP defects and their bypasses**: sublayer objects notFound (move to a top layer or use JSX); RGB modify falsely reports success (use the gray format); Photoshop open_document is broken (JSX `app.open`).

## Content map

| Domain | File | Content |
|---|---|---|
| Illustrator | [references/illustrator-guide.md](references/illustrator-guide.md) | Environment prerequisites / registry repair, MCP capability boundaries, coordinate systems, the JSX channel with templates, human-AI diff collaboration, the one-shot contour-panel swap method, batch layout and experimental phase-diagram composition in the field, a 144-image array swap in the field (the move-before-embed canonical order), a 72-image embed in the field (three traps and the mirror-verdict method), quick-troubleshooting table |
| Photoshop | [references/photoshop-guide.md](references/photoshop-guide.md) | The COM channel, the layer.kind trap, cross-document copying, the LUT reverse-engineering method for unreadable adjustment parameters, quick-troubleshooting table |
| Sample code | [scripts/embed_phase_diagram.jsx](scripts/embed_phase_diagram.jsx) | The complete template for converting linked images to embedded wholesale (v8, 72/72 in the field): pure-data snapshots, re-read-at-the-tail, flip restoration, z-order marker restoration, ungrouping, a final geometry-correction phase, double verification; the target path arrives via arguments |

## Scope boundaries

- matplotlib figure generation (before anything enters Illustrator): the `academic-plotting` skill;
- ParaView contour rendering: the `paraview-pitfalls` skill (its pipeline's tail end feeds this skill's composition);
- PowerShell encoding/BOM pitfalls when driving Adobe: see the corresponding sections inside references/.
