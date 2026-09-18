/* ============================================================
   Prism-style bar plot
   opts: fill "color" | "outline" | "gray"; err "up" | "both"; sig "bracket" | "stars"; points "filled" | "open"
   ============================================================ */
const PRISM_GRAYS = ["#ffffff", "#9b9b9b", "#000000", "#d4d4d4", "#5e5e5e"];
function prismSVG(M, W, H, opts = {}) {
  const b = M.b; const fs = opts.fs || 12; const u = fs / 12; const lw = opts.lw || 1;
  const fill = opts.fill || "color", errMode = opts.err || "up", pts = opts.points || "filled";
  const stacked = b.layout === "stacked" && !b.sum && M.series.length > 1;
  const sigMode = stacked ? "stars" : opts.sig || "bracket";
  const f = (v) => +v.toFixed(2);
  const S_ = M.series, cells = M.cells;
  const nSer = S_.length;
  const longest = Math.max(0, ...M.shown.map((c) => c.length));
  const lpos = nSer > 1 ? b.legendPos || "inTL" : "none";
  const sq = fs * 0.85, rowH = fs * 1.55;
  const labW = (se) => se.label.length * fs * 0.58;
  const legendW = nSer > 1 ? Math.max(...S_.map(labW)) + sq + 8 * u : 0;
  const legendH = nSer > 1 ? (nSer - 1) * rowH + sq : 0;
  const rowW = nSer > 1 ? S_.reduce((a, se) => a + sq + 6 * u + labW(se) + 14 * u, 0) - 14 * u : 0;
  const outside = lpos === "outBR" || lpos === "outTR";
  const ml = 58 * u, mr = 10 * u + (outside ? legendW + 14 * u : 0), mt = 14 * u + (lpos === "top" ? rowH + 6 * u : 0);
  const pw0 = W - ml - mr; const bandGuess = pw0 / Math.max(1, cells.length);
  const rot = longest * fs * 0.58 > bandGuess - 4 * u;
  const willNote = b.stats && M.maxN > 1;
  const mb = (rot ? 18 * u + Math.min(130 * u, longest * fs * 0.45 + fs) : fs * 2.4) + (willNote ? fs * 1.1 : 0);
  const pw = pw0, ph = H - mt - mb;
  const errOf = (se) => (M.maxN > 1 ? (b.err === "sem" ? se.sem : se.sd) : 0);
  // significance pairs
  const refIdx = cells.findIndex((c) => c.cond === b.ref);
  const comps = [];
  if (b.stats && M.maxN > 1 && refIdx >= 0) cells.forEach((c, ci) => { if (ci === refIdx) return; c.series.forEach((se, si) => { if (isFinite(se.p)) comps.push({ ci, si, p: se.p }); }); });
  let ymax = 1;
  if (stacked) for (const c of cells) { let acc = 0; c.series.forEach((se, si) => { acc += se.mean || 0; ymax = Math.max(ymax, acc + errOf(se)); if (b.dots) se.per.forEach((p, pi) => { const cum = c.series.slice(0, si + 1).reduce((a, x) => a + (x.per[pi] && x.per[pi].v != null ? x.per[pi].v : 0), 0); ymax = Math.max(ymax, cum); }); }); }
  else for (const c of cells) for (const se of c.series) ymax = Math.max(ymax, (se.mean || 0) + errOf(se), ...(b.dots ? se.vals : [0]));
  const levels = stacked ? 0 : sigMode === "bracket" ? comps.length : comps.length ? 1 : 0;
  const sigGap = ymax * 0.11; let need = ymax * 1.06 + levels * sigGap + (levels ? ymax * 0.1 : ymax * 0.04);
  if (stacked && b.basis === "parent" && ymax > 94 && ymax <= 106) need = 100;
  const step = niceStep(need, 5); const top = Math.ceil(need / step - 1e-9) * step;
  const Y = (v) => mt + ph - (v / top) * ph;
  const band = pw / Math.max(1, cells.length); const inner = stacked ? 1 : nSer;
  const bw = Math.min((stacked ? 60 : 46) * u, (band * (stacked ? 0.6 : 0.7)) / inner);
  const barX = (ci, si) => ml + band * ci + band / 2 - (bw * inner) / 2 + bw * (stacked ? 0 : si);
  const colorOf = (se, si) => fill === "gray" ? PRISM_GRAYS[si % PRISM_GRAYS.length] : fill === "outline" ? "#ffffff" : se.color;
  const strokeOf = (se) => fill === "outline" ? se.color : "#000000";
  let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${f(H)}" ${opts.mm ? `width="${opts.mm[0]}mm" height="${opts.mm[1]}mm"` : `width="${f(W)}" height="${f(H)}"`} font-family="Arial, Helvetica, sans-serif" role="img" aria-label="Bar plot">`;
  o += `<rect width="${f(W)}" height="${f(H)}" fill="#fff"/>`;
  // y axis
  const axW = f(lw * 1.3), tick = 5 * u;
  o += `<path d="M${f(ml)} ${f(mt)}V${f(mt + ph)}H${f(ml + pw)}" stroke="#000" stroke-width="${axW}" fill="none" stroke-linecap="square"/>`;
  for (let v = 0; v <= top + 1e-9; v += step) {
    const y = f(Y(v));
    o += `<line x1="${f(ml - tick)}" x2="${f(ml)}" y1="${y}" y2="${y}" stroke="#000" stroke-width="${axW}"/>`;
    o += `<text x="${f(ml - tick - 3 * u)}" y="${f(Y(v) + fs * 0.36)}" font-size="${f(fs)}" text-anchor="end" fill="#000">${+v.toFixed(2)}</text>`;
  }
  o += `<text transform="translate(${f(fs * 1.05)} ${f(mt + ph / 2)}) rotate(-90)" font-size="${f(fs * 1.08)}" font-weight="700" text-anchor="middle" fill="#000">${esc(`% of ${b.basis === "total" ? "total" : M.parentLabel}`)}</text>`;
  // bars
  cells.forEach((c, ci) => {
    if (stacked) {
      const x = barX(ci, 0), cx = x + bw / 2, cap = bw * 0.18; let acc = 0; const errs = [];
      c.series.forEach((se, si) => {
        const v = se.mean || 0; const y0 = Y(acc), y1 = Y(acc + v);
        if (y0 - y1 > 0.2) o += `<rect x="${f(x)}" y="${f(y1)}" width="${f(bw)}" height="${f(y0 - y1)}" fill="${colorOf(se, si)}" stroke="${strokeOf(se)}" stroke-width="${f(lw * (fill === "outline" ? 1.8 : 1.1))}" data-c="${ci}" data-s="${si}"/>`;
        acc += v; errs.push({ se, si, top: acc });
      });
      for (const { se, top: tv } of errs) {
        const e = errOf(se); if (!(e > 0)) continue;
        const ex = cx;
        o += `<path d="M${f(ex)} ${f(errMode === "both" ? Y(Math.max(0, tv - e)) : Y(tv))}V${f(Y(tv + e))}M${f(ex - cap)} ${f(Y(tv + e))}H${f(ex + cap)}${errMode === "both" ? `M${f(ex - cap)} ${f(Y(Math.max(0, tv - e)))}H${f(ex + cap)}` : ""}" stroke="#000" stroke-width="${f(lw * 1.1)}" fill="none"/>`;
      }
      if (b.dots) c.series.forEach((se, si) => se.per.forEach((p, pi) => {
        if (p.v == null) return; const cum = c.series.slice(0, si + 1).reduce((a, x) => a + (x.per[pi] && x.per[pi].v != null ? x.per[pi].v : 0), 0);
        const off = (pi - (se.per.length - 1) / 2) * Math.min(bw * 0.12, 5 * u);
        o += `<circle cx="${f(cx + off)}" cy="${f(Y(cum))}" r="${f(2.3 * u)}" fill="${pts === "open" ? "#fff" : "#000"}" stroke="#000" stroke-width="${f(lw * 0.8)}"/>`;
      }));
      if (b.stats && M.maxN > 1) errs.forEach(({ se, top: tv }, k) => {
        if (!isFinite(se.p)) return; const st = stars(se.p); const mid = tv - (se.mean || 0) / 2;
        if ((se.mean || 0) / top * ph < fs * 0.9) return;
        o += `<text x="${f(x + bw + 4 * u)}" y="${f(Y(mid) + fs * 0.36)}" font-size="${f(st === "ns" ? fs * 0.8 : fs * 1.05)}" fill="#000">${st}</text>`;
        void k;
      });
      o += `<rect x="${f(ml + band * ci)}" y="${f(mt)}" width="${f(band)}" height="${f(ph)}" fill="transparent" data-c="${ci}" data-s="-1"/>`;
    }
    if (!stacked) c.series.forEach((se, si) => {
      const x = barX(ci, si), v = se.mean; if (!isFinite(v)) return;
      const bwi = bw * (inner > 1 ? 1 : 1);
      o += `<rect x="${f(x)}" y="${f(Y(v))}" width="${f(bwi)}" height="${f(Y(0) - Y(v))}" fill="${colorOf(se, si)}" stroke="${strokeOf(se)}" stroke-width="${f(lw * (fill === "outline" ? 1.8 : 1.1))}" data-c="${ci}" data-s="${si}"/>`;
      const e = errOf(se), cx = x + bwi / 2, cap = bwi * 0.22;
      if (e > 0) {
        const lo = errMode === "both" ? Y(Math.max(0, v - e)) : Y(v);
        o += `<path d="M${f(cx)} ${f(lo)}V${f(Y(v + e))}M${f(cx - cap)} ${f(Y(v + e))}H${f(cx + cap)}${errMode === "both" ? `M${f(cx - cap)} ${f(Y(Math.max(0, v - e)))}H${f(cx + cap)}` : ""}" stroke="#000" stroke-width="${f(lw * 1.1)}" fill="none"/>`;
      }
      if (b.dots) se.per.forEach((p, pi) => {
        if (p.v == null) return; const n = se.per.length; const off = (pi - (n - 1) / 2) * Math.min(bwi * 0.22, 6 * u);
        o += `<circle cx="${f(cx + off)}" cy="${f(Y(p.v))}" r="${f(2.6 * u)}" fill="${pts === "open" ? "#fff" : "#000"}" stroke="#000" stroke-width="${f(lw * 0.9)}"/>`;
      });
    });
    const cx = ml + band * ci + band / 2;
    o += rot
      ? `<text transform="translate(${f(cx + fs * 0.3)} ${f(mt + ph + fs * 0.9)}) rotate(-45)" font-size="${f(fs)}" text-anchor="end" fill="#000" data-rename="cond|${ci}">${esc(c.cond)}</text>`
      : `<text x="${f(cx)}" y="${f(mt + ph + fs * 1.45)}" font-size="${f(fs)}" text-anchor="middle" fill="#000" data-rename="cond|${ci}">${esc(c.cond)}</text>`;
  });
  // significance
  const topOf = (ci, si) => { const se = cells[ci].series[si]; return Math.max((se.mean || 0) + errOf(se), ...(b.dots ? se.vals : [0])); };
  if (sigMode === "bracket" && comps.length) {
    let yv = ymax * 1.06;
    const gap = sigGap;
    comps.sort((a, c) => Math.abs(a.ci - refIdx) - Math.abs(c.ci - refIdx) || a.si - c.si);
    for (const cp of comps) {
      const x1 = barX(refIdx, cp.si) + bw / 2, x2 = barX(cp.ci, cp.si) + bw / 2; const y = Y(yv); const dt = 4 * u;
      o += `<path d="M${f(x1)} ${f(y + dt)}V${f(y)}H${f(x2)}V${f(y + dt)}" stroke="#000" stroke-width="${f(lw * 1.1)}" fill="none"/>`;
      const st = stars(cp.p);
      o += `<text x="${f((x1 + x2) / 2)}" y="${f(y - 2.5 * u)}" font-size="${f(st === "ns" ? fs * 0.9 : fs * 1.15)}" text-anchor="middle" fill="#000">${st}</text>`;
      yv += gap;
    }
  } else if (sigMode === "stars" && !stacked) {
    for (const cp of comps) { const x = barX(cp.ci, cp.si) + bw / 2; const st = stars(cp.p); o += `<text x="${f(x)}" y="${f(Y(topOf(cp.ci, cp.si)) - 5 * u)}" font-size="${f(st === "ns" ? fs * 0.85 : fs * 1.15)}" text-anchor="middle" fill="#000">${st}</text>`; }
  }
  // legend (no box, Prism-like) — position preset or dragged (fractions of the plot area)
  if (nSer > 1 && lpos !== "none") {
    let lx, ly; const inset = 8 * u;
    if (lpos === "custom" && b.legendXY) { lx = ml + b.legendXY[0] * pw; ly = mt + b.legendXY[1] * ph; }
    else if (lpos === "inTR") { lx = ml + pw - legendW - inset; ly = mt + inset; }
    else if (lpos === "outTR") { lx = ml + pw + 14 * u; ly = mt + 4 * u; }
    else if (lpos === "outBR") { lx = ml + pw + 14 * u; ly = mt + ph - legendH - 2 * u; }
    else if (lpos === "top") { lx = ml + (pw - rowW) / 2; ly = 8 * u; }
    else { lx = ml + inset + 6 * u; ly = mt + inset; }
    lx = clamp(lx, 2, W - (lpos === "top" ? rowW : legendW) - 2); ly = clamp(ly, 2, H - legendH - 2);
    o += `<g data-legend="1" transform="translate(${f(lx)} ${f(ly)})" style="cursor:move">`;
    o += `<rect x="${f(-3 * u)}" y="${f(-3 * u)}" width="${f((lpos === "top" ? rowW : legendW) + 6 * u)}" height="${f((lpos === "top" ? sq : legendH) + 6 * u)}" fill="#fff" fill-opacity="0"/>`;
    let cx = 0, cy = 0;
    S_.forEach((se, si) => {
      o += `<rect x="${f(cx)}" y="${f(cy)}" width="${f(sq)}" height="${f(sq)}" fill="${colorOf(se, si)}" stroke="${strokeOf(se)}" stroke-width="${f(lw * (fill === "outline" ? 1.6 : 1))}"/>`;
      o += `<text x="${f(cx + sq + 5 * u)}" y="${f(cy + sq * 0.88)}" font-size="${f(fs)}" fill="#000" data-rename="${esc(se.reg && M.gate ? `reg|${M.gate.id}|${se.reg}` : se.key === "sum" ? "sum" : `gate|${se.key}`)}">${esc(se.label)}</text>`;
      if (lpos === "top") cx += sq + 6 * u + labW(se) + 14 * u; else cy += rowH;
    });
    o += `</g>`;
  }
  o = o.replace("<svg ", `<svg data-plot="${f(ml)},${f(mt)},${f(pw)},${f(ph)}" `);
  if (comps.length) o += `<text x="${f(W - 4 * u)}" y="${f(H - 3 * u)}" font-size="${f(Math.max(4, fs * 0.72))}" fill="#555" text-anchor="end">vs ${esc(b.ref)} · Welch t-test</text>`;
  return o + "</svg>";
}
