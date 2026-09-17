/* ============================================================
   Analysis protocols: apoptosis · cell cycle · custom
   ============================================================ */
const PROTOCOLS = {
  apoptosis: { name: "Apoptosis · Annexin V / 7-AAD·PI", steps: ["P1 · FSC-A × SSC-A (세포)", "P2 · FSC-H × FSC-W (singlet)", "P3 · SSC-H × SSC-W (singlet)", "사분면 · Annexin V × 7-AAD/PI"] },
  cellcycle: { name: "Cell cycle · PI DNA content", steps: ["P1 · FSC-A × SSC-A (세포)", "P2 · PI-W × PI-A (doublet 제거)", "PI-A 히스토그램 (Y = Count)", "Sub-G1 · G1 · S · G2/M · >4N 범위"] },
  custom: { name: "Custom · 직접 gating", steps: ["gate 없이 FSC-A × SSC-A 플롯에서 시작", "상단 도구(사각형·다각형·사분면·범위)로 직접 구성", "완성 후 복사·붙여넣기 또는 앵커로 다른 샘플에 적용"] },
};
const CC_IDS = [["SubG1", "Sub-G1"], ["G1", "G1"], ["S", "S"], ["G2M", "G2/M"], ["G4N", ">4N"]];
const RANGE_COLORS_DEFAULT = { SubG1: "#9aa0a8", G1: "#2a78d6", S: "#eb6834", G2M: "#1baf7a", G4N: "#e87ba4" };
S.protocol = "apoptosis";
S.rangeColors = { ...RANGE_COLORS_DEFAULT };
function rangeColor(id) { return S.rangeColors[id] || gateColor(id); }

function detectProtocol(samples) {
  const names = samples.flatMap((s) => s.params.map((p) => (p.name + " " + p.stain).toUpperCase()));
  const has = (re) => names.some((n) => re.test(n));
  if (has(/ANNEXIN/) || (has(/7.?AAD/) && (has(/^PE-A/) || has(/FITC/) || has(/APC/)))) return "apoptosis";
  if (has(/^PI-W/) || has(/DAPI-W|FXCYCLE|DRAQ5|HOECHST/)) return "cellcycle";
  if (has(/^PI-A/) && !has(/^PE-A|FITC|APC/)) return "cellcycle";
  return null;
}

function scatterGate(s, tree, id) {
  const D = dataOf(s);
  const fa = findParam(s, [/^FSC-A$/i, /^FSC/i, /^FS/i]); const sa = findParam(s, [/^SSC-A$/i, /^SSC/i, /^SS/i]);
  if (!fa || !sa) return "root";
  const X = D[s.pIndex[fa]], Y = D[s.pIndex[sa]];
  const x0 = Math.max(quantile(X, null, 0.1) * 0.9, T(fa).ax.max * 0.06), x1 = Math.min(quantile(X, null, 0.995) * 1.08, T(fa).ax.max * 0.98);
  const y0 = Math.max(quantile(Y, null, 0.01) * 0.9, T(sa).ax.max * 0.02), y1 = Math.min(quantile(Y, null, 0.995) * 1.1, T(sa).ax.max * 0.98);
  S.names[id] = S.names[id] || id;
  tree.push({ id, parent: "root", type: "poly", xp: fa, yp: sa, g: { pts: [[x0, y0 + (y1 - y0) * 0.02], [x0 + (x1 - x0) * 0.55, y0], [x1, y0 + (y1 - y0) * 0.08], [x1, y1 * 0.96], [x0 + (x1 - x0) * 0.72, y1], [x0 + (x1 - x0) * 0.08, y1 * 0.9], [x0 - (x1 - x0) * 0.02, y0 + (y1 - y0) * 0.35]] } });
  return id;
}
function autoGatesCellCycle(s) {
  const D = dataOf(s); const tree = [];
  S.gateSeq = Math.max(S.gateSeq, 2);
  const fl = fluorParams(s);
  const dna = findParam(s, [/^PI-A$/i, /^PI[\s_-]/i, /FxCycle.*-A$/i, /DAPI-A$/i, /Hoechst.*-A$/i, /DRAQ5.*-A$/i, /7.?AAD-A$/i]) || fl.find((p) => /-A$/i.test(p)) || fl[0];
  if (!dna) return tree;
  const base = dna.replace(/-A$/i, "");
  const dnaW = s.params.find((p) => p.name.toUpperCase() === (base + "-W").toUpperCase()) ? base + "-W" : null;
  const rng = s.params[s.pIndex[dna]].range || 262144;
  S.axes[dna] = { scale: "lin", min: 0, max: rng, cof: 150 };
  if (dnaW) S.axes[dnaW] = { scale: "lin", min: 0, max: s.params[s.pIndex[dnaW]].range || 262144, cof: 150 };
  S.axesVer++; markAllDirty();
  let parent = scatterGate(s, tree, "P1");
  let idx = parent === "root" ? null : poolIdx(s, tree, parent);
  if (dnaW) {
    const W = D[s.pIndex[dnaW]]; const q50 = quantile(W, idx, 0.5), q16 = quantile(W, idx, 0.16);
    S.names.P2 = S.names.P2 || "P2";
    tree.push({ id: "P2", parent, type: "rect", xp: dnaW, yp: dna, g: { x1: Math.max(0, quantile(W, idx, 0.004) * 0.9), x2: q50 + Math.max(q50 - q16, 1500) * 3.2, y1: rng * 0.015, y2: rng * 0.92 } });
    parent = "P2"; idx = poolIdx(s, tree, parent);
  }
  // locate G1 / G2 peaks on a 256-channel histogram
  const X = D[s.pIndex[dna]]; const nb = 256; const hb = new Float32Array(nb); const n = idx ? idx.length : X.length;
  for (let i = 0; i < n; i++) { const v = X[idx ? idx[i] : i]; const k = Math.floor((v / rng) * nb); if (k >= 0 && k < nb) hb[k]++; }
  const sm = hb.map((_, i) => ((hb[i - 1] || 0) + hb[i] * 2 + (hb[i + 1] || 0)) / 4);
  let g1b = 0; for (let i = Math.floor(nb * 0.06); i < nb * 0.6; i++) if (sm[i] > sm[g1b]) g1b = i;
  const G1 = ((g1b + 0.5) / nb) * rng;
  let g2b = -1; for (let i = Math.floor(g1b * 1.7); i <= Math.min(nb - 1, Math.ceil(g1b * 2.35)); i++) if (g2b < 0 || sm[i] > sm[g2b]) g2b = i;
  const G2 = g2b > 0 && sm[g2b] > sm[g1b] * 0.04 ? ((g2b + 0.5) / nb) * rng : G1 * 2;
  const cuts = { SubG1: [rng * 0.004, G1 * 0.83], G1: [G1 * 0.83, G1 * 1.19], S: [G1 * 1.19, G2 * 0.89], G2M: [G2 * 0.89, G2 * 1.31], G4N: [G2 * 1.31, Math.min(rng * 0.92, G2 * 2.6)] };
  for (const [id, label] of CC_IDS) {
    S.names[id] = S.names[id] || label;
    tree.push({ id, parent, type: "range", xp: dna, yp: null, g: { x1: cuts[id][0], x2: cuts[id][1] } });
  }
  return tree;
}
function autoGatesFor(s, protocol) {
  if (protocol === "cellcycle") return autoGatesCellCycle(s);
  if (protocol === "custom") return [];
  return autoGates(s);
}

/* ---- demo data for the cell-cycle protocol (synthetic) ---- */
const DEMO_CC_PARAMS = [
  { name: "FSC-A", stain: "", range: 262144 }, { name: "FSC-H", stain: "", range: 262144 }, { name: "FSC-W", stain: "", range: 262144 },
  { name: "SSC-A", stain: "", range: 262144 }, { name: "SSC-H", stain: "", range: 262144 }, { name: "SSC-W", stain: "", range: 262144 },
  { name: "PI-A", stain: "PI", range: 262144 }, { name: "PI-W", stain: "", range: 262144 },
];
const DEMO_CC_TUBES = ["Control", "Drug A", "Drug B", "Drug A+B"];
const DEMO_CC_COMP = { Control: [0.02, 0.58, 0.15, 0.23, 0.02], "Drug A": [0.05, 0.5, 0.14, 0.28, 0.03], "Drug B": [0.1, 0.2, 0.1, 0.48, 0.12], "Drug A+B": [0.2, 0.15, 0.08, 0.41, 0.16] };
function genDemoCellCycle(tube, rep, n) {
  const seed = [...("cc" + tube)].reduce((a, c) => a * 31 + c.charCodeAt(0), 11) + rep * 7919;
  const rand = mulberry32(seed); const N = makeNormal(rand);
  const base = DEMO_CC_COMP[tube]; const jit = base.map((v) => Math.max(0.003, v * (1 + N(0, 0.1)))); const tot = jit.reduce((a, b) => a + b, 0);
  const cum = []; jit.reduce((a, v, i) => (cum[i] = a + v / tot), 0);
  const g1 = [50000, 51500, 48800][rep % 3]; const g2 = g1 * 1.97;
  const cols = DEMO_CC_PARAMS.map(() => new Float32Array(n));
  for (let e = 0; e < n; e++) {
    const r = rand(); let st = cum.findIndex((c) => r < c); if (st < 0) st = 4;
    let dna;
    if (st === 0) dna = g1 * 0.08 + Math.abs(N(0, g1 * 0.32));
    else if (st === 1) dna = N(g1, g1 * 0.042);
    else if (st === 2) dna = g1 + rand() * (g2 - g1) + N(0, g1 * 0.03);
    else if (st === 3) dna = N(g2, g2 * 0.042);
    else dna = N(g2 * 1.95, g2 * 0.06);
    const doublet = rand() < 0.07;
    let w = N(84000 + dna * 0.05, 5200);
    if (doublet) { dna = N(g1, g1 * 0.05) + N(g1 * (rand() < 0.7 ? 1 : 1.97), g1 * 0.06); w = N(150000, 22000); }
    const size = st === 0 ? 0.55 : 1 + (dna / g1 - 1) * 0.18;
    const fa = N(62000 * size, 17000), sa = N(52000 * (st === 0 ? 0.8 : 1), 15000);
    const row = [fa, fa * N(0.68, 0.04), N(104000, 8000), sa, sa * N(0.7, 0.04), N(80000, 7000), dna, w];
    for (let p = 0; p < 8; p++) cols[p][e] = clamp(row[p], 0, 262143);
  }
  return cols;
}
function resetWorkspace() {
  for (const r of S.reps) for (const id of r.sampleIds) S.samples.delete(id);
  S.reps = []; S.names = {}; S.quadNames = {}; S.gateSeq = 0; S.quadSeq = 0; S.extraPlots = []; S.clipboard = null;
  UNDO.length = 0; REDO.length = 0; S.bar.exclude = {}; S.hist.exclude = {}; S.hist.colors = {}; S.bar.gid = null; S.bar.members = null; S.ui.selPop = null; S.ui.gridKey = null;
  TCACHE.clear();
}
function bootDemoCellCycle() {
  for (let r = 0; r < 3; r++) {
    const rep = newRep(`Rep ${r + 1}`); rep.demo = true;
    for (const tube of DEMO_CC_TUBES) addSample(rep, { name: tube, group: "Cells", fileName: `demo_cellcycle_${tube}_rep${r + 1}.fcs`.replace(/[\s+]/g, "_"), n: 10000, params: DEMO_CC_PARAMS, raw: genDemoCellCycle(tube, r, 10000), spill: null }, { demo: true });
    const ss = groupSamples(rep, "Cells"); const a = ss[0];
    a.tree = autoGatesCellCycle(a); rep.anchors.Cells = a.id; for (const s of ss) if (s !== a) s.follow = true;
  }
  S.ui.repId = S.reps[0].id; const cur = groupSamples(S.reps[0], "Cells")[2]; S.ui.cur = cur.id; S.ui.sel = new Set([cur.id]);
  Object.assign(S.bar, { scope: "all", group: "Cells", gid: null, members: ["G1", "S", "G2M"], layout: "stacked", sum: false, ref: "Control" });
}
function bootDemoFor(protocol) {
  resetWorkspace();
  if (protocol === "cellcycle") bootDemoCellCycle();
  else { bootDemo(); if (protocol === "custom") for (const s of S.samples.values()) { s.tree = []; s.overrides = {}; } }
  markAllDirty();
}
function applyProtocol(protocol, opts = {}) {
  const demo = S.reps.some((r) => r.demo);
  S.protocol = protocol;
  if (demo && !opts.keepData) { bootDemoFor(protocol); fullRender(); toast(`${PROTOCOLS[protocol].name} 예시(모의) 데이터로 전환했습니다`); return; }
  pushUndo(); let groups = 0;
  for (const rep of S.reps) for (const g of repGroups(rep)) {
    const ss = groupSamples(rep, g); if (!ss.length) continue;
    const a = (rep.anchors[g] && S.samples.get(rep.anchors[g])) || pickAnchor(ss);
    a.tree = autoGatesFor(a, protocol); a.overrides = {}; a.follow = true; rep.anchors[g] = a.id;
    for (const s of ss) if (s !== a) { s.follow = true; s.overrides = {}; }
    groups++;
  }
  S.extraPlots = []; S.ui.selPop = null; S.ui.gridKey = null; S.bar.gid = null;
  if (protocol === "cellcycle") Object.assign(S.bar, { members: ["G1", "S", "G2M"], layout: "stacked", sum: false });
  markAllDirty(); fullRender();
  toast(`${PROTOCOLS[protocol].name} 프로토콜을 ${groups}개 그룹의 앵커에 적용했습니다`, "되돌리기", undo);
}
function renderProtocol() {
  const box = $("#protoBox"); if (!box) return; box.innerHTML = "";
  const sel = h("select", { class: "sel-input", id: "protoSel", style: { width: "100%" } }, ...Object.entries(PROTOCOLS).map(([k, p]) => h("option", { value: k, selected: S.protocol === k ? "" : null }, p.name)));
  sel.addEventListener("change", () => applyProtocol(sel.value));
  const steps = h("ol", { class: "proto-steps" }, ...PROTOCOLS[S.protocol].steps.map((t) => h("li", null, t)));
  const again = h("button", { class: "btn sm", title: "현재 데이터로 자동 gate를 다시 만듭니다 (되돌리기 가능)" }, "gate 다시 만들기");
  again.addEventListener("click", () => applyProtocol(S.protocol, { keepData: true }));
  box.append(h("div", { class: "p-head", style: { borderBottom: "0", paddingBottom: "4px" } }, h("span", { class: "p-title" }, "분석 · gating 프로토콜"), h("div", { class: "spacer" }), again),
    h("div", { style: { padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: "6px" } }, sel, steps));
}
