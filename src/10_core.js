"use strict";
/* ============================================================
   Anchorgating — core: utils, palettes, transforms, FCS parser, demo
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const uid = (() => { let i = 0; return (p = "id") => p + (++i).toString(36) + Math.random().toString(36).slice(2, 6); })();
const clone = (o) => JSON.parse(JSON.stringify(o));
const fmtInt = (n) => Math.round(n).toLocaleString("en-US");
const fmtPct = (v, d = 1) => (isFinite(v) ? v.toFixed(d) : "–");
const fmtSig = (v) => (!isFinite(v) ? "–" : v === 0 ? "0" : v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toPrecision(2));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(3)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
const ICON = {
  anchor: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 12H3a9 9 0 0 0 18 0h-2M8 10h8"/></svg>',
  link: '<svg class="i" viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/></svg>',
  unlink: '<svg class="i" viewBox="0 0 24 24"><path d="M15 7h2a5 5 0 0 1 0 10h-2M9 17H7A5 5 0 0 1 7 7h2"/><path d="M3 3l18 18"/></svg>',
  dots: '<svg class="i" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
  down: '<svg class="i" viewBox="0 0 24 24" style="width:11px;height:11px"><path d="m6 9 6 6 6-6"/></svg>',
  x: '<svg class="i" viewBox="0 0 24 24" style="width:12px;height:12px"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  trash: '<svg class="i" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  expand: '<svg class="i" viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  plus: '<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
};
const ic = (name) => { const t = document.createElement("template"); t.innerHTML = ICON[name]; return t.content.firstChild; };

/* ---------------- RNG ---------------- */
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function makeNormal(rand) { let spare = null; return function (m = 0, s = 1) { if (spare !== null) { const v = spare; spare = null; return m + s * v; } let u, v, r; do { u = rand() * 2 - 1; v = rand() * 2 - 1; r = u * u + v * v; } while (r >= 1 || r === 0); const f = Math.sqrt(-2 * Math.log(r) / r); spare = v * f; return m + s * u * f; }; }

/* ---------------- Palettes ---------------- */
const PALETTES = {
  viridis: { name: "Viridis", group: "rec", tag: "추천", stops: ["#440154", "#482878", "#3e4a89", "#31688e", "#26828e", "#1f9e89", "#35b779", "#6ece58", "#b5de2b", "#fde725"] },
  cividis: { name: "Cividis", group: "rec", tag: "색각이상 최적", stops: ["#00224e", "#123570", "#3b496c", "#575d6d", "#707173", "#8a8779", "#a69d75", "#c4b56c", "#e4cf5b", "#fee838"] },
  magma: { name: "Magma", group: "rec", tag: "추천", stops: ["#1c1044", "#4f127b", "#812581", "#b5367a", "#e55064", "#fb8761", "#fec287"] },
  inferno: { name: "Inferno", group: "rec", stops: ["#1b0c41", "#4a0c6b", "#781c6d", "#a52c60", "#cf4446", "#ed6925", "#fb9b06", "#f7d13d"] },
  plasma: { name: "Plasma", group: "rec", stops: ["#0d0887", "#46039f", "#7201a8", "#9c179e", "#bd3786", "#d8576b", "#ed7953", "#fb9f3a", "#fdca26", "#f0f921"] },
  blues: { name: "Blues", group: "mono", stops: ["#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"] },
  greens: { name: "Greens", group: "mono", stops: ["#a8dcc0", "#74c69d", "#40916c", "#2d6a4f", "#1b4332"] },
  purples: { name: "Purples", group: "mono", stops: ["#c9c6e4", "#9e9ac8", "#756bb1", "#54278f", "#3f007d"] },
  reds: { name: "Reds", group: "mono", stops: ["#fcbba1", "#fb6a4a", "#de2d26", "#a50f15", "#67000d"] },
  mono: { name: "Graphite", group: "mono", stops: ["#b9bec6", "#8a919b", "#5c636d", "#343a42", "#0f1216"] },
  flowjo: { name: "FlowJo", group: "classic", tag: "FlowJo 실제 색", stops: ["#1a1adc", "#1023e3", "#214fee", "#3c88f0", "#53b5f2", "#64d8f1", "#6eede2", "#72f7b8", "#73f781", "#80f54b", "#bcf64e", "#e9cd45", "#e8a93b", "#e17c2f", "#d94d24", "#d73921"] },
  turbo: { name: "Turbo", group: "classic", tag: "무지개", tagWarn: true, stops: ["#30123b", "#4145ab", "#4675ed", "#39a2fc", "#1bcfd4", "#24eca6", "#61fc6c", "#a4fc3b", "#d1e834", "#f3c63a", "#fe9b2d", "#f36315", "#d93806", "#b11901", "#7a0403"] },
  classic: { name: "Classic", group: "classic", tag: "Diva·FlowJo", tagWarn: true, stops: ["#0000ff", "#00a2ff", "#00e676", "#ffee00", "#ff8a00", "#ff0000"] },
  custom: { name: "Custom", group: "custom", stops: null },
};
function hexToRgb(hx) { const v = hx.replace("#", ""); const n = parseInt(v.length === 3 ? v.split("").map((c) => c + c).join("") : v, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function buildLUT(stops) {
  const rgb = stops.map(hexToRgb); const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (rgb.length - 1); const k = Math.min(rgb.length - 2, Math.floor(t)); const f = t - k;
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = rgb[k][c] + (rgb[k + 1][c] - rgb[k][c]) * f;
  }
  return lut;
}
function lutCss(lut, i) { i = clamp(i | 0, 0, 255) * 3; return `rgb(${lut[i]},${lut[i + 1]},${lut[i + 2]})`; }

/* ---------------- Axis transforms ---------------- */
const SCATTER_RE = /^(FSC|SSC|FS|SS)[\s_-]?/i;
const TIME_RE = /^time$/i;
function defaultAxis(pname, range) {
  const max = range > 0 ? range : 262144;
  if (SCATTER_RE.test(pname) || TIME_RE.test(pname)) return { scale: "lin", min: 0, max, cof: 150 };
  return { scale: "biex", min: -600, max, cof: 150 };
}
function makeT(ax) {
  const c = Math.max(1, ax.cof || 150);
  let f, inv;
  if (ax.scale === "log") { const lo = ax.min > 0 ? ax.min : 1; f = (x) => Math.log10(x > lo ? x : lo); inv = (t) => Math.pow(10, t); }
  else if (ax.scale === "biex") { f = (x) => Math.asinh(x / c); inv = (t) => c * Math.sinh(t); }
  else { f = (x) => x; inv = (t) => t; }
  const lo = ax.scale === "log" ? (ax.min > 0 ? ax.min : 1) : ax.min;
  const t0 = f(lo), t1 = f(ax.max), span = t1 - t0 || 1;
  return {
    ax, f, inv, t0, t1,
    u: (x) => (f(x) - t0) / span,
    x: (u) => inv(t0 + u * span),
    key: `${ax.scale}|${ax.min}|${ax.max}|${c}`,
  };
}
function niceStep(span, target) { const raw = span / target; const p = Math.pow(10, Math.floor(Math.log10(raw))); const m = raw / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
/* ticks: [{v, major, label:{base,exp}|string}] */
function axisTicks(T, small) {
  const ax = T.ax, out = [];
  if (ax.scale === "lin") {
    const st = niceStep(ax.max - ax.min, small ? 3 : 5);
    for (let v = Math.ceil(ax.min / st) * st; v <= ax.max + 1e-9; v += st) out.push({ v, major: true, label: compactNum(v) });
    return out;
  }
  const lo = ax.scale === "log" ? (ax.min > 0 ? ax.min : 1) : ax.min;
  const addDecades = (sign) => {
    for (let k = 0; k <= 7; k++) {
      const base = sign * Math.pow(10, k);
      for (let m = 1; m <= 9; m++) {
        const v = sign * m * Math.pow(10, k);
        if (v < lo - 1e-9 || v > ax.max + 1e-9) continue;
        if (ax.scale === "biex" && Math.abs(v) < ax.cof * 0.6) { if (m === 1) out.push({ v, major: false }); continue; }
        out.push({ v, major: m === 1, label: m === 1 ? { base: sign < 0 ? "-10" : "10", exp: String(k) } : null });
      }
      void base;
    }
  };
  addDecades(1);
  if (ax.scale === "biex") { if (lo <= 0) out.push({ v: 0, major: true, label: "0" }); if (lo < 0) addDecades(-1); }
  return out.sort((a, b) => a.v - b.v);
}
function compactNum(v) { const a = Math.abs(v); if (a >= 1e6) return (v / 1e6).toFixed(a % 1e6 ? 1 : 0) + "M"; if (a >= 1e3) return (v / 1e3).toFixed(a % 1e3 ? 1 : 0) + "K"; return String(Math.round(v)); }

/* ---------------- FCS parser ---------------- */
function asciiAt(u8, a, b) { let s = ""; for (let i = a; i < b && i < u8.length; i++) s += String.fromCharCode(u8[i]); return s; }
function decodeText(bytes) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch (e) { try { return new TextDecoder("euc-kr").decode(bytes); } catch (e2) { return new TextDecoder("latin1").decode(bytes); } }
}
function parseKeywords(text) {
  const delim = text[0]; const tokens = []; let cur = ""; let i = 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === delim) { if (text[i + 1] === delim && cur !== "" ) { cur += delim; i += 2; continue; } tokens.push(cur); cur = ""; i++; continue; }
    cur += ch; i++;
  }
  if (cur.trim().length) tokens.push(cur);
  const kw = {};
  for (let k = 0; k + 1 < tokens.length; k += 2) kw[tokens[k].trim().toUpperCase()] = tokens[k + 1];
  return kw;
}
function parseFCS(buf, fileName) {
  const u8 = new Uint8Array(buf); const dv = new DataView(buf);
  const ver = asciiAt(u8, 0, 6);
  if (!/^FCS[23]\.\d/.test(ver)) throw new Error(`${fileName}: FCS 파일 형식이 아닙니다`);
  const hnum = (a, b) => parseInt(asciiAt(u8, a, b + 1).trim() || "0", 10) || 0;
  const tS = hnum(10, 17), tE = hnum(18, 25);
  let dS = hnum(26, 33), dE = hnum(34, 41);
  const kw = parseKeywords(decodeText(u8.subarray(tS, tE + 1)));
  if (!dS || !dE) { dS = parseInt(kw["$BEGINDATA"] || "0", 10); dE = parseInt(kw["$ENDDATA"] || "0", 10); }
  const mode = (kw["$MODE"] || "L").trim().toUpperCase();
  if (mode !== "L") throw new Error(`${fileName}: list mode(L)만 지원합니다 ($MODE=${mode})`);
  const P = parseInt(kw["$PAR"], 10);
  const dt = (kw["$DATATYPE"] || "F").trim().toUpperCase();
  const bo = (kw["$BYTEORD"] || "1,2,3,4").trim();
  const little = bo.startsWith("1");
  const params = []; let evBytes = 0;
  for (let p = 1; p <= P; p++) {
    const name = (kw[`$P${p}N`] || `P${p}`).trim();
    const stain = (kw[`$P${p}S`] || "").trim();
    const bits = parseInt(kw[`$P${p}B`] || (dt === "D" ? 64 : 32), 10);
    const range = parseFloat(kw[`$P${p}R`] || "262144");
    const e = (kw[`$P${p}E`] || "0,0").split(",").map(Number);
    const gain = parseFloat(kw[`$P${p}G`] || "1") || 1;
    const bytes = dt === "F" ? 4 : dt === "D" ? 8 : bits / 8;
    params.push({ name, stain, bits, range, e, gain, bytes, off: evBytes });
    evBytes += bytes;
  }
  const avail = dE - dS + 1;
  let n = parseInt(kw["$TOT"] || "0", 10);
  if (!n || n * evBytes > avail) n = Math.floor(avail / evBytes);
  const raw = params.map(() => new Float32Array(n));
  for (let pi = 0; pi < P; pi++) {
    const pr = params[pi], arr = raw[pi];
    const mask = pr.range > 0 && dt === "I" ? Math.pow(2, Math.ceil(Math.log2(pr.range))) - 1 : 0;
    const logAmp = dt === "I" && pr.e[0] > 0;
    for (let e = 0; e < n; e++) {
      const o = dS + e * evBytes + pr.off;
      let v;
      if (dt === "F") v = dv.getFloat32(o, little);
      else if (dt === "D") v = dv.getFloat64(o, little);
      else {
        if (pr.bytes === 1) v = dv.getUint8(o);
        else if (pr.bytes === 2) v = dv.getUint16(o, little);
        else if (pr.bytes === 4) v = dv.getUint32(o, little);
        else v = 0;
        if (mask) v = v & mask;
        if (logAmp) v = Math.pow(10, (pr.e[0] * v) / pr.range) * (pr.e[1] > 0 ? pr.e[1] : 1);
        else if (pr.gain !== 1) v = v / pr.gain;
      }
      arr[e] = v;
    }
  }
  const spill = parseSpill(kw["$SPILLOVER"] || kw["SPILL"] || kw["SPILLOVER"], params.map((p) => p.name));
  const tube = (kw["TUBE NAME"] || kw["TUBE_NAME"] || "").trim() || fileName.replace(/\.(fcs|lmd)$/i, "");
  const group = (kw["$SRC"] || kw["SPECIMEN NAME"] || kw["SAMPLE ID"] || kw["$SMNO"] || "").trim();
  return {
    name: tube, group, fileName, n,
    params: params.map((p) => ({ name: p.name, stain: p.stain, range: p.range })),
    raw, spill, kw: { experiment: kw["EXPERIMENT NAME"] || "", date: kw["$DATE"] || "", cyt: kw["$CYT"] || "" },
  };
}
function parseSpill(str, names) {
  if (!str) return null;
  const parts = str.split(",").map((s) => s.trim());
  const k = parseInt(parts[0], 10);
  if (!k || parts.length < 1 + k + k * k) return null;
  const chans = parts.slice(1, 1 + k);
  const vals = parts.slice(1 + k, 1 + k + k * k).map(Number);
  const idx = chans.map((c) => names.indexOf(c));
  if (idx.some((i) => i < 0)) return null;
  const M = []; for (let i = 0; i < k; i++) M.push(vals.slice(i * k, i * k + k));
  const inv = invertMatrix(M);
  if (!inv) return null;
  return { chans, idx, M, inv };
}
function invertMatrix(M) {
  const n = M.length; const A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c]; for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; if (f) for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]; }
  }
  return A.map((r) => r.slice(n));
}
function applyComp(raw, spill, n) {
  const out = raw.slice();
  const k = spill.idx.length; const src = spill.idx.map((i) => raw[i]);
  const dst = spill.idx.map(() => new Float32Array(n));
  for (let e = 0; e < n; e++) {
    for (let j = 0; j < k; j++) { let s = 0; for (let i = 0; i < k; i++) s += src[i][e] * spill.inv[i][j]; dst[j][e] = s; }
  }
  spill.idx.forEach((pi, j) => (out[pi] = dst[j]));
  return out;
}

/* ---------------- Demo dataset (synthetic) ----------------
   Generic Annexin V-PE / 7-AAD apoptosis batch with single-stain controls:
   groups "Cell A" & "Cell B"; tubes Unstained, Annexin V only, 7-AAD only,
   Control, Drug A, Drug B, Drug A+B. All values are simulated. */
const DEMO_PARAMS = [
  { name: "FSC-A", stain: "", range: 262144 }, { name: "FSC-H", stain: "", range: 262144 }, { name: "FSC-W", stain: "", range: 262144 },
  { name: "SSC-A", stain: "", range: 262144 }, { name: "SSC-H", stain: "", range: 262144 }, { name: "SSC-W", stain: "", range: 262144 },
  { name: "PE-A", stain: "Annexin V", range: 262144 }, { name: "7-AAD-A", stain: "7-AAD", range: 262144 },
];
const DEMO_TUBES = ["Unstained", "Annexin V only", "7-AAD only", "Control", "Drug A", "Drug B", "Drug A+B"];
// fractions: live, early, late, necrotic
const DEMO_COMP = {
  "Cell A": { Unstained: [.95, .02, .015, .015], "Annexin V only": [.92, .035, .03, .015], "7-AAD only": [.92, .035, .03, .015], Control: [.92, .035, .03, .015], "Drug A": [.8, .09, .08, .03], "Drug B": [.74, .12, .1, .04], "Drug A+B": [.47, .21, .25, .07] },
  "Cell B": { Unstained: [.94, .025, .02, .015], "Annexin V only": [.9, .045, .035, .02], "7-AAD only": [.9, .045, .035, .02], Control: [.9, .045, .035, .02], "Drug A": [.82, .08, .07, .03], "Drug B": [.69, .14, .12, .05], "Drug A+B": [.38, .2, .32, .1] },
};
function genDemoSample(group, tube, rep, n) {
  const seed = [...(group + tube)].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) + rep * 1013;
  const rand = mulberry32(seed); const N = makeNormal(rand);
  const repShift = [1, 1.28, 0.86][rep % 3];                 // instrument/day-to-day PE shift
  const aadShift = [1, 0.9, 1.18][rep % 3];
  const base = DEMO_COMP[group][tube];
  const jitter = base.map((v, i) => Math.max(0.002, v * (1 + N(0, i === 0 ? 0.02 : 0.12))));
  const s = jitter.reduce((a, b) => a + b, 0); const comp = jitter.map((v) => v / s);
  const cum = comp.map((_, i) => comp.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const peStained = tube !== "Unstained" && tube !== "7-AAD only", aadStained = tube !== "Unstained" && tube !== "Annexin V only";
  const fscC = group === "Cell B" ? 108000 : 92000, sscC = group === "Cell B" ? 64000 : 56000;
  const cols = DEMO_PARAMS.map(() => new Float32Array(n));
  for (let e = 0; e < n; e++) {
    const r = rand(); let kind = "cell";
    if (r < 0.07) kind = "debris"; else if (r < 0.16) kind = "doublet";
    const q = rand(); const st = q < cum[0] ? 0 : q < cum[1] ? 1 : q < cum[2] ? 2 : 3;
    let fa, sa, fh, sh, fw, sw;
    if (kind === "debris") {
      fa = Math.abs(N(16000, 9000)); sa = Math.abs(N(14000, 9000)); fh = fa * N(0.85, 0.1); sh = sa * N(0.85, 0.1); fw = Math.abs(N(52000, 22000)); sw = Math.abs(N(50000, 22000));
    } else {
      const shrink = st === 0 ? 0 : st === 1 ? 14000 : 24000;
      const z1 = N(), z2 = N();
      fa = fscC - shrink + 19000 * z1; sa = sscC + (st ? 6000 : 0) + 15000 * (0.45 * z1 + 0.89 * z2);
      if (kind === "doublet") { fa = fa * N(1.8, 0.12); sa = sa * N(1.8, 0.15); fh = fa * N(0.52, 0.06); sh = sa * N(0.52, 0.07); fw = N(118000, 17000); sw = N(112000, 17000); }
      else { fh = fa * N(0.8, 0.035); sh = sa * N(0.82, 0.04); fw = N(64000, 5200); sw = N(60000, 5600); }
    }
    let pe, aad;
    const stD = kind === "debris" ? (rand() < 0.6 ? 3 : 0) : st;
    if (stD === 0) { pe = N(45, 110); aad = N(25, 95); }
    else if (stD === 1) { pe = Math.pow(10, N(3.45, 0.28)); aad = N(90, 140); }
    else if (stD === 2) { pe = Math.pow(10, N(3.85, 0.3)); aad = Math.pow(10, N(3.75, 0.28)); }
    else { pe = N(260, 260); aad = Math.pow(10, N(3.6, 0.3)); }
    pe = peStained ? pe * repShift : N(0, 85);
    aad = aadStained ? aad * aadShift : N(0, 80);
    const row = [fa, fh, fw, sa, sh, sw, pe, aad];
    for (let p = 0; p < 8; p++) cols[p][e] = p < 6 ? clamp(row[p], 0, 262143) : clamp(row[p], -2000, 262143);
  }
  return cols;
}
