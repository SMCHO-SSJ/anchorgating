/* ============================================================
   Model: workspace state, gates, anchors, overrides, undo
   ============================================================ */
const REGIONS = ["UL", "UR", "LL", "LR"];
const REGION_POS = { UL: "좌상", UR: "우상", LL: "좌하", LR: "우하" };
const NUMBERING = {
  diva: { UL: "Q1", UR: "Q2", LL: "Q3", LR: "Q4" },
  flowjo: { UL: "Q1", UR: "Q2", LR: "Q3", LL: "Q4" },
};
const REGION_COLORS_DEFAULT = { LL: "#9aa0a8", LR: "#2a78d6", UR: "#eb6834", UL: "#1baf7a" };
const GATE_COLORS = ["#d23f3f", "#1faa3a", "#2a5bd6", "#b04ad0", "#d98a00", "#0e9aa7", "#7a5a3a"];

const S = {
  reps: [], samples: new Map(),
  names: {}, quadNames: {}, gateSeq: 0, quadSeq: 0,
  axes: {}, axesVer: 1,
  comp: true,
  style: { mode: "dot", dotSize: 1, alpha: 1, colorBy: "density", single: "#2a5bd6", palette: "flowjo", densScale: "linear", labelStyle: "flowjo", custom: ["#dfe9f7", "#3987e5", "#0d2b57"], levels: 7, smooth: 2, labels: true, numbering: "diva", fontSize: 11, lineW: 1, reverse: false, histFill: "#4b5bd4", histSmooth: 0 },
  styleVer: 1,
  regionColors: { ...REGION_COLORS_DEFAULT },
  sumColor: "#4a3aa7",
  bar: { scope: "all", group: null, gid: null, regions: ["LR", "UR"], sum: false, sumLabel: "Total apoptosis", layout: "grouped", err: "sd", dots: true, stats: true, ref: null, basis: "parent", exclude: {}, order: [], style: "prism", pfill: "color", psig: "stars", perr: "up", ppts: "filled", legendPos: "inTL", legendXY: null },
  extraPlots: [],
  ui: { repId: null, cur: null, sel: new Set(), view: "chain", rTab: "bar", tool: null, selPop: null, gridKey: null, tile: 190, gridGroup: null },
  clipboard: null,
};
const repById = (id) => S.reps.find((r) => r.id === id);
const curRep = () => repById(S.ui.repId);
const curSample = () => S.samples.get(S.ui.cur);
const repSamples = (rep) => (rep ? rep.sampleIds.map((id) => S.samples.get(id)).filter(Boolean) : []);
const groupSamples = (rep, g) => repSamples(rep).filter((s) => s.group === g);
function repGroups(rep) { const out = []; for (const s of repSamples(rep)) if (!out.includes(s.group)) out.push(s.group); return out; }

function newRep(name) { const r = { id: uid("r"), name: name || `Rep ${S.reps.length + 1}`, sampleIds: [], anchors: {}, demo: false }; S.reps.push(r); return r; }

function addSample(rep, parsed, opts = {}) {
  const s = {
    id: uid("s"), repId: rep.id, name: parsed.name, group: parsed.group || "그룹 1", fileName: parsed.fileName,
    n: parsed.n, params: parsed.params, pIndex: {}, raw: parsed.raw, spill: parsed.spill || null, compData: null,
    tree: [], overrides: {}, follow: true, demo: !!opts.demo, kw: parsed.kw || {},
    dirty: true, pops: null, ucache: {}, ver: 0,
  };
  s.params.forEach((p, i) => (s.pIndex[p.name] = i));
  for (const p of s.params) if (!S.axes[p.name]) S.axes[p.name] = defaultAxis(p.name, p.range);
  S.samples.set(s.id, s); rep.sampleIds.push(s.id);
  return s;
}
function removeSample(s) {
  const rep = repById(s.repId);
  rep.sampleIds = rep.sampleIds.filter((id) => id !== s.id);
  for (const g in rep.anchors) if (rep.anchors[g] === s.id) {
    for (const f of groupSamples(rep, g)) { f.tree = clone(effTree(f)); f.overrides = {}; }
    rep.anchors[g] = null;
  }
  S.samples.delete(s.id);
}

/* ---------- data access ---------- */
function dataOf(s) {
  if (S.comp && s.spill) { if (!s.compData) s.compData = applyComp(s.raw, s.spill, s.n); return s.compData; }
  return s.raw;
}
const TCACHE = new Map();
function T(pname) {
  const ax = S.axes[pname] || (S.axes[pname] = defaultAxis(pname, 262144));
  const k = pname + "#" + ax.scale + ax.min + "|" + ax.max + "|" + ax.cof;
  let t = TCACHE.get(pname);
  if (!t || t._k !== k) { t = makeT(ax); t._k = k; TCACHE.set(pname, t); }
  return t;
}
/* unit-space (0..1, clamped) event coordinates, cached per sample/param */
function unitArr(s, pname) {
  const pi = s.pIndex[pname]; if (pi == null) return null;
  const t = T(pname); const key = t._k + (S.comp && s.spill ? "c" : "r");
  const c = s.ucache[pname];
  if (c && c.key === key) return c.arr;
  const src = dataOf(s)[pi]; const arr = new Float32Array(s.n);
  const span = t.t1 - t.t0 || 1;
  for (let i = 0; i < s.n; i++) { const u = (t.f(src[i]) - t.t0) / span; arr[i] = u < 0 ? 0 : u > 1 ? 1 : u; }
  s.ucache[pname] = { key, arr };
  return arr;
}

/* ---------- gate tree / anchors ---------- */
function anchorOf(s) { const rep = repById(s.repId); const aid = rep && rep.anchors[s.group]; return aid && aid !== s.id ? S.samples.get(aid) || null : null; }
function isAnchor(s) { const rep = repById(s.repId); return !!rep && rep.anchors[s.group] === s.id; }
function leader(s) { return s.follow ? anchorOf(s) : null; }
function effTree(s) {
  const a = leader(s);
  if (!a) return s.tree;
  return a.tree.map((n) => (s.overrides[n.id] ? { ...n, g: s.overrides[n.id], _ov: true } : n));
}
/* the tree that structural edits for s should go to */
function structTree(s) { const a = leader(s); return a ? a : s; }
function followersOf(a) { const rep = repById(a.repId); if (!rep || rep.anchors[a.group] !== a.id) return []; return groupSamples(rep, a.group).filter((f) => f.id !== a.id && f.follow); }
function markDirty(list) { for (const s of list) { s.dirty = true; s.ver++; } }
function affected(s) { return [s, ...followersOf(s)]; }
function markAllDirty() { for (const s of S.samples.values()) { s.dirty = true; s.ver++; } }

function nodeKey(n) { return n.parent + "|" + (n.type === "range" ? "hist" : "2d") + "|" + n.xp + "|" + (n.type === "range" ? "" : n.yp); }
function nodeChildrenKeys(tree, gid) { const n = tree.find((x) => x.id === gid); if (!n) return []; return n.type === "quad" ? REGIONS.map((r) => gid + "." + r) : [gid]; }
function descendants(tree, gid) {
  const out = new Set([gid]); let grew = true;
  while (grew) { grew = false; for (const n of tree) if (!out.has(n.id) && out.has(n.parent.split(".")[0])) { out.add(n.id); grew = true; } }
  return out;
}
function popLabel(key) {
  if (key === "root") return "All events";
  const [gid, reg] = key.split(".");
  if (reg) return regionName(gid, reg);
  return S.names[gid] || gid;
}
function regionName(gid, reg) { const q = S.quadNames[gid] || {}; return q[reg] || NUMBERING[S.style.numbering][reg]; }
function gateColor(gid) {
  const keys = Object.keys(S.names); const i = keys.indexOf(gid);
  return GATE_COLORS[(i < 0 ? 0 : i) % GATE_COLORS.length];
}

/* ---------- populations ---------- */
function pip(px, py, xs, ys) { let inside = false; for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) { if ((ys[i] > py) !== (ys[j] > py) && px < ((xs[j] - xs[i]) * (py - ys[i])) / (ys[j] - ys[i]) + xs[i]) inside = !inside; } return inside; }
function sameIdx(a, b) { if (!a || !b || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
function compute(s) {
  if (!s.dirty && s.pops) return s.pops;
  const prev = s.pops; const pops = new Map();
  let all = prev && prev.get("root");
  if (!all || all.length !== s.n) { all = new Uint32Array(s.n); for (let i = 0; i < s.n; i++) all[i] = i; }
  pops.set("root", all);
  const tree = effTree(s);
  for (const { node } of treeOrder(tree)) { const par = pops.get(node.parent); if (par) evalNode(s, node, par, pops); }
  // stabilise identity to avoid needless redraws
  if (prev) for (const [k, v] of pops) { const o = prev.get(k); if (o !== v && sameIdx(o, v)) pops.set(k, o); }
  s.pops = pops; s.dirty = false;
  return pops;
}
function evalNode(s, n, par, pops) {
  const ux = unitArr(s, n.xp), uy = n.type === "range" ? null : unitArr(s, n.yp);
  const empty = new Uint32Array(0);
  if (!ux || (n.type !== "range" && !uy)) { for (const k of nodeChildrenKeys([n], n.id)) pops.set(k, empty); return; }
  const tx = T(n.xp), ty = n.yp ? T(n.yp) : null, g = n.g;
  const tmp = new Uint32Array(par.length);
  if (n.type === "rect" || n.type === "range") {
    let a = tx.u(Math.min(g.x1, g.x2)), b = tx.u(Math.max(g.x1, g.x2));
    if (a <= 0.0005) a = -1; if (b >= 0.9995) b = 2;
    let c = -1, d = 2;
    if (n.type === "rect") { c = ty.u(Math.min(g.y1, g.y2)); d = ty.u(Math.max(g.y1, g.y2)); if (c <= 0.0005) c = -1; if (d >= 0.9995) d = 2; }
    let m = 0;
    for (let i = 0; i < par.length; i++) { const e = par[i]; const x = ux[e]; if (x < a || x > b) continue; if (uy) { const y = uy[e]; if (y < c || y > d) continue; } tmp[m++] = e; }
    pops.set(n.id, tmp.slice(0, m));
  } else if (n.type === "poly") {
    const xs = g.pts.map((p) => tx.u(p[0])), ys = g.pts.map((p) => ty.u(p[1]));
    let minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    let m = 0;
    for (let i = 0; i < par.length; i++) { const e = par[i]; const x = ux[e], y = uy[e]; if (x < minx || x > maxx || y < miny || y > maxy) continue; if (pip(x, y, xs, ys)) tmp[m++] = e; }
    pops.set(n.id, tmp.slice(0, m));
  } else if (n.type === "quad") {
    const qx = tx.u(g.x), qy = ty.u(g.y);
    const b = { UL: new Uint32Array(par.length), UR: new Uint32Array(par.length), LL: new Uint32Array(par.length), LR: new Uint32Array(par.length) };
    const c = { UL: 0, UR: 0, LL: 0, LR: 0 };
    for (let i = 0; i < par.length; i++) { const e = par[i]; const r = (uy[e] >= qy ? "U" : "L") + (ux[e] >= qx ? "R" : "L"); b[r][c[r]++] = e; }
    for (const r of REGIONS) pops.set(n.id + "." + r, b[r].slice(0, c[r]));
  }
}
function popStats(s, key) {
  const pops = compute(s); const arr = pops.get(key); if (!arr) return null;
  const tree = effTree(s);
  let parentKey = "root";
  if (key !== "root") { const gid = key.split(".")[0]; const n = tree.find((x) => x.id === gid); if (n) parentKey = n.parent; }
  const par = pops.get(parentKey);
  return { count: arr.length, pParent: par && par.length ? (arr.length / par.length) * 100 : NaN, pTotal: s.n ? (arr.length / s.n) * 100 : NaN, parentKey };
}

/* ---------- default gates ---------- */
function quantile(arr, idx, q) {
  const n = idx ? idx.length : arr.length; if (!n) return 0;
  const step = Math.max(1, Math.floor(n / 6000)); const v = [];
  for (let i = 0; i < n; i += step) v.push(idx ? arr[idx[i]] : arr[i]);
  v.sort((a, b) => a - b); return v[clamp(Math.floor(q * (v.length - 1)), 0, v.length - 1)];
}
function findParam(s, res) { for (const re of res) { const p = s.params.find((p) => re.test(p.name) || re.test(p.stain)); if (p) return p.name; } return null; }
function fluorParams(s) { return s.params.filter((p) => !SCATTER_RE.test(p.name) && !TIME_RE.test(p.name)).map((p) => p.name); }
function autoGates(s) {
  const D = dataOf(s); const tree = [];
  const fa = findParam(s, [/^FSC-A$/i, /^FSC/i, /^FS/i]); const sa = findParam(s, [/^SSC-A$/i, /^SSC/i, /^SS/i]);
  const fh = findParam(s, [/^FSC-H$/i]), fw = findParam(s, [/^FSC-W$/i]), sh = findParam(s, [/^SSC-H$/i]), sw = findParam(s, [/^SSC-W$/i]);
  const fl = fluorParams(s);
  const ann = findParam(s, [/annexin/i, /^PE-A$/i, /FITC-A/i]) || fl[0];
  const via = findParam(s, [/7.?AAD/i, /^PI/i, /propidium/i, /DAPI/i, /PerCP/i]) || fl.find((p) => p !== ann);
  let parent = "root"; let all = null;
  const col = (p) => D[s.pIndex[p]];
  let seq = 0; const nextId = () => { const id = "P" + (++seq); S.gateSeq = Math.max(S.gateSeq, seq); return id; };
  if (fa && sa) {
    const X = col(fa), Y = col(sa);
    const x0 = Math.max(quantile(X, null, 0.1) * 0.9, T(fa).ax.max * 0.08), x1 = Math.min(quantile(X, null, 0.995) * 1.05, T(fa).ax.max * 0.98);
    const y0 = Math.max(quantile(Y, null, 0.02), T(sa).ax.max * 0.02), y1 = Math.min(quantile(Y, null, 0.995) * 1.08, T(sa).ax.max * 0.98);
    const id = nextId(); S.names[id] = S.names[id] || id;
    tree.push({ id, parent, type: "poly", xp: fa, yp: sa, g: { pts: [[x0, y0 + (y1 - y0) * 0.02], [x0 + (x1 - x0) * 0.55, y0], [x1, y0 + (y1 - y0) * 0.08], [x1, y1 * 0.96], [x0 + (x1 - x0) * 0.72, y1], [x0 + (x1 - x0) * 0.08, y1 * 0.9], [x0 - (x1 - x0) * 0.02, y0 + (y1 - y0) * 0.35]] } });
    parent = id; all = poolIdx(s, tree, parent);
  }
  const singlet = (hp, wp) => {
    const X = col(hp), W = col(wp);
    const q50 = quantile(W, all, 0.5), q16 = quantile(W, all, 0.16);
    const id = nextId(); S.names[id] = S.names[id] || id;
    tree.push({ id, parent, type: "rect", xp: hp, yp: wp, g: { x1: quantile(X, all, 0.003) * 0.9, x2: Math.min(quantile(X, all, 0.998) * 1.1, T(hp).ax.max), y1: Math.max(0, q16 - (q50 - q16) * 4), y2: q50 + Math.max(q50 - q16, 1500) * 3.2 } });
    parent = id; all = poolIdx(s, tree, parent);
  };
  if (fh && fw) singlet(fh, fw);
  if (sh && sw) singlet(sh, sw);
  if (ann && via) {
    const X = col(ann), Y = col(via);
    const thr = (A) => { const q30 = quantile(A, all, 0.3), q05 = quantile(A, all, 0.05); return Math.max(q30 + 6 * Math.max(q30 - q05, 40), 250); };
    const id = "Q1"; S.quadSeq = Math.max(S.quadSeq, 1); S.names[id] = S.names[id] || "Quad";
    if (!S.quadNames[id]) S.quadNames[id] = {};
    tree.push({ id, parent, type: "quad", xp: ann, yp: via, g: { x: thr(X), y: thr(Y) } });
  }
  return tree;
}
function poolIdx(s, tree, key) { const tmp = { ...s, tree, follow: false, overrides: {}, dirty: true, pops: null, ucache: s.ucache }; const p = compute(tmp); return p.get(key) || null; }
function defaultGeom(s, type, xp, yp, parentKey) {
  const D = dataOf(s); const pops = compute(s); const idx = pops.get(parentKey) || null;
  const X = s.pIndex[xp] != null ? D[s.pIndex[xp]] : null, Y = yp && s.pIndex[yp] != null ? D[s.pIndex[yp]] : null;
  const tx = T(xp), ty = yp ? T(yp) : null;
  const qx = (q) => (X ? quantile(X, idx, q) : tx.x(q)), qy = (q) => (Y ? quantile(Y, idx, q) : ty.x(q));
  if (type === "quad") return { x: qx(0.6), y: qy(0.6) };
  if (type === "range") return { x1: qx(0.25), x2: qx(0.75) };
  if (type === "rect") return { x1: qx(0.2), x2: qx(0.8), y1: qy(0.2), y2: qy(0.8) };
  const a = tx.u(qx(0.15)), b = tx.u(qx(0.85)), c = ty.u(qy(0.15)), d = ty.u(qy(0.85));
  return { pts: [[a, c], [b, c], [b, d], [a, d]].map(([u, v]) => [tx.x(u), ty.x(v)]) };
}

/* ---------- undo ---------- */
const UNDO = [], REDO = [];
function snapshot() {
  const samples = {}; for (const s of S.samples.values()) samples[s.id] = { tree: s.tree, overrides: s.overrides, follow: s.follow, name: s.name, group: s.group };
  return JSON.stringify({ samples, anchors: S.reps.map((r) => [r.id, r.anchors, r.name, r.sampleIds.slice()]), names: S.names, quadNames: S.quadNames, extra: S.extraPlots });
}
function pushUndo() { UNDO.push(snapshot()); if (UNDO.length > 120) UNDO.shift(); REDO.length = 0; updateUndoBtns(); }
function restore(json) {
  const o = JSON.parse(json);
  for (const id in o.samples) { const s = S.samples.get(id); if (!s) continue; Object.assign(s, o.samples[id]); }
  for (const [rid, anc, nm, ids] of o.anchors) { const r = repById(rid); if (r) { r.anchors = anc; r.name = nm; if (ids) { const keep = ids.filter((id) => S.samples.has(id)); for (const id of r.sampleIds) if (!keep.includes(id) && S.samples.has(id)) keep.push(id); r.sampleIds = keep; } } }
  S.names = o.names; S.quadNames = o.quadNames; S.extraPlots = o.extra || [];
  markAllDirty();
}
function undo() { if (!UNDO.length) return; REDO.push(snapshot()); restore(UNDO.pop()); updateUndoBtns(); fullRender(); toast("되돌렸습니다"); }
function redo() { if (!REDO.length) return; UNDO.push(snapshot()); restore(REDO.pop()); updateUndoBtns(); fullRender(); }
function updateUndoBtns() { const u = $("#btnUndo"), r = $("#btnRedo"); if (u) u.disabled = !UNDO.length; if (r) r.disabled = !REDO.length; }

/* ---------- edits ---------- */
function setGeom(s, gid, g) {
  const a = leader(s);
  if (a) { s.overrides[gid] = g; markDirty([s]); return "override"; }
  const n = s.tree.find((x) => x.id === gid); if (!n) return null;
  n.g = g; markDirty(affected(s)); return isAnchor(s) ? "anchor" : "own";
}
function addGate(s, node) {
  const tgt = structTree(s);
  if (node.type === "quad") { node.id = "Q" + (++S.quadSeq); S.names[node.id] = "Quad" + (S.quadSeq > 1 ? S.quadSeq : ""); S.quadNames[node.id] = {}; }
  else { node.id = "P" + (++S.gateSeq); S.names[node.id] = node.id; }
  tgt.tree.push(node); markDirty(affected(tgt));
  return { node, viaAnchor: tgt !== s ? tgt : null };
}
function deleteGate(s, gid) {
  const tgt = structTree(s); const del = descendants(tgt.tree, gid);
  tgt.tree = tgt.tree.filter((n) => !del.has(n.id));
  for (const f of followersOf(tgt)) for (const d of del) delete f.overrides[d];
  markDirty(affected(tgt));
  return tgt !== s ? tgt : null;
}
function changePlotAxes(s, plot, xp, yp) {
  const tgt = structTree(s); const nodes = tgt.tree.filter((n) => nodeKey(n) === plot.key);
  for (const n of nodes) {
    n.xp = xp; if (n.type !== "range") n.yp = yp;
    for (const f of [tgt, ...followersOf(tgt)]) delete f.overrides[n.id];
  }
  markDirty(affected(tgt));
  for (const n of nodes) n.g = defaultGeom(tgt, n.type, n.xp, n.yp, n.parent);
  markDirty(affected(tgt));
  return nodes.length;
}
function toggleAnchor(s) {
  const rep = repById(s.repId); const cur = rep.anchors[s.group];
  const group = groupSamples(rep, s.group);
  if (cur === s.id) {
    for (const f of group) if (f.id !== s.id) { f.tree = clone(effTree(f)); f.overrides = {}; }
    rep.anchors[s.group] = null;
    markDirty(group); return { released: true };
  }
  const snap = clone(effTree(s)).map((n) => { delete n._ov; return n; });
  const prevAnchor = cur ? S.samples.get(cur) : null;
  s.tree = snap; s.overrides = {}; s.follow = true;
  rep.anchors[s.group] = s.id;
  for (const f of group) {
    if (f.id === s.id) continue;
    if (!prevAnchor) f.overrides = {};
    if (f === prevAnchor) f.overrides = {};
    f.follow = true;
  }
  markDirty(group);
  return { count: group.length - 1 };
}
function setFollow(s, on) {
  if (on) { s.follow = true; s.overrides = {}; }
  else { s.tree = clone(effTree(s)).map((n) => { delete n._ov; return n; }); s.overrides = {}; s.follow = false; }
  markDirty([s]);
}
function copyGates(s) {
  const tree = clone(effTree(s)).map((n) => { delete n._ov; return n; });
  S.clipboard = { tree, from: s.name, rep: repById(s.repId).name };
}
function pasteTo(targets) {
  if (!S.clipboard) return 0;
  const tree = S.clipboard.tree; const tset = new Set(targets.map((t) => t.id));
  const anchorsFirst = targets.slice().sort((a, b) => (isAnchor(b) ? 1 : 0) - (isAnchor(a) ? 1 : 0));
  const touched = new Set();
  for (const t of anchorsFirst) {
    if (isAnchor(t)) { t.tree = clone(tree); t.overrides = {}; for (const f of followersOf(t)) { f.overrides = {}; touched.add(f); } }
    else {
      const a = leader(t);
      if (a && tset.has(a.id)) t.overrides = {};
      else if (a) { t.follow = false; t.tree = clone(tree); t.overrides = {}; }
      else { t.tree = clone(tree); t.overrides = {}; }
    }
    touched.add(t);
  }
  markDirty([...touched]);
  return touched.size;
}
function revertOverride(s, gid) { delete s.overrides[gid]; markDirty([s]); }

/* ---------- plots derived from tree ---------- */
function plotsFor(s) {
  const tree = effTree(s); const map = new Map();
  for (const n of tree) {
    const key = nodeKey(n);
    if (!map.has(key)) map.set(key, { key, parent: n.parent, kind: n.type === "range" ? "hist" : "2d", xp: n.xp, yp: n.type === "range" ? null : n.yp, nodes: [] });
    map.get(key).nodes.push(n);
  }
  const avail = new Set(["root", ...tree.flatMap((n) => nodeChildrenKeys(tree, n.id))]);
  for (const e of S.extraPlots) {
    const key = e.parent + "|" + e.kind + "|" + e.xp + "|" + (e.kind === "hist" ? "" : e.yp);
    if (!map.has(key) && avail.has(e.parent)) map.set(key, { key, parent: e.parent, kind: e.kind, xp: e.xp, yp: e.kind === "hist" ? null : e.yp, nodes: [], extra: e });
  }
  // order: by depth of parent in tree order
  const order = (k) => { if (k === "root") return 0; const gid = k.split(".")[0]; const i = tree.findIndex((n) => n.id === gid); return i < 0 ? 999 : i + 1; };
  return [...map.values()].sort((a, b) => order(a.parent) - order(b.parent));
}
function treeOrder(tree) {
  const out = []; const walk = (key, depth) => {
    for (const n of tree.filter((x) => x.parent === key)) {
      out.push({ node: n, depth });
      for (const ck of nodeChildrenKeys(tree, n.id)) walk(ck, depth + 1);
    }
  };
  walk("root", 0); return out;
}
