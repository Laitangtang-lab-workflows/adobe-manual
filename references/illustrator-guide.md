# Illustrator MCP field guide (the full collection)

> Scope: `illustrator-mcp-server` v1.10.3 (ie3jp; the npx cache follows npm latest) + Illustrator 2024 + Windows 11, driven from an AI harness via PowerShell.
> Origin: human-AI contour-panel composition in the field (AI layout, JSX image replacement, registry repair — the full run).
> Records **environment prerequisites, tool capability boundaries, coordinate systems, the JSX scripting channel, pitfalls and standard workflows** for direct reuse by any Illustrator collaboration session.

## 1. Environment prerequisites (violated = every tool times out)

### 1.1 Elevations must align (the most important rule)

The MCP server drives Illustrator through PowerShell COM `DoJavaScript`; **the server's process elevation must match Illustrator's**:

| server (node) | Illustrator | Result |
|---|---|---|
| admin | user | ❌ every tool times out (-32001) |
| user | user | ✅ works |
| admin | admin | ✅ works |

- If you habitually launch your harness elevated → **Illustrator must be launched elevated too**.
- **The single-instance trap**: when Illustrator is already running at user elevation, "Run as administrator" merely focuses the old instance (the PID doesn't change). You must fully exit first, then right-click → run as admin.
- Diagnostic commands (PowerShell):

```powershell
# check elevations (Add-Type P/Invoke GetTokenInformation for token details)
Get-CimInstance Win32_Process -Filter "Name='Illustrator.exe'" | Select ProcessId
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ? { $_.CommandLine -like '*illustrator-mcp-server*' } | Select ProcessId
```

### 1.2 After moving/reinstalling Illustrator: the registry must be updated

Symptom: `TYPE_E_CANTLOADLIBRARY (0x80029C4A)` (type-library load failure).

Cause: the registry COM paths still point at the old install location. Three spots to update:

```powershell
# ① CLSID LocalServer32 (both HKCR and HKLM)
$exe = "<Illustrator install path>\Support Files\Contents\Windows\Illustrator.exe /Automation"
Set-ItemProperty "Registry::HKEY_CLASSES_ROOT\CLSID\{4A6A01D0-B9A2-41AF-80F2-E7AE77C6DCF0}\LocalServer32" -Name "(default)" -Value $exe
Set-ItemProperty "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Classes\CLSID\{4A6A01D0-B9A2-41AF-80F2-E7AE77C6DCF0}\LocalServer32" -Name "(default)" -Value $exe

# ② TypeLib (win32 and HELPDIR across HKCR + HKLM + WOW6432Node)
$tlb = "<Illustrator install path>\Plug-ins\Extensions\ScriptingSupport.aip"
$help = "<Illustrator install path>\Plug-ins\Extensions\"
$roots = @(
  "Registry::HKEY_CLASSES_ROOT\TypeLib\{D6752E03-199E-4FDC-973A-97E87D674E90}\1.0",
  "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Classes\TypeLib\{D6752E03-199E-4FDC-973A-97E87D674E90}\1.0",
  "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Classes\TypeLib\{D6752E03-199E-4FDC-973A-97E87D674E90}\1.0"
)
foreach ($r in $roots) { Set-ItemProperty "$r\0\win32" -Name "(default)" -Value $tlb; Set-ItemProperty "$r" -Name "HELPDIR" -Value $help }
```

After the change you **must restart both the MCP server and Illustrator** (processes cache the old registration).

## 2. MCP tool capabilities and limits (as measured)

### 2.1 Reliably working

| Category | Tools |
|---|---|
| Reading | get_document_info / get_document_structure / get_layers / get_selection / list_text_frames |
| Placing | place_image (embed=true embeds) |
| Modifying | modify_object (move/scale/rename/text, **note the anchor is the top-left corner**) |
| Layers | manage_layers (create/delete/rename; deleting empty layers works) |
| Artboards | manage_artboards |
| Output | save_document / export (PNG preview) |

### 2.2 Known defects (must be bypassed)

| Defect | Symptom | Bypass |
|---|---|---|
| **sublayer objects not operable** | select/modify on an object inside a sublayer reports `notFound` (reads work) | have the user move it to a **top-level layer**, or use JSX |
| RGB color ineffective on paths | modify/replace_color reports success but get_selection confirms no change | use the **gray format** (`{type:"gray", value:50}`) — verified working |
| replace_color false success | reports replacedCount>0, nothing changes | don't rely on it; use modify (gray) or JSX |
| find_objects unreliable | type=image returns 0 though objects exist | use get_layers(include_items=true) or JSX |
| create's fill/stroke parameters | color params on create_rectangle etc. don't take effect | modify (gray) afterwards, or JSX |
| move_to_layer coordinates | returned bounds are document coordinates (Y up) | the position didn't actually change; don't judge by the return value |
| **MCP hurting user documents in shared sessions** | MCP's open/export/close all act on the **currently active document** with no target parameter; with the user concurrently editing another document, export may grab the wrong file and close may kill the user's document (confirmed 2026-11-08: a user document was nearly lost — no unsaved changes, fortunately) | while the user has AI open: `get_document_info` to verify the active document name before every MCP action; verify the returned name before closing; the COM channel is unaffected (JSX holds the doc reference throughout) |
| embed losing the placed name | place_image keeps names fine; JSX embed loses them | see §4 JSX flows |

## 3. Coordinate systems (two of them, easily confused)

| System | Origin | Y direction | Used by |
|---|---|---|---|
| **artboard-web** | artboard top-left | down | positions of place_image / modify_object |
| **document** | artboard bottom-left | up | bounds returned by get_layers / get_document_structure |

**Conversion** (A4 portrait artboard height 841.89pt):

```
artboard_y = 841.89 − document_y(top)
```

i.e. a top y of 808.26 in document coordinates → artboard-web y = 33.63.

## 4. The JSX scripting channel (--run and COM DoJavaScript, complements to MCP)

> The MCP has no "delete object" tool and no "execute JSX" tool — batch tasks like replacing old images **must go through the JSX channel**. Prefer §4.0's COM direct connection (far faster than §4.1's --run).

### 4.0 COM DoJavaScript direct connection (preferred; verified REPLACED 24/24)

```powershell
# ① test the channel first (same elevation-alignment requirement as §1.1; needs a FullLanguage sandbox for New-Object -ComObject)
$ai = New-Object -ComObject Illustrator.Application
"COM-OK version=" + $ai.Version        # 28.6.0

# ② read the UTF-8 JSX file into a .NET string before passing (Chinese-path safe: .NET string -> COM BSTR = UTF-16)
$jsx = [System.IO.File]::ReadAllText('C:\path\replace.jsx', [System.Text.Encoding]::UTF8)
$result = $ai.DoJavaScript($jsx, @(), 1)   # 1 = execute synchronously
"JSX-RESULT: $result"                      # the script's return value comes back as a string
```

- **Advantages**: immediate return, none of --run's 30–40 s latency, printable return values, no new process.
- After `doc.save()` inside JSX, check `Get-Item xxx.ai`'s timestamp on the PowerShell side to confirm the write landed (retry around sync-drive locks).
- Have JSX `return 'REPLACED ' + done + ' / missing: ' + missing.join(',')`-style result strings for easy verification.

### 4.1 Autorun (--run, the old channel)

```powershell
$exe = "<Illustrator install path>\Support Files\Contents\Windows\Illustrator.exe"
Start-Process $exe -ArgumentList "--run", "`"C:\path\script.jsx`""
```

- Roughly **30–40 s of latency** (the single instance forwards to the running Illustrator); the process exits when the script finishes.
- Write logs to a file inside the script (`File` + poll-wait) to avoid dialogs.
- Dialog control: `app.preferences.setBooleanPreference("ShowExternalJSXWarning", false)` — set once, no more confirmation dialogs (the default true prompts "continue" every time).

### 4.2 The correct order for placing embedded images (hard-won)

`placedItems.add()` carries three traps; the canonical order:

```jsx
var pl = doc.placedItems.add();
pl.file = f;                     // ① set the file first
pl.left = x; pl.top = y;         // ② position
pl.width = 80; pl.height = 53.333; // ③ size
pl.embed();                      // ④ embed
pl.name = name;                  // ⑤ name (set AFTER embed)
pl.move(targetLayer, ElementPlacement.PLACEATBEGINNING); // ⑥ move to the target layer
```

**Measured traps**:
1. `placedItems.add()` lands on the **currently active layer**, not the target layer → you must `move()` or fix up afterwards with position matching (see 4.3)
2. `embed()` may **reset name/position** (setting name right after embed is also occasionally lost) → the sturdiest approach is the **two-pass method**: place the images (unnamed), then run a position-matching fixup script (see 4.3)
3. `embed()` may **fail silently** (the object stays a linked `PlacedItem`, `it.file` non-null) → check `it.file`; if non-null, re-`embed()`
4. **`embed()` returns a value (measured)**: the converted new `RasterItem` — `var ri = it.embed(); ri.name = name; ri.move(layer, ElementPlacement.PLACEATEND);` sets the name on the **returned object** and moves again; the original `it` is defunct — never reuse it.

### 4.3 Position-matching fixup script (template)

```jsx
// match by left/top → move into the target layer + name
var topY = { "808.26": "1.25", "754.93": "1.0", "701.59": "0.875", "648.26": "0.75" };
var leftV = { "54.552": "1", "134.552": "2", /* ... */ };
for (var i = layer.pageItems.length - 1; i >= 0; i--) {
    var it = layer.pageItems[i];
    if (it.typename != "PlacedItem" && it.typename != "RasterItem") continue;
    var H = null, V = null;
    for (var t in topY) if (Math.abs(it.top - parseFloat(t)) < 1.0) H = topY[t];
    for (var l in leftV) if (Math.abs(it.left - parseFloat(l)) < 1.0) V = leftV[l];
    if (H && V) {
        it.move(targetLayer, ElementPlacement.PLACEATBEGINNING);
        it.name = "img_" + H + "_" + V;
    }
}
```

### 4.4 Common JSX snippets

```jsx
// delete an object
it.remove();
// find an object by name
for (var i = 0; i < doc.pageItems.length; i++) {
  var it = doc.pageItems[i];
  if (it.name == "img_1.0_4") { /* ... */ break; }
}
// write a log
var f = new File("C:/Users/.../log.txt"); f.open("w"); f.writeln("..."); f.close();
// layers
var layer = doc.layers["panels"]; doc.activeLayer = layer; // activeLayer sometimes doesn't take — use move()
```

## 5. The human-AI collaboration flow (diff mode)

1. **Build a baseline**: read the whole document (UUIDs, names, types, position/size, text, layers) into JSON
2. **The user edits**: UUIDs are stable identities; names are nicknames (renames disturb the diff — tell the user)
3. **Pull the diff**: compare current state against the baseline and report every change (added/removed/moved/scaled/text)
4. Undetectable: operation history, purely visual nudges (the user must describe those)

## 6. Contour-panel experience (physical correctness)

### 6.1 The core lesson: post-processing must not "content-adaptively scale"

> ⚠️ **This section is a v8-era record; that approach was abandoned by user ruling**: the v8 route (PIL post-scaling) is fully obsolete. The correct solution is **ParaView rendering the final layout directly** (one global scale + anchored cameras + transparent background; no PIL content scaling whatsoever). See the paraview-pitfalls skill. Kept below for historical reference only:

- The raw renders **already used fixed cameras** (uniform view bounds + parallel scale); all panels shared one scale
- Any later "uniform height / uniform area / centering" **breaks physical proportions** (with H the nozzle-to-substrate distance, "uniform height" scales different-H panels differently → physically distorted)
- **The v8-final scheme**: base row height on one reference H; other H rows scale by H; within one H, V rows share the height (V affects width/shape only); left-aligned (material origin) + bottom-aligned (material base)
- Why the slowest-speed column is genuinely taller: flow conservation at the lowest printing speed gives the thickest line and tallest column — **physically real**, never to be flattened away

### 6.2 PIL post-processing notes

- `Image.transform(AFFINE)` takes the **output→input mapping** (once reversed here, causing an unintended shrink+shift)
- AFFINE has no LANCZOS; use BICUBIC (RGB) / BILINEAR (alpha)
- Whitening to transparency: `alpha = clip((248 − min_rgb) × 32, 0, 255)`

## 7. The standard replacement flow (contour-panel re-versioning, upgraded to one-shot)

1. Generate the new PNGs with python/ParaView (transparent background, uniform transforms)
2. The user confirms previews
3. **The one-shot replacement JSX** (template; verified REPLACED 24/24):
   - find old images by name (search **both** `placedItems` and `rasterItems` — some may already be embedded RasterItems)
   - **record the old image's left/top/width/height → delete → place the new image at the same position and size** — reusing old parameters and **doing no coordinate conversion** sidesteps §3's two-system trap at the root (to nudge a cell, move it manually in AI first; the script only does same-name in-place swaps)
   - `placedItems.add()` → set file/name/left/top/width/height → `move(panel layer)` → `var ri = it.embed()` → on the **returned object** `ri.name = name; ri.move(panel layer)`
   - `doc.save()` at the end; the script `return`s a result string
4. Execute via §4.0 COM DoJavaScript; on the PowerShell side verify the return string + the `xxx.ai` timestamp
5. Verify with MCP `get_layers(include_items=true)` (panel layer item_count=24, names img_H_V, bounds matching the old cells; separators/annotation bars/substrate/background untouched)
6. MCP `export` (artboard:0 → PNG, scale=2, background white) to export a preview for user confirmation
7. Before replacing, `Copy-Item` a backup of the old .ai; **`*.ai` stays out of Git** (heavy binaries live on the sync drive); the repo keeps only PNG previews and JSX templates

## 8. Quick-troubleshooting table

| Symptom | Cause | Fix |
|---|---|---|
| All tools -32001 timeout | elevation mismatch (server vs Illustrator) | align elevations and restart |
| TYPE_E_CANTLOADLIBRARY | install path moved; registry stale | update the registry per §1.2 |
| select/modify notFound | object in a sublayer | move to a top layer / JSX |
| image lands on the wrong layer | placedItems.add uses the active layer | move() or position-matching fixup |
| file still old after save | sync-drive lock / MCP save false success | JSX doc.save() and check the file timestamp |
| .ai depends on external files after JSX placement | embed failed silently | check it.file; re-embed |
| MCP can't delete objects / run JSX | no delete or script tool in the MCP | go through §4.0 COM DoJavaScript |
| replaced object lost its name | embed returns a new RasterItem; the original is defunct | set the name on the `embed()` return value |
| JSX Chinese-path errors/mojibake | script-file encoding | store JSX as UTF-8; PowerShell reads it into a .NET string before DoJavaScript |
| replacement script mis-steps when also moving coordinates | the two coordinate systems are easily confused | reuse the old image's left/top/width/height; no conversion |
| open_document reports SIGTERM/timeout | opening a PDF outgrew the tool timeout (the document did open) | get_document_info to check the active document before retrying; don't blindly re-open (measured; save_as .ai worked right after) |
| **Error 1200 PARM accessing collection refs after close** | the return string referenced the closed doc's `pis.length` etc. (the save had actually succeeded) | build the return string into a local variable **before** close; return only the local afterwards |
| **forward-slash input path vs `doc.fullName.fsName` backslashes** | path-validation string equality is always false; defensive checks misfire | normalize separators before comparing (`path.split('/').join('\\')`, plus toLowerCase) |
| **a freshly opened document shows `saved=false`** | untouched after open, `doc.saved` is still false (relative-path re-resolution marks it dirty) | a "close unmodified documents" script will SKIP it — harmless; just reuse the open document for the real script |
| **links "revive" after a directory move** | links whose relative position to the .ai is unchanged auto-resolve on open (`it.file.exists=true`); only links pointing outside the moved tree are truly broken | probe `it.file` on the open document before declaring breakage; to pin absolute paths: `it.file = it.file` explicit re-set + save |
| **JSX `exportFile` PNG24 hangs on huge .ai** | a 291MB document's exportFile never returns inside DoJavaScript and Illustrator's CPU drops to zero (the COM call hangs; killing the client doesn't help) | export previews via MCP `export` (artboard:N; a separate COM connection is unaffected); leave the JSX channel for edit/save operations |
| opening matplotlib-exported .ai/.pdf warns about missing CMSY10 etc. | script mathtext with custom+Arial falls back to `mathtext.fallback='cm'` for some math glyphs, and the machine lacks that font name | ignorable (embedded subsets display and print fine); or install matplotlib's `mpl-data/fonts/ttf` cm*.ttf as system fonts |

## 9. JSX batch-layout pitfalls (composition in the field)

| Trap | Symptom | Countermeasure |
|---|---|---|
| **`Layer.duplicate()` doesn't exist** | Error 24 "not a function" (`typeof l.duplicate === 'undefined'`) | copy per object: snapshot the `srcLayer.pageItems` array → `item.duplicate()` → `move(dstLayer, PLACEATEND)` → `translate(dx,dy)`; layer order is guaranteed by the sequence of `doc.layers.add()` (add appends at the top, so add in background→…→separator order to get bottom→top) |
| **`geometricBounds` actual format** | measured = `[left, top, right, bottom]` (**opposite** of the ExtendScript docs' claimed `[top,left,bottom,right]`; consistent with `item.left/top/width/height`) | always measure extents via `item.left / top / width / height`, never geometricBounds |
| **`resize()` anchors at the object's own center** | it scales object sizes but **not inter-object spacing** → after a whole-figure "scale", the content extent barely changes and gaps keep their pt values | never whole-figure-scale via per-object resize; use Illustrator UI's group scaling (Ctrl+G → scale), or a transform matrix (`app.concatenateScaleMatrix` throws "Illegal argument - Object expected" on 2024 — matrix construction didn't pan out; use with care) |
| **`textFrame.position = [x,y]`** | y matches `item.top` (document coordinates, Y up) | tick-label placement: `position=[x, y_tick]` with y_tick mapped from the tick value |
| **tick numbers upside down** | a colorbar PNG (imshow `origin='lower'`) has **vmin at the bottom, vmax at the top**; numbers laid out with vmin on top end up reversed | map numbers as `y = top − (vmax−val)/span×H` (vmin→bottom, vmax→top) |
| **`resize(scale, scale, false, …)` ineffective** | with changePositions=false (measured on 2024) the object size doesn't change at all | use `true` (center anchor) or another approach; don't rely on changePositions=false's top-left-anchor behavior |
| text anchors | position is the text's top-left (top edge) | center numbers on ticks: `position.y = y_tick − fontSize/2` (≈ −4pt at 9pt) |

**Reusable JSX** (project-side, same names as shipped): `layout62_3x3.jsx` (template blocks → 3×3 copy-and-swap, with the `type_state_quantity` layer-naming convention), `replace_cloud_images_p95.jsx` (same-name in-place swap). **Never** whole-figure-scale via per-object `resize()` (the center-anchor trap above; the retired `scale62_to_a4.jsx` lives on as the cautionary archive of this section).

## 10. Experimental phase-diagram composition in the field

Re-running the "saveAs a new document + in-place swap" flow on another document (a 48-panel experimental phase-diagram .ai) surfaced new pitfalls. Companion scripts are project-side; the color-grading (Photoshop) lessons are in this skill's [photoshop-guide.md](photoshop-guide.md).

| Trap | Symptom | Countermeasure |
|---|---|---|
| **`doc.layers.getByName()` searches top level only** | state layers are sublayers of "Layer 1"; getByName throws `No such element` | write your own recursive findLayer (top→sublayers, two levels suffice); **MCP's manage_layers show/hide is likewise top-level only**, with the same error |
| **hidden layers can't be modified by script** | `remove()` on objects in a hidden layer throws `Target layer cannot be modified` | set `layer.visible = true` first (record the original state), restore visibility when everything is done |
| **`placedItems.add()` lands on the active layer** | with the active layer hidden/locked, `pl.file = f` throws `Target layer cannot be modified` | set `doc.activeLayer = <a visible layer>` before placing; orphan empty PlacedItems linger on whatever layer was active — clean up afterwards |
| **`embed()` return value unstable** | on 28.6.0, `var ri = pl.embed()` sometimes returns undefined (contradicting §4.2's "returns a value" — trust neither blindly) | when it returns nothing, find the new RasterItem **by position matching** (left/top ±0.5pt, name=="") and name it; and after embed **re-set left/top/width/height** (embed may reset them) |
| **`.file` getter throws on empty PlacedItems** | `if (!pit.file)` throws `There is no file associated with this item` | orphan probing must be `try { hasFile = !!it.file } catch { hasFile = false }` |
| **interrupted batch leaves half-work** | old images deleted, new ones not placed/named; a full rerun mis-places or duplicates | scripts must be **idempotent**: drive by an expected panel list (not by enumerating current state); found-by-name → swap; not found → pending; snapshot (jobs + geometry) before mutating collections |
| **executing without verifying the document** | saveAs/replacement on the wrong document | verify `app.activeDocument.name` first; only saveAs when `doc.fullName.fsName != target path` (prevents saving back over the source) |
| **error handlers causing harm** | `catch { activeDocument.close(DONOTSAVECHANGES) }` once closed the user's unsaved document (configuration lost — painful) | verify the name before closing; if you can avoid closing, don't close |

**Workflow essentials**: back up with `Copy-Item` before touching a .ai; prefer saveAs to a new document; run batches as background jobs + `job_output(wait)` (embedding 48 images + saving a 300MB file takes ~2–5 minutes); afterwards verify item_count layer by layer via get_layers (an 84→85 jump is how one orphan in the viscous layer was caught; 47/48 caught a missing cell); preview via MCP `export(artboard:0, scale=2, background=white)`, downscaling anything over 2000px before review.

**Naming as interface**: once embedded images uniformly follow `stretch_H*_V*.jpg` / `fracture_H*_V*.jpg` naming, the swap script only needs a "name → same-name file" mapping — no coordinate tables.

## 11. A 144-image contour-array batch swap (2026-10-11)

> Scene: batch-embedding 144 fresh renders into a huge contour-array .ai (47.9 MB, nine blocks of 216 cells). This batch's confirmations cross-check §4.2/§10 — **the move-before-embed canonical order was established here**, superseding §4.2's "operate on the embed return value" as the primary path.

| Trap | Symptom | Countermeasure |
|---|---|---|
| **`doc.activeLayer` assignment silently failing + `embed()` returning nothing (a double trap)** | the batch script set `doc.activeLayer = panelLayer` before placing and relied on `var ri = it.embed()`'s return for naming/moving — activeLayer didn't error but **placement still landed on the then-active layer (the colorbar layer)**, and embed returned undefined (§10 already noted its instability) → **all 144 images landed in the colorbar layer**, while the script's self-check — built on the return value — **falsely reported success** | **canonical order: after setting file/position/size/name on the placed item, first `it.move(targetLayer, …)`, then `it.embed()`** — moving while still a PlacedItem is reliable, and an empty embed return no longer matters (the image is already on the right layer). §4.2's "embed → operate on the return value" demotes to fallback; self-checks must not depend on embed's return — enumerate the layer and verify item_count and names instead |
| **vertical colorbar orientation convention (fixed)** | colorbar annotation direction inconsistent with the render, making every reading wrong | convention: **vertical colorbar bottom = vmin, top = vmax** (matplotlib `origin='lower'` colorbars; same root as §9's reversed tick numbers); layout and numbering follow this always — don't reinvent it per batch |
| **TIFF export with `antiAliasing=true` → Error 1226** | setting that property on `ExportOptionsTIFF` triggers enum error 1226 | **omit it** (skip antiAliasing entirely) |
| **`lZWCompression` is an enum** | assigning a boolean errors | use the enum value or omit (the default compression policy is fine); never true/false |

## 12. Link-to-embed conversion + a 24-image sub-batch swap (2026-11-04)

> Scene: a ~300MB experimental phase-diagram .ai converted wholesale from linked to embedded, followed by swapping one state layer's 24 simulation tif placeholders for graded experiment jpgs (two other layers had been swapped the previous September, see §10).
> **User-fixed rule: composed images in .ai files are always embedded (embed), never linked** — preventing link breakage from directory reorgs and sync-drive migration (this project reworked broken links twice for exactly that reason); companion discipline: back up with `Copy-Item` and pause the sync drive before touching a large .ai; `doc.save()` only after full success.

| Trap | Symptom | Countermeasure |
|---|---|---|
| **embed() strips the extension from names** | placed name `chain_H1.25V1.tif` normalizes to `chain_H1.25V1` after embedding; matching by original names all misses | strip only **known suffixes** exactly (`endsWith('.tif')`); never `lastIndexOf('.')` — names carry decimals (H1.25/H0.875) and get truncated to `chain_H1` (confirmed this batch; the surviving H1 tier created a "half-fixed" illusion) |
| **embed() most likely resets position and size** | of 24 embedded tifs, 23 were reset to the same spot at native pixel size (1920×1080pt); only the last loop iteration survived | snapshot each name/bounds before embedding and re-set from the snapshot after; if the snapshot wasn't persisted, reload from the **pre-embedding backup document** (open the backup, read placedItems' name/geometricBounds, re-set by name in the main document) — this is where backing up first pays off |
| **modifying locked-layer objects → 8705** | `Target layer cannot be modified` — the object or an ancestor layer is locked (here some tiers' layers were locked, others weren't — same batch, different fates) | unlock the **object + ancestor layer chain** before modifying (record original states, restore afterwards); same root as §10's hidden layers — clear every modification-blocking state on the chain |
| **COM is slow on 300MB documents** | opening the backup + walking two documents takes ~10–12 minutes; the default pwsh timeout demoted it to a background job; `Responding=False` and a "(Not Responding)" title are normal while a single-threaded script runs | run batch tasks as background jobs + `job_output(wait)`; don't kill the process; if a hang looks dialog-caused, enumerate Illustrator's top-level windows (EnumWindows) to check for a modal dialog before deciding |
| **regex-editing a .ps1 to patch itself backfires** | using `-replace` to rewrite paths/mappings inside the script mangled the escape chain, producing garbage output with empty tier names | write a new file instead of regex surgery on scripts (same root as the shell-escaping iron rule); count outputs against the expected list afterwards |

Flow essentials (the embed conversion): pause the sync drive → back up → batch embed (save only on full success) → probe (placed=0 / raster count / per-image name+position check) → resume sync. The swap reuses §10/§11's move-before-embed canonical order, plus this section's unlock-chain and position snapshots; companion scripts are project-side (`embed_all.jsx`, `embed_fix_positions.jsx`, `replace_viscous.jsx`, `add_viscous_labels.jsx`, `apply_lut_viscous.ps1`).
| **PNG24 export from a huge .ai yields empty files** | same family as §8's "exportFile PNG24 hangs", different symptom: no hang, but 0-byte PNGs | **export a TIFF master and convert to PNG** (TIFF export works); direct PNG24 output is untrustworthy on huge documents |

### 12.1 A 72-image embed (2026-11-07): embed's collateral shifts and the final correction phase

> Scene: a 34MB simulation phase-diagram .ai (72 linked tifs, some cells stacked across states) converted wholesale. The embed loop re-set each position with immediate verification — all green — yet the final check still found 3 misplaced. Three new confirmations, all verified fixed on the same document:

| Trap | Symptom | Countermeasure |
|---|---|---|
| **embed() shifts items collaterally within a group** | in each state group (a set of links placed together), **the first-embedded raster** gets dragged to the position of the **last** one embedded in that group (name unchanged, geometry altered); per-item re-set + read-back inside the loop all pass, and only the final check exposes it. Any document with multiple states stacked on one cell will hit this | after the embed loop, run a dedicated **final correction phase**: look up rasters by name → chainUnlock → force-re-set snapshot geometry → chainRestore → final check again (all 3 fixed by the correction phase here) |
| **the correction phase forgetting the ancestor-chain unlock** | each item got chainUnlock in the embed loop, but the standalone correction phase wrote `rw.left` directly → the still-locked raster threw 8705 into a try, and the read-back still showed misplacement as FIX-FAIL | every property-writing phase (correction/re-set) must chainUnlock the ancestor chain — same treatment as the embed loop |
| **ExtendScript `File.open('e')` is not append** | in 'e' (edit) mode the file pointer sits at 0 and writeln overwrites from the top — the log keeps only the last entry plus a stale tail, losing everything in between | appending logs requires `f.open('e'); f.seek(0, 2); f.writeln(s); f.close()` |

The upgraded script architecture (over §12's `embed_all.jsx`): snapshots hold **pure data only** (name→geometry, no object references) → each loop iteration **re-reads** the tail element of `placedItems` (name-matched against the snapshot) → embed → re-set → **final correction phase** → final check (all names + geometry ±0.5pt) → save only on full pass → **reopen the document and re-verify**. 72/72 passed; the finished file was 218MB.

### 12.2 The same embed, continued (that evening): embed's transform/structure triple trap and the mirror-verdict method

> §12.1's output still hid three issues (found via the user inspecting in AI + a vision sub-agent's pixel analysis + micro-experiments). After fixing all three, the renders correlate 0.993–0.997 pixel-wise with the linked original, whole-image difference 0.42%. The final script is this skill's [scripts/embed_phase_diagram.jsx](../scripts/embed_phase_diagram.jsx) (v8, with flip restoration / z-order restoration / ungrouping / final correction, the full flow).

| Trap | Symptom | Countermeasure |
|---|---|---|
| **embed() drops the placed item's flip transform** | the source tifs had the nozzle on the right and the placements carried a horizontal flip (rendered nozzle on the left); after embedding, the raster reverts to the tif's native orientation = the whole image "mirrored". The tif data is intact — purely the transform is lost | after re-setting geometry, apply the **full-parameter** `ri.resize(-100, 100, true, true, true, true, 1)` (about the center, bounds unchanged) to restore the flip |
| **two-parameter `resize(-100,100)` is silently ineffective on RasterItems** | no flip, no error, empty FAILS — script-level, you can't tell it didn't take | flips must use the full seven-parameter form; verify with a "mirror-correlation = 1.0 before/after export" micro-experiment (test one image before batching 72) |
| **embed() wraps each image in a new group inserted at the container top** | user-visible as two symptoms: 72 extra groups in the Layers panel ("a layer per image"); all images pushed above the separators/borders (z-order scrambled) | the marker-slot method: `marker.move(pit, PLACEAFTER)` to hold the z-slot → embed → `group/raster.move(marker, PLACEBEFORE)` to restore → move the raster out and delete the empty group → delete the marker; the final check adds a **position-by-position same-name comparison of the pageItems sequence before vs after embedding** (ZM=0 to pass) |
| **ElementPlacement has no PLACEBEHIND** | Error 1320 Invalid enumeration value | "directly behind the target" = `PLACEAFTER`; "directly in front" = `PLACEBEFORE` |
| **flips applied inside the loop vanish on save (confirmed on a later array batch)** | applying the full-parameter resize to rasters still inside the embed wrapper groups — then moving them out and deleting the groups — ran without error, yet after save+reopen all 72 had reverted to unflipped | flips must be a **standalone phase**: after all embedding and ungrouping, per loose raster: chainUnlock + full-parameter resize + save (persistence verified 0.981–0.995 after the patch) |
| **when the placed name ≠ the linked filename, embed renames by the file's base name** | one batch's stretch placements were named `stretch_H0.75V1.tif` but linked to `stretch_0075_H0.75V1.tif`; after embedding the raster bears the file's base name and the by-placed-name scan misses everything (RASTER-NOT-FOUND) | before embedding, read `pit.file.fsName` and store the file base name; the name-location candidate set = {placed name, stripped placed name, file base name, file base name + .tif, empty} |
| **broken-link documents must be relinked before embedding** | one batch had 24+24 links without files; embed() can't read the source and necessarily fails | a relink pre-phase: `pi.file = new File(sourceFolder/placedName)`; only enter the embed loop once every link exists |
| **fixed-point color sampling misleads** | mirroring puts different content under the same coordinates — a mirror was once misdiagnosed as "blue→gray discoloration" and a "CMYK color-management problem" (the colors had never changed) | for render comparison use **per-cell luminance correlation** (compute both direct and mirrored, the higher decides orientation), never fixed-point colors; a four-way comparison (two versions × two export channels) eliminates channel artifacts conclusively |

**The verification methodology (定型 in this batch)**: ① structure (counts/names/geometry ±0.5pt) ② z-order position-by-position comparison ③ same-channel whole-image export + per-cell direct/mirrored correlation ④ spot-check of embedded data (copy one image to a new document, export, compare line profiles against the source file) ⑤ delete backups only after everything passes.

### 12.3 A five-file V→U relabel and PNG re-export batch (2026-11-09, 11 images)

> Scene: 29 text replacements across five .ai files (three multi-state phase diagrams + two contour close-ups), then re-exporting 11 PNGs by state-layer visibility, matching historical dimensions. The pipeline scripts are project-side (inventory → size probe → final export → local crop-and-replace).

| Trap | Symptom | Countermeasure |
|---|---|---|
| **v28 has no ExportType.PNG enum name** | `doc.exportFile(f, ExportType.PNG, opts)` throws Invalid enumeration value | on v28 use `ExportType.PNG24` (with `ExportOptionsPNG24`); run an enumeration probe before writing the main script |
| **artBoardClipping=false content-cropping untrustworthy (v28)** | expecting "crop to visible content bounds", all 11 exports instead yielded the same unrelated 378×172 image | switch to `artBoardClipping=true` artboard clipping + a local threshold (grayscale <250) white-border crop to reproduce historical geometry |
| **reusing the open-document collection across exports = cross-document contamination** | looping `app.documents` by name for export turned all 11 PNGs into the same contour image (document-identity confusion, caught only by eyeballing saturation statistics) | before every exportFile, `app.open` the target fresh + `app.activeDocument = doc`, close right after exporting; trust no cross-call document-collection state |
| **PNG scaling convention mismatching historical exports** | scaling was based on the artboard's 72dpi, but the historical PNGs used a "content-width" convention (content spans only 84% of the artboard) — artboard-based scaling was off by 17% | first a scale=100 probe export to measure content width (at this tier px==pt); scaling = target-width-px ÷ content-width-pt ×100; probe-vs-final threshold rounding differs by ~0.3%, needing one correction re-export |
| **the text replacement itself was the sturdiest part** | setting `contents` on TextFrames deep inside nested groups succeeded 29/29, styles preserved (the italic U stayed italic) | recurse GroupItems and assign contents directly; no need to rebuild text objects; `doc.save()` to persist |

Dimension-reproduction convention: probe (scale=100, px==pt) measures each (file,state) content width/height → the final export scales by target width → local white-border crop → compare against originals (width ±1px passes; height within 1% is threshold rounding; files whose content genuinely changed since reflect it honestly). Spot-check via local OCR (reading out every U=/H= label, conf ≥0.79).
