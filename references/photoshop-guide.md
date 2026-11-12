# Photoshop MCP field guide (the full collection)

> Scope: Photoshop 2024 (25.12) + photoshop-mcp + Windows 11, driven from an AI harness via PowerShell.
> Origin: batch blue-tone processing of 48 experiment photos in the field (MCP tool pitfalls, the COM channel, adjustment-layer read failures, cross-document layer copying, the full LUT reverse-engineering flow).
> Companion: this skill's [illustrator-guide.md](illustrator-guide.md) (elevation alignment, encoding, the COM channel — shared experience, applies to both apps).

## 1. Channel choice: the MCP tool surface is narrow and buggy — real work goes through COM DoJavaScript

### 1.1 MCP tools as measured (25.12 + photoshop-mcp)

| Tool | Status | Note |
|---|---|---|
| get_session_info | ✅ works | confirms PS is running, version, open-document list |
| get_active_document_info | ⚠️ half-broken | basic info works, but the **layers/channel lists are always empty** |
| open_document | ❌ buggy | server-side internal error `'float' object has no attribute 'value'` |
| create/save_document etc. | unverified | not needed in that run |

### 1.2 COM direct connection (preferred; same pattern as Illustrator)

```powershell
$ps = New-Object -ComObject Photoshop.Application
"PS-COM-OK version=" + $ps.Version              # 25.12.0
$jsx = [System.IO.File]::ReadAllText('C:\path\script.jsx', [System.Text.Encoding]::UTF8)
$result = $ps.DoJavaScript($jsx, @(), 1)        # 1 = execute synchronously
```

- Store JSX files as UTF-8; the PowerShell side reads them into a .NET string before passing (Chinese-path safe).
- **A top-level `return` in JSX is illegal** ("return statement outside of a function body") → `function main(){...return "..."} main();`
- **The PowerShell script file itself must be UTF-8 with BOM** (without BOM it is misread as GBK and the Chinese breaks the quotes; after writing, convert with `[System.IO.File]::WriteAllText($p, $t, [System.Text.UTF8Encoding]::new($true))`).
- Opening documents goes through JSX: `app.open(new File(path))` (MCP open_document is broken).
- Saving JPEG: `doc.saveAs(new File(out), opts, true, Extension.LOWERCASE)`, `opts.quality` 0–12 (11 used); then `doc.close(SaveOptions.DONOTSAVECHANGES)`.
- **Verify the document name before closing anything**: a blind `activeDocument.close()` inside `catch` once closed the user's unsaved grading document (configuration lost — a painful lesson).

## 2. Scripting pitfalls (measured on 25.12)

| # | Trap | Symptom | Countermeasure |
|---|---|---|---|
| 2.1 | **the `layer.kind` enum trap** | accessing `layer.kind` on some layers throws an invalid-enum error (Error 1320) | don't branch on kind; use ActionManager: `executeActionGet(ref(Lyr index))` then `hasKey(stringIDToTypeID("adjustment"))` to detect adjustment layers |
| 2.2 | **adjustment-layer parameters unreadable** | the adjustment's ActionList yields a `count`, but `getObject(i)` / `getToObject(i)` both report "not a function" — list items can't be deserialized over COM (a wrapper defect) | **parameter-level reproduction is a dead end** → give up on reading parameters; use §3's LUT reverse-engineering or §2.3's whole-layer copy |
| 2.3 | **cross-document layer-copy limits** | `srcLayer.duplicate(targetDoc, PLACEATBEGINNING)` throws "you can only duplicate layers from the frontmost document"; after a few failures the source-document reference itself goes stale ("object invalid") | before each image: ① `app.activeDocument = sourceDoc` to bring it frontmost, then duplicate; ② **re-resolve the source document by name every time** (`for app.documents` matching name) — never cache document references across iterations |
| 2.4 | **DOM adjustColorBalance exists but is coarse** | `doc.activeLayer.adjustColorBalance([C,R? three values], …)` works but the tone mapping is crude (subtracting green and adding blue pushes lines toward purple, not blue) | for fine grading, let the user hand-tune in PS, then reproduce via §3's reverse engineering |
| 2.5 | **getFiles returns URL-encoded names** | `Folder.getFiles("*.jpg")` yields `file.name` in `%E5%BA%9F%E7%89%87`-style encoding for Chinese | `decodeURI(name)` before comparing |

## 3. The LUT reverse-engineering method (the fallback when parameters are unreadable or a configuration is lost — strongly recommended)

**Applies when**: applying "the same global color adjustment" to a batch of photos (adjustment layers or direct adjustments both qualify; anything with local/spatial operations does not).

**Principle**: an adjustment layer applies one color mapping to every pixel. From paired pixels of "original → user-graded" you statistically recover that mapping as a per-channel 256-level LUT; applying it in batch is an equivalent reproduction. Hue/saturation is fundamentally a 3D color mapping — a 1D per-channel LUT is an approximation — **check the residual first**; if mean > 3/255, upgrade to a 3D LUT.

**Measured**: blue-tone batch of 48 photos, fit residual **mean = 1.85/255 (0.7%)**, below double-JPEG-compression noise; generalization to photos outside the fit was clean.

Flow (C# via `Add-Type` + System.Drawing `LockBits` — never per-pixel GetPixel):
1. Inputs: originals + user-graded exports (available even from an unsaved PS document — `doc.saveAs` JPEG exports the composited result with adjustments);
2. Fit: `LUT[c][v] = mean(graded channel value | original channel value == v)`, empty slots linearly interpolated;
3. Residual check: LUT-applied originals vs. user grading diff (sampled mean/max); verify generalization on an image outside the fit;
4. Show the user a "your grading / LUT reproduction / generalization sample" triptych for confirmation;
5. Batch-apply (48 images in 1–2 minutes) into a separate output folder, **originals untouched**; archive the LUT for reproduction.

Sample scripts (project-side, same names as shipped in the originating project): `fit_lut_recolor.ps1` (fit + reproduce + residual), `batch_apply_lut.ps1` (in-batch fit + batch apply), `apply_lut_viscous.ps1` (a 24-image sub-batch, new directory layout).

**Fit-source fallback**: when the user-graded originals have been scattered (common after directory reorgs), fit from "original photo vs. existing graded jpg" pairs — a self-consistent loop (that year's LUT was exactly the mapping between those two), with residuals at double-JPEG-noise level and style fully consistent with the existing batch (verified 2026-11-04 on a 24-image sub-batch).

## 4. Quick-troubleshooting table

| Symptom | Cause | Fix |
|---|---|---|
| MCP open_document errors with 'float' object | photoshop-mcp server bug | use COM `app.open(new File(...))` |
| Layer list reads empty | get_active_document_info half-broken | enumerate `doc.layers` via JSX (the AM route is sturdier) |
| `layer.kind` throws invalid-enum | kind unavailable on some layers | AM `executeActionGet` + `hasKey("adjustment")` probing |
| Adjustment-layer parameters unreachable | ActionList items not deserializable over COM | §3 LUT reverse engineering (or whole-layer copy, above) |
| Copying layers: "only from the frontmost document" | the duplicate's source document isn't frontmost | `app.activeDocument = sourceDoc`, then duplicate |
| "Object invalid" during copy | a cached document COM proxy has gone stale | re-resolve the source-document reference by name each time |
| Batch interrupted and rerun goes misaligned | the script isn't idempotent | drive by an expected-name list + snapshot geometry + skip-completed (cf. illustrator-guide.md §10) |
| The user's grading configuration lost | document closed unsaved | `doc.saveAs` the effect out before touching anything; verify the name before closing |
