/* ============================================================
   File loading, demo boot, global bindings
   ============================================================ */
const CTRL_RES = [/^(ctrl|control|con|vehicle|veh|dmso|mock|nc|untreated)$/i, /(^|[_\s-])(c|ctrl|con|control|dmso|veh|vehicle|nc)$/i, /^\+\+$/, /^(un|unstained|blank)$/i];
function pickAnchor(samples, preferName) {
  if (preferName) { const s = samples.find((x) => x.name === preferName); if (s) return s; }
  for (const re of CTRL_RES) { const s = samples.find((x) => re.test(x.name.trim())); if (s) return s; }
  return samples[0];
}
function initGroupGates(rep, g) {
  const ss = groupSamples(rep, g); if (!ss.length) return;
  if (rep.anchors[g]) { for (const s of ss) if (!s.tree.length && s.id !== rep.anchors[g]) { s.follow = true; } return; }
  let src = null;
  for (const r of S.reps) if (r !== rep && r.anchors[g]) { src = S.samples.get(r.anchors[g]); break; }
  const a = pickAnchor(ss, src && src.name);
  a.tree = src ? clone(src.tree) : autoGatesFor(a, S.protocol);
  a.overrides = {}; a.follow = true; rep.anchors[g] = a.id;
  for (const s of ss) if (s !== a) { s.follow = true; s.overrides = {}; }
  markDirty(ss);
  return { anchor: a, fromRep: src ? repById(src.repId).name : null };
}
async function loadFiles(fileList) {
  const files = [...fileList].filter((f) => /\.(fcs|lmd)$/i.test(f.name) || f.type === "");
  if (!files.length) { toast("FCS 파일(.fcs)을 선택하세요"); return; }
  const wasDemo = S.reps.some((r) => r.demo);
  if (wasDemo) { resetWorkspace(); const r = newRep("Rep 1"); S.ui.repId = r.id; }
  const rep = curRep() || (() => { const r = newRep(); S.ui.repId = r.id; return r; })();
  const errors = []; const added = [];
  toast(`${files.length}개 파일을 읽는 중…`);
  for (const f of files) {
    try {
      const buf = await f.arrayBuffer(); const parsed = parseFCS(buf, f.name);
      if (!parsed.group && f.webkitRelativePath) { const parts = f.webkitRelativePath.split("/"); if (parts.length > 2) parsed.group = parts[parts.length - 2]; }
      added.push(addSample(rep, parsed));
    } catch (e) { errors.push(e.message || String(e)); }
  }
  let switched = null;
  if (added.length && (wasDemo || repSamples(rep).length === added.length)) {
    const d = detectProtocol(added);
    if (d && d !== S.protocol) { S.protocol = d; switched = d; }
    if (S.protocol === "cellcycle") Object.assign(S.bar, { members: ["G1", "S", "G2M"], layout: "stacked", sum: false, gid: null });
  }
  const groups = [...new Set(added.map((s) => s.group))]; const info = [];
  for (const g of groups) { const r = initGroupGates(rep, g); if (r) info.push(`${g}: 앵커 ${r.anchor.name}${r.fromRep ? ` (${r.fromRep} gate에서 시작)` : ""}`); }
  if (added.length) {
    const first = added.find((s) => !isAnchor(s)) || added[0]; S.ui.cur = first.id; S.ui.sel = new Set([first.id]);
    S.bar.group = null; S.bar.gid = null;
  }
  fullRender();
  if (errors.length) toast(`${added.length}개 불러옴 · ${errors.length}개 실패: ${errors[0]}`);
  else toast(`${rep.name}에 ${added.length}개 샘플을 불러왔습니다${switched ? ` · 파라미터를 보고 ‘${PROTOCOLS[switched].name}’ 프로토콜을 선택했습니다` : ""} · ${info.join(" · ")}`);
}
function bootDemo() {
  const t0 = performance.now();
  for (let r = 0; r < 3; r++) {
    const rep = newRep(`Rep ${r + 1}`); rep.demo = true;
    for (const g of ["Cell A", "Cell B"]) for (const tube of DEMO_TUBES) {
      addSample(rep, { name: tube, group: g, fileName: `demo_${g}_${tube}_rep${r + 1}.fcs`.replace(/[\s+]/g, "_"), n: 10000, params: DEMO_PARAMS, raw: genDemoSample(g, tube, r, 10000), spill: null }, { demo: true });
    }
    for (const g of ["Cell A", "Cell B"]) {
      const ss = groupSamples(rep, g); const a = ss.find((s) => s.name === "Control");
      a.tree = autoGates(a); rep.anchors[g] = a.id; for (const s of ss) if (s !== a) s.follow = true;
    }
  }
  S.quadNames.Q1 = { LL: "Live", LR: "Early apoptosis", UR: "Late apoptosis", UL: "Necrosis" };
  S.ui.repId = S.reps[0].id;
  const cur = groupSamples(S.reps[0], "Cell A").find((s) => s.name === "Drug A+B");
  S.ui.cur = cur.id; S.ui.sel = new Set([cur.id]);
  Object.assign(S.bar, { scope: "all", group: "Cell A", gid: "Q1", regions: ["LR", "UR"], ref: "Control" });
  for (const g of ["Cell A", "Cell B"]) for (const c of ["Unstained", "Annexin V only", "7-AAD only"]) { S.bar.exclude[g + "|" + c] = true; S.hist.exclude[g + "|" + c] = true; }
  void t0;
}

/* ---------------- bindings ---------------- */
function bind() {
  $("#btnLoad").addEventListener("click", () => $("#fileInput").click());
  $("#fileInput").addEventListener("change", (e) => { if (e.target.files.length) loadFiles(e.target.files); e.target.value = ""; });
  $("#tplInput").addEventListener("change", async (e) => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; try { applyTemplate(JSON.parse(await f.text())); } catch (err) { toast(`템플릿을 읽지 못했습니다: ${err.message}`); } });
  $("#btnUndo").addEventListener("click", undo); $("#btnRedo").addEventListener("click", redo);
  $("#btnMore").setAttribute("data-popper", "1"); $("#btnMore").addEventListener("click", () => exportMenu($("#btnMore")));
  $("#btnCopy").addEventListener("click", doCopy);
  $("#btnPaste").setAttribute("data-popper", "1"); $("#btnPaste").addEventListener("click", () => pasteMenu($("#btnPaste")));
  $("#btnSelAll").addEventListener("click", () => { S.ui.sel = new Set(curRep().sampleIds); renderSamples(); toast(`${S.ui.sel.size}개 샘플 선택 — Ctrl+V로 복사한 gate를 붙여넣을 수 있습니다`); });
  $("#btnAddPlot").addEventListener("click", addPlot);
  $$("#viewSeg button").forEach((b) => b.addEventListener("click", () => { S.ui.view = b.dataset.v; setTool(null); renderCenter(); }));
  $$("#tools .tool").forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool)));
  $$("#rTabs button").forEach((b) => b.addEventListener("click", () => { S.ui.rTab = b.dataset.t; renderRight(); }));
  // drag & drop
  let dragDepth = 0; const drop = $("#drop");
  window.addEventListener("dragenter", (e) => { if ([...(e.dataTransfer.types || [])].includes("Files")) { dragDepth++; drop.hidden = false; e.preventDefault(); } });
  window.addEventListener("dragover", (e) => { if (!drop.hidden) e.preventDefault(); });
  window.addEventListener("dragleave", () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) drop.hidden = true; });
  window.addEventListener("drop", (e) => { e.preventDefault(); dragDepth = 0; drop.hidden = true; if (e.dataTransfer.files.length) loadFiles(e.dataTransfer.files); });
  // keyboard
  document.addEventListener("keydown", (e) => {
    const typing = e.target.closest("input, select, textarea");
    if (e.key === "Escape") { if (DRAW) { DRAW = null; } if (S.ui.tool) setTool(null); closePop(); closeBarModal(); closeExport(); for (const v of VIEWS) drawOverlay(v.ctxO, v, v.dpr); return; }
    if (typing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === "c" && !String(window.getSelection())) { e.preventDefault(); doCopy(); return; }
    if (mod && e.key.toLowerCase() === "v") {
      e.preventDefault(); const sel = [...S.ui.sel].map((id) => S.samples.get(id)).filter(Boolean);
      if (sel.length > 1 || (sel.length === 1 && S.clipboard && sel[0].name !== S.clipboard.from)) doPaste(sel); else pasteMenu($("#btnPaste"));
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && S.ui.selPop && S.ui.selPop !== "root") { e.preventDefault(); doDeleteGate(S.ui.selPop.split(".")[0]); return; }
    const toolKey = { r: "rect", p: "poly", q: "quad" }[e.key.toLowerCase()];
    if (toolKey && !mod && S.ui.view === "chain") setTool(toolKey);
  });
  window.addEventListener("resize", () => { closePop(); if (BAR_MODAL) renderBarModal(); else if (S.ui.rTab === "bar") renderBar(); });
  let lastW = 0; new ResizeObserver(() => { const w = $("#rBar").clientWidth; if (Math.abs(w - lastW) > 8 && S.ui.rTab === "bar") { lastW = w; renderBar(); } }).observe($("#rBar"));
}
(async function main() {
  loadProps(); bind(); bootDemo(); fullRender();
  try {
    if (!(window.claude && typeof window.claude.use === "function")) {
      // standalone: opened directly in a browser — use a normal download
      DL = { save: async ({ filename, data }) => { const blob = data instanceof Blob ? data : new Blob([data]); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); return { status: "saved" }; } };
      const b = $("#rBar"); b._sig = null; renderRight();
    } else {
      const dl = await window.claude.use("downloads");
      if (dl) { DL = dl; const b = $("#rBar"); b._sig = null; renderRight(); }
    }
  } catch (e) { DL = null; }
})();
