// embed_phase_diagram.jsx — 把一份 .ai 里的全部链接图整体改为嵌入的最终版脚本（v8，一次 72 图实战 72/72 成功）
// 目标文档路径经参数传入（PowerShell 侧 $ai.DoJavaScript($jsx, @('C:/path/target.ai'), 1)）；
//   arguments[0]=目标 .ai 全路径，arguments[1]=可选日志路径；架构与全部踩坑见 adobe-manual skill §12.1/§12.2
// 相对早期 embed_all.jsx 的四点升级（均有实锤）：
//   ① embed() 会把每图包进新组并插到容器顶部（z 序乱、面板多组）→ 标记路径占位 + PLACEBEFORE 归位 + 移出删空组
//   ② embed() 丢弃放置项的翻转变换 → **独立翻转相**在全部嵌入、拆组完成后对散置 raster 施加全参数
//      resize(-100,100,true,true,true,true,1)；两参数 resize 静默无效，循环内（组内态）施加的翻转存盘即丢——必须独立相
//   ③ embed() 有"组首 raster 被组末嵌入连带移位"行为 → 嵌入后跑收尾几何矫正相（带 chainUnlock）
//   ④ 终检之外再加 z 序逐位比对（嵌入前后 pageItems 序列同名对应）
// 断链文档：先跑"重链前置相"（按放置名映射源文件，pi.file = new File(...)；放置名≠文件名时，
//   embed 后 raster 按文件基名命名，名字定位候选集须含文件基名）
function main() {
  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
  var TARGET = arguments[0] || 'C:/path/to/target.ai';   // 必填：目标 .ai 全路径
  var NAME = TARGET.split('/').pop();
  var FLIP = true;   // 放置项带水平翻转的文档置 true；无翻转置 false 跳过翻转复原
  var LOG = arguments[1] || (Folder.temp + '/embed_phase.log');
  function log(s) { var f = new File(LOG); f.encoding = 'UTF-8'; if (f.open('e')) { f.seek(0, 2); f.writeln(s); f.close(); } }
  function normPath(p) { return String(p).split('/').join('\\').toLowerCase(); }
  function baseName(n) { return (n.length > 4 && n.slice(-4).toLowerCase() == '.tif') ? n.slice(0, -4) : n; }

  for (var i = app.documents.length - 1; i >= 0; i--) {
    if (app.documents[i].name == NAME) app.documents[i].close(SaveOptions.DONOTSAVECHANGES);
  }
  var doc = app.open(new File(TARGET));
  if (normPath(doc.fullName.fsName) != normPath(TARGET)) return 'WRONG-DOC';
  var n0 = doc.placedItems.length, r0 = doc.rasterItems.length;
  log('OPEN placed=' + n0 + ' raster=' + r0);
  if (n0 == 0) { doc.close(SaveOptions.DONOTSAVECHANGES); return 'ALREADY RASTER=' + r0; }

  function seqDump(d) {
    var a = [];
    for (var i = 0; i < d.pageItems.length; i++) a.push(d.pageItems[i].typename + '|' + String(d.pageItems[i].name));
    return a;
  }
  var seqPre = seqDump(doc);

  function chainUnlock(item) {
    var chain = [];
    var cur = item.parent;
    while (cur && cur.typename != 'Document') {
      try { chain.push({ o: cur, isLayer: (cur.typename == 'Layer'), lk: cur.locked, hd: (cur.typename == 'Layer' ? !cur.visible : cur.hidden) }); }
      catch (e) { return null; }
      cur = cur.parent;
    }
    for (var i = chain.length - 1; i >= 0; i--) {
      var c = chain[i];
      try { c.o.locked = false; if (c.isLayer) c.o.visible = true; else c.o.hidden = false; } catch (e) { return null; }
    }
    return chain;
  }
  function chainRestore(chain) {
    if (!chain) return;
    for (var i = 0; i < chain.length; i++) {
      var c = chain[i];
      try { if (c.isLayer) c.o.visible = !c.hd; else c.o.hidden = c.hd; c.o.locked = c.lk; } catch (e) {}
    }
  }

  var snap = {}, snapList = [];
  for (var p = 0; p < doc.placedItems.length; p++) {
    var it = doc.placedItems[p];
    snap[String(it.name)] = { l: it.left, t: it.top, w: it.width, h: it.height };
    snapList.push(String(it.name));
  }

  var fails = [], guard = 0;
  while (doc.placedItems.length > 0 && guard < n0 * 4 + 20) {
    guard++;
    var L = doc.placedItems.length;
    var pit = doc.placedItems[L - 1];
    var nm = String(pit.name);
    var s = snap[nm];
    if (s == null) { fails.push(nm + ':NO-SNAPSHOT'); break; }
    var chain = chainUnlock(pit);
    try { pit.locked = false; pit.hidden = false; } catch (e) {}
    var marker = doc.pathItems.add();
    marker.stroked = false; marker.filled = false;
    marker.move(pit, ElementPlacement.PLACEAFTER);      // 占住 pit 正后方（原 z 槽）
    var placedBefore = doc.placedItems.length;
    var ri = null;
    try { ri = pit.embed(); } catch (e) { ri = null; }
    if (doc.placedItems.length >= placedBefore) { fails.push(nm + ':EMBED-STUCK'); try { marker.remove(); } catch (e) {} chainRestore(chain); break; }
    if (ri == null || ri.typename != 'RasterItem') {
      var cand = baseName(nm);
      for (var j = 0; j < doc.rasterItems.length; j++) {
        var rn = String(doc.rasterItems[j].name);
        if (rn == cand || rn == nm || rn == '') { ri = doc.rasterItems[j]; break; }
      }
    }
    if (ri == null) { fails.push(nm + ':RASTER-NOT-FOUND'); try { marker.remove(); } catch (e) {} chainRestore(chain); break; }
    var grp = null;
    try { if (ri.parent && ri.parent.typename == 'GroupItem') grp = ri.parent; } catch (e) {}
    try { ri.name = nm; ri.left = s.l; ri.top = s.t; ri.width = s.w; ri.height = s.h; } catch (e) {}
    // 注意：翻转不在此处做！循环内对（尚在 embed 包装组内、随后移出删组的）raster 施加的
    // resize 翻转会在存盘后静默丢失（eps0075 实锤 72/72）——必须放到拆组完成后的独立翻转相。
    try {
      var target = (grp != null) ? grp : ri;
      target.move(marker, ElementPlacement.PLACEBEFORE);
      ri.move(marker, ElementPlacement.PLACEBEFORE);
      if (grp != null) grp.remove();
      marker.remove();
    } catch (e) { fails.push(nm + ':Z-FAIL ' + e); try { marker.remove(); } catch (e2) {} }
    chainRestore(chain);
    if (doc.placedItems.length % 12 == 0) log('PROGRESS placed=' + doc.placedItems.length + ' fails=' + fails.length);
  }

  // 收尾几何矫正相（防"组首 raster 被组末嵌入连带移位"）
  for (var q = 0; q < snapList.length; q++) {
    var nmq = snapList[q], sq = snap[nmq];
    for (var w = 0; w < doc.rasterItems.length; w++) {
      var rw = doc.rasterItems[w];
      if (String(rw.name) != nmq) continue;
      if (Math.abs(rw.left - sq.l) >= 0.5 || Math.abs(rw.width - sq.w) >= 0.5) {
        var chq = chainUnlock(rw);
        try { rw.left = sq.l; rw.top = sq.t; rw.width = sq.w; rw.height = sq.h; } catch (e) {}
        chainRestore(chq);
      }
    }
  }

  // ---- 独立翻转相（拆组完成后的散置 raster 上运行；eps0075 实锤循环内翻转存盘即丢）----
  if (FLIP) {
    for (var fp = 0; fp < doc.rasterItems.length; fp++) {
      var fr = doc.rasterItems[fp];
      var fs = snap[String(fr.name)];
      var fch = chainUnlock(fr);
      try { fr.locked = false; fr.hidden = false; } catch (e) {}
      try { fr.resize(-100, 100, true, true, true, true, 1); }   // 全参数！两参数对 RasterItem 静默无效
      catch (e) { fails.push(String(fr.name) + ':FLIP-FAIL'); }
      if (fs && (Math.abs(fr.left - fs.l) > 0.5 || Math.abs(fr.width - fs.w) > 0.5)) {
        try { fr.left = fs.l; fr.top = fs.t; fr.width = fs.w; fr.height = fs.h; } catch (e) {}
      }
      chainRestore(fch);
    }
    log('FLIP pass done, fails=' + fails.length);
  }

  function verify(d) {
    var bad = [];
    for (var k = 0; k < snapList.length; k++) {
      var nm2 = snapList[k], s2 = snap[nm2], found = false;
      for (var j = 0; j < d.rasterItems.length; j++) {
        var rr = d.rasterItems[j];
        if (String(rr.name) == nm2 &&
            Math.abs(rr.left - s2.l) < 0.5 && Math.abs(rr.top - s2.t) < 0.5 &&
            Math.abs(rr.width - s2.w) < 0.5 && Math.abs(rr.height - s2.h) < 0.5) { found = true; break; }
      }
      if (!found) bad.push(nm2);
    }
    return bad;
  }
  var bad = verify(doc);

  var seqPost = seqDump(doc);
  var zMismatch = [];
  if (seqPre.length == seqPost.length) {
    for (var z = 0; z < seqPre.length; z++) {
      if (seqPre[z].split('|')[1] != seqPost[z].split('|')[1]) zMismatch.push('#' + z);
    }
  } else zMismatch.push('LEN');

  var allOk = (doc.placedItems.length == 0 && fails.length == 0 && bad.length == 0 && zMismatch.length == 0);
  var report = 'PLACED ' + n0 + '->' + doc.placedItems.length + ' RASTER ' + r0 + '->' + doc.rasterItems.length +
               ' FAILS=[' + fails.join(';') + '] BAD=[' + bad.join(';') + '] ZM=' + zMismatch.length;
  if (allOk) {
    doc.save();
    report += ' SAVED';
    doc.close(SaveOptions.DONOTSAVECHANGES);
    var doc2 = app.open(new File(TARGET));
    report += ' | REOPEN placed=' + doc2.placedItems.length + ' raster=' + doc2.rasterItems.length + ' BAD=[' + verify(doc2).join(';') + ']';
    doc2.close(SaveOptions.DONOTSAVECHANGES);
  } else {
    doc.close(SaveOptions.DONOTSAVECHANGES);
    report += ' NOT-SAVED';
  }
  log(report);
  return report;
}
main();
