/* ============================================================
   Figure export at physical size (mm) with fonts in pt
   ============================================================ */
const MM2PT = 72 / 25.4, MM2PX = 96 / 25.4;

function barSVG(M, W, H, opts = {}) {
  const b = M.b; const fs = opts.fs || (opts.big ? 13 : 11); const u = fs / 11; const lw = opts.lw || 1;
  const longest = Math.max(0, ...M.shown.map((c) => c.length));
  const rot = longest * fs * 0.56 > (W - 60 * u) / Math.max(1, M.shown.length) - 6 * u;
  const legendRows = 1 + (b.dots && M.reps.length > 1 && b.layout !== "stacked" ? 1 : 0);
  const stacked = b.layout === "stacked" && !b.sum && M.series.length > 1;
  const hasStats = b.stats && M.maxN > 1 && !stacked;
  const noteH = hasStats ? fs + 5 * u : 0;
  const ml = 48 * u, mr = 8 * u, mt = 10 * u + legendRows * (fs + 7 * u), mb = (rot ? 14 * u + Math.min(120 * u, longest * fs * 0.5) : fs + 14 * u) + noteH;
  const pw = W - ml - mr, ph = H - mt - mb;
  const errOf = (se) => (M.maxN > 1 ? (b.err === "sem" ? se.sem : se.sd) : 0);
  let ymax = 1;
  for (const c of M.cells) {
    if (stacked) { let acc = 0; for (const se of c.series) { acc += se.mean || 0; ymax = Math.max(ymax, acc + errOf(se)); } }
    else for (const se of c.series) ymax = Math.max(ymax, (se.mean || 0) + errOf(se), ...(b.dots ? se.vals : [0]));
  }
  ymax *= hasStats ? 1.18 : 1.06;
  if (stacked && b.basis === "parent" && ymax > 92 && ymax < 112) ymax = 100;
  const step = niceStep(ymax, ph > 160 * u ? 6 : 4); ymax = Math.ceil(ymax / step - 1e-9) * step;
  const Y = (v) => mt + ph - (v / ymax) * ph;
  const band = pw / Math.max(1, M.cells.length); const inner = stacked || M.series.length === 1 ? 1 : M.series.length;
  const bwid = Math.min((opts.big ? 64 : 40) * u, (band * 0.72) / inner);
  const f = (v) => +v.toFixed(2);
  const size = opts.mm ? `width="${opts.mm[0]}mm" height="${opts.mm[1]}mm"` : `width="${W}" height="${H}"`;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${f(H)}" ${size} font-family="Arial, Helvetica, sans-serif" role="img" aria-label="Bar plot">`;
  out += `<rect width="${f(W)}" height="${f(H)}" fill="#ffffff"/>`;
  for (let v = 0; v <= ymax + 1e-9; v += step) { const y = f(Y(v)); out += `<line x1="${f(ml)}" x2="${f(W - mr)}" y1="${y}" y2="${y}" stroke="${v === 0 ? "#6b7380" : "#e3e6ea"}" stroke-width="${f(lw * (v === 0 ? 1 : 0.7))}"/><text x="${f(ml - 5 * u)}" y="${f(Y(v) + fs * 0.35)}" font-size="${f(fs)}" fill="#3a414b" text-anchor="end">${+v.toFixed(2)}</text>`; }
  out += `<text transform="translate(${f(fs * 0.95)} ${f(mt + ph / 2)}) rotate(-90)" font-size="${f(fs)}" fill="#12151a" text-anchor="middle">${esc(`% of ${b.basis === "total" ? "total" : M.parentLabel}`)}</text>`;
  let lx = ml, ly = 8 * u; const sq = fs * 0.85;
  for (const se of M.series) {
    const rn = se.reg && M.gate ? `reg|${M.gate.id}|${se.reg}` : se.key === "sum" ? "sum" : `gate|${se.key}`;
    out += `<rect x="${f(lx)}" y="${f(ly)}" width="${f(sq)}" height="${f(sq)}" rx="${f(sq * 0.2)}" fill="${se.color}"/><text x="${f(lx + sq + 3 * u)}" y="${f(ly + sq * 0.9)}" font-size="${f(fs)}" fill="#12151a" data-rename="${esc(rn)}">${esc(se.label)}</text>`;
    lx += sq + 12 * u + se.label.length * fs * 0.56;
  }
  if (legendRows > 1) { lx = ml; ly += fs + 7 * u; M.reps.forEach((r, i) => { out += `<g fill="#12151a" stroke="#fff" stroke-width="${f(0.8 * lw)}">${marker(REP_SHAPES[i % 5], f(lx + 4 * u), f(ly + sq / 2), f(3.3 * u))}</g><text x="${f(lx + 11 * u)}" y="${f(ly + sq * 0.9)}" font-size="${f(fs * 0.9)}" fill="#5b6470">${esc(r.name)}</text>`; lx += 20 * u + r.name.length * fs * 0.55; }); }
  const rr = (x, y, w, hgt, fill, attrs, roundTop) => { if (hgt <= 0.3) return ""; const r = Math.min(2.5 * u, w / 2, hgt); if (!roundTop) return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(hgt)}" fill="${fill}" ${attrs}/>`; return `<path d="M${f(x)} ${f(y + hgt)}V${f(y + r)}Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)}H${f(x + w - r)}Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)}V${f(y + hgt)}Z" fill="${fill}" ${attrs}/>`; };
  const cap = 3.5 * u, sw = f(lw * 1.1);
  M.cells.forEach((c, ci) => {
    const cx = ml + band * ci + band / 2;
    if (stacked) {
      let acc = 0; const x = cx - bwid / 2;
      c.series.forEach((se, si) => {
        const v = se.mean || 0; const y0 = Y(acc), y1 = Y(acc + v); const gap = si ? Math.min(1, u) : 0;
        out += rr(x, y1 + gap, bwid, y0 - y1 - gap, se.color, `data-c="${ci}" data-s="${si}"`, si === c.series.length - 1);
        acc += v; const e = errOf(se);
        if (e > 0) out += `<path d="M${f(cx)} ${f(Y(acc - e))}V${f(Y(acc + e))}M${f(cx - cap)} ${f(Y(acc + e))}H${f(cx + cap)}M${f(cx - cap)} ${f(Y(acc - e))}H${f(cx + cap)}" stroke="#12151a" stroke-width="${sw}" fill="none"/>`;
      });
      out += `<rect x="${f(cx - band / 2)}" y="${f(mt)}" width="${f(band)}" height="${f(ph)}" fill="transparent" data-c="${ci}" data-s="-1"/>`;
    } else {
      c.series.forEach((se, si) => {
        const x = cx - (bwid * inner) / 2 + bwid * si + u; const w = bwid - 2 * u; const v = se.mean;
        if (isFinite(v)) out += rr(x, Y(v), w, Y(0) - Y(v), se.color, `data-c="${ci}" data-s="${si}"`, true);
        const e = errOf(se); const mx = x + w / 2;
        if (e > 0 && isFinite(v)) out += `<path d="M${f(mx)} ${f(Y(Math.max(0, v - e)))}V${f(Y(v + e))}M${f(mx - cap)} ${f(Y(v + e))}H${f(mx + cap)}M${f(mx - cap)} ${f(Y(Math.max(0, v - e)))}H${f(mx + cap)}" stroke="#12151a" stroke-width="${sw}" fill="none"/>`;
        let topY = Y((v || 0) + e);
        if (b.dots) se.per.forEach((p, pi) => { if (p.v == null) return; const off = (pi - (se.per.length - 1) / 2) * Math.min(6.5 * u, w / (se.per.length + 1)); const y = Y(p.v); topY = Math.min(topY, y); out += `<g fill="#12151a" stroke="#ffffff" stroke-width="${f(0.8 * lw)}">${marker(M.reps.length > 1 ? REP_SHAPES[pi % 5] : "circle", f(mx + off), f(y), f((opts.big ? 3.8 : 3.1) * u))}</g>`; });
        if (hasStats && isFinite(se.p)) { const st = stars(se.p); out += `<text x="${f(mx)}" y="${f(topY - 5 * u)}" font-size="${f(st === "ns" ? fs * 0.82 : fs * 1.08)}" fill="${st === "ns" ? "#7f8793" : "#12151a"}" text-anchor="middle" font-weight="700">${st}</text>`; }
        out += `<rect x="${f(x - u)}" y="${f(mt)}" width="${f(bwid)}" height="${f(ph)}" fill="transparent" data-c="${ci}" data-s="${si}"/>`;
      });
    }
    const lab = esc(c.cond);
    out += rot ? `<text transform="translate(${f(cx + 2 * u)} ${f(mt + ph + fs)}) rotate(-38)" font-size="${f(fs)}" fill="#12151a" text-anchor="end" data-rename="cond|${ci}">${lab}</text>` : `<text x="${f(cx)}" y="${f(mt + ph + fs + 5 * u)}" font-size="${f(fs)}" fill="#12151a" text-anchor="middle" data-rename="cond|${ci}">${lab}</text>`;
  });
  if (hasStats && M.b.ref) out += `<text x="${f(W - mr)}" y="${f(H - 3 * u)}" font-size="${f(Math.max(4, fs * 0.8))}" fill="#7f8793" text-anchor="end">vs ${esc(M.b.ref)} · Welch t-test</text>`;
  return out + "</svg>";
}

function floatingInput(clientX, clientY, width, value, onCommit) {
  const inp = h("input", { class: "canvas-edit", value, "aria-label": "이름 편집" });
  inp.style.left = clamp(clientX, 8, innerWidth - width - 8) + "px"; inp.style.top = clamp(clientY, 8, innerHeight - 40) + "px"; inp.style.width = width + "px";
  document.body.append(inp); inp.focus(); inp.select();
  let done = false;
  const fin = (ok) => { if (done) return; done = true; const v = inp.value.trim(); inp.remove(); if (ok && v && v !== value) onCommit(v); };
  inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") fin(true); if (e.key === "Escape") fin(false); });
  inp.addEventListener("blur", () => fin(true));
}

/* ---- PNG with physical resolution (pHYs) so Word/PPT/Illustrator place it at the right size ---- */
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
async function canvasToPNG(canvas, dpi) {
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  const src = new Uint8Array(await blob.arrayBuffer());
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21); const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9); chunk.set([112, 72, 89, 115], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const at = 33; const out = new Uint8Array(src.length + 21);
  out.set(src.subarray(0, at)); out.set(chunk, at); out.set(src.subarray(at), at + 21);
  return new Blob([out], { type: "image/png" });
}

const EXPORT_PRESETS = {
  plot: [
    { id: "sm", label: "논문 · 작게", w: 40, fs: 6, dot: 0.5, lw: 0.5, dpi: 600 },
    { id: "md", label: "논문 · 중간", w: 60, fs: 7, dot: 0.7, lw: 0.6, dpi: 600 },
    { id: "lg", label: "발표 · 크게", w: 120, fs: 14, dot: 1.4, lw: 1.2, dpi: 300 },
  ],
  bar: [
    { id: "sm", label: "논문 · 작게", w: 55, h: 45, fs: 6, lw: 0.5, dpi: 600 },
    { id: "md", label: "논문 · 중간", w: 85, h: 65, fs: 7, lw: 0.6, dpi: 600 },
    { id: "lg", label: "발표 · 크게", w: 170, h: 120, fs: 14, lw: 1.2, dpi: 300 },
  ],
};
const EXP = {
  plot: { preset: "md", w: 60, fs: 7, dot: 0.7, lw: 0.6, dpi: 600, labels: true, titles: true, heads: false, zoom: 1 },
  bar: { preset: "md", w: 85, h: 65, fs: 7, lw: 0.6, dpi: 600, zoom: 1 },
  hist: { preset: "md", w: 85, h: 65, fs: 7, lw: 0.6, dpi: 600, zoom: 1 },
};
let EXPORT_MODAL = null;
function closeExport() { if (EXPORT_MODAL) { EXPORT_MODAL.remove(); EXPORT_MODAL = null; } }
function renderExport(target, o) {
  const k = o.dpi / 72;
  if (target.type === "hist") {
    const W = o.w * MM2PT, H = o.h * MM2PT;
    return { svg: histSVG(histModel(), W, H, { fs: o.fs, lw: o.lw, mm: [o.w, o.h] }), wMm: o.w, hMm: o.h, px: [Math.round(W * k), Math.round(H * k)] };
  }
  if (target.type === "bar") {
    const W = o.w * MM2PT, H = o.h * MM2PT;
    return { svg: drawBar(barModel(), W, H, { fs: o.fs, lw: o.lw, mm: [o.w, o.h] }), wMm: o.w, hMm: o.h, px: [Math.round(W * k), Math.round(H * k)] };
  }
  const opts = { wPt: o.w * MM2PT, hPt: o.w * MM2PT, dpi: o.dpi, fs: o.fs, dot: o.dot, lw: o.lw, labels: o.labels, titles: o.titles };
  if (target.type === "plot") { const c = plotToCanvas(target.s, target.plot, opts); return { canvas: c, wMm: o.w, hMm: o.w, px: [c.width, c.height] }; }
  const plots = plotsFor(target.s); const cols = Math.min(4, plots.length), rows = Math.ceil(plots.length / cols);
  const gap = 3, head = o.heads ? (o.fs * 1.9) / MM2PT : 0;
  const wMm = cols * o.w + (cols - 1) * gap, hMm = rows * (o.w + head) + (rows - 1) * gap;
  const pxmm = o.dpi / 25.4; const c = document.createElement("canvas"); c.width = Math.round(wMm * pxmm); c.height = Math.round(hMm * pxmm);
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  plots.forEach((p, i) => {
    const pc = plotToCanvas(target.s, p, opts); const x = (i % cols) * (o.w + gap), y = Math.floor(i / cols) * (o.w + head + gap) + head;
    ctx.drawImage(pc, Math.round(x * pxmm), Math.round(y * pxmm));
    if (o.heads) { ctx.fillStyle = "#12151a"; ctx.font = `bold ${(o.fs * o.dpi) / 72}px ${FONT}`; ctx.textBaseline = "alphabetic"; ctx.fillText(popLabel(p.parent), Math.round(x * pxmm), Math.round((y - head * 0.25) * pxmm)); }
  });
  return { canvas: c, wMm, hMm, px: [c.width, c.height] };
}
async function exportPNG(target, o, out) {
  let canvas = out.canvas;
  if (!canvas) {
    canvas = await new Promise((res, rej) => { const img = new Image(); img.onload = () => { const c = document.createElement("canvas"); c.width = out.px[0]; c.height = out.px[1]; c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); res(c); }; img.onerror = rej; img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(out.svg); });
  }
  const blob = await canvasToPNG(canvas, o.dpi);
  const base = target.type === "hist" ? `histogram_${S.hist.group}_${S.hist.xp}` : target.type === "bar" ? `barplot_${S.bar.group}` : target.type === "chain" ? `${target.s.group}_${target.s.name}_gating` : `${target.s.group}_${target.s.name}_${popLabel(target.plot.parent)}`;
  const size = target.type === "bar" || target.type === "hist" ? `${o.w}x${o.h}mm` : `${o.w}mm`;
  saveFile(`${base}_${size}_${o.fs}pt_${o.dpi}dpi.png`.replace(/[\\/:*?"<>|]/g, "_"), blob);
}
function openExport(target) {
  closeExport(); closePop();
  const kind = target.type === "bar" || target.type === "hist" ? "bar" : "plot"; const o = EXP[target.type === "hist" ? "hist" : kind];
  const back = h("div", { class: "modal-back" }); const modal = h("div", { class: "modal", role: "dialog", "aria-label": "그림 저장" });
  back.append(modal); back.addEventListener("pointerdown", (e) => { if (e.target === back) closeExport(); });
  document.body.append(back); EXPORT_MODAL = back;
  const title = target.type === "hist" ? "Histogram 그림 저장" : target.type === "bar" ? "Bar plot 그림 저장" : target.type === "chain" ? `${target.s.name} · gating 플롯 전체 저장` : `${target.s.name} · ${popLabel(target.plot.parent)} 플롯 저장`;
  const build = () => {
    modal.innerHTML = "";
    const close = h("button", { class: "btn sm" }, "닫기"); close.addEventListener("click", closeExport);
    modal.append(h("div", { class: "f-row" }, h("b", { style: { fontSize: "15px" } }, title), h("div", { class: "spacer" }), close));
    const ctl = h("div", { class: "field", style: { gap: "14px" } });
    const presets = h("div", { class: "seg" }, ...EXPORT_PRESETS[kind].map((p) => { const bt = h("button", { class: o.preset === p.id ? "on" : "" }, p.label); bt.addEventListener("click", () => { const { label, id, ...vals } = p; void label; Object.assign(o, vals, { preset: id }); build(); }); return bt; }));
    const num = (label, key, step, min, max, unit) => {
      const inp = h("input", { class: "txt-input num", type: "number", id: "exp_" + key, step: String(step), min: String(min), max: String(max), value: String(o[key]) });
      inp.addEventListener("change", () => { const v = parseFloat(inp.value); if (isFinite(v) && v >= min && v <= max) { o[key] = v; o.preset = null; build(); } else { inp.value = o[key]; toast(`${label}는 ${min}–${max} ${unit} 사이로 입력하세요`); } });
      return h("label", { class: "field" }, h("span", { class: "f-label" }, `${label} (${unit})`), inp);
    };
    const fields = h("div", { class: "qgrid" }, num(kind === "bar" ? "너비" : "플롯 한 변", "w", 1, 10, 400, "mm"));
    if (kind === "bar") fields.append(num("높이", "h", 1, 10, 400, "mm"));
    fields.append(num("글자 크기", "fs", 0.5, 4, 30, "pt"));
    if (kind === "plot") fields.append(num("점 크기", "dot", 0.1, 0.1, 6, "pt"));
    fields.append(num("선 굵기", "lw", 0.1, 0.2, 4, "pt"));
    const dpi = h("select", { class: "sel-input", id: "exp_dpi" }, ...[300, 600, 1200].map((d) => h("option", { value: String(d), selected: o.dpi === d ? "" : null }, `${d} dpi`)));
    dpi.addEventListener("change", () => { o.dpi = +dpi.value; build(); });
    fields.append(h("label", { class: "field" }, h("span", { class: "f-label" }, "해상도"), dpi));
    ctl.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "프리셋"), presets), fields);
    if (kind === "plot") {
      const ck = (label, key) => { const c = h("label", { class: "check" }, h("input", { type: "checkbox", id: "exp_" + key, checked: o[key] ? "" : null }), label); c.querySelector("input").addEventListener("change", (e) => { o[key] = e.target.checked; build(); }); return c; };
      ctl.append(h("div", { class: "f-row" }, ck("gate 이름·%", "labels"), ck("축 제목", "titles"), target.type === "chain" ? ck("패널 제목", "heads") : null));
    }
    const out = renderExport(target, o);
    ctl.append(h("div", { class: "note" }, `출력 ${out.px[0].toLocaleString()} × ${out.px[1].toLocaleString()} px · 실제 크기 ${out.wMm.toFixed(0)} × ${out.hMm.toFixed(0)} mm · PNG에 ${o.dpi} dpi 정보 포함`));
    const png = h("button", { class: "btn primary", disabled: DL ? null : "" }, "PNG 저장");
    png.addEventListener("click", () => exportPNG(target, o, out).catch((e) => toast(`PNG를 만들지 못했습니다: ${e.message || e}`)));
    const row = h("div", { class: "f-row" }, png);
    if (kind === "bar") { const sv = h("button", { class: "btn", disabled: DL ? null : "" }, "SVG 저장 (Illustrator 편집용)"); sv.addEventListener("click", () => saveFile((target.type === "hist" ? `histogram_${S.hist.group}_${S.hist.xp}` : `barplot_${S.bar.group}`) + `_${o.w}x${o.h}mm_${o.fs}pt.svg`.replace(/[\\/:*?"<>|]/g, "_"), out.svg)); row.append(sv); }
    ctl.append(row,
      h("div", { class: "note", style: { lineHeight: "1.55" } }, "글자가 작아지는 이유는 크게 저장한 그림을 논문에서 줄이기 때문입니다. 여기서는 처음부터 figure에 들어갈 실제 크기(mm)로 그리고 글자·점·선을 pt로 지정합니다. 저장한 PNG를 줄이지 말고 100% 크기로 넣으면 지정한 pt 그대로 인쇄됩니다. 대부분의 저널은 최종 크기 기준 6–8 pt 글자, 300 dpi 이상(선·점 그림은 600 dpi 이상)을 권장하니 투고할 저널의 figure 가이드도 함께 확인하세요."));
    const prev = h("div", { class: "exp-preview" });
    const zoom = o.zoom || 1;
    if (out.canvas) { const c = out.canvas; c.style.width = out.wMm * MM2PX * zoom + "px"; c.style.height = out.hMm * MM2PX * zoom + "px"; c.style.maxWidth = "none"; prev.append(c); }
    else { const d = document.createElement("div"); d.innerHTML = out.svg; const el = d.firstChild; el.setAttribute("width", out.wMm * MM2PX * zoom + "px"); el.setAttribute("height", out.hMm * MM2PX * zoom + "px"); el.style.maxWidth = "none"; prev.append(el); }
    const zseg = h("div", { class: "seg" }, ...[[1, "실제 크기"], [2, "×2"], [4, "×4"]].map(([z, l]) => { const bt = h("button", { class: zoom === z ? "on" : "" }, l); bt.addEventListener("click", () => { o.zoom = z; build(); }); return bt; }));
    const right = h("div", { class: "field", style: { minWidth: 0 } }, h("div", { class: "f-row" }, h("span", { class: "f-label" }, "미리보기"), zseg), h("span", { class: "note" }, "‘실제 크기’는 화면 배율 100%에서 인쇄 크기와 비슷하게 보입니다. 이 크기에서 읽히면 논문에서도 읽힙니다."), prev);
    modal.append(h("div", { class: "exp-grid" }, ctl, right));
  };
  build();
}
