"use strict";
const MARK = { pass: "✓", partial: "~", fail: "✗", "context-only": "·", unassessed: "·" };
const CLS = { pass: "pass", partial: "partial", fail: "fail", "context-only": "context", unassessed: "context" };
const TIERS = [
  ["frontier-closed", "Frontier · closed"],
  ["frontier-open", "Frontier · open weights"],
  ["open-8b", "Small open weights (7–8B)"],
];
let DATA, profile = "I-a", reqSel = "R6";

const $ = (s, r = document) => r.querySelector(s);
const el = (t, c, html) => { const e = document.createElement(t); if (c) e.className = c; if (html != null) e.innerHTML = html; return e; };
const set = (e, txt) => { e.textContent = txt; return e; };
const pct = r => r == null ? "n/a" : (r * 100).toFixed(r * 100 % 1 ? 1 : 0) + "%";

fetch("data.json").then(r => r.json()).then(d => { DATA = d; init(); })
  .catch(() => { const a = $("#hero-answer"); if (a) a.textContent = "Could not load data.json."; });

function init() {
  heroAnswer();
  toggles("#profile-toggle", DATA.profiles.map(p => [p.id, p.id]), profile, v => { profile = v; renderHeatmap(); });
  const gated = DATA.req_order.filter(r => !isContext(r));
  toggles("#req-toggle", gated.map(r => [r, `${r} · ${DATA.requirements[r].name}`]), reqSel, v => { reqSel = v; renderBars(); });
  renderHeatmap(); renderBars(); renderAlpha(); renderFamilyGate(); renderCrosswalk(); wireReceipt();
}
const isContext = r => (DATA.thresholds["I-a"][r] || {}).context_only === true;

function heroAnswer() {
  const rd = Object.values(DATA.readiness);
  const notReady = rd.filter(x => x.startsWith("Not-ready")).length;
  let r6fail = 0, r6tot = 0;
  for (const m of DATA.models) for (const p of ["I-a", "II-a"]) {
    const c = DATA.cells[`${m.stem}|${p}|R6`]; if (c) { r6tot++; if (c.verdict === "fail") r6fail++; }
  }
  $("#hero-answer").innerHTML =
    `<b>No.</b> All ${DATA.models.length} models (frontier and open) are <b>Not-ready at the model layer</b> ` +
    `(${notReady}/${rd.length} cards). The no-fabrication bar (R6) fails for <b>${r6fail} of ${r6tot}</b> model×profile cards; ` +
    `the strongest, Claude Opus 4.8, misses by a single fabrication in 42 on a zero-tolerance bar. ` +
    `The value is the <em>spread</em>: which requirement each model fails, and the system wrap it demands.`;
}

function toggles(sel, opts, cur, onPick) {
  const box = $(sel);
  box.querySelectorAll("button").forEach(b => b.remove());
  opts.forEach(([v, label]) => {
    const b = el("button", v === cur ? "active" : "", label);
    b.onclick = () => { box.querySelectorAll("button").forEach(x => x.classList.remove("active")); b.classList.add("active"); onPick(v); };
    box.appendChild(b);
  });
}

function renderHeatmap() {
  const reqs = DATA.req_order;
  const tbl = el("table", "hm-grid");
  const thead = el("thead"), htr = el("tr");
  htr.appendChild(el("th"));
  reqs.forEach(r => {
    const crit = (DATA.thresholds[profile][r] || {}).criticality || "";
    htr.appendChild(el("th", "", `<span class="colname">${r}</span><div class="colcrit crit-${crit}">${(crit || "").slice(0, 4)}</div>`));
  });
  thead.appendChild(htr); tbl.appendChild(thead);
  const tb = el("tbody");
  TIERS.forEach(([tier, tlabel]) => {
    const models = DATA.models.filter(m => m.tier === tier);
    if (!models.length) return;
    const tr = el("tr", "tier"), td = el("td"); td.colSpan = reqs.length + 1; td.textContent = tlabel; tr.appendChild(td); tb.appendChild(tr);
    models.forEach(m => {
      const row = el("tr");
      row.appendChild(el("td", "rowhead", `${m.label}<small>${m.family}</small>`));
      reqs.forEach(r => {
        const c = DATA.cells[`${m.stem}|${profile}|${r}`];
        const wrap = el("td", "cellwrap");
        const v = c ? c.verdict : "context-only";
        const clickable = c && ["pass", "partial", "fail"].includes(v);
        const btn = el("button", `cell ${CLS[v] || "context"}`);
        btn.innerHTML = `<span class="mark">${MARK[v] || "·"}</span>${c && c.rate != null ? pct(c.rate) : ""}`;
        if (clickable) { btn.onclick = () => openReceipt(m, profile, r); btn.title = `${m.label} · ${r} · click for the scenarios`; }
        else btn.disabled = true;
        wrap.appendChild(btn); row.appendChild(wrap);
      });
      tb.appendChild(row);
    });
  });
  tbl.appendChild(tb);
  const host = $("#heatmap"); host.innerHTML = ""; host.appendChild(tbl);
  $("#legend").innerHTML =
    `<span class="lg"><span class="swatch" style="background:var(--pass-bg)"></span> pass (≥ target)</span>` +
    `<span class="lg"><span class="swatch" style="background:var(--partial-bg)"></span> partial (≥ floor)</span>` +
    `<span class="lg"><span class="swatch" style="background:var(--fail-bg)"></span> fail (&lt; floor)</span>` +
    `<span class="lg"><span class="swatch" style="background:var(--context-bg)"></span> context-only</span>` +
    `<span class="lg" style="margin-left:auto;font-style:italic">every model on ${profile}: Not-ready (model-layer)</span>`;
}

function renderBars() {
  const r = reqSel;
  const rows = DATA.models.map(m => ({ m, c: DATA.cells[`${m.stem}|${profile}|${r}`] })).filter(x => x.c && x.c.rate != null);
  const host = $("#bars-chart"); host.innerHTML = "";
  const th = DATA.thresholds[profile][r] || {};
  if (!rows.length) { host.innerHTML = `<p class="lede">No gated scenarios for ${r} on ${profile}.</p>`; return; }
  const W = 720, padL = 152, padR = 46, rowH = 30, top = 50, bot = 30;
  const H = top + rows.length * rowH + bot;
  const x = v => padL + v * (W - padL - padR);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%" });
  const y0 = top - 8, y1 = H - bot;
  const zone = (a, b, fill) => svg.appendChild(svgEl("rect", { x: x(a), y: y0, width: Math.max(0, x(b) - x(a)), height: y1 - y0, fill }));
  if (th.floor != null) zone(0, th.floor, "var(--fail-bg)");
  if (th.floor != null && th.target != null) zone(th.floor, th.target, "var(--partial-bg)");
  if (th.target != null) zone(th.target, 1, "var(--pass-bg)");
  [0, .25, .5, .75, 1].forEach(g => {
    svg.appendChild(svgEl("line", { x1: x(g), y1: y0, x2: x(g), y2: y1, stroke: "var(--line)" }));
    svg.appendChild(txt(x(g), y1 + 16, (g * 100) + "%", { class: "ax-label", "text-anchor": "middle" }));
  });
  const line = (v, color) => { if (v != null) svg.appendChild(svgEl("line", { x1: x(v), y1: y0 - 4, x2: x(v), y2: y1, stroke: color, class: "thr-line" })); };
  line(th.floor, "var(--partial)"); line(th.target, "var(--pass)");
  const lbl = (v, color, s, yy) => {
    if (v == null) return;
    const anchor = v > 0.9 ? "end" : "middle", xx = v > 0.9 ? x(v) - 3 : x(v);
    svg.appendChild(txt(xx, yy, s, { class: "thr-label", fill: color, "text-anchor": anchor }));
  };
  lbl(th.floor, "var(--partial)", `floor ${th.floor}`, 16);
  lbl(th.target, "var(--pass)", `target ${th.target}`, 34);
  rows.forEach((row, i) => {
    const y = top + i * rowH + 4, h = rowH - 12, v = row.c.rate;
    const color = row.c.verdict === "pass" ? "var(--pass)" : row.c.verdict === "partial" ? "var(--partial)" : "var(--fail)";
    svg.appendChild(txt(padL - 10, y + h / 2 + 4, row.m.label, { class: "bar-name", "text-anchor": "end" }));
    svg.appendChild(svgEl("rect", { x: padL, y, width: Math.max(1.5, x(v) - padL), height: h, rx: 3, fill: color, opacity: .9 }));
    svg.appendChild(txt(x(v) + 6, y + h / 2 + 4, pct(v), { class: "bar-val", fill: color }));
  });
  const c = el("div"); c.appendChild(svg); host.appendChild(c);
  const cap = $("#bars-cap");
  if (cap) cap.innerHTML = `<b>Figure 2.</b> Per-model pass-rate for <b>${r} · ${DATA.requirements[r].name}</b> on ${profile} ` +
    `(${th.criticality || ""}). Floor ${th.floor ?? "n/a"}, target ${th.target ?? "n/a"}; shaded bands = fail / partial / pass.`;
}

function renderAlpha() {
  const cal = DATA.calibration, rb = cal.rule_baseline || {};
  const cards = [
    ["A↔B", rb.a_b, "two independent humans", true],
    ["panel↔A", cal.panel_a, "the LLM panel vs the human", true],
    ["A↔rule", rb.a_rule, "human vs the old rule grader", false],
    ["B↔rule", rb.b_rule, "2nd human vs the rule grader", false],
  ];
  const host = $("#alpha-chart"); host.innerHTML = "";
  cards.forEach(([lab, val, sub, hi]) => {
    host.appendChild(el("div", "alpha-card" + (hi ? " hi" : ""),
      `<div class="big">${val != null ? val.toFixed(3) : "n/a"}</div><div class="lab"><b>${lab}</b> · ${sub}</div>`));
  });
  const cap = $("#alpha-cap");
  if (cap) cap.innerHTML = `<b>Figure 3.</b> Inter-rater reliability, Krippendorff's α (1.0 = perfect, 0 = chance). ` +
    `The two humans (${(rb.a_b ?? 0).toFixed(3)}) agree far more than either agrees with the rule grader ` +
    `(${(rb.a_rule ?? 0).toFixed(3)} / ${(rb.b_rule ?? 0).toFixed(3)}): the rule was the outlier. The deployed panel reaches ` +
    `${(cal.panel_a ?? 0).toFixed(3)} against the human.`;
}

function renderFamilyGate() {
  const fams = DATA.calibration.per_family || [];
  const host = $("#family-gate"); if (!fams.length) { host.innerHTML = ""; return; }
  const tbl = el("table", "data");
  tbl.innerHTML = `<thead><tr><th>Judgment family</th><th>panel↔A α</th><th>raw</th><th>fail-recall</th><th>n</th><th>gate</th></tr></thead>`;
  const tb = el("tbody");
  fams.forEach(f => {
    const g = f.gate.replace(/\*\*/g, "").toLowerCase();
    let band = "n/a", cls = "";
    if (g.includes("publish")) { band = "publish"; cls = "gate-publish"; }
    else if (g.includes("tentative")) { band = "tentative"; cls = "gate-tentative"; }
    else if (g.includes("do not deploy") || g.includes("do-not-deploy")) { band = "do-not-deploy"; cls = "gate-deploy"; }
    const frag = g.includes("prevalence-fragile") ? `<span class="frag">α prevalence-fragile (minority &lt; 5)</span>` : "";
    tb.appendChild(el("tr", "", `<td>${f.family}</td><td class="num">${f.alpha}</td><td class="num">${f.raw}</td>` +
      `<td class="num">${f.fail_recall}</td><td class="num">${f.n}</td><td><span class="gate-pill ${cls}">${band}</span>${frag}</td>`));
  });
  tbl.appendChild(tb); host.innerHTML = ""; host.appendChild(tbl);
}

function renderCrosswalk() {
  const tbl = el("table", "data");
  tbl.innerHTML = `<thead><tr><th>R</th><th>Requirement</th><th>Model-behavior test</th><th>I-a</th><th>II-a</th><th>Regulatory anchor</th></tr></thead>`;
  const tb = el("tbody");
  DATA.req_order.forEach(r => {
    const m = DATA.requirements[r]; if (!m) return;
    const ci = (DATA.thresholds["I-a"][r] || {}).criticality || "n/a", cii = (DATA.thresholds["II-a"][r] || {}).criticality || "n/a";
    tb.appendChild(el("tr", "", `<td><b>${r}</b></td><td>${m.name}</td><td>${m.test}</td>` +
      `<td><span class="crit-tag crit-${ci}">${ci}</span></td><td><span class="crit-tag crit-${cii}">${cii}</span></td><td>${m.reg}</td>`));
  });
  tbl.appendChild(tb); const host = $("#crosswalk-table"); host.innerHTML = ""; host.appendChild(tbl);
}

/* receipts */
function openReceipt(m, prof, r) {
  const req = DATA.requirements[r], c = DATA.cells[`${m.stem}|${prof}|${r}`];
  const scns = DATA.scenarios.filter(s => s.model === m.stem && s.profile === prof && s.requirement === r);
  scns.sort((a, b) => (a.verdict === "fail" ? 0 : 1) - (b.verdict === "fail" ? 0 : 1));
  const body = $("#receipt-body"); body.innerHTML = "";
  const head = el("div", "receipt-head");
  head.innerHTML = `<h3>${m.label} · ${r} ${req.name}</h3>` +
    `<div class="receipt-meta">${prof} (${DATA.profiles.find(p => p.id === prof).name}) · ${pct(c.rate)} pass (n=${c.n}) · ` +
    `verdict <b class="scn-verdict ${c.verdict}">${c.verdict.toUpperCase()}</b> · ${c.criticality}</div>` +
    `<p class="receipt-reg"><b>Test:</b> ${req.test}<br><b>Regulatory anchor:</b> ${req.reg}</p>`;
  body.appendChild(head);
  const show = scns.slice(0, 12);
  show.forEach(s => body.appendChild(scnCard(s)));
  if (scns.length > show.length) body.appendChild(set(el("div", "scn-more"), `+ ${scns.length - show.length} more scenarios (failures shown first)`));
  $("#receipt").hidden = false; document.body.style.overflow = "hidden";
}

function scnCard(s) {
  const card = el("div", "scn");
  card.appendChild(el("div", "scn-top", `<span>${s.id} · ${s.family}</span><span class="scn-verdict ${s.verdict}">${s.verdict.toUpperCase()}</span>`));
  const b = el("div", "scn-body");
  b.appendChild(set(el("div", "role"), "user prompt"));
  b.appendChild(set(el("div", "scn-text"), s.prompt + (s.injected_context ? "\n\n[injected context] " + s.injected_context : "")));
  b.appendChild(set(el("div", "role"), "model response"));
  b.appendChild(set(el("div", "scn-text"), s.response));
  if (s.judges) {
    b.appendChild(set(el("div", "role"), "cross-family judge panel"));
    const votes = el("div", "judge-votes");
    Object.entries(s.judges).forEach(([spec, v]) => votes.appendChild(el("span", `vote ${v}`, `${spec.split(":")[0]} <b>${v}</b>`)));
    b.appendChild(votes);
  } else if (s.reason) {
    b.appendChild(set(el("div", "role"), "rule grader"));
    b.appendChild(set(el("div", "scn-text"), s.reason));
  }
  card.appendChild(b); return card;
}

function wireReceipt() {
  const ov = $("#receipt"), close = () => { ov.hidden = true; document.body.style.overflow = ""; };
  $(".receipt-close").onclick = close;
  ov.onclick = e => { if (e.target === ov) close(); };
  document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
}

function svgEl(tag, attrs) { const e = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
function txt(x, y, s, attrs) { const e = svgEl("text", Object.assign({ x, y }, attrs || {})); e.textContent = s; return e; }
