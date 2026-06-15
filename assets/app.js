"use strict";
const MARK = { pass: "✓", partial: "~", fail: "✗", "context-only": "·", unassessed: "·" };
const CLS = { pass: "pass", partial: "partial", fail: "fail", "context-only": "context", unassessed: "unassessed" };
const TIERS = [
  ["frontier-closed", "Frontier · closed"],
  ["frontier-open", "Frontier · open weights"],
  ["open-8b", "Small open weights (7–8B)"],
];
let DATA, profile = "I-a", reqSel = "R6";

const $ = (s, r = document) => r.querySelector(s);
const el = (t, c, html) => { const e = document.createElement(t); if (c) e.className = c; if (html != null) e.innerHTML = html; return e; };
const pct = r => r == null ? "—" : (r * 100).toFixed(r * 100 % 1 ? 1 : 0) + "%";

fetch("assets/data.json").then(r => r.json()).then(d => { DATA = d; init(); })
  .catch(() => { $("#hero-answer").textContent = "Could not load data.json."; });

function init() {
  heroAnswer();
  toggles("#profile-toggle", DATA.profiles.map(p => [p.id, p.id]), profile, v => { profile = v; renderHeatmap(); });
  const gated = DATA.req_order.filter(r => DATA.requirements[r] && !isContext(r));
  toggles("#req-toggle", gated.map(r => [r, `${r} ${DATA.requirements[r].name}`]), reqSel, v => { reqSel = v; renderBars(); });
  renderHeatmap(); renderBars(); renderAlpha(); renderFamilyGate(); renderCrosswalk();
  wireReceipt();
}

function isContext(r) {
  const t = DATA.thresholds["I-a"][r] || {};
  return t.context_only === true;
}

function heroAnswer() {
  const rd = Object.values(DATA.readiness);
  const notReady = rd.filter(x => x.startsWith("Not-ready")).length;
  // R6 fail count across model×profile
  let r6fail = 0, r6tot = 0;
  for (const m of DATA.models) for (const p of ["I-a", "II-a"]) {
    const c = DATA.cells[`${m.stem}|${p}|R6`]; if (c) { r6tot++; if (c.verdict === "fail") r6fail++; }
  }
  $("#hero-answer").innerHTML =
    `<b>No.</b> All ${DATA.models.length} models — frontier and open — are <b>Not-ready at the model layer</b> ` +
    `(${notReady}/${rd.length} cards). The no-fabrication bar (R6) fails for <b>${r6fail} of ${r6tot}</b> model×profile cards: ` +
    `even the strongest misses by a single fabrication on a zero-tolerance bar. The value is the <em>spread</em> — and the wrap each failure demands.`;
}

function toggles(sel, opts, cur, onPick) {
  const box = $(sel); box.innerHTML = "";
  opts.forEach(([v, label]) => {
    const b = el("button", v === cur ? "active" : "", label);
    b.onclick = () => { box.querySelectorAll("button").forEach(x => x.classList.remove("active")); b.classList.add("active"); onPick(v); };
    box.appendChild(b);
  });
}

function renderHeatmap() {
  const reqs = DATA.req_order;
  const tbl = el("table", "hm-grid");
  const thead = el("thead"); const htr = el("tr");
  htr.appendChild(el("th", "", "model"));
  reqs.forEach(r => {
    const crit = (DATA.thresholds[profile][r] || {}).criticality || "";
    htr.appendChild(el("th", "", `${r}<div class="colcrit crit-${crit}">${crit.slice(0, 4) || ""}</div>`));
  });
  thead.appendChild(htr); tbl.appendChild(thead);
  const tb = el("tbody");
  TIERS.forEach(([tier, tlabel]) => {
    const models = DATA.models.filter(m => m.tier === tier);
    if (!models.length) return;
    const tr = el("tr", "tier"); const td = el("td"); td.colSpan = reqs.length + 1; td.textContent = tlabel; tr.appendChild(td); tb.appendChild(tr);
    models.forEach(m => {
      const row = el("tr");
      row.appendChild(el("td", "rowhead", `${m.label}<small>${m.family}</small>`));
      reqs.forEach(r => {
        const c = DATA.cells[`${m.stem}|${profile}|${r}`];
        const td2 = el("td");
        if (!c) { td2.innerHTML = `<span class="cell context"><span class="mark">·</span></span>`; row.appendChild(td2); return; }
        const cls = CLS[c.verdict] || "context";
        const clickable = ["pass", "partial", "fail"].includes(c.verdict);
        const btn = el("button", `cell ${cls}`);
        btn.innerHTML = `<span class="mark">${MARK[c.verdict] || "·"}</span><br>${c.rate == null ? "" : pct(c.rate)}`;
        if (clickable) { btn.onclick = () => openReceipt(m, profile, r); btn.title = `${m.label} · ${r} · click for the scenarios`; }
        else { btn.disabled = true; }
        td2.appendChild(btn); row.appendChild(td2);
      });
      tb.appendChild(row);
    });
  });
  tbl.appendChild(tb);
  const host = $("#heatmap"); host.innerHTML = ""; host.appendChild(tbl);

  // readiness strip
  $("#legend").innerHTML =
    `<span><span class="swatch" style="background:var(--pass-bg)"></span> pass (≥ target)</span>` +
    `<span><span class="swatch" style="background:var(--partial-bg)"></span> partial (≥ floor)</span>` +
    `<span><span class="swatch" style="background:var(--fail-bg)"></span> fail (&lt; floor)</span>` +
    `<span><span class="swatch" style="background:var(--context-bg)"></span> context-only (not gated)</span>` +
    `<span style="margin-left:auto;font-style:italic">every model on ${profile}: Not-ready (model-layer)</span>`;
}

function renderBars() {
  const r = reqSel;
  const rows = DATA.models.map(m => ({ m, c: DATA.cells[`${m.stem}|${profile}|${r}`] })).filter(x => x.c && x.c.rate != null);
  const host = $("#bars-chart"); host.innerHTML = "";
  if (!rows.length) { host.innerHTML = `<p class="section-lede">No gated scenarios for ${r} on ${profile}.</p>`; return; }
  const th = DATA.thresholds[profile][r] || {};
  const W = 760, padL = 160, padR = 56, rowH = 30, top = 28, bot = 24;
  const H = top + rows.length * rowH + bot;
  const x = v => padL + v * (W - padL - padR);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%" });
  // grid + axis
  [0, .25, .5, .75, 1].forEach(g => {
    svg.appendChild(svgEl("line", { x1: x(g), y1: top - 6, x2: x(g), y2: H - bot, stroke: "var(--line)" }));
    svg.appendChild(txt(x(g), H - bot + 14, (g * 100) + "%", { class: "bar-label", "text-anchor": "middle" }));
  });
  // floor + target lines
  const mark = (val, color, lab) => {
    if (val == null) return;
    svg.appendChild(svgEl("line", { x1: x(val), y1: top - 6, x2: x(val), y2: H - bot, stroke: color, class: "thr-line" }));
    svg.appendChild(txt(x(val), top - 10, lab, { class: "thr-label", fill: color, "text-anchor": "middle" }));
  };
  mark(th.floor, "var(--partial)", `floor ${th.floor != null ? th.floor : ""}`);
  mark(th.target, "var(--pass)", `target ${th.target != null ? th.target : ""}`);
  rows.forEach((row, i) => {
    const y = top + i * rowH + 4, h = rowH - 12, v = row.c.rate;
    const color = row.c.verdict === "pass" ? "var(--pass)" : row.c.verdict === "partial" ? "var(--partial)" : "var(--fail)";
    svg.appendChild(txt(padL - 8, y + h / 2 + 4, row.m.label, { class: "bar-label", "text-anchor": "end" }));
    svg.appendChild(svgEl("rect", { x: padL, y, width: Math.max(1, x(v) - padL), height: h, rx: 3, fill: color, opacity: .85 }));
    const t = txt(x(v) + 6, y + h / 2 + 4, pct(v), { class: "bar-val", fill: color });
    svg.appendChild(t);
  });
  const c = el("div", "chart"); c.appendChild(svg); host.appendChild(c);
}

function renderAlpha() {
  const cal = DATA.calibration, rb = cal.rule_baseline || {};
  const cards = [
    ["A↔B", rb.a_b, "two independent humans agree", true],
    ["panel↔A", cal.panel_a, "the LLM panel vs the human", true],
    ["A↔rule", rb.a_rule, "human vs the old rule grader", false],
    ["B↔rule", rb.b_rule, "2nd human vs the rule grader", false],
  ];
  const host = $("#alpha-chart"); host.innerHTML = "";
  cards.forEach(([lab, val, sub, hi]) => {
    const card = el("div", "alpha-card" + (hi ? " hi" : ""));
    card.innerHTML = `<div class="big">${val != null ? val.toFixed(3) : "—"}</div><div class="lab"><b>${lab}</b><br>${sub}</div>`;
    host.appendChild(card);
  });
  host.appendChild(Object.assign(el("p", "section-lede small"),
    { innerHTML: `Krippendorff's α (1.0 = perfect, 0 = chance). The two humans (0.771) agree far more than either agrees with the rule grader (0.61 / 0.55) — the rule was the outlier, which is the empirical case for the panel. The deployed panel reaches ${cal.panel_a != null ? cal.panel_a.toFixed(3) : "—"} vs the human.`, style: "margin-top:6px" }));
}

function renderFamilyGate() {
  const fams = DATA.calibration.per_family || [];
  const host = $("#family-gate");
  if (!fams.length) { host.innerHTML = ""; return; }
  const tbl = el("table", "data");
  tbl.innerHTML = `<thead><tr><th>Judgment family</th><th>panel↔A α</th><th>raw agree</th><th>fail-recall</th><th>n</th><th>gate</th></tr></thead>`;
  const tb = el("tbody");
  fams.forEach(f => {
    const g = f.gate.toLowerCase();
    const cls = g.includes("publish") ? "gate-publish" : g.includes("tentative") ? "gate-tentative" : "gate-deploy";
    const tr = el("tr");
    tr.innerHTML = `<td>${f.family}</td><td class="num">${f.alpha}</td><td class="num">${f.raw}</td>` +
      `<td class="num">${f.fail_recall}</td><td class="num">${f.n}</td><td><span class="gate-pill ${cls}">${f.gate}</span></td>`;
    tb.appendChild(tr);
  });
  tbl.appendChild(tb); host.innerHTML = ""; host.appendChild(tbl);
}

function renderCrosswalk() {
  const tbl = el("table", "data");
  tbl.innerHTML = `<thead><tr><th>R</th><th>Requirement</th><th>Model-behavior test</th><th>I-a</th><th>II-a</th><th>Regulatory anchor</th></tr></thead>`;
  const tb = el("tbody");
  DATA.req_order.forEach(r => {
    const m = DATA.requirements[r]; if (!m) return;
    const ci = (DATA.thresholds["I-a"][r] || {}).criticality || "—";
    const cii = (DATA.thresholds["II-a"][r] || {}).criticality || "—";
    const tr = el("tr");
    tr.innerHTML = `<td><b>${r}</b></td><td>${m.name}</td><td>${m.test}</td>` +
      `<td><span class="crit-tag crit-${ci}">${ci}</span></td><td><span class="crit-tag crit-${cii}">${cii}</span></td><td>${m.reg}</td>`;
    tb.appendChild(tr);
  });
  tbl.appendChild(tb); const host = $("#crosswalk-table"); host.innerHTML = ""; host.appendChild(tbl);
}

/* ---- receipts ---- */
function openReceipt(m, prof, r) {
  const req = DATA.requirements[r];
  const c = DATA.cells[`${m.stem}|${prof}|${r}`];
  const scns = DATA.scenarios.filter(s => s.model === m.stem && s.profile === prof && s.requirement === r);
  scns.sort((a, b) => (a.verdict === "fail" ? -1 : 1) - (b.verdict === "fail" ? -1 : 1));
  const body = $("#receipt-body");
  body.innerHTML = "";
  const head = el("div", "receipt-head");
  head.innerHTML = `<h3>${m.label} — ${r} ${req.name}</h3>` +
    `<div class="receipt-meta">${prof} (${DATA.profiles.find(p => p.id === prof).name}) · ${pct(c.rate)} pass (${c.n}) · verdict <b class="scn-verdict ${c.verdict}">${c.verdict.toUpperCase()}</b> · ${c.criticality}</div>` +
    `<p class="receipt-reg"><b>Test:</b> ${req.test}<br><b>Regulatory anchor:</b> ${req.reg}</p>`;
  body.appendChild(head);
  const show = scns.slice(0, 12);
  show.forEach(s => body.appendChild(scnCard(s)));
  if (scns.length > show.length) body.appendChild(Object.assign(el("div", "scn-more"), { textContent: `+ ${scns.length - show.length} more scenarios (failures shown first)` }));
  $("#receipt").hidden = false;
  document.body.style.overflow = "hidden";
}

function scnCard(s) {
  const card = el("div", "scn");
  const top = el("div", "scn-top");
  top.innerHTML = `<span>${s.id} · ${s.family}</span><span class="scn-verdict ${s.verdict}">${s.verdict.toUpperCase()}</span>`;
  card.appendChild(top);
  const b = el("div", "scn-body");
  b.appendChild(Object.assign(el("div", "role"), { textContent: "user prompt" }));
  b.appendChild(Object.assign(el("div", "scn-text"), { textContent: s.prompt + (s.injected_context ? "\n\n[injected context] " + s.injected_context : "") }));
  b.appendChild(Object.assign(el("div", "role"), { textContent: "model response" }));
  b.appendChild(Object.assign(el("div", "scn-text"), { textContent: s.response }));
  if (s.judges) {
    const votes = el("div", "judge-votes");
    Object.entries(s.judges).forEach(([spec, v]) => {
      const fam = spec.split(":")[0];
      votes.appendChild(Object.assign(el("span", `vote ${v}`), { innerHTML: `${fam} <b>${v}</b>` }));
    });
    b.appendChild(Object.assign(el("div", "role"), { textContent: "cross-family judge panel" }));
    b.appendChild(votes);
  } else if (s.reason) {
    b.appendChild(Object.assign(el("div", "role"), { textContent: "rule grader" }));
    b.appendChild(Object.assign(el("div", "scn-text"), { textContent: s.reason }));
  }
  card.appendChild(b);
  return card;
}

function wireReceipt() {
  const ov = $("#receipt");
  const close = () => { ov.hidden = true; document.body.style.overflow = ""; };
  $(".receipt-close").onclick = close;
  ov.onclick = e => { if (e.target === ov) close(); };
  document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
}

/* ---- tiny svg helpers ---- */
function svgEl(tag, attrs) { const e = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
function txt(x, y, s, attrs) { const e = svgEl("text", Object.assign({ x, y }, attrs || {})); e.textContent = s; return e; }
