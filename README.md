# adobe-manual

**Driving Adobe Illustrator and Photoshop from AI agents — the field manual that works: elevation alignment, the COM DoJavaScript channel, JSX batch templates, and every confirmed trap of embed/swap/layout/export, plus a battle-tested 72-image link-to-embed script.**

> [!NOTE]
> This repository is **written and maintained entirely by AI agents** under human direction — see [AI-maintained](#ai-maintained).
> Documentation is English-first; a Chinese README is available ([README.zh-CN.md](README.zh-CN.md)), and a Chinese SKILL companion ([SKILL.zh-CN.md](SKILL.zh-CN.md)).

## Why

Automating Adobe apps from an agent sounds easy and then isn't: every MCP tool times out until process elevations align; the MCP can't delete objects or run scripts at all; one coordinate system quietly differs from the other; `embed()` loses names, flips, positions and z-order in four different ways. This handbook is the dense sediment of months of production figure work — every entry confirmed on live manuscripts:

- **Environment & channels** — the elevation-alignment matrix (violated = universal -32001 timeouts), registry repair after relocating Illustrator, the COM `DoJavaScript` direct channel (instant return, printable results) versus the 30–40 s `--run` route, UTF-8/BOM encoding rules for Chinese paths.
- **Capability boundaries as measured** — which MCP tools are reliable, which lie (RGB modify false success), which are broken (Photoshop open_document), and the exact bypass for each.
- **JSX craft** — the canonical place→move→embed order (established across 24-, 48-, 144- and 144-image batches), position-reuse to sidestep coordinate conversion, idempotent batch scripts driven by expected-name lists, marker-slot z-order restoration, the standalone flip phase, and the final geometry-correction phase.
- **Photoshop specifics** — the `layer.kind` trap, cross-document copy limits, and the LUT reverse-engineering method that reproduces a user's hand-grading from before/after pixel pairs (0.7% residual, verified on 48 photos).
- **A production-grade script** — `embed_phase_diagram.jsx` (v8): converts every linked image in a .ai to embedded with flip restoration, z-order restoration, ungrouping and double verification; 72/72 in the field, target path passed as an argument.

## Install as a skill

```
git clone https://github.com/Laitangtang-lab-workflows/adobe-manual ~/.agents/skills/adobe-manual
```

Works with any agent harness supporting the SKILL.md convention (Claude Code, DeepSeek Harness, …) on Windows with Illustrator/Photoshop 2024 and PowerShell; equally valuable as plain documentation for human scripters.

## Repository layout

| Path | Content |
|---|---|
| `SKILL.md` | Skill entry point: the four iron rules |
| `references/illustrator-guide.md` | The full Illustrator field guide (12 sections) |
| `references/photoshop-guide.md` | The Photoshop field guide incl. the LUT method |
| `scripts/embed_phase_diagram.jsx` | The v8 link-to-embed production script |

## AI-maintained

Every file in this repository — documentation, scripts, this README — is written and updated by AI agents under human supervision, and every trap was first stepped on by an AI session operating live Adobe documents under human direction. Expect commits to be machine-authored; humans review direction and decisions, not lines.

## License

[CC0-1.0](LICENSE) — released to the public domain. Use, fork and vendor it into anything, no attribution required (a nod is always appreciated).

By submitting a pull request you agree that your contributions are dedicated under CC0 as well.
