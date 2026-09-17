/* ============================================================
   Plot rendering (canvas) and gate interaction
   ============================================================ */
const PINK = "#1b1f24", PACC = "#2a78d6", POVR = "#d9591f", PMUTED = "#6b7380", PLINE = "#2b3038";
const FONT = 'Arial, "Helvetica Neue", Helvetica, "Malgun Gothic", sans-serif';
let LUT_CACHE = { key: "", lut: null };
function currentLUT() {
  const st = S.style; let stops = st.palette === "custom" ? st.custom : (PALETTES[st.palette] || PALETTES.viridis).stops; if (st.reverse) stops = stops.slice().reverse();
  const key = stops.join();
  if (LUT_CACHE.key !== key) LUT_CACHE = { key, lut: buildLUT(stops) };
  return LUT_CACHE.lut;
}
let RENDER_OV = null;
function plotFS(compact) { return RENDER_OV ? RENDER_OV.fs : compact ? 8.5 : S.style.fontSize || 11; }
function plotLW() { return RENDER_OV ? RENDER_OV.lw : S.style.lineW || 1; }
function showTitles(compact) { return RENDER_OV ? RENDER_OV.titles !== false : !compact; }
function margins(compact) {
  if (compact && !RENDER_OV) return { l: 34, r: 6, t: 6, b: 24 };
  const fs = plotFS(compact); const ti = showTitles(compact);
  return { l: Math.round(fs * (ti ? 4.6 : 3.4) + 4), r: Math.round(fs * 0.9 + 3), t: Math.round(fs * 0.8 + 2), b: Math.round(fs * (ti ? 3.6 : 2.2) + 2) };
}
function axisTitle(s, p) { const pr = s.params[s.pIndex[p]]; return pr && pr.stain ? `${p} · ${pr.stain}` : p; }

function blur(arr, gw, gh, r) {
  if (r <= 0) return arr;
  const tmp = new Float32Array(arr.length); const out = new Float32Array(arr.length); const k = 2 * r + 1;
  for (let y = 0; y < gh; y++) { let acc = 0; for (let x = -r; x <= r; x++) acc += arr[y * gw + clamp(x, 0, gw - 1)]; for (let x = 0; x < gw; x++) { tmp[y * gw + x] = acc / k; acc += arr[y * gw + Math.min(gw - 1, x + r + 1)] - arr[y * gw + Math.max(0, x - r)]; } }
  for (let x = 0; x < gw; x++) { let acc = 0; for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, gh - 1) * gw + x]; for (let y = 0; y < gh; y++) { out[y * gw + x] = acc / k; acc += tmp[Math.min(gh - 1, y + r + 1) * gw + x] - tmp[Math.max(0, y - r) * gw + x]; } }
  return out;
}
function binGrid(pop, ux, uy, gw, gh, inner) {
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < pop.length; i++) { const e = pop[i]; if (inner) { const a = ux[e], b = uy[e]; if (a <= 0.0005 || a >= 0.9995 || b <= 0.0005 || b >= 0.9995) continue; } const ix = Math.min(gw - 1, (ux[e] * gw) | 0); const iy = Math.min(gh - 1, ((1 - uy[e]) * gh) | 0); g[iy * gw + ix]++; }
  return g;
}
function marching(vals, gw, gh, thr, emit) {
  const v = (x, y) => vals[y * gw + x];
  for (let y = 0; y < gh - 1; y++) for (let x = 0; x < gw - 1; x++) {
    const a = v(x, y), b = v(x + 1, y), c = v(x + 1, y + 1), d = v(x, y + 1);
    const idx = (a >= thr ? 8 : 0) | (b >= thr ? 4 : 0) | (c >= thr ? 2 : 0) | (d >= thr ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    const lerp = (p, q) => (thr - p) / (q - p || 1e-9);
    const T_ = [x + lerp(a, b), y], R_ = [x + 1, y + lerp(b, c)], B_ = [x + lerp(d, c), y + 1], L_ = [x, y + lerp(a, d)];
    const segs = { 1: [[L_, B_]], 2: [[B_, R_]], 3: [[L_, R_]], 4: [[T_, R_]], 5: [[T_, L_], [B_, R_]], 6: [[T_, B_]], 7: [[T_, L_]], 8: [[T_, L_]], 9: [[T_, B_]], 10: [[T_, R_], [L_, B_]], 11: [[T_, R_]], 12: [[L_, R_]], 13: [[B_, R_]], 14: [[L_, B_]] }[idx];
    for (const sg of segs) emit(sg[0], sg[1]);
  }
}
function measureLabel(ctx, lab, fs) {
  if (lab == null) return 0;
  if (typeof lab === "string") { ctx.font = `${fs}px ${FONT}`; return ctx.measureText(lab).width; }
  ctx.font = `${fs}px ${FONT}`; const a = ctx.measureText(lab.base).width; ctx.font = `${fs * 0.72}px ${FONT}`; return a + ctx.measureText(lab.exp).width + 1;
}
function drawLabel(ctx, lab, x, y, align, fs) {
  const w = measureLabel(ctx, lab, fs); const x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  if (typeof lab === "string") { ctx.font = `${fs}px ${FONT}`; ctx.fillText(lab, x0, y); return; }
  ctx.font = `${fs}px ${FONT}`; const wb = ctx.measureText(lab.base).width; ctx.fillText(lab.base, x0, y);
  ctx.font = `${fs * 0.72}px ${FONT}`; ctx.fillText(lab.exp, x0 + wb + 0.5, y - fs * 0.42);
}

/* --- core draw; all coordinates in CSS px scaled by k --- */
function drawData(ctx, s, plot, w, h, k, compact, opts = {}) {
  const m = margins(compact); const st = S.style; const lut = currentLUT();
  ctx.save(); ctx.scale(k, k);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
  const bx = m.l, by = m.t, bw = w - m.l - m.r, bh = h - m.t - m.b;
  const pop = compute(s).get(plot.parent);
  const ux = unitArr(s, plot.xp), uy = plot.kind === "hist" ? null : unitArr(s, plot.yp);
  ctx.save(); ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
  let histMax = 1;
  if (!pop || !ux || (plot.kind !== "hist" && !uy)) {
    ctx.fillStyle = PMUTED; ctx.font = `${compact ? 10 : 12}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(!pop ? "상위 population 없음" : `이 샘플에 ${!ux ? plot.xp : plot.yp} 파라미터 없음`, bx + bw / 2, by + bh / 2);
  } else if (plot.kind === "hist") {
    // 256-channel count histogram (FACSDiva / FlowJo convention), Y = events per channel
    const nb = compact && !RENDER_OV ? 128 : 256;
    const hb0 = new Float32Array(nb);
    for (let i = 0; i < pop.length; i++) hb0[Math.min(nb - 1, (ux[pop[i]] * nb) | 0)]++;
    const sm = st.histSmooth > 0 ? st.histSmooth * (nb / 256) : 0; const hb = sm ? smoothArr(hb0, sm) : hb0;
    for (let i = 1; i < nb - 1; i++) histMax = Math.max(histMax, hb[i]);
    histMax = Math.max(5, histMax * 1.08);
    ctx.beginPath(); ctx.moveTo(bx, by + bh);
    if (sm) for (let i = 0; i < nb; i++) { const x = bx + ((i + 0.5) / nb) * bw; ctx.lineTo(x, by + bh - (Math.min(hb[i], histMax) / histMax) * bh); }
    else for (let i = 0; i < nb; i++) { const xa = bx + (i / nb) * bw, xb = bx + ((i + 1) / nb) * bw; const y = by + bh - (Math.min(hb[i], histMax) / histMax) * bh; ctx.lineTo(xa, y); ctx.lineTo(xb, y); }
    ctx.lineTo(bx + bw, by + bh); ctx.closePath();
    ctx.fillStyle = st.histFill || "#4b5bd4"; ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = "#1c2366"; ctx.lineWidth = 0.7 * plotLW(); ctx.stroke();
  } else {
    const mode = st.mode;
    if (mode === "density") {
      const cell = RENDER_OV ? Math.max(0.35, bw / 280) : compact ? 2 : 1.6; const gw = Math.max(24, Math.round(bw / cell)), gh = Math.max(24, Math.round(bh / cell));
      const g = blur(binGrid(pop, ux, uy, gw, gh, true), gw, gh, st.smooth);
      let mx = 0; for (let i = 0; i < g.length; i++) if (g[i] > mx) mx = g[i];
      const off = document.createElement("canvas"); off.width = gw; off.height = gh; const oc = off.getContext("2d"); const img = oc.createImageData(gw, gh);
      const lm = Math.log1p(mx || 1);
      for (let i = 0; i < g.length; i++) { const c = g[i]; if (c < 0.08) continue; const t = st.densScale !== "log" ? Math.min(1, c / (mx || 1)) : Math.log1p(c) / lm; const li = st.densScale !== "log" ? (t * 255) | 0 : (30 + 225 * t) | 0; img.data[i * 4] = lut[li * 3]; img.data[i * 4 + 1] = lut[li * 3 + 1]; img.data[i * 4 + 2] = lut[li * 3 + 2]; img.data[i * 4 + 3] = 255; }
      oc.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(off, bx, by, bw, bh);
    } else if (mode === "dot") {
      drawDots(ctx, pop, ux, uy, bx, by, bw, bh, compact, lut, null);
    } else {
      const gc = compact ? 48 : 72;
      const g = blur(blur(binGrid(pop, ux, uy, gc, gc), gc, gc, 1), gc, gc, 1);
      const sorted = Array.from(g).filter((v) => v > 0).sort((a, b) => b - a); const total = sorted.reduce((a, b) => a + b, 0);
      const L = st.levels; const fr = [0.975]; for (let i = 1; i < L; i++) fr.push(0.88 - (0.8 * (i - 1)) / Math.max(1, L - 2));
      const thr = fr.map((f) => { let acc = 0; for (const v of sorted) { acc += v; if (acc >= f * total) return v; } return sorted[sorted.length - 1] || 1; });
      if (mode === "contourdots") drawDots(ctx, pop, ux, uy, bx, by, bw, bh, compact, lut, { g, gc, thr: thr[0] });
      ctx.lineWidth = (compact && !RENDER_OV ? 0.9 : 1.15) * plotLW(); ctx.lineJoin = "round";
      thr.forEach((t, li) => {
        ctx.strokeStyle = st.colorBy === "single" ? st.single : lutCss(lut, 40 + (215 * li) / Math.max(1, L - 1));
        ctx.beginPath();
        marching(g, gc, gc, t, (p, q) => { ctx.moveTo(bx + ((p[0] + 0.5) / gc) * bw, by + ((p[1] + 0.5) / gc) * bh); ctx.lineTo(bx + ((q[0] + 0.5) / gc) * bw, by + ((q[1] + 0.5) / gc) * bh); });
        ctx.stroke();
      });
    }
  }
  ctx.restore();
  drawAxes(ctx, s, plot, bx, by, bw, bh, compact, histMax, opts);
  ctx.restore();
}
function drawDots(ctx, pop, ux, uy, bx, by, bw, bh, compact, lut, outlier) {
  const st = S.style; const size = RENDER_OV ? Math.max(0.05, RENDER_OV.dot) : Math.max(0.5, st.dotSize * (compact ? 0.75 : 1));
  const maxPts = 160000; const step = pop.length > maxPts ? pop.length / maxPts : 1;
  const nb = 28; let buckets;
  if (outlier) {
    ctx.fillStyle = st.colorBy === "single" ? st.single : PMUTED; ctx.globalAlpha = Math.min(1, st.alpha);
    ctx.beginPath();
    for (let f = 0; f < pop.length; f += step) { const e = pop[f | 0]; const ix = Math.min(outlier.gc - 1, (ux[e] * outlier.gc) | 0), iy = Math.min(outlier.gc - 1, ((1 - uy[e]) * outlier.gc) | 0); if (outlier.g[iy * outlier.gc + ix] >= outlier.thr) continue; ctx.rect(bx + ux[e] * bw - size / 2, by + (1 - uy[e]) * bh - size / 2, size, size); }
    ctx.fill(); ctx.globalAlpha = 1; return;
  }
  if (st.colorBy === "single") {
    ctx.fillStyle = st.single; ctx.globalAlpha = st.alpha; ctx.beginPath();
    for (let f = 0; f < pop.length; f += step) { const e = pop[f | 0]; ctx.rect(bx + ux[e] * bw - size / 2, by + (1 - uy[e]) * bh - size / 2, size, size); }
    ctx.fill(); ctx.globalAlpha = 1; return;
  }
  // FlowJo-style pseudocolor: smoothed 2D density, bilinear lookup per event, linear colour scale, dense events drawn last
  const G = compact && !RENDER_OV ? 96 : 128; const gw = G, gh = G; const rad = Math.max(1, (st.smooth | 0) + 1);
  const g = blur(blur(binGrid(pop, ux, uy, gw, gh, true), gw, gh, rad), gw, gh, rad);
  let mx = 0; for (let i = 0; i < g.length; i++) if (g[i] > mx) mx = g[i];
  const lin = st.densScale !== "log"; const lm = Math.log1p(mx || 1); const NB = 64;
  buckets = Array.from({ length: NB }, () => []);
  for (let f = 0; f < pop.length; f += step) {
    const e = pop[f | 0]; const fx = clamp(ux[e] * gw - 0.5, 0, gw - 1.001), fy = clamp((1 - uy[e]) * gh - 0.5, 0, gh - 1.001);
    const x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0, x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1);
    const d = (g[y0 * gw + x0] * (1 - ax) + g[y0 * gw + x1] * ax) * (1 - ay) + (g[y1 * gw + x0] * (1 - ax) + g[y1 * gw + x1] * ax) * ay;
    const t = lin ? d / (mx || 1) : Math.log1p(d) / lm;
    buckets[clamp((t * NB) | 0, 0, NB - 1)].push(e);
  }
  ctx.globalAlpha = st.alpha;
  for (let b = 0; b < NB; b++) {
    const arr = buckets[b]; if (!arr.length) continue;
    ctx.fillStyle = lutCss(lut, (b / (NB - 1)) * 255); ctx.beginPath();
    for (const e of arr) ctx.rect(bx + ux[e] * bw - size / 2, by + (1 - uy[e]) * bh - size / 2, size, size);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawAxes(ctx, s, plot, bx, by, bw, bh, compact, histMax, opts) {
  const fs = plotFS(compact) * (compact && !RENDER_OV ? 1 : 0.95); const tl = Math.max(2, fs * 0.38); const lw = plotLW();
  ctx.strokeStyle = S.style.labelStyle === "flowjo" ? "#000000" : PLINE; ctx.lineWidth = lw; ctx.strokeRect(bx + lw / 2, by + lw / 2, bw - lw, bh - lw);
  ctx.fillStyle = "#3a414b";
  const axisX = (pname) => {
    const t = T(pname); let last = -1e9; ctx.beginPath();
    for (const tk of axisTicks(t, compact)) {
      const u = t.u(tk.v); if (u < -0.001 || u > 1.001) continue; const x = bx + u * bw;
      const len = tk.major ? tl : tl * 0.55; ctx.moveTo(x, by + bh); ctx.lineTo(x, by + bh + len);
      if (tk.label) { const wlab = measureLabel(ctx, tk.label, fs); if (x - wlab / 2 > last + 4) { drawLabel(ctx, tk.label, x, by + bh + tl + fs * 0.85, "center", fs); last = x + wlab / 2; } }
    }
    ctx.stroke();
  };
  const axisY = (pname) => {
    const t = T(pname); let last = 1e9; ctx.beginPath();
    for (const tk of axisTicks(t, compact)) {
      const u = t.u(tk.v); if (u < -0.001 || u > 1.001) continue; const y = by + (1 - u) * bh;
      const len = tk.major ? tl : tl * 0.55; ctx.moveTo(bx, y); ctx.lineTo(bx - len, y);
      if (tk.label && y + fs * 0.6 < last - 2) { drawLabel(ctx, tk.label, bx - tl - 3, y, "right", fs); last = y - fs * 0.6; }
    }
    ctx.stroke();
  };
  axisX(plot.xp);
  if (plot.kind === "hist") {
    const st = niceStep(histMax, compact ? 2 : 4); ctx.beginPath(); let last = 1e9;
    for (let v = 0; v <= histMax; v += st) { const y = by + bh - (v / histMax) * bh; ctx.moveTo(bx, y); ctx.lineTo(bx - tl, y); if (y + 6 < last) { drawLabel(ctx, compactNum(v), bx - tl - 3, y, "right", fs); last = y - 6; } }
    ctx.stroke();
  } else axisY(plot.yp);
  if (showTitles(compact)) {
    const tf = plotFS(compact) * 1.08;
    ctx.fillStyle = PINK; ctx.font = `${tf}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText(axisTitle(s, plot.xp), bx + bw / 2, by + bh + tl + fs * 1.6 + tf);
    ctx.save(); ctx.translate(tf * 0.75, by + bh / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = "middle";
    ctx.fillText(plot.kind === "hist" ? "Count" : axisTitle(s, plot.yp), 0, 0); ctx.restore();
  }
}

/* --- geometry helpers in unit space --- */
function gU(n) {
  const tx = T(n.xp), ty = n.yp ? T(n.yp) : null, g = n.g;
  if (n.type === "rect") return { x1: tx.u(Math.min(g.x1, g.x2)), x2: tx.u(Math.max(g.x1, g.x2)), y1: ty.u(Math.min(g.y1, g.y2)), y2: ty.u(Math.max(g.y1, g.y2)) };
  if (n.type === "range") return { x1: tx.u(Math.min(g.x1, g.x2)), x2: tx.u(Math.max(g.x1, g.x2)) };
  if (n.type === "quad") return { x: tx.u(g.x), y: ty.u(g.y) };
  return { pts: g.pts.map((p) => [tx.u(p[0]), ty.u(p[1])]) };
}
function uToG(n, u) {
  const tx = T(n.xp), ty = n.yp ? T(n.yp) : null;
  if (n.type === "rect") return { x1: tx.x(u.x1), x2: tx.x(u.x2), y1: ty.x(u.y1), y2: ty.x(u.y2) };
  if (n.type === "range") return { x1: tx.x(u.x1), x2: tx.x(u.x2) };
  if (n.type === "quad") return { x: tx.x(u.x), y: ty.x(u.y) };
  return { pts: u.pts.map((p) => [tx.x(p[0]), ty.x(p[1])]) };
}

function drawOverlay(ctx, view, k) {
  const { s, plot, w, h, compact } = view; const m = margins(compact);
  const bx = m.l, by = m.t, bw = w - m.l - m.r, bh = h - m.t - m.b;
  const X = (u) => bx + u * bw, Y = (u) => by + (1 - u) * bh;
  ctx.save(); ctx.scale(k, k); if (!view.noClear) ctx.clearRect(0, 0, w, h);
  const tree = effTree(s); const nodes = tree.filter((n) => nodeKey(n) === plot.key);
  const hv = view.hover; const drag = DRAG && DRAG.view === view ? DRAG : null;
  const fs = compact && !RENDER_OV ? 9 : plotFS(compact); view.labels = [];
  const showLabels = RENDER_OV ? RENDER_OV.labels !== false : S.style.labels;
  const fj = S.style.labelStyle === "flowjo";
  const chip = (text, x, y, color, align = "left", meta = null) => {
    const lines = String(text).split("\n"); ctx.font = `${fj ? "" : "bold "}${fs}px ${FONT}`;
    const tw = Math.max(...lines.map((l) => ctx.measureText(l).width)); const pad = Math.max(1.5, fs * (fj ? 0.22 : 0.28)); const lh = fs * 1.15; const hh = (lines.length - 1) * lh + fs + pad * 2;
    let x0 = align === "right" ? x - tw - pad * 2 : x; x0 = clamp(x0, bx + 1, bx + bw - tw - pad * 2 - 1);
    const y0 = clamp(y, by + 1, by + bh - hh - 1);
    ctx.fillStyle = fj ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.86)"; ctx.fillRect(x0, y0, tw + pad * 2, hh);
    ctx.fillStyle = fj ? "#000000" : color; ctx.textBaseline = "top"; ctx.textAlign = align === "right" ? "right" : "left";
    lines.forEach((l, i) => ctx.fillText(l, align === "right" ? x0 + pad + tw : x0 + pad, y0 + pad + 0.5 + i * lh));
    ctx.textAlign = "left";
    if (meta) view.labels.push({ x: x0, y: y0, w: tw + pad * 2, h: hh, meta });
  };
  const handle = (x, y, shape, active, color) => {
    const r = active ? 6.5 : compact ? 3.6 : 4.6;
    ctx.beginPath();
    if (shape === "sq") ctx.rect(x - r, y - r, r * 2, r * 2); else ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = active ? color : "#ffffff"; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = color; ctx.stroke();
  };
  ctx.save(); ctx.beginPath(); ctx.rect(bx - 8, by - 8, bw + 16, bh + 16); ctx.clip();
  for (const n of nodes) {
    const sel = !RENDER_OV && S.ui.selPop && S.ui.selPop.split(".")[0] === n.id;
    const color = RENDER_OV ? "#000000" : n._ov ? POVR : sel ? PACC : S.style.labelStyle === "flowjo" ? "#000000" : PINK;
    const u = gU(n); const on = (part) => (hv && hv.node.id === n.id && hv.part === part) || (drag && drag.node.id === n.id && drag.part === part);
    const st = popStats(s, n.type === "quad" ? n.id + ".UL" : n.id);
    ctx.lineWidth = (sel ? 1.8 : 1.4) * plotLW(); ctx.strokeStyle = color;
    const name = (S.names[n.id] || n.id) + (n._ov && !RENDER_OV ? " · 개별" : "");
    if (n.type === "rect") {
      const x1 = X(u.x1), x2 = X(u.x2), y1 = Y(u.y2), y2 = Y(u.y1);
      ctx.fillStyle = RENDER_OV ? "rgba(0,0,0,0)" : sel ? "rgba(42,120,214,0.07)" : "rgba(27,31,36,0.025)"; ctx.fillRect(x1, y1, x2 - x1, y2 - y1); ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      if (showLabels) chip((fj ? `${name}\n${fmtSig(st ? st.pParent : NaN)}` : `${name}  ${fmtPct(st ? st.pParent : NaN)}%`), x1 + 3, y1 + 3, color, "left", { kind: "gate", gid: n.id });
      if (!view.readonly) {
        [["c0", x1, y1], ["c1", x2, y1], ["c2", x2, y2], ["c3", x1, y2]].forEach(([p, x, y]) => handle(x, y, "sq", on(p), color));
        [["el", x1, (y1 + y2) / 2], ["er", x2, (y1 + y2) / 2], ["et", (x1 + x2) / 2, y1], ["eb", (x1 + x2) / 2, y2]].forEach(([p, x, y]) => handle(x, y, "c", on(p), color));
      }
    } else if (n.type === "poly") {
      ctx.beginPath(); u.pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.closePath();
      ctx.fillStyle = RENDER_OV ? "rgba(0,0,0,0)" : sel ? "rgba(42,120,214,0.07)" : "rgba(27,31,36,0.025)"; ctx.fill(); ctx.stroke();
      let top = u.pts.reduce((a, p) => (p[1] > a[1] ? p : a), u.pts[0]);
      if (showLabels) chip((fj ? `${name}\n${fmtSig(st ? st.pParent : NaN)}` : `${name}  ${fmtPct(st ? st.pParent : NaN)}%`), X(top[0]) - 20, Y(top[1]) + 4, color, "left", { kind: "gate", gid: n.id });
      if (!view.readonly) u.pts.forEach((p, i) => handle(X(p[0]), Y(p[1]), "c", on("v" + i), color));
    } else if (n.type === "range") {
      const x1 = X(u.x1), x2 = X(u.x2);
      ctx.fillStyle = RENDER_OV ? "rgba(0,0,0,0)" : sel ? "rgba(42,120,214,0.09)" : "rgba(27,31,36,0.04)"; ctx.fillRect(x1, by, x2 - x1, bh);
      ctx.beginPath(); ctx.moveTo(x1, by); ctx.lineTo(x1, by + bh); ctx.moveTo(x2, by); ctx.lineTo(x2, by + bh); ctx.stroke();
      const rk = nodes.filter((m) => m.type === "range").sort((a, c) => a.g.x1 - c.g.x1).indexOf(n);
      ctx.save(); ctx.globalAlpha = 0.7; ctx.fillStyle = rangeColor(n.id); ctx.fillRect(x1, by + 1, Math.max(1, x2 - x1), Math.max(2, fs * 0.28)); ctx.restore();
      if (showLabels) chip((fj ? `${name}\n${fmtSig(st ? st.pParent : NaN)}` : `${name}  ${fmtPct(st ? st.pParent : NaN)}%`), x1 + 2, by + fs * 0.55 + (rk % 3) * fs * 2.7, color, "left", { kind: "gate", gid: n.id });
      if (!view.readonly) { handle(x1, by + 8, "sq", on("r1"), color); handle(x2, by + 8, "sq", on("r2"), color); }
    } else if (n.type === "quad") {
      const qx = X(u.x), qy = Y(u.y);
      ctx.beginPath(); ctx.moveTo(qx, by); ctx.lineTo(qx, by + bh); ctx.moveTo(bx, qy); ctx.lineTo(bx + bw, qy);
      ctx.lineWidth = (on("qx") || on("qy") ? 2.4 : sel ? 1.6 : 1.3) * plotLW(); ctx.stroke();
      const e4 = Math.max(2, fs * 0.35), lh = fs * 1.56 + e4; const pos = { UL: [bx + e4, by + e4, "left"], UR: [bx + bw - e4, by + e4, "right"], LL: [bx + e4, fj ? by + bh : by + bh - lh, "left"], LR: [bx + bw - e4, fj ? by + bh : by + bh - lh, "right"] };
      if (showLabels || (compact && !RENDER_OV)) for (const r of REGIONS) { const rs = popStats(s, n.id + "." + r); chip(fj ? `${regionName(n.id, r)}\n${fmtSig(rs ? rs.pParent : NaN)}` : `${regionName(n.id, r)}  ${fmtPct(rs ? rs.pParent : NaN)}%`, pos[r][0], pos[r][1], color, pos[r][2], { kind: "region", gid: n.id, reg: r }); }
      if (!view.readonly) {
        // end grips: triangles showing single-axis drag
        const grip = (x, y, dir, act) => { ctx.beginPath(); const a = act ? 7 : 5; if (dir === "h") { ctx.moveTo(x - a, y); ctx.lineTo(x, y - a); ctx.lineTo(x + a, y); ctx.lineTo(x, y + a); } else { ctx.moveTo(x, y - a); ctx.lineTo(x + a, y); ctx.lineTo(x, y + a); ctx.lineTo(x - a, y); } ctx.closePath(); ctx.fillStyle = act ? color : "#fff"; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = color; ctx.stroke(); };
        grip(qx, by + bh - 1, "h", on("qx")); grip(qx, by + 1, "h", on("qx"));
        grip(bx + 1, qy, "v", on("qy")); grip(bx + bw - 1, qy, "v", on("qy"));
        const act = on("qc"); const r = act ? 9 : compact ? 6 : 7.5;
        ctx.beginPath(); ctx.arc(qx, qy, r, 0, Math.PI * 2); ctx.fillStyle = act ? color : "#ffffff"; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = color; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(qx - r * 0.5, qy); ctx.lineTo(qx + r * 0.5, qy); ctx.moveTo(qx, qy - r * 0.5); ctx.lineTo(qx, qy + r * 0.5); ctx.strokeStyle = act ? "#fff" : color; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
  }
  // drawing preview
  const dr = DRAW && DRAW.view === view ? DRAW : null;
  if (dr) {
    ctx.strokeStyle = PACC; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.fillStyle = "rgba(42,120,214,0.08)";
    if (dr.type === "rect" && dr.u1) { const x1 = X(Math.min(dr.u0[0], dr.u1[0])), x2 = X(Math.max(dr.u0[0], dr.u1[0])), y1 = Y(Math.max(dr.u0[1], dr.u1[1])), y2 = Y(Math.min(dr.u0[1], dr.u1[1])); ctx.fillRect(x1, y1, x2 - x1, y2 - y1); ctx.strokeRect(x1, y1, x2 - x1, y2 - y1); }
    if (dr.type === "range" && dr.u1) { const x1 = X(Math.min(dr.u0[0], dr.u1[0])), x2 = X(Math.max(dr.u0[0], dr.u1[0])); ctx.fillRect(x1, by, x2 - x1, bh); ctx.strokeRect(x1, by, x2 - x1, bh); }
    if (dr.type === "poly") {
      ctx.beginPath(); dr.pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); if (dr.mouse) ctx.lineTo(X(dr.mouse[0]), Y(dr.mouse[1])); ctx.stroke();
      ctx.setLineDash([]); dr.pts.forEach((p, i) => handle(X(p[0]), Y(p[1]), "c", i === 0 && dr.nearFirst, PACC));
    }
    ctx.setLineDash([]);
  }
  ctx.restore();
  ctx.restore();
}

/* --- hit testing in CSS px --- */
function hitTest(view, px, py) {
  const { s, plot, w, h, compact } = view; const m = margins(compact);
  const bx = m.l, by = m.t, bw = w - m.l - m.r, bh = h - m.t - m.b;
  const X = (u) => bx + u * bw, Y = (u) => by + (1 - u) * bh;
  const nodes = effTree(s).filter((n) => nodeKey(n) === plot.key);
  const selId = S.ui.selPop ? S.ui.selPop.split(".")[0] : null;
  nodes.sort((a, b) => (a.id === selId ? -1 : 0) - (b.id === selId ? -1 : 0));
  const R = compact ? 8 : 10, near = (x, y) => Math.hypot(px - x, py - y) <= R;
  for (const n of nodes) {
    const u = gU(n);
    if (n.type === "quad") { const qx = X(u.x), qy = Y(u.y); if (Math.hypot(px - qx, py - qy) <= R + 3) return { node: n, part: "qc" }; }
    if (n.type === "rect") { const x1 = X(u.x1), x2 = X(u.x2), y1 = Y(u.y2), y2 = Y(u.y1); const c = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]; for (let i = 0; i < 4; i++) if (near(...c[i])) return { node: n, part: "c" + i }; }
    if (n.type === "poly") { const pts = u.pts; for (let i = 0; i < pts.length; i++) if (near(X(pts[i][0]), Y(pts[i][1]))) return { node: n, part: "v" + i }; }
    if (n.type === "range") { const x1 = X(u.x1), x2 = X(u.x2); if (Math.abs(px - x1) <= 6) return { node: n, part: "r1" }; if (Math.abs(px - x2) <= 6) return { node: n, part: "r2" }; }
  }
  for (const n of nodes) {
    const u = gU(n);
    if (n.type === "quad") { const qx = X(u.x), qy = Y(u.y); if (Math.abs(px - qx) <= 6 && py >= by - 6 && py <= by + bh + 6) return { node: n, part: "qx" }; if (Math.abs(py - qy) <= 6 && px >= bx - 6 && px <= bx + bw + 6) return { node: n, part: "qy" }; }
    if (n.type === "rect") {
      const x1 = X(u.x1), x2 = X(u.x2), y1 = Y(u.y2), y2 = Y(u.y1); const inY = py >= y1 - 5 && py <= y2 + 5, inX = px >= x1 - 5 && px <= x2 + 5;
      if (inY && Math.abs(px - x1) <= 5) return { node: n, part: "el" }; if (inY && Math.abs(px - x2) <= 5) return { node: n, part: "er" };
      if (inX && Math.abs(py - y1) <= 5) return { node: n, part: "et" }; if (inX && Math.abs(py - y2) <= 5) return { node: n, part: "eb" };
    }
  }
  const ux = (px - bx) / bw, uy = 1 - (py - by) / bh;
  for (const n of nodes) {
    const u = gU(n);
    if (n.type === "rect" && ux >= u.x1 && ux <= u.x2 && uy >= u.y1 && uy <= u.y2) return { node: n, part: "move" };
    if (n.type === "poly" && pip(ux, uy, u.pts.map((p) => p[0]), u.pts.map((p) => p[1]))) return { node: n, part: "move" };
    if (n.type === "range" && ux >= u.x1 && ux <= u.x2) return { node: n, part: "move" };
  }
  return null;
}
const PART_CURSOR = { move: "move", c0: "nwse-resize", c2: "nwse-resize", c1: "nesw-resize", c3: "nesw-resize", el: "ew-resize", er: "ew-resize", et: "ns-resize", eb: "ns-resize", qc: "move", qx: "ew-resize", qy: "ns-resize", r1: "ew-resize", r2: "ew-resize" };
const PART_HINT = { move: "gate 전체를 드래그해서 이동", qc: "중심점 드래그: 두 기준선을 함께 이동", qx: "세로선 드래그: X 기준값만 이동", qy: "가로선 드래그: Y 기준값만 이동", el: "경계 드래그", er: "경계 드래그", et: "경계 드래그", eb: "경계 드래그", r1: "경계 드래그", r2: "경계 드래그" };

/* --- interaction state --- */
let DRAG = null, DRAW = null;
function unitFromEvent(view, ev) {
  const r = view.cvO.getBoundingClientRect(); const px = ev.clientX - r.left, py = ev.clientY - r.top;
  const m = margins(view.compact); const bw = view.w - m.l - m.r, bh = view.h - m.t - m.b;
  return { px, py, u: [(px - m.l) / bw, 1 - (py - m.t) / bh] };
}
function applyDrag(d, u) {
  const n = d.node; const U = clone(d.startU); const du = u[0] - d.startMouse[0], dv = u[1] - d.startMouse[1];
  const c01 = (v) => clamp(v, 0, 1);
  const p = d.part;
  if (n.type === "rect") {
    if (p === "move") { const ddx = clamp(du, -U.x1, 1 - U.x2), ddy = clamp(dv, -U.y1, 1 - U.y2); U.x1 += ddx; U.x2 += ddx; U.y1 += ddy; U.y2 += ddy; }
    else {
      const setX = (k) => (U[k] = c01(d.startU[k] + du)), setY = (k) => (U[k] = c01(d.startU[k] + dv));
      if (p === "c0") { setX("x1"); setY("y2"); } if (p === "c1") { setX("x2"); setY("y2"); } if (p === "c2") { setX("x2"); setY("y1"); } if (p === "c3") { setX("x1"); setY("y1"); }
      if (p === "el") setX("x1"); if (p === "er") setX("x2"); if (p === "et") setY("y2"); if (p === "eb") setY("y1");
      if (U.x1 > U.x2) [U.x1, U.x2] = [U.x2, U.x1]; if (U.y1 > U.y2) [U.y1, U.y2] = [U.y2, U.y1];
    }
  } else if (n.type === "range") {
    if (p === "move") { const ddx = clamp(du, -U.x1, 1 - U.x2); U.x1 += ddx; U.x2 += ddx; }
    if (p === "r1") U.x1 = c01(d.startU.x1 + du); if (p === "r2") U.x2 = c01(d.startU.x2 + du);
    if (U.x1 > U.x2) [U.x1, U.x2] = [U.x2, U.x1];
  } else if (n.type === "quad") {
    if (p === "qc" || p === "qx") U.x = c01(d.startU.x + du);
    if (p === "qc" || p === "qy") U.y = c01(d.startU.y + dv);
  } else if (n.type === "poly") {
    if (p === "move") { const xs = U.pts.map((q) => q[0]), ys = U.pts.map((q) => q[1]); const ddx = clamp(du, -Math.min(...xs), 1 - Math.max(...xs)), ddy = clamp(dv, -Math.min(...ys), 1 - Math.max(...ys)); U.pts = U.pts.map((q) => [q[0] + ddx, q[1] + ddy]); }
    else if (p[0] === "v") { const i = +p.slice(1); U.pts[i] = [c01(d.startU.pts[i][0] + du), c01(d.startU.pts[i][1] + dv)]; }
  }
  return uToG(n, U);
}
function bindView(view) {
  const cv = view.cvO;
  cv.addEventListener("pointermove", (ev) => {
    const { px, py, u } = unitFromEvent(view, ev);
    if (DRAG && DRAG.view === view) {
      if (!DRAG.moved) {
        DRAG.moved = true; pushUndo();
        DRAG.hadOverride = !!view.s.overrides[DRAG.node.id];
      }
      const g = applyDrag(DRAG, u); const res = setGeom(view.s, DRAG.node.id, g);
      if (res === "override" && !DRAG.hadOverride && !DRAG.notified) {
        DRAG.notified = true; const a = anchorOf(view.s); const s = view.s; const gid = DRAG.node.id;
        toast(`${s.name}: 앵커(${a ? a.name : ""})와 분리해 이 샘플의 ${S.names[gid] || gid}만 조정합니다`, "앵커로 되돌리기", () => { pushUndo(); revertOverride(s, gid); fullRender(); });
        DRAG.node = effTree(view.s).find((n) => n.id === gid);
      }
      scheduleLive(); return;
    }
    if (DRAW && DRAW.view === view) {
      if (DRAW.type === "poly") { DRAW.mouse = u; const f = DRAW.pts[0]; const m = margins(view.compact); const bw = view.w - m.l - m.r, bh = view.h - m.t - m.b; DRAW.nearFirst = DRAW.pts.length >= 3 && Math.hypot((u[0] - f[0]) * bw, (u[1] - f[1]) * bh) < 10; }
      else if (DRAW.down) DRAW.u1 = [clamp(u[0], 0, 1), clamp(u[1], 0, 1)];
      drawOverlay(view.ctxO, view, view.dpr); return;
    }
    if (S.ui.tool && !view.compact) { cv.style.cursor = "crosshair"; return; }
    const hit = view.readonly ? null : hitTest(view, px, py);
    const prev = view.hover; view.hover = hit;
    cv.style.cursor = hit ? PART_CURSOR[hit.part[0] === "v" ? "move" : hit.part] || "move" : "default";
    if (hit && hit.part[0] === "v") cv.style.cursor = "grab";
    if ((prev && !hit) || (hit && (!prev || prev.part !== hit.part || prev.node.id !== hit.node.id))) { drawOverlay(view.ctxO, view, view.dpr); setFootHint(view, hit); }
    const lab = !view.readonly && (!hit || hit.part === "move") ? labelAt(view, px, py) : null;
    if (lab) { cv.style.cursor = "text"; if (view.hintEl) view.hintEl.textContent = "더블클릭해서 이름 변경"; }
  });
  cv.addEventListener("pointerleave", () => { if (view.hover && !DRAG) { view.hover = null; drawOverlay(view.ctxO, view, view.dpr); setFootHint(view, null); } });
  cv.addEventListener("pointerdown", (ev) => {
    if (ev.button === 2) return;
    const { px, py, u } = unitFromEvent(view, ev);
    if (S.ui.tool && !view.compact) {
      const tool = S.ui.tool;
      if ((tool === "range") !== (view.plot.kind === "hist")) { toast(view.plot.kind === "hist" ? "히스토그램에서는 '범위' 도구를 사용하세요" : "'범위' 도구는 히스토그램 플롯에서 사용합니다"); return; }
      const uc = [clamp(u[0], 0, 1), clamp(u[1], 0, 1)];
      if (tool === "quad") { createGate(view, "quad", { x: T(view.plot.xp).x(uc[0]), y: T(view.plot.yp).x(uc[1]) }); return; }
      if (tool === "poly") {
        if (!DRAW || DRAW.view !== view) DRAW = { view, type: "poly", pts: [] };
        if (DRAW.nearFirst && DRAW.pts.length >= 3) { finishPoly(view); return; }
        DRAW.pts.push(uc); drawOverlay(view.ctxO, view, view.dpr); return;
      }
      DRAW = { view, type: tool, u0: uc, u1: null, down: true }; cv.setPointerCapture(ev.pointerId); return;
    }
    const hit = view.readonly ? null : hitTest(view, px, py);
    if (hit) {
      cv.setPointerCapture(ev.pointerId);
      DRAG = { view, node: hit.node, part: hit.part, startMouse: u, startU: gU(hit.node), moved: false };
      const newSel = hit.node.type === "quad" ? hit.node.id + ".UL" : hit.node.id;
      if (!S.ui.selPop || S.ui.selPop.split(".")[0] !== hit.node.id) { S.ui.selPop = newSel; renderTree(); }
      if (view.compact && S.ui.cur !== view.s.id) { S.ui.cur = view.s.id; renderSamples(); renderTree(); renderContext(); }
      drawOverlay(view.ctxO, view, view.dpr);
    }
  });
  const end = (ev) => {
    if (DRAG && DRAG.view === view) {
      const moved = DRAG.moved; DRAG = null;
      if (moved) { renderSamples(); renderTree(); renderContext(); renderRight(); scheduleLive(); }
      else drawOverlay(view.ctxO, view, view.dpr);
    }
    if (DRAW && DRAW.view === view && DRAW.type !== "poly" && DRAW.down) {
      const d = DRAW; DRAW = null;
      const m = margins(view.compact); const bw = view.w - m.l - m.r, bh = view.h - m.t - m.b;
      if (!d.u1 || Math.abs(d.u1[0] - d.u0[0]) * bw < 5 || (d.type === "rect" && Math.abs(d.u1[1] - d.u0[1]) * bh < 5)) { drawOverlay(view.ctxO, view, view.dpr); return; }
      const tx = T(view.plot.xp);
      if (d.type === "range") createGate(view, "range", { x1: tx.x(Math.min(d.u0[0], d.u1[0])), x2: tx.x(Math.max(d.u0[0], d.u1[0])) });
      else { const ty = T(view.plot.yp); createGate(view, "rect", { x1: tx.x(Math.min(d.u0[0], d.u1[0])), x2: tx.x(Math.max(d.u0[0], d.u1[0])), y1: ty.x(Math.min(d.u0[1], d.u1[1])), y2: ty.x(Math.max(d.u0[1], d.u1[1])) }); }
    }
  };
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  cv.addEventListener("dblclick", (ev) => {
    if (DRAW && DRAW.view === view && DRAW.type === "poly") { if (DRAW.pts.length > 3) DRAW.pts.pop(); finishPoly(view); return; }
    if (view.readonly || S.ui.tool) return;
    { const r0 = view.cvO.getBoundingClientRect(); const lab = labelAt(view, ev.clientX - r0.left, ev.clientY - r0.top); if (lab) { editCanvasLabel(view, lab); return; } }
    // insert a vertex on polygon edge
    const { px, py, u } = unitFromEvent(view, ev); const m = margins(view.compact); const bw = view.w - m.l - m.r, bh = view.h - m.t - m.b;
    for (const n of effTree(view.s).filter((x) => nodeKey(x) === view.plot.key && x.type === "poly")) {
      const U = gU(n); const P = U.pts.map((p) => [m.l + p[0] * bw, m.t + (1 - p[1]) * bh]);
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length]; const L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2; const t = clamp(((px - a[0]) * (b[0] - a[0]) + (py - a[1]) * (b[1] - a[1])) / (L2 || 1), 0, 1);
        if (Math.hypot(px - (a[0] + t * (b[0] - a[0])), py - (a[1] + t * (b[1] - a[1]))) < 6) {
          pushUndo(); U.pts.splice(i + 1, 0, [clamp(u[0], 0, 1), clamp(u[1], 0, 1)]); setGeom(view.s, n.id, uToG(n, U)); scheduleLive(); toast("꼭짓점을 추가했습니다 · 꼭짓점 우클릭으로 삭제"); return;
        }
      }
    }
  });
  cv.addEventListener("contextmenu", (ev) => {
    const { px, py } = unitFromEvent(view, ev); const hit = view.readonly ? null : hitTest(view, px, py);
    if (hit && hit.part[0] === "v" && hit.node.type === "poly" && hit.node.g.pts.length > 3) {
      ev.preventDefault(); pushUndo(); const U = gU(hit.node); U.pts.splice(+hit.part.slice(1), 1); setGeom(view.s, hit.node.id, uToG(hit.node, U)); scheduleLive();
    }
  });
}
function finishPoly(view) {
  const d = DRAW; DRAW = null;
  if (!d || d.pts.length < 3) { toast("다각형은 꼭짓점이 3개 이상 필요합니다"); drawOverlay(view.ctxO, view, view.dpr); return; }
  const tx = T(view.plot.xp), ty = T(view.plot.yp);
  createGate(view, "poly", { pts: d.pts.map((p) => [tx.x(p[0]), ty.x(p[1])]) });
}
function createGate(view, type, g) {
  pushUndo();
  const { node, viaAnchor } = addGate(view.s, { parent: view.plot.parent, type, xp: view.plot.xp, yp: type === "range" ? null : view.plot.yp, g });
  S.extraPlots = S.extraPlots.filter((e) => !(e.parent === view.plot.parent && e.xp === view.plot.xp && (e.kind === "hist" || e.yp === view.plot.yp)));
  S.ui.selPop = type === "quad" ? node.id + ".UL" : node.id; setTool(null);
  fullRender();
  toast(viaAnchor ? `${S.names[node.id]}을(를) 앵커 ${viaAnchor.name}에 추가해 그룹 전체에 적용했습니다` : `${S.names[node.id]} gate를 만들었습니다`);
}
function setFootHint(view, hit) {
  const el = view.hintEl; if (!el) return;
  el.textContent = hit ? PART_HINT[hit.part[0] === "v" ? "move" : hit.part] || (hit.part[0] === "v" ? "꼭짓점 드래그 · 우클릭으로 삭제" : "") : "";
  if (hit && hit.part[0] === "v") el.textContent = "꼭짓점 드래그 · 우클릭 삭제 · 선 더블클릭으로 추가";
}

/* --- views --- */
let VIEWS = [];
const RO = new ResizeObserver((entries) => { for (const en of entries) { const v = en.target._view; if (v) sizeView(v); } });
function makeView(s, plot, opts = {}) {
  const wrap = h("div", { class: "cv" });
  const cvD = h("canvas"), cvO = h("canvas");
  wrap.append(cvD, cvO);
  const view = { s, plot, compact: !!opts.compact, readonly: !!opts.readonly, wrap, cvD, cvO, ctxD: cvD.getContext("2d"), ctxO: cvO.getContext("2d"), w: 0, h: 0, dpr: 1, last: null, hover: null, hintEl: null };
  wrap._view = view; RO.observe(wrap); bindView(view); VIEWS.push(view);
  return view;
}
function sizeView(v) {
  const r = v.wrap.getBoundingClientRect(); if (!r.width) return;
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  const w = Math.round(r.width), hh = Math.round(r.height);
  if (w === v.w && hh === v.h && dpr === v.dpr && v.last) return;
  v.w = w; v.h = hh; v.dpr = dpr;
  for (const c of [v.cvD, v.cvO]) { c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr); }
  v.last = null; renderView(v);
}
function renderView(v, force) {
  if (!v.w || !v.wrap.isConnected) return;
  const pop = compute(v.s).get(v.plot.parent);
  const sig = [pop, S.styleVer, S.axesVer, v.w, v.h, S.comp].join("|");
  if (force || !v.last || v.last.pop !== pop || v.last.sig !== sig) {
    drawData(v.ctxD, v.s, v.plot, v.w, v.h, v.dpr, v.compact);
    v.last = { pop, sig };
  }
  drawOverlay(v.ctxO, v, v.dpr);
}
function pruneViews() { VIEWS = VIEWS.filter((v) => { if (!v.wrap.isConnected) { RO.unobserve(v.wrap); return false; } return true; }); }
let LIVE_RAF = 0;
function scheduleLive() {
  if (LIVE_RAF) return;
  LIVE_RAF = requestAnimationFrame(() => {
    LIVE_RAF = 0;
    for (const v of VIEWS) renderView(v);
    updateLiveText();
    if (S.ui.rTab === "bar") renderBar(); else if (S.ui.rTab === "stats") renderStats();
    if (BAR_MODAL) renderBarModal();
  });
}
/* export a plot at publication resolution */
function plotToCanvas(s, plot, o) {
  const k = o.dpi / 72; const w = o.wPt, hh = o.hPt;
  const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(hh * k);
  const ctx = c.getContext("2d");
  RENDER_OV = { fs: o.fs, dot: o.dot, lw: o.lw, labels: o.labels, titles: o.titles };
  try { drawData(ctx, s, plot, w, hh, k, false); drawOverlay(ctx, { s, plot, w, h: hh, compact: false, readonly: true, hover: null, noClear: true }, k); }
  finally { RENDER_OV = null; }
  return c;
}
function labelAt(view, px, py) { return (view.labels || []).slice().reverse().find((b) => px >= b.x - 2 && px <= b.x + b.w + 2 && py >= b.y - 2 && py <= b.y + b.h + 2) || null; }
function editCanvasLabel(view, lab) {
  const r = view.cvO.getBoundingClientRect(); const m = lab.meta;
  const cur = m.kind === "region" ? regionName(m.gid, m.reg) : S.names[m.gid] || m.gid;
  floatingInput(r.left + lab.x - 2, r.top + lab.y - 3, Math.max(150, lab.w + 40), cur, (v) => {
    pushUndo();
    if (m.kind === "region") (S.quadNames[m.gid] = S.quadNames[m.gid] || {})[m.reg] = v; else S.names[m.gid] = v;
    fullRender(); toast(`이름을 ‘${v}’(으)로 바꿨습니다 — 모든 샘플·반복·bar plot에 적용`, "되돌리기", undo);
  });
}
