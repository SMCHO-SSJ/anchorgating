/* ============================================================
   UI: tabs, samples, tree, center views, popovers, style, stats
   ============================================================ */
let TOAST_T = 0;
function toast(msg, actionLabel, action) {
  const t = $("#toast"); t.innerHTML = ""; t.append(h("span", null, msg));
  if (actionLabel) t.append(h("button", { onclick: () => { t.hidden = true; action(); } }, actionLabel));
  t.hidden = false; clearTimeout(TOAST_T); TOAST_T = setTimeout(() => (t.hidden = true), actionLabel ? 6500 : 3200);
}
let POP = null;
function closePop() { if (POP) { POP.remove(); POP = null; } }
function placeFloating(el, anchor) {
  document.body.append(el);
  const r = anchor.getBoundingClientRect(); const pr = el.getBoundingClientRect();
  let x = r.left, y = r.bottom + 6;
  if (x + pr.width > innerWidth - 12) x = innerWidth - pr.width - 12;
  if (y + pr.height > innerHeight - 12) y = Math.max(12, r.top - pr.height - 6);
  el.style.left = Math.max(12, x) + "px"; el.style.top = Math.max(12, y) + "px";
}
function openMenu(anchor, items) {
  closePop();
  const m = h("div", { class: "menu", role: "menu" });
  for (const it of items) {
    if (it.sep) { m.append(h("div", { class: "sep" })); continue; }
    if (it.head) { m.append(h("div", { class: "mh" }, it.head)); continue; }
    const b = h("button", { role: "menuitem", disabled: it.disabled, title: it.title || null, onclick: () => { closePop(); it.onClick(); } }, it.label);
    if (it.disabled) b.style.opacity = 0.45;
    m.append(b);
  }
  POP = m; placeFloating(m, anchor);
}
document.addEventListener("pointerdown", (e) => { if (POP && !POP.contains(e.target) && !e.target.closest("[data-popper]")) closePop(); }, true);
function setTool(t) {
  S.ui.tool = S.ui.tool === t ? null : t; if (!t) S.ui.tool = null;
  DRAW = null;
  $$("#tools .tool").forEach((b) => b.classList.toggle("on", b.dataset.tool === S.ui.tool));
  renderContext(); for (const v of VIEWS) drawOverlay(v.ctxO, v, v.dpr);
}
function inlineEdit(el, value, onDone) {
  const inp = h("input", { class: "inline-edit", value });
  el.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const finish = (ok) => { if (done) return; done = true; const v = inp.value.trim(); if (ok && v && v !== value) onDone(v); else fullRender(); };
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); e.stopPropagation(); });
  inp.addEventListener("blur", () => finish(true));
}

/* ---------------- replicate tabs ---------------- */
function renderRepTabs() {
  const nav = $("#repTabs"); nav.innerHTML = "";
  for (const r of S.reps) {
    const b = h("button", { class: "rep-tab" + (r.id === S.ui.repId ? " on" : ""), title: "더블클릭: 이름 변경" },
      h("span", { class: "nm" }, r.name), h("span", { class: "cnt num" }, String(r.sampleIds.length)));
    const x = h("span", { class: "x", title: "반복 삭제", role: "button" }); x.append(ic("x"));
    x.addEventListener("click", (e) => { e.stopPropagation(); deleteRep(r); });
    if (S.reps.length > 1) b.append(x);
    b.addEventListener("click", () => { if (S.ui.repId !== r.id) switchRep(r.id); });
    b.addEventListener("dblclick", () => inlineEdit(b.querySelector(".nm"), r.name, (v) => { pushUndo(); r.name = v; fullRender(); }));
    nav.append(b);
  }
  const add = h("button", { class: "rep-add", title: "반복 추가 (각 반복은 gate를 따로 조정)" }); add.append(ic("plus"), "반복 추가");
  add.addEventListener("click", () => { const r = newRep(); switchRep(r.id); toast(`${r.name}을(를) 추가했습니다 — 이 탭에 FCS 파일을 불러오세요`); });
  nav.append(add);
}
function switchRep(id) {
  S.ui.repId = id; const rep = curRep(); const ss = repSamples(rep);
  const pick = ss.find((s) => s.name === (curSample() || {}).name && s.group === (curSample() || {}).group) || ss[0];
  S.ui.cur = pick ? pick.id : null; S.ui.sel = new Set(pick ? [pick.id] : []);
  if (S.bar.scope === "rep") S.bar.group = null;
  fullRender();
}
function deleteRep(r) {
  const i = S.reps.indexOf(r); const samples = repSamples(r);
  S.reps.splice(i, 1); for (const s of samples) S.samples.delete(s.id);
  if (S.ui.repId === r.id) switchRep(S.reps[Math.max(0, i - 1)].id); else fullRender();
  toast(`${r.name}을(를) 삭제했습니다`, "되돌리기", () => { S.reps.splice(i, 0, r); for (const s of samples) S.samples.set(s.id, s); switchRep(r.id); });
}

/* ---------------- samples ---------------- */
function renderSamples() {
  const list = $("#sampleList"); list.innerHTML = ""; const rep = curRep();
  const ss = repSamples(rep);
  $("#sampleCount").textContent = ss.length ? `${ss.length}개 · ${rep.name}` : "";
  if (!ss.length) {
    list.append(h("div", { class: "empty", style: { padding: "22px 12px" } }, h("b", null, "샘플이 없습니다"), h("span", null, "FCS 파일을 이 창에 끌어다 놓거나 ‘FCS 불러오기’를 누르세요.")));
    return;
  }
  const order = ss.map((s) => s.id);
  for (const g of repGroups(rep)) {
    const gs = groupSamples(rep, g); const aid = rep.anchors[g]; const a = aid ? S.samples.get(aid) : null;
    const nm = h("span", { class: "grp-name", title: "더블클릭: 그룹 이름 변경" }, g);
    nm.addEventListener("dblclick", () => inlineEdit(nm, g, (v) => renameGroup(rep, g, v)));
    const head = h("div", { class: "grp-head" }, nm, h("span", { class: "p-sub" }, a ? `· 앵커 ${a.name}` : "· 앵커 없음"));
    head.addEventListener("dragover", (e) => { if (!DRAG_SID) return; e.preventDefault(); head.classList.add("drop-into"); });
    head.addEventListener("dragleave", () => head.classList.remove("drop-into"));
    head.addEventListener("drop", (e) => { if (!DRAG_SID) return; e.preventDefault(); e.stopPropagation(); const id = DRAG_SID; DRAG_SID = null; clearDropMarks(); const first = gs[0]; if (first && first.id !== id) reorderSample(id, first.id, false); });
    const box = h("div", { class: "grp" }, head);
    for (const s of gs) {
      const anc = rep.anchors[g] === s.id;
      const row = h("div", { class: "srow" + (S.ui.sel.has(s.id) ? " sel" : "") + (S.ui.cur === s.id ? " cur" : ""), "data-sid": s.id, draggable: "true", title: "드래그: 순서 변경 · 이름 더블클릭: 이름 변경" });
      const ab = h("button", { class: "anchor-btn" + (anc ? " on" : ""), title: anc ? "앵커 해제 (각 샘플이 현재 gate를 독립적으로 유지)" : "이 샘플을 앵커로 고정: 같은 그룹의 모든 샘플이 이 gate를 따라 움직임", "aria-pressed": anc ? "true" : "false" });
      ab.append(ic("anchor"));
      ab.addEventListener("click", (e) => { e.stopPropagation(); doToggleAnchor(s); });
      const name = h("span", { class: "s-name", title: `${s.fileName}` }, s.name);
      name.addEventListener("dblclick", (e) => { e.stopPropagation(); e.preventDefault(); row.draggable = false; inlineEdit(name, s.name, (v) => renameSampleUI(s, v)); });
      const ev = h("span", { class: "s-ev num" }, compactNum(s.n));
      let lb = h("span");
      if (a && !anc) {
        const nOv = Object.keys(s.overrides).length;
        lb = h("button", { class: "link-btn " + (s.follow ? (nOv ? "ovr" : "follow") : ""), title: s.follow ? (nOv ? `앵커를 따르는 중 · 개별 조정 ${nOv}개 (클릭: 독립으로 전환)` : "앵커를 따르는 중 (클릭: 독립으로 전환)") : "독립 gate · 앵커 변경을 따르지 않음 (클릭: 다시 따르기)" });
        lb.append(ic(s.follow ? "link" : "unlink"));
        if (s.follow && nOv) lb.append(h("span", { class: "badge" }, String(nOv)));
        lb.addEventListener("click", (e) => { e.stopPropagation(); pushUndo(); setFollow(s, !s.follow); fullRender(); toast(s.follow ? `${s.name}: 앵커 ${a.name}를 다시 따릅니다` : `${s.name}: 독립 gate로 전환했습니다`); });
      }
      const more = h("button", { class: "link-btn", title: "샘플 메뉴", "data-popper": "1" }); more.append(ic("dots"));
      more.addEventListener("click", (e) => { e.stopPropagation(); sampleMenu(more, s); });
      row.append(ab, name, ev, lb, more);
      row.addEventListener("click", (e) => {
        if (e.metaKey || e.ctrlKey) { S.ui.sel.has(s.id) ? S.ui.sel.delete(s.id) : S.ui.sel.add(s.id); if (!S.ui.sel.size) S.ui.sel.add(s.id); }
        else if (e.shiftKey && S.ui.cur) { const i0 = order.indexOf(S.ui.cur), i1 = order.indexOf(s.id); const [a0, a1] = i0 < i1 ? [i0, i1] : [i1, i0]; S.ui.sel = new Set(order.slice(a0, a1 + 1)); }
        else S.ui.sel = new Set([s.id]);
        const changed = S.ui.cur !== s.id; S.ui.cur = s.id;
        $$("#sampleList .srow").forEach((r) => { r.classList.toggle("sel", S.ui.sel.has(r.dataset.sid)); r.classList.toggle("cur", r.dataset.sid === S.ui.cur); });
        if (changed) { renderTree(); renderContext(); renderCenter(); renderRight(); }
      });
      row.addEventListener("dragstart", (e) => { DRAG_SID = s.id; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", s.name); } catch (err) { /* ignore */ } row.classList.add("dragging"); });
      row.addEventListener("dragend", () => { DRAG_SID = null; clearDropMarks(); });
      row.addEventListener("dragover", (e) => { if (!DRAG_SID || DRAG_SID === s.id) return; e.preventDefault(); e.stopPropagation(); const r = row.getBoundingClientRect(); const after = e.clientY > r.top + r.height / 2; row.classList.toggle("drop-after", after); row.classList.toggle("drop-before", !after); });
      row.addEventListener("dragleave", () => row.classList.remove("drop-before", "drop-after"));
      row.addEventListener("drop", (e) => { if (!DRAG_SID) return; e.preventDefault(); e.stopPropagation(); const after = row.classList.contains("drop-after"); const id = DRAG_SID; DRAG_SID = null; clearDropMarks(); reorderSample(id, s.id, after); });
      row.addEventListener("contextmenu", (e) => { e.preventDefault(); sampleMenu(row, s); });
      box.append(row);
    }
    list.append(box);
  }
  updateUndoBtns();
}
function doToggleAnchor(s) {
  pushUndo(); const res = toggleAnchor(s);
  if (res.released) toast(`앵커를 해제했습니다 — ${s.group}의 샘플들은 현재 gate를 각자 유지합니다`);
  else toast(`${s.name}을(를) 앵커로 고정 — ${s.group} 그룹의 ${res.count}개 샘플이 이 gate를 따릅니다`);
  S.ui.cur = s.id; S.ui.sel = new Set([s.id]); fullRender();
}
function renameGroup(rep, g, v) {
  pushUndo();
  const target = groupSamples(rep, v); if (target.length) { toast("같은 이름의 그룹이 이미 있습니다 — 샘플 메뉴의 ‘그룹 이동’을 사용하세요"); fullRender(); return; }
  for (const s of groupSamples(rep, g)) s.group = v;
  rep.anchors[v] = rep.anchors[g]; delete rep.anchors[g];
  if (S.bar.group === g) S.bar.group = v;
  fullRender();
}
function regroup(s, g) {
  const rep = repById(s.repId);
  if (rep.anchors[s.group] === s.id) toggleAnchor(s);
  else if (leader(s)) { s.tree = clone(effTree(s)).map((n) => { delete n._ov; return n; }); s.overrides = {}; }
  s.group = g;
  if (rep.anchors[g]) { s.follow = true; s.overrides = {}; }
  markDirty([s]);
}
function moveToGroup(s, g) { pushUndo(); regroup(s, g); fullRender(); }
let DRAG_SID = null;
function clearDropMarks() { $$("#sampleList .drop-before, #sampleList .drop-after, #sampleList .dragging, #sampleList .drop-into").forEach((r) => r.classList.remove("drop-before", "drop-after", "dragging", "drop-into")); }
function applyOrder(r, group, names) {
  const slots = []; r.sampleIds.forEach((id, i) => { const x = S.samples.get(id); if (x && x.group === group) slots.push(i); });
  const sorted = slots.map((i) => S.samples.get(r.sampleIds[i])).sort((a, b) => { const ia = names.indexOf(a.name), ib = names.indexOf(b.name); return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib); });
  slots.forEach((pos, k) => (r.sampleIds[pos] = sorted[k].id));
}
function reorderSample(id, targetId, after) {
  const s = S.samples.get(id), t = S.samples.get(targetId); if (!s || !t || s.repId !== t.repId || id === targetId) return;
  const rep = repById(s.repId); pushUndo();
  const moved = s.group !== t.group; if (moved) regroup(s, t.group);
  const ids = rep.sampleIds.filter((x) => x !== id); ids.splice(ids.indexOf(targetId) + (after ? 1 : 0), 0, id); rep.sampleIds = ids;
  const names = groupSamples(rep, t.group).map((x) => x.name); let n = 0;
  for (const r of S.reps) if (r !== rep && groupSamples(r, t.group).length) { applyOrder(r, t.group, names); n++; }
  fullRender();
  toast(`${moved ? `${s.name}을(를) ${t.group} 그룹으로 옮기고 ` : ""}순서를 바꿨습니다${n ? ` · 다른 반복 ${n}개에도 같은 순서 적용` : ""}`, "되돌리기", undo);
}
function migrateCond(g, old, v) { const k = g + "|" + old; if (S.bar.exclude[k]) { delete S.bar.exclude[k]; S.bar.exclude[g + "|" + v] = true; } if (S.bar.ref === old) S.bar.ref = v; }
function renameSampleUI(s, v) {
  const old = s.name; if (!v || v === old) { fullRender(); return; }
  pushUndo(); s.name = v;
  const others = [...S.samples.values()].filter((x) => x !== s && x.group === s.group && x.name === old && x.repId !== s.repId);
  if (!others.length) migrateCond(s.group, old, v);
  fullRender();
  if (others.length) toast(`‘${old}’ → ‘${v}’ · 다른 반복에도 ‘${old}’이(가) ${others.length}개 있습니다 (bar plot은 이름으로 묶임)`, "모든 반복에 적용", () => { pushUndo(); for (const x of others) x.name = v; migrateCond(s.group, old, v); fullRender(); });
  else toast(`이름을 ‘${v}’(으)로 바꿨습니다`, "되돌리기", undo);
}
function renameCondition(g, old, v) {
  pushUndo(); let n = 0; for (const x of S.samples.values()) if (x.group === g && x.name === old) { x.name = v; n++; }
  migrateCond(g, old, v); fullRender(); if (BAR_MODAL) renderBarModal();
  toast(`‘${old}’ → ‘${v}’ (${n}개 샘플, 모든 반복)`, "되돌리기", undo);
}
function startRenameSample(s) {
  const el = $(`#sampleList .srow[data-sid="${s.id}"] .s-name`);
  if (el) { el.closest(".srow").draggable = false; inlineEdit(el, s.name, (v) => renameSampleUI(s, v)); }
}
function sampleMenu(anchor, s) {
  const rep = repById(s.repId);
  const groups = repGroups(rep).filter((g) => g !== s.group);
  openMenu(anchor, [
    { head: s.name },
    { label: "이름 변경", onClick: () => startRenameSample(s) },
    { label: "이 샘플의 gate 복사", onClick: () => { S.ui.cur = s.id; doCopy(); } },
    { label: "여기에 붙여넣기", disabled: !S.clipboard, onClick: () => doPaste([s]) },
    { label: isAnchor(s) ? "앵커 해제" : "앵커로 고정", onClick: () => doToggleAnchor(s) },
    { sep: true }, { head: "그룹 이동" },
    ...groups.map((g) => ({ label: `→ ${g}`, onClick: () => moveToGroup(s, g) })),
    { label: "새 그룹 만들기…", onClick: () => { let k = 2; while (repGroups(rep).includes(`그룹 ${k}`)) k++; moveToGroup(s, `그룹 ${k}`); toast("새 그룹을 만들었습니다 — 그룹 이름을 더블클릭해 바꿀 수 있습니다"); } },
    { sep: true },
    { label: "샘플 삭제", onClick: () => { const idx = rep.sampleIds.indexOf(s.id); const anchorWas = rep.anchors[s.group] === s.id; removeSample(s); if (S.ui.cur === s.id) S.ui.cur = rep.sampleIds[0] || null; S.ui.sel = new Set(S.ui.cur ? [S.ui.cur] : []); fullRender(); toast(`${s.name}을(를) 삭제했습니다`, "되돌리기", () => { S.samples.set(s.id, s); rep.sampleIds.splice(idx, 0, s.id); if (anchorWas) rep.anchors[s.group] = s.id; markAllDirty(); fullRender(); }); } },
  ]);
}

/* ---------------- copy / paste ---------------- */
function doCopy() {
  const s = curSample(); if (!s) return;
  copyGates(s); const n = S.clipboard.tree.length;
  toast(`${s.name}의 gate ${n}개를 복사했습니다 — ‘붙여넣기’로 다른 샘플·그룹·반복에 적용`);
}
function doPaste(targets, label) {
  if (!S.clipboard) { toast("먼저 기준 샘플에서 ‘복사’를 누르세요"); return; }
  if (!targets.length) return;
  pushUndo(); const n = pasteTo(targets); fullRender();
  toast(`${S.clipboard.from}의 gate를 ${label || n + "개 샘플"}에 붙여넣었습니다`, "되돌리기", undo);
}
function pasteMenu(anchor) {
  const s = curSample(); const rep = curRep(); if (!s) return;
  const sel = [...S.ui.sel].map((id) => S.samples.get(id)).filter(Boolean);
  const grp = groupSamples(rep, s.group), all = repSamples(rep), everywhere = [...S.samples.values()];
  const sameGroupAll = everywhere.filter((x) => x.group === s.group);
  const dis = !S.clipboard;
  openMenu(anchor, [
    { head: S.clipboard ? `복사됨: ${S.clipboard.from} (${S.clipboard.rep}) · gate ${S.clipboard.tree.length}개` : "복사된 gate가 없습니다" },
    { label: `선택한 샘플 (${sel.length})`, disabled: dis, onClick: () => doPaste(sel, `선택한 ${sel.length}개 샘플`) },
    { label: `그룹 ${s.group} 전체 (${grp.length})`, disabled: dis, onClick: () => doPaste(grp, `그룹 ${s.group}`) },
    { label: `${rep.name} 전체 (${all.length})`, disabled: dis, onClick: () => doPaste(all, rep.name) },
    { sep: true },
    { label: `모든 반복의 ${s.group} 그룹 (${sameGroupAll.length})`, disabled: dis, onClick: () => doPaste(sameGroupAll, `모든 반복의 ${s.group}`) },
    { label: `모든 반복 · 모든 샘플 (${everywhere.length})`, disabled: dis, onClick: () => doPaste(everywhere, "모든 반복") },
  ]);
}

/* ---------------- gate tree ---------------- */
function renderTree() {
  const box = $("#gateTree"); box.innerHTML = ""; const s = curSample();
  $("#treeSample").textContent = s ? s.name : "";
  if (!s) return;
  const tree = effTree(s);
  const row = (key, depth, label, color, extra) => {
    const st = popStats(s, key); const sel = S.ui.selPop === key;
    const nm = h("span", { class: "nm" }, label);
    const r = h("div", { class: "trow" + (sel ? " sel" : "") + (key.includes(".") ? " t-region" : ""), style: { paddingLeft: 6 + depth * 14 + "px" }, "data-key": key },
      h("span", { class: "t-name" }, h("span", { class: "t-sw", style: { background: color } }), nm, extra || null),
      h("span", { class: "t-pct num" }, key === "root" ? "" : fmtPct(st ? st.pParent : NaN) + "%"),
      h("span", { class: "t-cnt num" }, st ? fmtInt(st.count) : "–"));
    r.addEventListener("click", () => { S.ui.selPop = key; $$("#gateTree .trow").forEach((x) => x.classList.toggle("sel", x.dataset.key === key)); for (const v of VIEWS) { drawOverlay(v.ctxO, v, v.dpr); if (v.updateFoot) v.updateFoot(); } focusPlotFor(key); });
    return { r, nm };
  };
  box.append(row("root", 0, "All events", "#12151a").r);
  for (const { node, depth } of treeOrder(tree)) {
    const extra = h("span", { style: { display: "inline-flex", gap: "4px", alignItems: "center" } });
    if (node._ov) {
      const ob = h("button", { class: "t-ovr", title: "이 샘플만 개별 조정됨 — 클릭하면 앵커 값으로 되돌림" }, "개별 ↺");
      ob.addEventListener("click", (e) => { e.stopPropagation(); pushUndo(); revertOverride(s, node.id); fullRender(); toast("앵커 값으로 되돌렸습니다"); });
      extra.append(ob);
    }
    const typeLbl = { rect: "사각형", poly: "다각형", quad: "사분면", range: "범위" }[node.type];
    const main = row(node.type === "quad" ? node.id + ".UL" : node.id, depth + 1, S.names[node.id] || node.id, node.type === "quad" ? "transparent" : node.type === "range" ? rangeColor(node.id) : gateColor(node.id), extra);
    if (node.type === "quad") { main.r.children[1].textContent = ""; main.r.children[2].textContent = ""; main.r.dataset.key = node.id; main.nm.title = `${typeLbl} · ${node.xp} × ${node.yp}`; }
    main.nm.title = `${typeLbl} · ${node.xp}${node.yp ? " × " + node.yp : ""} · 더블클릭 이름 변경`;
    main.nm.addEventListener("dblclick", (e) => { e.stopPropagation(); inlineEdit(main.nm, S.names[node.id] || node.id, (v) => { pushUndo(); S.names[node.id] = v; fullRender(); }); });
    const del = h("button", { class: "t-ovr", style: { background: "transparent", color: "var(--muted)" }, title: "gate 삭제 (Delete)" }); del.append(ic("trash")); del.querySelector("svg").style.cssText = "width:13px;height:13px";
    del.addEventListener("click", (e) => { e.stopPropagation(); doDeleteGate(node.id); });
    extra.append(del);
    box.append(main.r);
    if (node.type === "quad") for (const reg of REGIONS) {
      const key = node.id + "." + reg; const rr = row(key, depth + 2, regionName(node.id, reg), S.regionColors[reg]);
      rr.nm.title = `${REGION_POS[reg]} · 더블클릭 이름 변경 (예: Early apoptosis)`;
      rr.nm.addEventListener("dblclick", (e) => { e.stopPropagation(); inlineEdit(rr.nm, regionName(node.id, reg), (v) => { pushUndo(); (S.quadNames[node.id] = S.quadNames[node.id] || {})[reg] = v; fullRender(); }); });
      box.append(rr.r);
    }
  }
}
function doDeleteGate(gid) {
  const s = curSample(); if (!s) return; pushUndo();
  const via = deleteGate(s, gid); S.ui.selPop = null; fullRender();
  toast(via ? `앵커 ${via.name}에서 삭제해 그룹 전체에 적용했습니다` : "gate를 삭제했습니다", "되돌리기", undo);
}
function focusPlotFor(key) {
  const s = curSample(); if (!s || S.ui.view !== "chain") return;
  const gid = key.split(".")[0]; const n = effTree(s).find((x) => x.id === gid);
  const v = VIEWS.find((v) => !v.compact && (n ? v.plot.key === nodeKey(n) : v.plot.parent === key));
  if (v) v.wrap.closest(".pcard").scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/* ---------------- context bar ---------------- */
function renderContext() {
  const c = $("#ctx"); c.innerHTML = ""; const s = curSample(); const rep = curRep();
  if (rep && rep.demo) c.append(h("span", { class: "demo-banner" }, "예시(모의) 데이터 · FCS를 불러오면 예시가 교체됩니다"));
  if (S.ui.tool) {
    const hint = { rect: "플롯 위에서 드래그해 사각형을 그리세요", poly: "클릭으로 꼭짓점을 찍고, 첫 점을 다시 클릭하거나 더블클릭해 닫으세요", quad: "사분면 중심이 될 위치를 클릭하세요", range: "히스토그램 위에서 좌우로 드래그하세요" }[S.ui.tool];
    c.append(h("span", { class: "chip anchor" }, hint), h("span", { class: "hint" }, h("span", { class: "kbd" }, "Esc"), " 취소"));
    return;
  }
  if (!s) return;
  c.append(h("span", { class: "chip" }, `${rep.name} · ${s.group} · ${s.name} · ${fmtInt(s.n)} events`));
  const a = anchorOf(s);
  if (isAnchor(s)) {
    const n = followersOf(s).length; const ch = h("span", { class: "chip anchor" }); ch.append(ic("anchor"), ` 앵커 · 드래그하면 ${n}개 샘플이 함께 변경`); c.append(ch);
  } else if (a && s.follow) {
    const ch = h("span", { class: "chip anchor" }); ch.append(ic("link"), ` 앵커 ${a.name}를 따르는 중`); c.append(ch);
    const nOv = Object.keys(s.overrides).length;
    if (nOv) { const ob = h("button", { class: "chip ovr", title: "개별 조정을 모두 지우고 앵커 값으로" }, `개별 조정 ${nOv}개 · 모두 되돌리기`); ob.addEventListener("click", () => { pushUndo(); s.overrides = {}; markDirty([s]); fullRender(); }); c.append(ob); }
    else c.append(h("span", { class: "hint" }, "이 샘플에서 드래그하면 이 샘플만 개별 조정됩니다"));
  } else if (a && !s.follow) {
    const b = h("button", { class: "chip" }, `독립 gate · 앵커 ${a.name} 따르기`); b.addEventListener("click", () => { pushUndo(); setFollow(s, true); fullRender(); }); c.append(b);
  } else c.append(h("span", { class: "hint" }, "앵커 없음 — 샘플 목록에서 ⚓를 눌러 기준 샘플을 고정하세요"));
}

/* ---------------- center ---------------- */
function renderCenter() {
  const chain = $("#chainView"), grid = $("#gridView");
  $$("#viewSeg button").forEach((b) => b.classList.toggle("on", b.dataset.v === S.ui.view));
  chain.hidden = S.ui.view !== "chain"; grid.hidden = S.ui.view !== "grid";
  $("#tools").style.display = S.ui.view === "chain" ? "flex" : "none";
  $("#btnAddPlot").style.display = S.ui.view === "chain" ? "" : "none";
  $("#gridCtl").style.display = S.ui.view === "grid" ? "flex" : "none";
  chain.innerHTML = ""; grid.innerHTML = "";
  const s = curSample();
  if (!s) {
    const target = S.ui.view === "chain" ? chain : grid;
    const load = h("button", { class: "btn primary", onclick: () => $("#fileInput").click() }, "FCS 파일 선택");
    target.append(h("div", { class: "empty", style: { gridColumn: "1 / -1" } }, h("b", null, `${curRep() ? curRep().name : ""}에 불러온 샘플이 없습니다`), h("span", null, "BD FACSDiva, CytoFLEX 등에서 내보낸 FCS 2.0/3.0/3.1 파일을 지원합니다. 파일은 이 브라우저 안에서만 처리되고 업로드되지 않습니다."), load));
    pruneViews(); return;
  }
  if (S.ui.view === "chain") renderChain(s, chain); else renderGrid(grid);
  pruneViews();
}
function plotCard(s, plot, compact) {
  const view = makeView(s, plot, { compact });
  const card = h("div", { class: "pcard" + (compact ? " tile" : "") + (isAnchor(s) && compact ? " anchor" : "") });
  const foot = h("div", { class: "pc-foot" });
  view.updateFoot = () => {
    foot.innerHTML = "";
    const nodes = effTree(s).filter((n) => nodeKey(n) === plot.key);
    if (compact) {
      const q = nodes.find((n) => n.type === "quad");
      if (q) { const g = h("div", { class: "rg num" }); for (const r of ["UL", "UR", "LL", "LR"]) { const st = popStats(s, q.id + "." + r); g.append(h("div", null, h("i", { style: { color: "#5b6470" } }, regionName(q.id, r)), h("b", null, fmtPct(st ? st.pParent : NaN) + "%"))); } foot.append(g); }
      else for (const n of nodes) { const st = popStats(s, n.id); foot.append(h("span", { class: "gchip" }, `${S.names[n.id]} ${fmtPct(st ? st.pParent : NaN)}%`)); }
      return;
    }
    for (const n of nodes) {
      const key = n.type === "quad" ? n.id + ".UL" : n.id;
      const st = n.type === "quad" ? null : popStats(s, n.id);
      const b = h("button", { class: "gchip" + (S.ui.selPop && S.ui.selPop.split(".")[0] === n.id ? " sel" : "") }, S.names[n.id] || n.id, st ? h("b", { class: "num" }, ` ${fmtPct(st.pParent)}%`) : null, n._ov ? h("span", { class: "ov" }, "개별") : null);
      b.addEventListener("click", () => { S.ui.selPop = key; renderTree(); scheduleLive(); view.updateFoot(); });
      foot.append(b);
    }
    view.hintEl = h("span", { class: "hint", style: { marginLeft: "auto", color: "#6b7380" } }, nodes.length ? "핸들을 드래그해 조정" : "도구를 골라 gate를 그리세요");
    foot.append(view.hintEl);
  };
  const pop = compute(s).get(plot.parent);
  if (compact) {
    const ab = h("button", { class: "anchor-btn" + (isAnchor(s) ? " on" : ""), title: isAnchor(s) ? "앵커 해제" : "앵커로 고정" }); ab.append(ic("anchor"));
    ab.addEventListener("click", () => doToggleAnchor(s));
    const a = anchorOf(s); const nOv = Object.keys(s.overrides).length;
    const state = isAnchor(s) ? h("span", { class: "gchip sel" }, "앵커") : a && s.follow ? h("span", { class: "gchip", style: nOv ? { color: "#c24f1b" } : null }, nOv ? `개별 ${nOv}` : "연동") : a ? h("span", { class: "gchip" }, "독립") : null;
    const title = h("div", { class: "pc-title" }, s.name);
    title.addEventListener("click", () => { S.ui.cur = s.id; S.ui.sel = new Set([s.id]); renderSamples(); renderTree(); renderContext(); });
    title.style.cursor = "pointer"; title.title = "더블클릭: 이름 변경";
    title.addEventListener("dblclick", (e) => { e.stopPropagation(); inlineEdit(title, s.name, (v) => renameSampleUI(s, v)); });
    card.append(h("div", { class: "pc-head" }, ab, title, state));
  } else {
    const xb = h("button", { class: "axbtn", "data-popper": "1", title: "X축 파라미터·스케일·범위" }, h("b", null, "X"), h("span", null, plot.xp)); xb.append(ic("down"));
    xb.addEventListener("click", () => openAxisPop(xb, view, "x"));
    const yb = plot.kind === "hist" ? null : h("button", { class: "axbtn", "data-popper": "1", title: "Y축 파라미터·스케일·범위" }, h("b", null, "Y"), h("span", null, plot.yp));
    if (yb) { yb.append(ic("down")); yb.addEventListener("click", () => openAxisPop(yb, view, "y")); }
    const mb = h("button", { class: "pc-menu", title: "플롯 메뉴", "data-popper": "1" }); mb.append(ic("dots"));
    mb.addEventListener("click", () => plotMenu(mb, view));
    card.append(h("div", { class: "pc-head" }, h("div", { class: "pc-title" }, popLabel(plot.parent), h("span", { class: "p-sub num" }, `  ${fmtInt(pop ? pop.length : 0)}`)), xb, yb, mb));
  }
  card.append(view.wrap, foot); view.updateFoot();
  return card;
}
function renderChain(s, box) {
  const plots = plotsFor(s);
  if (!plots.length) {
    S.extraPlots.push({ parent: "root", kind: "2d", xp: findParam(s, [/^FSC-A$/i, /^FSC/i]) || s.params[0].name, yp: findParam(s, [/^SSC-A$/i, /^SSC/i]) || (s.params[1] || s.params[0]).name });
    return renderChain(s, box);
  }
  for (const p of plots) box.append(plotCard(s, p, false));
}
function gridPlotKey(s) {
  const plots = plotsFor(s);
  if (S.ui.gridKey && plots.some((p) => p.key === S.ui.gridKey)) return S.ui.gridKey;
  const q = plots.find((p) => p.nodes.some((n) => n.type === "quad"));
  return (q || plots[plots.length - 1]).key;
}
function renderGrid(box) {
  const s = curSample(); const rep = curRep(); const plots = plotsFor(s); const key = gridPlotKey(s); S.ui.gridKey = key;
  const ctl = $("#gridCtl"); ctl.innerHTML = "";
  const groups = repGroups(rep); if (!groups.includes(S.ui.gridGroup)) S.ui.gridGroup = s.group;
  const gsel = h("select", { class: "sel-input", id: "gridGroup", title: "그룹" }, ...groups.map((g) => h("option", { value: g, selected: g === S.ui.gridGroup ? "" : null }, g)));
  gsel.addEventListener("change", () => { S.ui.gridGroup = gsel.value; renderCenter(); });
  const psel = h("select", { class: "sel-input", id: "gridPlot", title: "표시할 플롯" }, ...plots.map((p) => h("option", { value: p.key, selected: p.key === key ? "" : null }, `${popLabel(p.parent)} · ${p.xp}${p.yp ? " × " + p.yp : ""}`)));
  psel.addEventListener("change", () => { S.ui.gridKey = psel.value; renderCenter(); });
  const size = h("div", { class: "seg" }, ...[[150, "S"], [190, "M"], [250, "L"]].map(([v, l]) => { const b = h("button", { class: S.ui.tile === v ? "on" : "" }, l); b.addEventListener("click", () => { S.ui.tile = v; renderCenter(); }); return b; }));
  ctl.append(gsel, psel, size);
  box.style.gridTemplateColumns = `repeat(auto-fill, minmax(${S.ui.tile}px, 1fr))`;
  const base = plots.find((p) => p.key === key);
  for (const t of groupSamples(rep, S.ui.gridGroup)) {
    const tp = plotsFor(t).find((p) => p.key === key) || { ...base, nodes: [] };
    box.append(plotCard(t, tp, true));
  }
}
function plotMenu(btn, view) {
  const { s, plot } = view;
  const items = [
    { label: "이 플롯 그림 저장 (mm·pt 지정)…", disabled: !DL, onClick: () => openExport({ type: "plot", s, plot }) },
    { label: "현재 샘플 전체 플롯 그림 저장…", disabled: !DL, onClick: () => openExport({ type: "chain", s }) },
  ];
  if (plot.extra) {
    items.push({ sep: true },
      { label: plot.kind === "hist" ? "2D 플롯으로 전환" : "히스토그램으로 전환", onClick: () => { const e = plot.extra; if (e.kind === "hist") { e.kind = "2d"; e.yp = s.params.find((p) => p.name !== e.xp).name; } else { e.kind = "hist"; } renderCenter(); } },
      { label: "플롯 제거", onClick: () => { S.extraPlots = S.extraPlots.filter((e) => e !== plot.extra); renderCenter(); } });
  } else items.push({ sep: true }, { head: "gate가 있는 플롯은 gate를 모두 지우면 제거됩니다" });
  openMenu(btn, items);
}
function addPlot() {
  const s = curSample(); if (!s) return;
  const tree = effTree(s); const avail = new Set(["root", ...tree.flatMap((n) => nodeChildrenKeys(tree, n.id))]);
  const parent = S.ui.selPop && avail.has(S.ui.selPop) ? S.ui.selPop : "root";
  const fl = fluorParams(s);
  const xp = parent === "root" ? findParam(s, [/^FSC-A$/i]) || s.params[0].name : fl[0] || s.params[0].name;
  const yp = parent === "root" ? findParam(s, [/^SSC-A$/i]) || s.params[1].name : fl[1] || s.params[1].name;
  S.extraPlots.push({ parent, kind: "2d", xp, yp });
  renderCenter(); toast(`${popLabel(parent)}의 새 플롯을 추가했습니다 — 축 버튼으로 파라미터를 바꾸세요`);
  const last = $$("#chainView .pcard").pop(); if (last) last.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/* ---------------- axis popover ---------------- */
function repParams() { const out = []; for (const s of repSamples(curRep())) for (const p of s.params) if (!out.find((o) => o.name === p.name)) out.push(p); return out; }
function openAxisPop(btn, view, which) {
  closePop();
  const pop = h("div", { class: "pop", "data-popper": "1" }); POP = pop;
  const build = () => {
    pop.innerHTML = "";
    const plot = view.plot; const pname = which === "x" ? plot.xp : plot.yp; const ax = S.axes[pname];
    const list = h("div", { class: "param-list" });
    for (const p of repParams()) {
      const b = h("button", { class: p.name === pname ? "on" : "" }, h("span", null, p.name), h("small", null, p.stain || ""));
      b.addEventListener("click", () => {
        if (p.name === pname) return;
        const nx = which === "x" ? p.name : plot.xp, ny = which === "y" ? p.name : plot.yp;
        if (plot.extra) { plot.extra.xp = nx; if (plot.kind !== "hist") plot.extra.yp = ny; closePop(); renderCenter(); return; }
        pushUndo(); const k = changePlotAxes(view.s, plot, nx, ny); closePop(); renderAll();
        toast(`축을 ${p.name}(으)로 바꾸고 gate ${k}개를 새 축 기준으로 다시 배치했습니다`, "되돌리기", undo);
      });
      list.append(b);
    }
    const seg = h("div", { class: "seg" }, ...[["lin", "Linear"], ["log", "Log"], ["biex", "Biex"]].map(([v, l]) => {
      const b = h("button", { class: ax.scale === v ? "on" : "" }, l);
      b.addEventListener("click", () => { ax.scale = v; if (v === "log" && ax.min <= 0) ax.min = 1; if (v === "biex" && ax.min >= 0 && !SCATTER_RE.test(pname)) ax.min = -600; axesChanged(); build(); });
      return b;
    }));
    const mn = h("input", { class: "txt-input num", id: "axMin", type: "number", value: String(Math.round(ax.min)) });
    const mx = h("input", { class: "txt-input num", id: "axMax", type: "number", value: String(Math.round(ax.max)) });
    const apply = () => { const a = parseFloat(mn.value), b = parseFloat(mx.value); if (isFinite(a) && isFinite(b) && b > a && !(ax.scale === "log" && a <= 0)) { ax.min = a; ax.max = b; axesChanged(); } else toast(ax.scale === "log" ? "Log 스케일의 최솟값은 0보다 커야 합니다" : "최댓값이 최솟값보다 커야 합니다"); };
    mn.addEventListener("change", apply); mx.addEventListener("change", apply);
    pop.append(
      h("div", { class: "field" }, h("div", { class: "f-label" }, `${which.toUpperCase()}축 파라미터`), list),
      h("div", { class: "field" }, h("div", { class: "f-label" }, `${pname} 스케일`), seg),
      h("div", { class: "field" }, h("div", { class: "f-label" }, "범위 (원 데이터 값)"), h("div", { class: "f-row", style: { flexWrap: "nowrap" } }, mn, h("span", { class: "p-sub" }, "~"), mx)),
    );
    if (ax.scale === "biex") {
      const cof = h("input", { type: "range", id: "axCof", min: "20", max: "1000", step: "10", value: String(ax.cof) });
      const lab = h("span", { class: "num p-sub" }, String(ax.cof));
      cof.addEventListener("input", () => { ax.cof = +cof.value; lab.textContent = cof.value; axesChanged(); });
      pop.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "Biex 선형 구간 폭", lab), cof, h("span", { class: "note" }, "값이 클수록 0 근처가 넓게 펴집니다 (arcsinh cofactor)")));
    }
    const reset = h("button", { class: "btn sm" }, "기본값으로");
    reset.addEventListener("click", () => { const s = view.s; const pr = s.params[s.pIndex[pname]]; S.axes[pname] = defaultAxis(pname, pr ? pr.range : 262144); axesChanged(); build(); });
    pop.append(h("div", { class: "f-row" }, reset, h("span", { class: "note" }, "스케일·범위는 모든 플롯의 같은 파라미터에 적용")));
  };
  build(); placeFloating(pop, btn);
}
function axesChanged() { S.axesVer++; markAllDirty(); scheduleLive(); saveProps(); }

/* ---------------- style panel ---------------- */
function renderStyle() {
  const box = $("#rStyle"); box.innerHTML = ""; const st = S.style;
  const changed = () => { S.styleVer++; saveProps(); for (const v of VIEWS) renderView(v, true); renderTree(); if (S.ui.rTab === "style") renderStyle(); };
  const segField = (label, key, opts) => { const seg = h("div", { class: "seg" }, ...opts.map(([v, l]) => { const b = h("button", { class: st[key] === v ? "on" : "" }, l); b.addEventListener("click", () => { st[key] = v; changed(); }); return b; })); return h("div", { class: "field" }, h("div", { class: "f-label" }, label), seg); };
  const slider = (label, key, min, max, step, fmt = (v) => v) => {
    const lab = h("span", { class: "num", style: { color: "var(--ink)", fontWeight: 700, textTransform: "none" } }, String(fmt(st[key])));
    const r = h("input", { type: "range", id: "st_" + key, min: String(min), max: String(max), step: String(step), value: String(st[key]) });
    r.addEventListener("input", () => { st[key] = +r.value; lab.textContent = fmt(st[key]); S.styleVer++; for (const v of VIEWS) renderView(v, true); });
    r.addEventListener("change", () => saveProps());
    return h("div", { class: "field" }, h("div", { class: "f-label" }, label, lab), r);
  };
  const fjOn = st.mode === "dot" && st.colorBy === "density" && st.palette === "flowjo" && st.densScale !== "log" && st.labelStyle === "flowjo";
  const fjBtn = h("button", { class: "btn sm" + (fjOn ? " on" : "") }, fjOn ? "FlowJo 스타일 적용됨" : "FlowJo 스타일로 되돌리기");
  fjBtn.addEventListener("click", () => { Object.assign(st, { mode: "dot", colorBy: "density", palette: "flowjo", densScale: "linear", labelStyle: "flowjo", dotSize: 1, alpha: 1, smooth: 2, reverse: false }); changed(); });
  box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "프리셋"), h("div", { class: "f-row" }, fjBtn, h("span", { class: "note" }, "pseudocolor 점 · 선형 밀도 · Q 이름과 % 두 줄 표시"))));
  box.append(segField("플롯 표현", "mode", [["dot", "점"], ["density", "밀도"], ["contour", "등고선"], ["contourdots", "등고선+점"]]));
  box.append(segField("밀도 → 색 변환", "densScale", [["linear", "선형 (FlowJo)"], ["log", "로그 (저밀도 강조)"]]));
  box.append(segField("gate 라벨 모양", "labelStyle", [["flowjo", "FlowJo (이름·값 두 줄)"], ["box", "박스 (이름 값%)"]]));
  if (st.mode === "dot" || st.mode === "contourdots") box.append(slider("점 크기 (px)", "dotSize", 0.5, 5, 0.25), slider("점 불투명도", "alpha", 0.15, 1, 0.05, (v) => Math.round(v * 100) + "%"));
  if (st.mode === "contour" || st.mode === "contourdots") box.append(slider("등고선 개수", "levels", 3, 10, 1));
  box.append(slider("밀도 스무딩", "smooth", 0, 3, 1));
  box.append(slider("플롯 글자 크기 (화면, px)", "fontSize", 8, 18, 0.5), slider("선 굵기 (화면)", "lineW", 0.5, 3, 0.25));
  const ex = h("button", { class: "btn sm" }, "논문용 크기로 그림 저장…"); ex.addEventListener("click", () => { const s0 = curSample(); if (s0) openExport({ type: "chain", s: s0 }); });
  box.append(h("div", { class: "f-row" }, ex, h("span", { class: "note" }, "저장할 때는 mm·pt 단위로 따로 지정합니다")));
  const single = h("input", { type: "color", id: "st_single", value: st.single }); single.addEventListener("input", () => { st.single = single.value; S.styleVer++; for (const v of VIEWS) renderView(v, true); }); single.addEventListener("change", saveProps);
  const cseg = h("div", { class: "seg" }, ...[["density", "밀도 색상"], ["single", "단색"]].map(([v, l]) => { const b = h("button", { class: st.colorBy === v ? "on" : "" }, l); b.addEventListener("click", () => { st.colorBy = v; changed(); }); return b; }));
  const sw = st.colorBy === "single" ? h("div", { class: "swatches" }, ...["#111418", "#1c3f94", "#2a78d6", "#1b7f5b", "#c0392b", "#7a4bb3", "#e07b00", "#6b7380"].map((c) => { const b = h("button", { class: "swatch" + (st.single.toLowerCase() === c ? " on" : ""), style: { background: c }, title: c, "aria-label": c }); b.addEventListener("click", () => { st.single = c; changed(); }); return b; })) : null;
  box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "점 색상"), h("div", { class: "f-row" }, cseg, st.colorBy === "single" ? single : null), sw));
  const hc = h("input", { type: "color", id: "st_hist", value: st.histFill || "#4b5bd4" });
  hc.addEventListener("input", () => { st.histFill = hc.value; S.styleVer++; for (const v of VIEWS) renderView(v, true); }); hc.addEventListener("change", saveProps);
  box.append(slider("히스토그램 곡선 스무딩 (gating 플롯)", "histSmooth", 0, 8, 0.5, (v) => (v <= 0 ? "끔 · 계단형" : `σ ${v}`)));
  box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "히스토그램 색"), h("div", { class: "f-row" }, hc, ...["#4b5bd4", "#6b7380", "#111418", "#2a78d6"].map((c) => { const b = h("button", { class: "swatch" + ((st.histFill || "#4b5bd4") === c ? " on" : ""), style: { background: c }, "aria-label": c }); b.addEventListener("click", () => { st.histFill = c; changed(); }); return b; }))));
  if (st.colorBy !== "single" || st.mode === "density") {
    const pal = h("div", { class: "pal" });
    const groups = [["rec", "논문 추천 · 밝기가 고르게 변해 밀도 왜곡이 적고 색각이상에도 구분"], ["mono", "단색 계열 · 흑백 인쇄에도 안전"], ["classic", "FlowJo·Diva 느낌 (무지개)"], ["custom", "직접 만들기"]];
    for (const [gk, gl] of groups) {
      pal.append(h("div", { class: "pal-group" }, gl));
      for (const k in PALETTES) {
        const P = PALETTES[k]; if (P.group !== gk) continue;
        let stops = k === "custom" ? st.custom : P.stops; if (st.reverse) stops = stops.slice().reverse();
        const b = h("button", { class: st.palette === k ? "on" : "" }, h("span", null, P.name), h("span", { class: "ramp", style: { background: `linear-gradient(90deg, ${stops.join(",")})` } }), P.tag ? h("span", { class: "tag" + (P.tagWarn ? " warn" : "") }, P.tag) : h("span"));
        b.addEventListener("click", () => { st.palette = k; changed(); });
        pal.append(b);
      }
    }
    const rev = h("label", { class: "check" }, h("input", { type: "checkbox", id: "st_reverse", checked: st.reverse ? "" : null }), "색 순서 뒤집기");
    rev.querySelector("input").addEventListener("change", (e) => { st.reverse = e.target.checked; changed(); });
    const stopsRow = h("div", { class: "f-row", style: { gap: "4px" } });
    st.custom.forEach((c, i) => {
      const cell = h("span", { class: "stop" });
      const inp = h("input", { type: "color", id: "st_custom" + i, value: c, title: `${i + 1}번째 색` });
      inp.addEventListener("input", () => { st.custom[i] = inp.value; st.palette = "custom"; S.styleVer++; for (const v of VIEWS) renderView(v, true); });
      inp.addEventListener("change", () => { saveProps(); renderStyle(); });
      cell.append(inp);
      if (st.custom.length > 2) { const x = h("button", { class: "stop-x", title: "이 색 삭제", "aria-label": "이 색 삭제" }, "×"); x.addEventListener("click", () => { st.custom.splice(i, 1); st.palette = "custom"; changed(); }); cell.append(x); }
      stopsRow.append(cell);
    });
    if (st.custom.length < 7) { const add = h("button", { class: "btn sm" }, "+ 색"); add.addEventListener("click", () => { st.custom.push(st.custom[st.custom.length - 1]); st.palette = "custom"; changed(); }); stopsRow.append(add); }
    const copy = h("button", { class: "btn sm ghost" }, "선택한 팔레트를 Custom으로 복사해 편집");
    copy.addEventListener("click", () => { const P = PALETTES[st.palette]; if (P && P.stops) { const s0 = P.stops; st.custom = s0.length <= 7 ? s0.slice() : [0, 1, 2, 3, 4, 5, 6].map((i) => s0[Math.round((i * (s0.length - 1)) / 6)]); } st.palette = "custom"; changed(); });
    box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "밀도 팔레트"), pal, rev, h("div", { class: "pal-group" }, "Custom 색 (왼쪽 = 밀도 낮음 → 오른쪽 = 높음)"), stopsRow, copy));
  }
  const lab = h("label", { class: "check" }, h("input", { type: "checkbox", id: "st_labels", checked: st.labels ? "" : null }), "플롯에 gate 이름·% 표시");
  lab.querySelector("input").addEventListener("change", (e) => { st.labels = e.target.checked; changed(); });
  box.append(lab);

  // quadrant names
  const quadIds = [];
  for (const s of S.samples.values()) for (const n of effTree(s)) if (n.type === "quad" && !quadIds.find((q) => q.id === n.id)) quadIds.push(n);
  if (quadIds.length) {
    const f = h("div", { class: "field" }, h("div", { class: "f-label" }, "사분면 이름"));
    const numSeg = h("div", { class: "seg" }, ...[["diva", "Diva 번호 (Q3=좌하)"], ["flowjo", "FlowJo 번호 (Q4=좌하)"]].map(([v, l]) => { const b = h("button", { class: st.numbering === v ? "on" : "" }, l); b.addEventListener("click", () => { st.numbering = v; changed(); fullRender(); }); return b; }));
    f.append(numSeg);
    for (const q of quadIds) {
      const grid = h("div", { class: "qgrid" });
      for (const r of ["UL", "UR", "LL", "LR"]) {
        const inp = h("input", { class: "txt-input", id: `qn_${q.id}_${r}`, value: (S.quadNames[q.id] || {})[r] || "", placeholder: NUMBERING[st.numbering][r] });
        inp.addEventListener("change", () => { pushUndo(); (S.quadNames[q.id] = S.quadNames[q.id] || {})[r] = inp.value.trim(); renderTree(); scheduleLive(); renderCenter(); });
        grid.append(h("div", { class: "qcell" }, h("span", { class: "qpos" }, h("span", { class: "t-sw", style: { background: S.regionColors[r], display: "inline-block", marginRight: "5px", verticalAlign: "-1px" } }), `${NUMBERING[st.numbering][r]} · ${REGION_POS[r]}`), inp));
      }
      const preset = h("button", { class: "btn sm" }, "Annexin V / 7-AAD·PI 이름 적용");
      preset.addEventListener("click", () => {
        pushUndo(); const viaX = /7.?AAD|^PI|propidium|DAPI|PerCP/i.test(q.xp);
        S.quadNames[q.id] = viaX ? { LL: "Live", UL: "Early apoptosis", UR: "Late apoptosis", LR: "Necrosis" } : { LL: "Live", LR: "Early apoptosis", UR: "Late apoptosis", UL: "Necrosis" };
        fullRender(); toast("사분면 이름을 적용했습니다 (X=Annexin, Y=생존 염색 기준)");
      });
      const reset = h("button", { class: "btn sm ghost" }, "Q1–Q4로"); reset.addEventListener("click", () => { pushUndo(); S.quadNames[q.id] = {}; fullRender(); });
      f.append(h("div", { class: "note" }, `${S.names[q.id] || q.id} · ${q.xp} × ${q.yp}`), grid, h("div", { class: "f-row" }, preset, reset));
    }
    box.append(f);
  }
  // region colors
  const rc = h("div", { class: "field" }, h("div", { class: "f-label" }, "막대 색 (사분면)"));
  const row = h("div", { class: "f-row" });
  const qid = (quadIds[0] || {}).id;
  for (const r of ["LL", "LR", "UR", "UL"]) { const inp = h("input", { type: "color", id: "rc_" + r, value: S.regionColors[r] }); inp.addEventListener("input", () => { S.regionColors[r] = inp.value; renderBar(); }); inp.addEventListener("change", () => { saveProps(); renderTree(); }); row.append(h("label", { class: "check" }, inp, qid ? regionName(qid, r) : r)); }
  const sc = h("input", { type: "color", id: "rc_sum", value: S.sumColor }); sc.addEventListener("input", () => { S.sumColor = sc.value; renderBar(); }); sc.addEventListener("change", saveProps);
  row.append(h("label", { class: "check" }, sc, "합계"));
  const rreset = h("button", { class: "btn sm ghost" }, "추천 색으로"); rreset.addEventListener("click", () => { S.regionColors = { ...REGION_COLORS_DEFAULT }; S.sumColor = "#4a3aa7"; saveProps(); renderStyle(); renderTree(); });
  rc.append(row, h("div", { class: "f-row" }, rreset, h("span", { class: "note" }, "기본값은 색각이상 대비가 검증된 조합입니다")));
  box.append(rc);
  // compensation
  const withSpill = [...S.samples.values()].filter((s) => s.spill).length;
  const comp = h("label", { class: "check" }, h("input", { type: "checkbox", id: "st_comp", checked: S.comp ? "" : null, disabled: withSpill ? null : "" }), `FCS에 저장된 compensation 적용 (${withSpill}개 샘플에 있음)`);
  comp.querySelector("input").addEventListener("change", (e) => { S.comp = e.target.checked; markAllDirty(); S.axesVer++; scheduleLive(); renderTree(); });
  box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, "보정"), comp));
}

/* ---------------- stats panel ---------------- */
function renderStats() {
  const box = $("#rStats"); box.innerHTML = ""; const s = curSample(); if (!s) return;
  const t = h("table", { class: "st" }, h("thead", null, h("tr", null, h("th", null, "Population"), h("th", { class: "r" }, "#Events"), h("th", { class: "r" }, "%Parent"), h("th", { class: "r" }, "%Total"))));
  const tb = h("tbody"); const tree = effTree(s);
  const tr = (key, depth) => { const st = popStats(s, key); tb.append(h("tr", null, h("td", { style: { paddingLeft: 6 + depth * 12 + "px" } }, popLabel(key)), h("td", { class: "r num" }, st ? fmtInt(st.count) : "–"), h("td", { class: "r num" }, key === "root" ? "" : fmtPct(st ? st.pParent : NaN)), h("td", { class: "r num" }, fmtPct(st ? st.pTotal : NaN)))); };
  tr("root", 0);
  for (const { node, depth } of treeOrder(tree)) for (const k of nodeChildrenKeys(tree, node.id)) tr(k, depth + 1);
  t.append(tb);
  box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, `${s.name} · ${curRep().name}`), h("div", { class: "tbl-wrap" }, t)));

  const rep = curRep(); const ss = repSamples(rep); const keys = [];
  for (const x of ss) { const tr2 = effTree(x); for (const { node } of treeOrder(tr2)) for (const k of nodeChildrenKeys(tr2, node.id)) if (!keys.includes(k)) keys.push(k); }
  const metric = S.ui.statMetric || "pParent";
  const mseg = h("div", { class: "seg" }, ...[["pParent", "%Parent"], ["pTotal", "%Total"], ["count", "#Events"]].map(([v, l]) => { const b = h("button", { class: metric === v ? "on" : "" }, l); b.addEventListener("click", () => { S.ui.statMetric = v; renderStats(); }); return b; }));
  const t2 = h("table", { class: "st" }, h("thead", null, h("tr", null, h("th", null, "샘플"), ...keys.map((k) => h("th", { class: "r" }, popLabel(k))))));
  const tb2 = h("tbody");
  for (const x of ss) tb2.append(h("tr", null, h("td", null, `${x.group} · ${x.name}`), ...keys.map((k) => { const st = popStats(x, k); return h("td", { class: "r num" }, !st ? "–" : metric === "count" ? fmtInt(st.count) : fmtPct(st[metric])); })));
  t2.append(tb2);
  const csv = h("button", { class: "btn sm", disabled: DL ? null : "" }, "CSV 저장 (모든 반복)"); csv.addEventListener("click", saveStatsCSV);
  box.append(h("div", { class: "field" }, h("div", { class: "f-label" }, `${rep.name} · 모든 샘플`), h("div", { class: "f-row" }, mseg, csv), h("div", { class: "tbl-wrap" }, t2)));
}
function renderRight() {
  $$("#rTabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === S.ui.rTab));
  $("#rBar").hidden = S.ui.rTab !== "bar"; $("#rStats").hidden = S.ui.rTab !== "stats"; $("#rStyle").hidden = S.ui.rTab !== "style";
  if (S.ui.rTab === "bar") renderBar(); else if (S.ui.rTab === "stats") renderStats(); else renderStyle();
}
function updateTreeNumbers() {
  const s = curSample(); if (!s) return; const tree = effTree(s);
  for (const r of $$("#gateTree .trow")) {
    const key = r.dataset.key; if (!key || key === "root") continue;
    const n = tree.find((x) => x.id === key); if (n && n.type === "quad") continue;
    const st = popStats(s, key); if (r.children.length < 3) continue;
    r.children[1].textContent = fmtPct(st ? st.pParent : NaN) + "%"; r.children[2].textContent = st ? fmtInt(st.count) : "–";
  }
}
function updateLiveText() {
  updateTreeNumbers(); renderContext();
  for (const v of VIEWS) if (v.updateFoot) { const hint = v.hintEl ? v.hintEl.textContent : null; v.updateFoot(); if (hint && v.hintEl) v.hintEl.textContent = hint; }
}
function renderAll() { renderProtocol(); renderRepTabs(); renderSamples(); renderTree(); renderContext(); renderCenter(); renderRight(); updateUndoBtns(); }
function fullRender() { renderAll(); }

/* ---------------- persistence (per-viewer prefs only) ---------------- */
function saveProps() {
  try { localStorage.setItem("anchorgating.prefs.v3", JSON.stringify({ style: S.style, regionColors: S.regionColors, sumColor: S.sumColor, bar: { err: S.bar.err, dots: S.bar.dots, stats: S.bar.stats, layout: S.bar.layout, basis: S.bar.basis, style: S.bar.style, pfill: S.bar.pfill, psig: S.bar.psig, perr: S.bar.perr, ppts: S.bar.ppts, legendPos: S.bar.legendPos, legendXY: S.bar.legendXY }, plotKind: S.ui.plotKind, hist: (({ layout, overlap, smooth, norm, alpha, lw, line, palette, colors, labels, labelColor, gates, arrow, cols }) => ({ layout, overlap, smooth, norm, alpha, lw, line, palette, colors, labels, labelColor, gates, arrow, cols }))(S.hist) })); } catch (e) { /* storage unavailable */ }
}
function loadProps() {
  try { const o = JSON.parse(localStorage.getItem("anchorgating.prefs.v3") || "null"); if (!o) return; Object.assign(S.style, o.style || {}); Object.assign(S.regionColors, o.regionColors || {}); if (o.sumColor) S.sumColor = o.sumColor; Object.assign(S.bar, o.bar || {}); if (o.plotKind) S.ui.plotKind = o.plotKind; Object.assign(S.hist, o.hist || {}); if (!PALETTES[S.style.palette]) S.style.palette = "viridis"; } catch (e) { /* ignore */ }
}
