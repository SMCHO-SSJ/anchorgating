/* ============================================================
   Bar plot (live), statistics, exports
   ============================================================ */
function lgamma(x) { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = x, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp); let ser = 1.000000000190015; for (let j = 0; j < 6; j++) ser += c[j] / ++y; return -tmp + Math.log((2.5066282746310005 * ser) / x); }
function betacf(a, b, x) { let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - (qab * x) / qap; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d; let hh = d; for (let m = 1; m <= 200; m++) { const m2 = 2 * m; let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d; hh *= d * c; aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d; const del = d * c; hh *= del; if (Math.abs(del - 1) < 3e-7) break; } return hh; }
function betai(a, b, x) { if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x)); return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b; }
function welchP(a, b) {
  if (a.length < 2 || b.length < 2) return NaN;
  const m = (v) => v.reduce((x, y) => x + y, 0) / v.length; const va = (v, mu) => v.reduce((x, y) => x + (y - mu) ** 2, 0) / (v.length - 1);
  const ma = m(a), mb = m(b), sa = va(a, ma) / a.length, sb = va(b, mb) / b.length; const se2 = sa + sb;
  if (se2 <= 0) return ma === mb ? 1 : 0;
  const t = (ma - mb) / Math.sqrt(se2); const df = (se2 * se2) / ((sa * sa) / (a.length - 1) + (sb * sb) / (b.length - 1));
  return betai(df / 2, 0.5, df / (df + t * t));
}
const stars = (p) => (!isFinite(p) ? "" : p < 0.001 ? "***" : p < 0.01 ? "**" : p < 0.05 ? "*" : "ns");
function summ(vals) { const v = vals.filter((x) => x != null && isFinite(x)); const n = v.length; if (!n) return { n: 0, mean: NaN, sd: NaN, sem: NaN, vals: v }; const mean = v.reduce((a, b) => a + b, 0) / n; const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0; return { n, mean, sd, sem: n > 1 ? sd / Math.sqrt(n) : 0, vals: v }; }

function allGroups() { const out = []; for (const r of S.reps) for (const g of repGroups(r)) if (!out.includes(g)) out.push(g); return out; }
function gateChoices() {
  const out = []; const seen = new Set();
  const sets = new Map();
  for (const s of S.samples.values()) for (const { node } of treeOrder(effTree(s))) {
    if (!seen.has(node.id)) { seen.add(node.id); out.push(node); }
    if (node.type === "range") { const k = "set:" + node.parent + "|" + node.xp; if (!sets.has(k)) sets.set(k, { id: k, type: "rangeset", parent: node.parent, xp: node.xp, items: new Map() }); sets.get(k).items.set(node.id, node.g.x1); }
  }
  for (const st of sets.values()) if (st.items.size >= 2) { st.members = [...st.items.entries()].sort((a, c) => a[1] - c[1]).map((e) => e[0]); delete st.items; out.unshift(st); }
  return out;
}
function barModel() {
  const b = S.bar; const groups = allGroups();
  if (!groups.includes(b.group)) b.group = (curSample() && curSample().group) || groups[0];
  const gates = gateChoices(); if (!gates.find((g) => g.id === b.gid)) b.gid = (gates.find((g) => g.type === "rangeset") || gates.find((g) => g.type === "quad") || gates[gates.length - 1] || {}).id;
  const gate = gates.find((g) => g.id === b.gid);
  const reps = (b.scope === "all" ? S.reps : [curRep()]).filter((r) => r && groupSamples(r, b.group).length);
  const cr = curRep(); const orderReps = reps.includes(cr) ? [cr, ...reps.filter((r) => r !== cr)] : reps;
  const conds = []; for (const r of orderReps) for (const s of groupSamples(r, b.group)) if (!conds.includes(s.name)) conds.push(s.name);
  const shown = conds.filter((c) => !b.exclude[b.group + "|" + c]);
  let series = [];
  if (gate && gate.type === "quad") {
    const regs = b.regions.filter((r) => REGIONS.includes(r)); if (!regs.length) b.regions = ["LR", "UR"];
    series = b.sum ? [{ key: "sum", label: b.sumLabel || "합계", color: S.sumColor, parts: b.regions.map((r) => gate.id + "." + r) }] : b.regions.map((r) => ({ key: gate.id + "." + r, label: regionName(gate.id, r), color: S.regionColors[r], parts: [gate.id + "." + r], reg: r }));
    if (b.layout === "stacked" && !b.sum) series.sort((a, c) => ["LL", "LR", "UR", "UL"].indexOf(a.reg) - ["LL", "LR", "UR", "UL"].indexOf(c.reg));
  } else if (gate && gate.type === "rangeset") {
    let mem = (b.members || []).filter((id) => gate.members.includes(id)); if (!mem.length) { mem = gate.members.filter((id) => ["G1", "S", "G2M"].includes(id)); if (!mem.length) mem = gate.members.slice(); b.members = mem; }
    mem = gate.members.filter((id) => mem.includes(id));
    series = b.sum ? [{ key: "sum", label: b.sumLabel || "합계", color: S.sumColor, parts: mem }] : mem.map((id) => ({ key: id, label: S.names[id] || id, color: rangeColor(id), parts: [id] }));
  } else if (gate) series = [{ key: gate.id, label: S.names[gate.id] || gate.id, color: gateColor(gate.id), parts: [gate.id] }];
  const value = (s, parts) => { let tot = 0; for (const k of parts) { const st = popStats(s, k); if (!st) return null; tot += b.basis === "total" ? st.pTotal : st.pParent; } return tot; };
  const cells = shown.map((c) => ({ cond: c, series: series.map((se) => { const per = reps.map((r) => { const s = groupSamples(r, b.group).find((x) => x.name === c); return s ? { rep: r.name, v: value(s, se.parts) } : { rep: r.name, v: null }; }); return { ...se, per, ...summ(per.map((p) => p.v)) }; }) }));
  if (!shown.includes(b.ref)) b.ref = shown.find((c) => /^(\+\+|ctrl|control|vehicle|dmso)$/i.test(c)) || shown[0];
  const refCell = cells.find((c) => c.cond === b.ref);
  for (const c of cells) for (const [i, se] of c.series.entries()) se.p = refCell && c.cond !== b.ref ? welchP(se.vals, refCell.series[i].vals) : NaN;
  let parentLabel = "parent"; if (gate) parentLabel = popLabel(gate.parent);
  return { b, gate, reps, conds, shown, series, cells, parentLabel, maxN: Math.max(0, ...cells.flatMap((c) => c.series.map((s) => s.n))) };
}

const REP_SHAPES = ["circle", "square", "triangle", "diamond", "circle-open"];
function marker(shape, x, y, r) {
  if (shape === "square") return `<rect x="${x - r * 0.85}" y="${y - r * 0.85}" width="${r * 1.7}" height="${r * 1.7}"/>`;
  if (shape === "triangle") return `<path d="M${x} ${y - r * 1.1}L${x + r} ${y + r * 0.75}L${x - r} ${y + r * 0.75}Z"/>`;
  if (shape === "diamond") return `<path d="M${x} ${y - r * 1.15}L${x + r} ${y}L${x} ${y + r * 1.15}L${x - r} ${y}Z"/>`;
  return `<circle cx="${x}" cy="${y}" r="${r}"/>`;
}
/*BARSVG*/
function legendRow(b, re) {
  const opts = [["inTL", "그래프 안 · 왼쪽 위"], ["inTR", "그래프 안 · 오른쪽 위"], ["outBR", "바깥 · 오른쪽 아래"], ["outTR", "바깥 · 오른쪽 위"], ["top", "그래프 위 · 가로"], ["none", "숨기기"]];
  if (b.legendPos === "custom") opts.unshift(["custom", "직접 지정 (드래그한 위치)"]);
  const sel = h("select", { class: "sel-input", id: "barLegend" }, ...opts.map(([v, l]) => h("option", { value: v, selected: (b.legendPos || "inTL") === v ? "" : null }, l)));
  sel.addEventListener("change", () => { b.legendPos = sel.value; re(); });
  return h("div", { class: "f-row" }, h("span", { class: "note" }, "범례"), sel, h("span", { class: "note" }, "그래프에서 범례를 끌어 옮길 수도 있습니다"));
}
function drawBar(M, W, H, opts = {}) {
  const b = M.b;
  if (b.style === "prism") {
    return prismSVG(M, W, H, { fs: opts.fs || (opts.big ? 13 : 11.5), lw: opts.lw, mm: opts.mm, fill: b.pfill, sig: b.psig, err: b.perr, points: b.ppts });
  }
  return barSVG(M, W, H, opts);
}
function bindBarTip(container, M) {
  const tip = $("#tip"); const svg = container.querySelector("svg");
  svg.addEventListener("mousemove", (e) => {
    const t = e.target.closest("[data-c]"); if (!t) { tip.hidden = true; return; }
    const c = M.cells[+t.dataset.c]; const si = +t.dataset.s; const list = si < 0 ? c.series : [c.series[si]];
    tip.innerHTML = `<b>${esc(c.cond)}</b>` + list.map((se) => `<div>${esc(se.label)} · 평균 ${fmtPct(se.mean, 2)}%${se.n > 1 ? ` · ${M.b.err.toUpperCase()} ${fmtPct(M.b.err === "sem" ? se.sem : se.sd, 2)}` : ""} · n=${se.n}${isFinite(se.p) ? ` · p=${se.p < 0.001 ? se.p.toExponential(1) : se.p.toFixed(3)}` : ""}</div><div style="opacity:.75">${se.per.map((p) => `${esc(p.rep)} ${p.v == null ? "–" : p.v.toFixed(2)}`).join(" / ")}</div>`).join("");
    tip.hidden = false; tip.style.left = Math.min(innerWidth - 270, e.clientX + 14) + "px"; tip.style.top = e.clientY + 14 + "px";
  });
  svg.addEventListener("mouseleave", () => (tip.hidden = true));
  const leg = svg.querySelector("[data-legend]");
  if (leg) {
    leg.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(leg.getAttribute("transform")); if (!m) return;
      const ctm = svg.getScreenCTM(); if (!ctm) return; const k = 1 / ctm.a;
      const start = { x: e.clientX, y: e.clientY, lx: +m[1], ly: +m[2] }; let moved = false;
      leg.setPointerCapture(e.pointerId); tip.hidden = true;
      const move = (ev) => {
        const dx = (ev.clientX - start.x) * k, dy = (ev.clientY - start.y) * k;
        if (!moved && Math.hypot(dx, dy) < 3) return; moved = true;
        leg.setAttribute("transform", `translate(${start.lx + dx} ${start.ly + dy})`);
      };
      const up = (ev) => {
        leg.removeEventListener("pointermove", move); leg.removeEventListener("pointerup", up); leg.removeEventListener("pointercancel", up);
        if (!moved) return;
        const [pl, pt, pw, ph] = (svg.getAttribute("data-plot") || "0,0,1,1").split(",").map(Number);
        const mm = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(leg.getAttribute("transform"));
        S.bar.legendPos = "custom"; S.bar.legendXY = [(+mm[1] - pl) / pw, (+mm[2] - pt) / ph];
        saveProps(); const box = $("#rBar"); box._sig = null; renderBar(); if (BAR_MODAL) renderBarModal();
        toast("범례 위치를 저장했습니다 — 그림 저장에도 같은 위치가 쓰입니다");
      };
      leg.addEventListener("pointermove", move); leg.addEventListener("pointerup", up); leg.addEventListener("pointercancel", up);
    });
  }
  svg.addEventListener("dblclick", (e) => {
    const t = e.target.closest("[data-rename]"); if (!t) return;
    const [kind, a, b2] = t.dataset.rename.split("|");
    const cur = kind === "reg" ? regionName(a, b2) : kind === "sum" ? S.bar.sumLabel : kind === "gate" ? S.names[a] || a : M.shown[+a];
    tip.hidden = true;
    floatingInput(e.clientX - 30, e.clientY - 16, 180, cur, (v) => {
      if (kind === "cond") return renameCondition(M.b.group, cur, v);
      pushUndo();
      if (kind === "reg") (S.quadNames[a] = S.quadNames[a] || {})[b2] = v; else if (kind === "sum") S.bar.sumLabel = v; else S.names[a] = v;
      fullRender(); if (BAR_MODAL) renderBarModal(); toast(`이름을 ‘${v}’(으)로 바꿨습니다`, "되돌리기", undo);
    });
  });
}
function renderBar() {
  const box = $("#rBar"); if (box.hidden) return;
  if (S.ui.plotKind === "hist") return renderHistPanel();
  const M = barModel(); const b = M.b;
  if (!box._built || box._sig !== barCtlSig(M)) buildBarControls(box, M);
  const chart = box.querySelector(".chart-box"); const W = Math.max(300, chart.clientWidth - 12) || 360;
  chart.innerHTML = M.cells.length && M.series.length ? drawBar(M, W, 320) : `<div class="note" style="padding:30px 10px;text-align:center">표시할 데이터가 없습니다 — 사분면 gate와 조건을 확인하세요</div>`;
  if (M.cells.length && M.series.length) bindBarTip(chart, M);
  const tbl = box.querySelector(".bar-table"); tbl.innerHTML = "";
  const t = h("table", { class: "st" }, h("thead", null, h("tr", null, h("th", null, "조건"), h("th", null, "항목"), h("th", { class: "r" }, "평균 %"), h("th", { class: "r" }, b.err.toUpperCase()), h("th", { class: "r" }, "n"), h("th", { class: "r" }, "p"), ...M.reps.map((r) => h("th", { class: "r" }, r.name)))));
  const tb = h("tbody");
  for (const c of M.cells) for (const se of c.series) tb.append(h("tr", null, h("td", null, c.cond), h("td", null, se.label), h("td", { class: "r num" }, fmtPct(se.mean, 2)), h("td", { class: "r num" }, se.n > 1 ? fmtPct(b.err === "sem" ? se.sem : se.sd, 2) : "–"), h("td", { class: "r num" }, String(se.n)), h("td", { class: "r num" }, isFinite(se.p) ? (se.p < 0.001 ? se.p.toExponential(1) : se.p.toFixed(3)) : c.cond === b.ref ? "기준" : "–"), ...se.per.map((p) => h("td", { class: "r num" }, p.v == null ? "–" : p.v.toFixed(2)))));
  t.append(tb); tbl.append(t);
  const note = box.querySelector(".bar-note");
  note.textContent = M.maxN <= 1 ? "n=1: 반복이 1개라 오차막대와 통계가 표시되지 않습니다. 반복 탭을 추가하고 ‘모든 반복’을 선택하세요." : `평균 ± ${b.err.toUpperCase()}, 점 = 각 반복의 값. 사분면을 드래그하면 즉시 다시 계산됩니다. 범례·조건 이름은 더블클릭해서 바꿀 수 있습니다.`;
}
function barCtlSig(M) { return JSON.stringify(["bar", allGroups(), gateChoices().map((g) => g.id + g.type + (S.names[g.id] || "")), M.conds, S.reps.length, S.bar, S.quadNames, S.style.numbering, S.regionColors, S.rangeColors, S.sumColor, !!DL]); }
function buildBarControls(box, M) {
  const b = S.bar; box.innerHTML = ""; box._built = true; box._sig = barCtlSig(M);
  const re = () => { saveProps(); box._sig = null; renderBar(); if (BAR_MODAL) renderBarModal(); };
  const seg = (opts, key, disabled) => h("div", { class: "seg" }, ...opts.map(([v, l]) => { const bt = h("button", { class: b[key] === v ? "on" : "", disabled: disabled ? "" : null }, l); bt.addEventListener("click", () => { b[key] = v; re(); }); return bt; }));
  const nReps = S.reps.filter((r) => r.sampleIds.length).length;
  box.append(plotKindSeg(box));
  box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "데이터"), seg([["rep", `현재 반복 (${curRep() ? curRep().name : ""})`], ["all", `모든 반복 (${nReps})`]], "scope")));
  const groups = allGroups();
  const gsel = h("select", { class: "sel-input", id: "barGroup" }, ...groups.map((g) => h("option", { value: g, selected: g === b.group ? "" : null }, g))); gsel.addEventListener("change", () => { b.group = gsel.value; re(); });
  const gates = gateChoices();
  const psel = h("select", { class: "sel-input", id: "barGate", style: { flex: 1 } }, ...gates.map((g) => h("option", { value: g.id, selected: g.id === b.gid ? "" : null }, g.type === "rangeset" ? `세포주기 구간 · ${g.members.map((id) => S.names[id] || id).join(" / ")} (${popLabel(g.parent)} 기준)` : g.type === "quad" ? `${S.names[g.id] || g.id} — 사분면 (${popLabel(g.parent)} 기준)` : `${S.names[g.id] || g.id} (${popLabel(g.parent)} 기준)`)));
  psel.addEventListener("change", () => { b.gid = psel.value; re(); });
  box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "그룹 · 지표"), h("div", { class: "f-row", style: { flexWrap: "nowrap" } }, gsel, psel)));
  if (M.gate && M.gate.type === "rangeset") {
    const pills = h("div", { class: "pill-list" });
    for (const id of M.gate.members) { const on = (b.members || []).includes(id); const p = h("button", { class: "pill" + (on ? " on" : "") }, h("span", { class: "sw", style: { background: rangeColor(id) } }), S.names[id] || id); p.addEventListener("click", () => { const cur = b.members || []; b.members = on ? cur.filter((x) => x !== id) : [...cur, id]; if (!b.members.length) b.members = [id]; re(); }); pills.append(p); }
    const colors = h("div", { class: "f-row", style: { gap: "6px" } }, ...M.gate.members.map((id) => { const inp = h("input", { type: "color", value: rangeColor(id), title: S.names[id] || id }); inp.addEventListener("change", () => { S.rangeColors[id] = inp.value; re(); }); return inp; }));
    const sum = h("label", { class: "check" }, h("input", { type: "checkbox", id: "barSumR", checked: b.sum ? "" : null }), "선택한 구간을 합계 막대로");
    sum.querySelector("input").addEventListener("change", (e) => { b.sum = e.target.checked; re(); });
    box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "구간 (히스토그램 gate)"), pills, colors, sum));
    box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "막대 배치"), seg([["grouped", "나란히"], ["stacked", "누적"]], "layout", b.sum)));
  }
  if (M.gate && M.gate.type === "quad") {
    const pills = h("div", { class: "pill-list" });
    for (const r of ["LL", "LR", "UR", "UL"]) { const on = b.regions.includes(r); const p = h("button", { class: "pill" + (on ? " on" : "") }, h("span", { class: "sw", style: { background: S.regionColors[r] } }), regionName(M.gate.id, r)); p.addEventListener("click", () => { b.regions = on ? b.regions.filter((x) => x !== r) : [...b.regions, r]; if (!b.regions.length) b.regions = [r]; re(); }); pills.append(p); }
    const sum = h("label", { class: "check" }, h("input", { type: "checkbox", id: "barSum", checked: b.sum ? "" : null }), "선택한 영역을 합계 막대로");
    sum.querySelector("input").addEventListener("change", (e) => { b.sum = e.target.checked; re(); });
    const sumLabel = h("input", { class: "txt-input", id: "barSumLabel", value: b.sumLabel, style: { width: "150px" } }); sumLabel.addEventListener("change", () => { b.sumLabel = sumLabel.value; re(); });
    box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "사분면 영역"), pills, h("div", { class: "f-row" }, sum, b.sum ? sumLabel : null)));
    box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "막대 배치"), seg([["grouped", "나란히"], ["stacked", "누적"]], "layout", b.sum)));
  }
  box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "그림 스타일"), seg([["prism", "Prism"], ["classic", "기존"]], "style")));
  if (b.style === "prism") {
    box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "Prism 옵션"),
      h("div", { class: "f-row" }, seg([["color", "색 채움"], ["gray", "흑백"], ["outline", "테두리"]], "pfill"), seg([["stars", "별표"], ["bracket", "브래킷"]], "psig")),
      h("div", { class: "f-row" }, seg([["up", "오차 위만"], ["both", "오차 양쪽"]], "perr"), seg([["filled", "채운 원"], ["open", "빈 원"]], "ppts")),
      legendRow(b, re),
      b.layout === "stacked" && !b.sum ? h("span", { class: "note" }, "누적 막대: 유의성은 각 조각 오른쪽에 별표로 표시되고, 점은 반복별 누적값 위치에 찍힙니다") : null));
  }
  const dots = h("label", { class: "check" }, h("input", { type: "checkbox", id: "barDots", checked: b.dots ? "" : null }), "반복 점"); dots.querySelector("input").addEventListener("change", (e) => { b.dots = e.target.checked; re(); });
  const stats = h("label", { class: "check" }, h("input", { type: "checkbox", id: "barStats", checked: b.stats ? "" : null }), "통계 표시"); stats.querySelector("input").addEventListener("change", (e) => { b.stats = e.target.checked; re(); });
  const ref = h("select", { class: "sel-input", id: "barRef", title: "통계 기준 조건" }, ...M.shown.map((c) => h("option", { value: c, selected: c === b.ref ? "" : null }, `기준: ${c}`))); ref.addEventListener("change", () => { b.ref = ref.value; re(); });
  box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "오차 · 표시"), h("div", { class: "f-row" }, seg([["sd", "SD"], ["sem", "SEM"]], "err"), seg([["parent", "%Parent"], ["total", "%Total"]], "basis")), h("div", { class: "f-row" }, dots, stats, ref)));
  const cp = h("div", { class: "pill-list" });
  for (const c of M.conds) { const k = b.group + "|" + c; const on = !b.exclude[k]; const p = h("button", { class: "pill" + (on ? " on" : "") }, c); p.addEventListener("click", () => { if (on) b.exclude[k] = true; else delete b.exclude[k]; re(); }); cp.append(p); }
  box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "포함할 조건"), cp));
  const big = h("button", { class: "btn sm" }); big.append(ic("expand"), "크게 보기"); big.addEventListener("click", openBarModal);
  const figB = h("button", { class: "btn sm primary", disabled: DL ? null : "", title: DL ? "" : "이 보기에서는 파일 저장을 사용할 수 없습니다" }, "그림 저장 (mm·pt 지정)…"); figB.addEventListener("click", () => openExport({ type: "bar" }));
  const csvB = h("button", { class: "btn sm", disabled: DL ? null : "" }, "CSV"); csvB.addEventListener("click", () => saveBarCSV());
  box.append(h("div", { class: "chart-box" }), h("div", { class: "f-row" }, big, h("div", { class: "spacer" }), figB, csvB), h("div", { class: "note bar-note" }), h("div", { class: "tbl-wrap bar-table" }));
}
let BAR_MODAL = null;
function openBarModal() {
  const back = h("div", { class: "modal-back" }); const modal = h("div", { class: "modal", role: "dialog", "aria-label": "Plot" });
  const close = h("button", { class: "btn sm" }, "닫기"); close.addEventListener("click", closeBarModal);
  modal.append(h("div", { class: "f-row" }, h("b", { style: { fontSize: "15px" } }, S.ui.plotKind === "hist" ? "Histogram" : "Bar plot"), h("span", { class: "p-sub" }, "gate를 조정하면 이 창도 함께 갱신됩니다"), h("div", { class: "spacer" }), close), h("div", { class: "chart-box" }));
  back.append(modal); back.addEventListener("pointerdown", (e) => { if (e.target === back) closeBarModal(); });
  document.body.append(back); BAR_MODAL = back; renderBarModal();
}
function closeBarModal() { if (BAR_MODAL) { BAR_MODAL.remove(); BAR_MODAL = null; $("#tip").hidden = true; } }
function renderBarModal() { if (!BAR_MODAL) return; if (S.ui.plotKind === "hist") { const M = histModel(); const box = BAR_MODAL.querySelector(".chart-box"); const W = Math.max(320, box.clientWidth - 12); box.innerHTML = histSVG(M, W, Math.min(Math.max(360, innerHeight - 200), Math.max(360, histChartH(M, W) * 1.25)), { big: true }); bindHist(box, M, (live) => { if (!live) { renderBarModal(); const b = $("#rBar"); b._sig = null; renderBar(); } }); return; } const M = barModel(); const box = BAR_MODAL.querySelector(".chart-box"); const W = Math.max(320, box.clientWidth - 12); box.innerHTML = drawBar(M, W, Math.min(560, Math.max(360, innerHeight - 200)), { big: true }); bindBarTip(box, M); }

/* ---------------- downloads ---------------- */
let DL = null;
async function saveFile(filename, data) {
  if (!DL) { toast("이 보기에서는 파일 저장을 사용할 수 없습니다"); return; }
  try { await DL.save({ filename, data }); toast(`${filename} 저장을 요청했습니다`); }
  catch (e) { if (e && e.code === "declined") return; if (e && e.code === "rate_limited") toast("다른 저장 확인창이 열려 있습니다 — 잠시 후 다시 시도하세요"); else toast(`저장하지 못했습니다 (${(e && e.code) || "unknown"})`); }
}
const stamp = () => new Date().toISOString().slice(0, 10);
function csvCell(v) { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function saveBarCSV() {
  const M = barModel(); const rows = [["group", "condition", "series", "replicate", "value_percent", "basis"]];
  for (const c of M.cells) for (const se of c.series) { for (const p of se.per) rows.push([M.b.group, c.cond, se.label, p.rep, p.v == null ? "" : p.v.toFixed(4), M.b.basis]); rows.push([M.b.group, c.cond, se.label, "mean", se.mean.toFixed(4), M.b.basis]); rows.push([M.b.group, c.cond, se.label, M.b.err, (M.b.err === "sem" ? se.sem : se.sd).toFixed(4), M.b.basis]); }
  saveFile(`barplot_${M.b.group}_${stamp()}.csv`, rows.map((r) => r.map(csvCell).join(",")).join("\n"));
}
function saveStatsCSV() {
  const rows = [["replicate", "group", "sample", "file", "population", "parent", "events", "pct_parent", "pct_total"]];
  for (const r of S.reps) for (const s of repSamples(r)) { const tree = effTree(s); rows.push([r.name, s.group, s.name, s.fileName, "All events", "", s.n, "", 100]); for (const { node } of treeOrder(tree)) for (const k of nodeChildrenKeys(tree, node.id)) { const st = popStats(s, k); rows.push([r.name, s.group, s.name, s.fileName, popLabel(k), popLabel(node.parent), st ? st.count : "", st ? st.pParent.toFixed(3) : "", st ? st.pTotal.toFixed(3) : ""]); } }
  saveFile(`anchorgating_stats_${stamp()}.csv`, rows.map((r) => r.map(csvCell).join(",")).join("\n"));
}
function templateJSON() {
  return JSON.stringify({
    app: "Anchorgating", version: 1, saved: new Date().toISOString(), names: S.names, quadNames: S.quadNames, axes: S.axes, numbering: S.style.numbering,
    reps: S.reps.map((r) => ({ name: r.name, groups: repGroups(r).map((g) => ({ group: g, anchor: r.anchors[g] ? S.samples.get(r.anchors[g]).name : null, samples: groupSamples(r, g).map((s) => ({ name: s.name, follow: s.follow, tree: s.tree, overrides: s.overrides })) })) })),
    clipboard: S.clipboard,
  }, null, 1);
}
function applyTemplate(o) {
  if (!o || o.app !== "Anchorgating") throw new Error("Anchorgating 템플릿 파일이 아닙니다");
  pushUndo(); let matched = 0;
  Object.assign(S.names, o.names || {}); Object.assign(S.quadNames, o.quadNames || {}); if (o.axes) Object.assign(S.axes, o.axes);
  for (const k of Object.keys(S.names)) { const m = /^P(\d+)$/.exec(k); if (m) S.gateSeq = Math.max(S.gateSeq, +m[1]); const q = /^Q(\d+)$/.exec(k); if (q) S.quadSeq = Math.max(S.quadSeq, +q[1]); }
  o.reps.forEach((tr, i) => {
    const rep = S.reps.find((r) => r.name === tr.name) || S.reps[i]; if (!rep) return;
    for (const tg of tr.groups) {
      const ss = groupSamples(rep, tg.group); if (!ss.length) continue;
      for (const ts of tg.samples) { const s = ss.find((x) => x.name === ts.name); if (!s) continue; s.tree = clone(ts.tree); s.overrides = clone(ts.overrides || {}); s.follow = ts.follow !== false; matched++; }
      const a = tg.anchor && ss.find((x) => x.name === tg.anchor); rep.anchors[tg.group] = a ? a.id : null;
    }
  });
  if (o.clipboard) S.clipboard = o.clipboard;
  S.axesVer++; markAllDirty(); fullRender();
  toast(`템플릿을 적용했습니다 — 이름이 일치한 샘플 ${matched}개`, "되돌리기", undo);
}
function exportMenu(btn) {
  const s = curSample(); const dis = !DL; const t = dis ? "이 보기에서는 파일 저장을 사용할 수 없습니다" : null;
  openMenu(btn, [
    { head: "데이터" },
    { label: "통계 CSV (모든 반복·모든 population)", disabled: dis, title: t, onClick: saveStatsCSV },
    { label: "Bar plot 그림 저장 (PNG·SVG, 크기 지정)…", disabled: dis, title: t, onClick: () => openExport({ type: "bar" }) },
    { label: "Bar plot 데이터 CSV", disabled: dis, title: t, onClick: saveBarCSV },
    { label: "Histogram 그림 저장 (PNG·SVG, 크기 지정)…", disabled: dis, title: t, onClick: () => openExport({ type: "hist" }) },
    { label: "Histogram 데이터 CSV", disabled: dis, title: t, onClick: saveHistCSV },
    { label: s ? `${s.name} gating 플롯 그림 저장…` : "gating 플롯 그림 저장…", disabled: dis || !s, title: t, onClick: () => openExport({ type: "chain", s }) },
    { sep: true }, { head: "Gate 템플릿" },
    { label: "Gate 템플릿 저장 (JSON)", disabled: dis, title: t, onClick: () => saveFile(`anchorgating_template_${stamp()}.json`, templateJSON()) },
    { label: "Gate 템플릿 불러오기…", onClick: () => $("#tplInput").click() },
  ]);
}
