/* ============================================================
   Histogram plots: offset overlay (ridgeline) or small multiples
   ============================================================ */
S.hist = { repId: "cur", group: null, pop: null, xp: null, layout: "overlay", overlap: 0.55, smooth: 3, norm: "mode", alpha: 0.55, lw: 1, line: "dark", palette: "vivid", colors: {}, exclude: {}, labels: "right", labelColor: "black", showRef: false, ref: null, gates: false, arrow: true, cols: 0, xlabel: "" };
S.ui.plotKind = "bar";
const HIST_PALETTES = {
  vivid: { name: "선명", colors: ["#2f5fd0", "#e03131", "#2f9e44", "#15aabf", "#f08c00", "#9c36b5", "#5c6b7a", "#d6336c"] },
  prism: { name: "Prism", colors: ["#1f1f1f", "#d62728", "#1f77b4", "#2ca02c", "#9467bd", "#ff7f0e", "#8c564b", "#17becf"] },
  nature: { name: "Nature", colors: ["#e64b35", "#4dbbd5", "#00a087", "#3c5488", "#f39b7f", "#8491b4", "#91d1c2", "#7e6148"] },
  okabe: { name: "색약 친화", colors: ["#0072b2", "#d55e00", "#009e73", "#cc79a7", "#e69f00", "#56b4e9", "#f0e442", "#000000"] },
  pastel: { name: "파스텔", colors: ["#7aa6e8", "#f08a8a", "#86cf98", "#8fd3e0", "#f5bd6e", "#c09be0", "#aab4bf", "#f2a0c4"] },
  gray: { name: "회색조", colors: ["#1a1a1a", "#4d4d4d", "#7a7a7a", "#a3a3a3", "#c4c4c4", "#333333", "#666666", "#8f8f8f"] },
  viridis: { name: "Viridis", colors: null },
};
function histPalette(key, n) {
  const p = HIST_PALETTES[key] || HIST_PALETTES.vivid;
  if (p.colors) return p.colors;
  const lut = buildLUT(PALETTES.viridis.stops); const out = [];
  for (let i = 0; i < Math.max(2, n); i++) { const j = Math.round((i / Math.max(1, n - 1)) * 0.9 * 255) * 3; out.push("#" + [lut[j], lut[j + 1], lut[j + 2]].map((v) => v.toString(16).padStart(2, "0")).join("")); }
  return out;
}
function smoothArr(a, sigma) {
  if (!(sigma > 0)) return a;
  const r = Math.ceil(sigma * 3); const k = new Float32Array(2 * r + 1);
  for (let i = -r; i <= r; i++) k[i + r] = Math.exp((-i * i) / (2 * sigma * sigma));
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) { let v = 0, ws = 0; for (let j = -r; j <= r; j++) { const q = i + j; if (q < 0 || q >= a.length) continue; v += a[q] * k[j + r]; ws += k[j + r]; } out[i] = v / ws; }
  return out;
}
const hexDarken = (hex, f) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return "#222"; const n = parseInt(m[1], 16); return "#" + [16, 8, 0].map((s) => Math.round(((n >> s) & 255) * f).toString(16).padStart(2, "0")).join(""); };

const refFmt = (v) => (Math.abs(v) >= 100 ? Math.round(v).toString() : (+v.toPrecision(4)).toString());
function histModel() {
  const hs = S.hist; const groups = allGroups();
  if (!groups.includes(hs.group)) hs.group = (curSample() && curSample().group) || groups[0];
  let rep = hs.repId === "cur" ? curRep() : S.reps.find((r) => r.id === hs.repId);
  if (!rep) { hs.repId = "cur"; rep = curRep(); }
  let ss = rep ? groupSamples(rep, hs.group) : [];
  if (!ss.length) for (const r of S.reps) { const x = groupSamples(r, hs.group); if (x.length) { rep = r; ss = x; break; } }
  const s0 = ss.find((s) => isAnchor(s)) || ss[0];
  const pops = []; const params = [];
  let rangeNodes = [];
  if (s0) {
    const tree = effTree(s0);
    pops.push({ key: "root", label: "All events" });
    for (const { node } of treeOrder(tree)) for (const k of nodeChildrenKeys(tree, node.id)) pops.push({ key: k, label: popLabel(k), parent: node.parent });
    for (const p of s0.params) if (!TIME_RE.test(p.name)) params.push(p.name);
    if (!pops.find((p) => p.key === hs.pop)) {
      const rn = tree.find((n) => n.type === "range"); const qn = tree.find((n) => n.type === "quad");
      const nonRange = tree.filter((n) => n.type !== "range" && n.type !== "quad");
      hs.pop = rn ? rn.parent : qn ? qn.parent : nonRange.length ? nonRange[nonRange.length - 1].id : "root";
    }
    if (!params.includes(hs.xp)) {
      const rn = tree.find((n) => n.type === "range" && n.parent === hs.pop) || tree.find((n) => n.type === "range"); const qn = tree.find((n) => n.type === "quad");
      hs.xp = rn ? rn.xp : qn ? qn.xp : fluorParams(s0)[0] || params[0];
    }
    rangeNodes = tree.filter((n) => n.type === "range" && n.parent === hs.pop && n.xp === hs.xp);
  }
  const conds = ss.map((s) => s.name);
  const shown = conds.filter((c) => !hs.exclude[hs.group + "|" + c]);
  const pal = histPalette(hs.palette, conds.length);
  const colorOf = (c) => hs.colors[hs.group + "|" + c] || pal[conds.indexOf(c) % pal.length];
  const nb = 256; const series = [];
  for (const c of shown) {
    const s = ss.find((x) => x.name === c); const pop = compute(s).get(hs.pop); const ux = unitArr(s, hs.xp);
    const cnt = new Float32Array(nb); let n = 0;
    if (pop && ux) { n = pop.length; for (let i = 0; i < pop.length; i++) cnt[Math.min(nb - 1, (ux[pop[i]] * nb) | 0)]++; }
    const y = smoothArr(cnt, hs.smooth); let mx = 0; for (let i = 1; i < nb - 1; i++) mx = Math.max(mx, y[i]);
    series.push({ cond: c, idx: conds.indexOf(c), color: colorOf(c), y, n, max: mx || 1, missing: !pop || !ux, sample: s });
  }
  const gmax = Math.max(1, ...series.map((se) => se.max));
  return { hs, rep, ss, s0, pops, params, conds, shown, series, gmax, nb, T: hs.xp ? T(hs.xp) : null, rangeNodes };
}

/* ---- SVG ---- */
function histTickText(lab, x, y, fs, anchor) {
  const f = (v) => +v.toFixed(2);
  if (typeof lab === "string") return `<text x="${f(x)}" y="${f(y)}" font-size="${f(fs)}" fill="#12151a" text-anchor="${anchor}">${esc(lab)}</text>`;
  return `<text x="${f(x)}" y="${f(y)}" font-size="${f(fs)}" fill="#12151a" text-anchor="${anchor}">${esc(lab.base)}<tspan dy="${f(-fs * 0.42)}" font-size="${f(fs * 0.72)}">${esc(lab.exp)}</tspan></text>`;
}
function histSVG(M, W, H, opts = {}) {
  const hs = M.hs; const fs = opts.fs || (opts.big ? 13 : 11); const u = fs / 11; const lw = (opts.lw || 1) * (hs.lw || 1);
  const f = (v) => +v.toFixed(2);
  const size = opts.mm ? `width="${opts.mm[0]}mm" height="${opts.mm[1]}mm"` : `width="${f(W)}" height="${f(H)}"`;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${f(H)}" ${size} font-family="Arial, Helvetica, sans-serif" role="img" aria-label="Histogram">`;
  out += `<rect width="${f(W)}" height="${f(H)}" fill="#ffffff"/>`;
  if (!M.series.length || !M.T) return out + `<text x="${f(W / 2)}" y="${f(H / 2)}" font-size="${f(fs)}" fill="#7f8793" text-anchor="middle">표시할 히스토그램이 없습니다</text></svg>`;
  const t = M.T; const nb = M.nb; const xTitle = hs.xlabel || M.hs.xp;
  const strokeOf = (c) => (hs.line === "none" ? "none" : hs.line === "black" ? "#111111" : hs.line === "same" ? c : hexDarken(c, 0.62));
  const yNorm = (se, v) => (hs.norm === "count" ? v / M.gmax : v / se.max);
  const curvePath = (se, x0, pw, base, hgt, close) => {
    let d = close ? `M${f(x0)} ${f(base)}` : "";
    const yv = (i) => base - Math.min(1.02, yNorm(se, se.y[i])) * hgt;
    if (hs.smooth > 0) { for (let i = 0; i < nb; i++) { const x = x0 + ((i + 0.5) / nb) * pw; d += `${d ? "L" : "M"}${f(x)} ${f(yv(i))}`; } }
    else { for (let i = 0; i < nb; i++) { const xa = x0 + (i / nb) * pw, xb = x0 + ((i + 1) / nb) * pw; const y = f(yv(i)); d += `${d ? "L" : "M"}${f(xa)} ${y}L${f(xb)} ${y}`; } }
    return close ? d + `L${f(x0 + pw)} ${f(base)}Z` : d;
  };
  const xAxis = (x0, pw, y0, withTitle, fsz) => {
    const tl = Math.max(2, fsz * 0.38); let s = `<path d="M${f(x0)} ${f(y0)}H${f(x0 + pw)}" stroke="#111" stroke-width="${f(lw)}" fill="none"/>`; let ticks = ""; let last = -1e9;
    for (const tk of axisTicks(t, pw < 200)) {
      const uu = t.u(tk.v); if (uu < -0.001 || uu > 1.001) continue; const x = x0 + uu * pw;
      ticks += `M${f(x)} ${f(y0)}V${f(y0 + (tk.major ? tl : tl * 0.55))}`;
      if (tk.label) { const wl = (typeof tk.label === "string" ? tk.label.length : tk.label.base.length + tk.label.exp.length * 0.7) * fsz * 0.56; if (x - wl / 2 > last + 3 * u) { s += histTickText(tk.label, x, y0 + tl + fsz * 1.05, fsz, "middle"); last = x + wl / 2; } }
    }
    s += `<path d="${ticks}" stroke="#111" stroke-width="${f(lw)}" fill="none"/>`;
    if (withTitle) {
      const ty = y0 + tl + fsz * 2.45; const cx = x0 + pw / 2;
      s += `<text x="${f(cx)}" y="${f(ty)}" font-size="${f(fsz)}" fill="#12151a" text-anchor="middle" data-rename="xlabel" style="cursor:text">${esc(xTitle)}</text>`;
      if (hs.arrow) { const tw = xTitle.length * fsz * 0.56; const ax = cx + tw / 2 + 5 * u, ay = ty - fsz * 0.33, al = Math.min(28 * u, pw * 0.18); s += `<path d="M${f(ax)} ${f(ay)}H${f(ax + al)}M${f(ax + al - 3.5 * u)} ${f(ay - 2.6 * u)}L${f(ax + al)} ${f(ay)}L${f(ax + al - 3.5 * u)} ${f(ay + 2.6 * u)}" stroke="#111" stroke-width="${f(lw)}" fill="none"/>`; }
    }
    return s;
  };
  const yAxis = (x0, y0, ph, fsz, withTitle) => {
    const tl = Math.max(2, fsz * 0.38); const ymax = hs.norm === "count" ? M.gmax : 100; const st = niceStep(ymax, ph > 120 * u ? 4 : 2);
    let s = `<path d="M${f(x0)} ${f(y0)}V${f(y0 + ph)}" stroke="#111" stroke-width="${f(lw)}" fill="none"/>`; let tk = "";
    for (let v = 0; v <= ymax + 1e-9; v += st) { const y = y0 + ph - (v / ymax) * ph; tk += `M${f(x0)} ${f(y)}H${f(x0 - tl)}`; s += `<text x="${f(x0 - tl - 2 * u)}" y="${f(y + fsz * 0.35)}" font-size="${f(fsz)}" fill="#12151a" text-anchor="end">${hs.norm === "count" ? compactNum(v) : Math.round(v)}</text>`; }
    s += `<path d="${tk}" stroke="#111" stroke-width="${f(lw)}" fill="none"/>`;
    if (withTitle) s += `<text transform="translate(${f(x0 - tl - fsz * 2.6)} ${f(y0 + ph / 2)}) rotate(-90)" font-size="${f(fsz)}" fill="#12151a" text-anchor="middle">${hs.norm === "count" ? "Count" : "% of max"}</text>`;
    return s;
  };
  const gateMarks = (x0, pw, y0, ph, fsz) => {
    if (!hs.gates || !M.rangeNodes.length) return "";
    let s = ""; const seen = new Set(); const ends = [-1e9, -1e9];
    for (const n of [...M.rangeNodes].sort((p, q) => p.g.x1 - q.g.x1)) {
      for (const v of [n.g.x1, n.g.x2]) { const uu = t.u(v); if (uu <= 0.0005 || uu >= 0.9995) continue; const k = Math.round(uu * 2000); if (seen.has(k)) continue; seen.add(k); s += `<path d="M${f(x0 + uu * pw)} ${f(y0)}V${f(y0 + ph)}" stroke="#8a929c" stroke-width="${f(lw * 0.7)}" stroke-dasharray="${f(2 * u)} ${f(2 * u)}" fill="none"/>`; }
      const ua = clamp(t.u(n.g.x1), 0, 1), ub = clamp(t.u(n.g.x2), 0, 1); const lx = x0 + ((ua + ub) / 2) * pw; const nm = S.names[n.id] || n.id; const hw = nm.length * fsz * 0.82 * 0.3;
      let lv = 0; while (lv < 2 && ends[lv] > lx - hw - 2 * u) lv++; if (lv > 1) lv = ends[0] <= ends[1] ? 0 : 1; ends[lv] = lx + hw;
      s += `<text x="${f(lx)}" y="${f(y0 - 2.5 * u - lv * fsz * 0.85)}" font-size="${f(fsz * 0.82)}" fill="${rangeColor(n.id)}" text-anchor="middle" font-weight="700">${esc(nm)}</text>`;
    }
    return s;
  };
  const refMark = (x0, pw, y0, ph) => {
    if (!hs.showRef || hs.ref == null) return "";
    const uu = clamp(t.u(hs.ref), 0, 1); const x = x0 + uu * pw;
    return `<g data-ref="1" data-x0="${f(x0)}" data-pw="${f(pw)}" style="cursor:ew-resize"><rect x="${f(x - 5 * u)}" y="${f(y0)}" width="${f(10 * u)}" height="${f(ph)}" fill="transparent"/><path d="M${f(x)} ${f(y0)}V${f(y0 + ph)}" stroke="#111" stroke-width="${f(lw)}" stroke-dasharray="${f(3.5 * u)} ${f(2.5 * u)}" fill="none"/></g>`;
  };
  const n = M.series.length;
  if (hs.layout === "separate") {
    const cols = hs.cols || Math.max(1, Math.min(n, Math.floor(W / (170 * u)) || 1)); const rows = Math.ceil(n / cols);
    const cw = W / cols, chh = H / rows; const fsz = fs * 0.92;
    out += `<g data-plot="0,0,${f(W)},${f(H)}">`;
    M.series.forEach((se, i) => {
      const cx = (i % cols) * cw, cy = Math.floor(i / cols) * chh;
      const ml = (hs.norm === "count" ? 40 : 32) * u + fsz * 1.4, mr = 8 * u, mt = fsz + 10 * u + (hs.gates && M.rangeNodes.length ? fsz * 1.9 : 0), mb = fsz * 3.3 + 6 * u;
      const x0 = cx + ml, pw = cw - ml - mr, y0 = cy + mt, ph = chh - mt - mb; if (pw < 20 || ph < 20) return;
      out += `<text x="${f(x0 + pw / 2)}" y="${f(cy + fsz + 3 * u)}" font-size="${f(fsz * 1.05)}" font-weight="700" fill="${hs.labelColor === "match" ? se.color : "#12151a"}" text-anchor="middle" data-rename="cond|${se.idx}" style="cursor:text">${esc(se.cond)}</text>`;
      out += gateMarks(x0, pw, y0, ph, fsz);
      out += `<path d="${curvePath(se, x0, pw, y0 + ph, ph * 0.94, true)}" fill="${se.color}" fill-opacity="${f(hs.alpha)}" stroke="none"/>`;
      if (hs.line !== "none") out += `<path d="${curvePath(se, x0, pw, y0 + ph, ph * 0.94, false)}" fill="none" stroke="${strokeOf(se.color)}" stroke-width="${f(lw)}" stroke-linejoin="round"/>`;
      out += refMark(x0, pw, y0, ph);
      out += yAxis(x0, y0, ph, fsz, true) + xAxis(x0, pw, y0 + ph, true, fsz);
    });
    return out + "</g></svg>";
  }
  // overlay / offset (ridgeline)
  const o = clamp(hs.overlap, 0, 1); const full = o >= 0.999; const useLegend = full || hs.labels === "legend";
  const longest = Math.max(...M.series.map((se) => se.cond.length));
  const ml = full ? (hs.norm === "count" ? 44 : 36) * u + fs * 1.4 : 12 * u;
  const mr = useLegend ? 12 * u : Math.min(W * 0.35, longest * fs * 0.58 + 14 * u);
  const legendH = useLegend && !full ? n * (fs + 4 * u) + 6 * u : 0;
  const mt = 10 * u + (hs.gates && M.rangeNodes.length ? fs * 1.9 : 0) + legendH;
  const mb = fs * 3.3 + 8 * u;
  const pw = W - ml - mr, ph = H - mt - mb;
  const rowH = ph / (1 + (n - 1) * (1 - o)); const d = rowH * (1 - o);
  out += `<g data-plot="${f(ml)},${f(mt)},${f(pw)},${f(ph)}">`;
  out += gateMarks(ml, pw, mt, ph, fs);
  M.series.forEach((se, i) => {
    const base = mt + rowH + i * d; const hgt = rowH * (full ? 0.94 : 0.97);
    out += `<path d="${curvePath(se, ml, pw, base, hgt, true)}" fill="${se.color}" fill-opacity="${f(hs.alpha)}" stroke="none" data-hi="${i}"/>`;
    if (hs.line !== "none") out += `<path d="${curvePath(se, ml, pw, base, hgt, false)}" fill="none" stroke="${strokeOf(se.color)}" stroke-width="${f(lw)}" stroke-linejoin="round"/>`;
    if (!full && i < n - 1) out += `<path d="M${f(ml)} ${f(base)}H${f(ml + pw)}" stroke="${strokeOf(se.color) === "none" ? se.color : strokeOf(se.color)}" stroke-width="${f(lw * 0.5)}" stroke-opacity="0.5" fill="none"/>`;
    if (!useLegend) out += `<text x="${f(ml + pw + 7 * u)}" y="${f(base - Math.min(rowH * 0.18, fs * 0.2))}" font-size="${f(fs)}" fill="${hs.labelColor === "match" ? se.color : "#12151a"}" data-rename="cond|${se.idx}" style="cursor:text">${esc(se.cond)}</text>`;
  });
  out += refMark(ml, pw, mt, ph);
  if (full) out += yAxis(ml, mt, ph, fs, true);
  out += xAxis(ml, pw, mt + ph, true, fs);
  out += "</g>";
  if (useLegend) {
    const sq = fs * 0.85; const lx = full ? ml + pw - Math.min(pw * 0.45, longest * fs * 0.58 + sq + 10 * u) : ml + 4 * u; let ly = full ? mt + 4 * u : 8 * u;
    for (const se of M.series) { out += `<rect x="${f(lx)}" y="${f(ly)}" width="${f(sq)}" height="${f(sq)}" fill="${se.color}" fill-opacity="${f(Math.max(0.35, hs.alpha))}" stroke="${strokeOf(se.color)}" stroke-width="${f(lw * 0.7)}"/><text x="${f(lx + sq + 4 * u)}" y="${f(ly + sq * 0.9)}" font-size="${f(fs)}" fill="#12151a" data-rename="cond|${se.idx}" style="cursor:text">${esc(se.cond)}</text>`; ly += fs + 4 * u; }
  }
  return out + "</svg>";
}

/* ---- interactions ---- */
function bindHist(container, M, rerender) {
  const svg = container.querySelector("svg"); if (!svg) return;
  for (const ref of svg.querySelectorAll("[data-ref]")) ref.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return; e.preventDefault(); e.stopPropagation();
    const ctm = svg.getScreenCTM(); if (!ctm) return;
    const x0 = +ref.dataset.x0, pw = +ref.dataset.pw; const u0 = clamp(M.T.u(M.hs.ref), 0, 1);
    const peers = [...svg.querySelectorAll("[data-ref]")];
    const move = (ev) => {
      const du = (ev.clientX - e.clientX) / ctm.a / pw; const uu = clamp(u0 + du, 0, 1); M.hs.ref = M.T.x(uu);
      for (const p of peers) p.setAttribute("transform", `translate(${(uu - u0) * +p.dataset.pw} 0)`);
      rerender(true);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); saveProps(); rerender(false); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
    void x0;
  });
  svg.addEventListener("dblclick", (e) => {
    const t = e.target.closest("[data-rename]"); if (!t) return;
    const [kind, a] = t.dataset.rename.split("|");
    if (kind === "xlabel") return floatingInput(e.clientX - 60, e.clientY - 16, 180, M.hs.xlabel || M.hs.xp, (v) => { M.hs.xlabel = v; saveProps(); rerender(false); });
    const cur = M.conds[+a]; if (cur == null) return;
    floatingInput(e.clientX - 30, e.clientY - 16, 180, cur, (v) => renameCondition(M.hs.group, cur, v));
  });
}

/* ---- right panel ---- */
function plotKindSeg(box) {
  const seg = h("div", { class: "seg", id: "plotKind", style: { width: "100%" } }, ...[["bar", "Bar plot"], ["hist", "Histogram"]].map(([v, l]) => {
    const b = h("button", { class: S.ui.plotKind === v ? "on" : "", style: { flex: 1, justifyContent: "center" } }, l);
    b.addEventListener("click", () => { if (S.ui.plotKind === v) return; S.ui.plotKind = v; saveProps(); box._sig = null; renderBar(); if (BAR_MODAL) renderBarModal(); });
    return b;
  }));
  return h("div", { class: "field" }, seg);
}
function histCtlSig(M) { const hs = M.hs; return JSON.stringify(["hist", allGroups(), S.reps.map((r) => r.id + r.name), M.pops.map((p) => p.key + p.label), M.params, M.conds, hs.repId, hs.group, hs.pop, hs.xp, hs.layout, hs.norm, hs.line, hs.palette, hs.exclude, hs.labels, hs.labelColor, hs.showRef, hs.gates, hs.arrow, hs.cols, hs.overlap >= 0.999, !!DL]); }
function histChartH(M, W) {
  const n = Math.max(1, M.series.length);
  if (M.hs.layout === "separate") { const cols = M.hs.cols || Math.max(1, Math.min(n, Math.floor(W / 170) || 1)); return Math.ceil(n / cols) * 150; }
  const o = clamp(M.hs.overlap, 0, 1); return Math.round(Math.max(220, Math.min(620, 90 + 90 * (1 + (n - 1) * (1 - o)))));
}
function drawHistChart(box, M) {
  const chart = box.querySelector(".chart-box"); if (!chart) return;
  const W = Math.max(300, chart.clientWidth - 12) || 360;
  chart.innerHTML = histSVG(M, W, histChartH(M, W));
  bindHist(chart, M, (live) => { if (!live) { drawHistChart(box, histModel()); if (BAR_MODAL) renderBarModal(); } { const inp = box.querySelector("#histRefVal"); if (inp && S.hist.ref != null) inp.value = refFmt(S.hist.ref); } });
}
function renderHistPanel() {
  const box = $("#rBar"); if (box.hidden) return;
  const M = histModel();
  if (box._sig !== histCtlSig(M)) buildHistControls(box, M);
  drawHistChart(box, M);
  const note = box.querySelector(".bar-note");
  if (note) note.textContent = M.series.length ? `${M.rep ? M.rep.name : ""} · ${popLabel(M.hs.pop)} · ` + M.series.map((se) => `${se.cond} n=${fmtInt(se.n)}`).join(" · ") : "";
}
function buildHistControls(box, M) {
  const hs = S.hist; const sc = box.parentElement; const keep = sc ? sc.scrollTop : 0; requestAnimationFrame(() => { if (sc) sc.scrollTop = keep; });
  box.innerHTML = ""; box._built = true; box._sig = histCtlSig(M);
  const re = () => { saveProps(); box._sig = null; renderBar(); if (BAR_MODAL) renderBarModal(); };
  const live = () => { drawHistChart(box, histModel()); if (BAR_MODAL) renderBarModal(); };
  const seg = (opts, key) => h("div", { class: "seg" }, ...opts.map(([v, l]) => { const bt = h("button", { class: hs[key] === v ? "on" : "" }, l); bt.addEventListener("click", () => { hs[key] = v; re(); }); return bt; }));
  const slider = (label, key, min, max, step, fmt, id) => {
    const lab = h("span", { class: "num", style: { color: "var(--ink)", fontWeight: 700, textTransform: "none" } }, fmt(hs[key]));
    const r = h("input", { type: "range", id, min: String(min), max: String(max), step: String(step), value: String(hs[key]) });
    r.addEventListener("input", () => { const was = hs.overlap >= 0.999; hs[key] = +r.value; lab.textContent = fmt(hs[key]); if (key === "overlap" && was !== hs.overlap >= 0.999) { box._sig = null; } live(); });
    r.addEventListener("change", () => { saveProps(); if (box._sig === null) renderBar(); });
    return h("div", { class: "field" }, h("div", { class: "f-label" }, label, lab), r);
  };
  box.append(plotKindSeg(box));
  const repSel = h("select", { class: "sel-input", id: "histRep" }, h("option", { value: "cur", selected: hs.repId === "cur" ? "" : null }, `현재 반복 (${curRep() ? curRep().name : ""})`), ...S.reps.filter((r) => r.sampleIds.length).map((r) => h("option", { value: r.id, selected: hs.repId === r.id ? "" : null }, r.name)));
  repSel.addEventListener("change", () => { hs.repId = repSel.value; re(); });
  const gsel = h("select", { class: "sel-input", id: "histGroup" }, ...allGroups().map((g) => h("option", { value: g, selected: g === hs.group ? "" : null }, g))); gsel.addEventListener("change", () => { hs.group = gsel.value; re(); });
  box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "데이터"), h("div", { class: "f-row", style: { flexWrap: "nowrap" } }, repSel, gsel)));
  const psel = h("select", { class: "sel-input", id: "histPop", style: { flex: 1, minWidth: 0 } }, ...M.pops.map((p) => h("option", { value: p.key, selected: p.key === hs.pop ? "" : null }, p.key === "root" ? "All events" : `${p.label}${p.parent ? ` (${popLabel(p.parent)} 안)` : ""}`)));
  psel.addEventListener("change", () => { hs.pop = psel.value; re(); });
  const xsel = h("select", { class: "sel-input", id: "histParam", style: { flex: 1, minWidth: 0 } }, ...M.params.map((p) => h("option", { value: p, selected: p === hs.xp ? "" : null }, p)));
  xsel.addEventListener("change", () => { hs.xp = xsel.value; hs.xlabel = ""; hs.ref = null; re(); });
  box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "population · 파라미터"), h("div", { class: "f-row", style: { flexWrap: "nowrap" } }, psel, xsel), h("span", { class: "note" }, "X축 스케일·범위는 gating 플롯의 축 설정을 따릅니다")));
  box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "보기 방식"), seg([["overlay", "겹쳐서 (오프셋)"], ["separate", "하나씩"]], "layout")));
  if (hs.layout === "overlay") {
    box.append(slider("겹침 정도", "overlap", 0, 1, 0.05, (v) => (v >= 0.999 ? "100% · 완전히 겹침" : v <= 0 ? "0% · 줄마다 분리" : Math.round(v * 100) + "%"), "histOverlap"));
    box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "샘플 이름"), h("div", { class: "f-row" }, hs.overlap >= 0.999 ? h("span", { class: "note" }, "완전히 겹치면 범례로 표시됩니다") : seg([["right", "오른쪽에"], ["legend", "범례로"]], "labels"), seg([["black", "검정 글씨"], ["match", "곡선 색 글씨"]], "labelColor"))));
  } else {
    box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "열 개수"), seg([[0, "자동"], [1, "1"], [2, "2"], [3, "3"], [4, "4"]], "cols")));
  }
  box.append(slider("곡선 스무딩", "smooth", 0, 10, 0.5, (v) => (v <= 0 ? "끔 · 계단형 원본" : `σ ${v} 채널`), "histSmooth"));
  box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "Y 값"), seg([["mode", "% of max (모드 정규화)"], ["count", "Count"]], "norm")));
  // colours
  const palRow = h("div", { class: "pill-list" }, ...Object.entries(HIST_PALETTES).map(([k, p]) => {
    const cols = histPalette(k, 5).slice(0, 5);
    const b = h("button", { class: "pill" + (hs.palette === k ? " on" : ""), title: p.name }, h("span", { style: { display: "inline-flex", gap: "1px" } }, ...cols.map((c) => h("span", { class: "sw", style: { background: c, borderRadius: "2px" } }))), p.name);
    b.addEventListener("click", () => { hs.palette = k; for (const key of Object.keys(hs.colors)) if (key.startsWith(hs.group + "|")) delete hs.colors[key]; re(); });
    return b;
  }));
  const pal = histPalette(hs.palette, M.conds.length);
  const condRows = h("div", { class: "field", style: { gap: "4px" } }, ...M.conds.map((c, i) => {
    const k = hs.group + "|" + c; const on = !hs.exclude[k]; const col = hs.colors[k] || pal[i % pal.length];
    const inp = h("input", { type: "color", value: col, title: `${c} 색`, disabled: on ? null : "" });
    inp.addEventListener("input", () => { hs.colors[k] = inp.value; live(); }); inp.addEventListener("change", saveProps);
    const tog = h("button", { class: "pill" + (on ? " on" : ""), style: { flex: 1, justifyContent: "flex-start", minWidth: 0 } }, c);
    tog.addEventListener("click", () => { if (on) hs.exclude[k] = true; else delete hs.exclude[k]; re(); });
    const up = h("button", { class: "btn sm", title: "위로", disabled: i ? null : "", style: { padding: "2px 6px" } }, "↑");
    up.addEventListener("click", () => { const r = M.rep; if (!r) return; const ss = groupSamples(r, hs.group); const a = ss[i], b = ss[i - 1]; if (a && b) { reorderSample(a.id, b.id, false); box._sig = null; renderBar(); } });
    return h("div", { class: "f-row", style: { flexWrap: "nowrap", gap: "6px" } }, inp, tog, up);
  }));
  const reset = h("button", { class: "btn sm" }, "색 초기화"); reset.addEventListener("click", () => { for (const key of Object.keys(hs.colors)) if (key.startsWith(hs.group + "|")) delete hs.colors[key]; re(); });
  box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "색 · 포함할 조건"), palRow, condRows, h("div", { class: "f-row" }, reset, h("span", { class: "note" }, "색 칸을 눌러 조건마다 직접 고를 수 있습니다"))));
  box.append(slider("채움 불투명도", "alpha", 0, 1, 0.05, (v) => Math.round(v * 100) + "%", "histAlpha"));
  box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "외곽선"), seg([["dark", "진한 같은 색"], ["same", "같은 색"], ["black", "검정"], ["none", "없음"]], "line")));
  box.append(slider("선 굵기", "lw", 0.25, 3, 0.25, (v) => v + "×", "histLw"));
  // extras
  const ck = (label, key, id, after) => { const c = h("label", { class: "check" }, h("input", { type: "checkbox", id, checked: hs[key] ? "" : null }), label); c.querySelector("input").addEventListener("change", (e) => { hs[key] = e.target.checked; if (after) after(); re(); }); return c; };
  const refVal = h("input", { class: "txt-input num", id: "histRefVal", type: "text", value: hs.ref != null ? refFmt(hs.ref) : "", style: { width: "90px" }, disabled: hs.showRef ? null : "" });
  refVal.addEventListener("change", () => { const v = parseFloat(refVal.value); if (isFinite(v)) { hs.ref = v; saveProps(); live(); } });
  const initRef = () => { if (hs.showRef && hs.ref == null) { const se = M.series[0]; if (se) { let bi = 1; for (let i = 1; i < M.nb - 1; i++) if (se.y[i] > se.y[bi]) bi = i; hs.ref = M.T.x((bi + 0.5) / M.nb); } } };
  box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "표시"),
    h("div", { class: "f-row" }, ck("세로 기준선", "showRef", "histShowRef", initRef), refVal, h("span", { class: "note" }, "선을 끌어 옮길 수 있습니다")),
    h("div", { class: "f-row" }, ck("구간 gate 경계", "gates", "histGates"), ck("축 이름 화살표", "arrow", "histArrow")),
    M.rangeNodes.length || !hs.gates ? null : h("span", { class: "note" }, "이 population·파라미터에는 범위 gate가 없습니다")));
  const big = h("button", { class: "btn sm" }); big.append(ic("expand"), "크게 보기"); big.addEventListener("click", openBarModal);
  const figB = h("button", { class: "btn sm primary", disabled: DL ? null : "" }, "그림 저장 (mm·pt 지정)…"); figB.addEventListener("click", () => openExport({ type: "hist" }));
  const csvB = h("button", { class: "btn sm", disabled: DL ? null : "" }, "CSV"); csvB.addEventListener("click", saveHistCSV);
  box.insertBefore(h("div", { class: "chart-box" }), box.children[1]);
  box.insertBefore(h("div", { class: "f-row" }, big, h("div", { class: "spacer" }), figB, csvB), box.children[2]);
  box.insertBefore(h("div", { class: "note bar-note" }), box.children[3]);
  box.append(h("div", { class: "note", style: { lineHeight: "1.5" } }, "샘플 이름과 X축 이름은 그래프에서 더블클릭해 바꿀 수 있습니다. gate를 드래그하면 히스토그램도 바로 갱신됩니다."));
}
function saveHistCSV() {
  const M = histModel(); const t = M.T; if (!t) return;
  const head = ["bin", `${M.hs.xp}_low`, `${M.hs.xp}_high`, ...M.series.map((se) => se.cond)];
  const rows = [head];
  for (let i = 0; i < M.nb; i++) rows.push([i, t.x(i / M.nb).toPrecision(6), t.x((i + 1) / M.nb).toPrecision(6), ...M.series.map((se) => (M.hs.norm === "count" ? se.y[i].toFixed(3) : ((se.y[i] / se.max) * 100).toFixed(3)))]);
  saveFile(`histogram_${M.hs.group}_${M.hs.xp}_${stamp()}.csv`.replace(/[\\/:*?"<>|]/g, "_"), rows.map((r) => r.map(csvCell).join(",")).join("\n"));
}
