/* ===========================================================================
   Gulf CDC — Workforce Knowledge Continuity Portal
   Vanilla JS. No build step, no dependencies. Reads window.GCDC_DATA.
   =========================================================================== */
(function () {
  "use strict";

  const DATA = window.GCDC_DATA || {};
  const TX = DATA.taxonomy || [];
  const MATRIX = DATA.expertiseMatrix || [];
  const GAPS = DATA.knowledgeGaps || [];
  const HOLDERS = DATA.criticalHolders || [];
  const SHORTLIST = DATA.interviewShortlist || [];

  /* ---------------------------------------------------------------- helpers */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clean = (s) => String(s || "").trim().replace(/\s+/g, " ");

  // Classify a coverage-status string → {cls, icon, label}
  function coverageStatus(raw) {
    const s = String(raw || "");
    if (s.includes("No Core Expert")) return { cls: "critical", icon: "■", label: "No Core Expert" };
    if (s.includes("Single Core") || s.includes("SPOF") || s.includes("Single Point"))
      return { cls: "serious", icon: "▲", label: "Single Core Expert" };
    if (s.includes("Thin")) return { cls: "warn", icon: "◆", label: "Thin Coverage" };
    if (s.includes("Adequate")) return { cls: "good", icon: "●", label: "Adequate" };
    return { cls: "neutral", icon: "•", label: clean(s.replace(/^[^\w]+/, "")) || "—" };
  }
  // Classify a continuity-risk flag → {cls, label}
  function riskFlag(raw) {
    const s = String(raw || "");
    if (s.includes("High")) return { cls: "critical", label: "High Continuity Risk" };
    if (s.includes("Moderate")) return { cls: "moderate", label: "Moderate Risk" };
    return { cls: "good", label: "Low / Standard" };
  }
  const riskColor = (cls) =>
    cls === "critical" ? "var(--st-critical)" :
    cls === "moderate" ? "var(--st-warn)" : "var(--st-good)";

  // Fixed categorical colour per domain (order of first appearance in taxonomy)
  const DOMAINS = [];
  TX.forEach((t) => { if (!DOMAINS.includes(t.domain)) DOMAINS.push(t.domain); });
  const DOMAIN_COLOR = {};
  DOMAINS.forEach((d, i) => { DOMAIN_COLOR[d] = `var(--c${(i % 9) + 1})`; });

  function pill(cls, label, icon) {
    return `<span class="pill pill--${cls}"><span class="pill__dot"></span>${icon ? esc(icon) + " " : ""}${esc(label)}</span>`;
  }

  /* ---------------------------------------------------------------- tooltip */
  const tip = $("#tooltip");
  function showTip(html, x, y) {
    tip.innerHTML = html; tip.hidden = false;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  function hideTip() { tip.hidden = true; }
  document.addEventListener("mousemove", (e) => {
    const t = e.target.closest("[data-tip]");
    if (t) showTip(t.getAttribute("data-tip"), e.clientX, e.clientY);
    else hideTip();
  });
  document.addEventListener("mouseleave", hideTip);

  /* ---------------------------------------------------------------- charts */
  // Donut from segments [{label, value, colorVar}]
  function donut(segments, opts = {}) {
    const total = segments.reduce((a, s) => a + s.value, 0) || 1;
    const R = 52, C = 2 * Math.PI * R, cx = 60, cy = 60, sw = 18;
    let off = 0;
    const arcs = segments.filter((s) => s.value > 0).map((s) => {
      const len = (s.value / total) * C;
      const seg = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none"
        stroke="${s.color}" stroke-width="${sw}"
        stroke-dasharray="${len - 2} ${C - len + 2}" stroke-dashoffset="${-off}"
        transform="rotate(-90 ${cx} ${cy})" stroke-linecap="butt"
        data-tip="<b>${esc(s.label)}</b><br>${s.value} (${Math.round(s.value / total * 100)}%)"></circle>`;
      off += len; return seg;
    }).join("");
    const center = opts.centerNum != null
      ? `<text x="${cx}" y="${cy - 2}" text-anchor="middle" class="donut-center__num">${opts.centerNum}</text>
         <text x="${cx}" y="${cy + 15}" text-anchor="middle" class="donut-center__lbl">${esc(opts.centerLbl || "")}</text>` : "";
    return `<svg viewBox="0 0 120 120" width="150" height="150" class="chart" role="img" aria-label="${esc(opts.aria || "chart")}">
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--surface-2)" stroke-width="${sw}"></circle>
      ${arcs}${center}</svg>`;
  }
  function legend(items) {
    return `<div class="legend">` + items.map((i) =>
      `<span class="legend__item"><span class="legend__swatch" style="background:${i.color}"></span>${esc(i.label)} <b style="color:var(--ink)">${i.value}</b></span>`
    ).join("") + `</div>`;
  }
  // Horizontal stacked-bar rows: rows [{label, color, segs:[{value,color,label}]}]
  function stackedRows(rows, maxTotal) {
    return `<div style="display:grid;gap:10px;margin-top:6px">` + rows.map((r) => {
      const total = r.segs.reduce((a, s) => a + s.value, 0);
      const segs = r.segs.filter((s) => s.value > 0).map((s) =>
        `<span style="width:${(s.value / maxTotal) * 100}%;background:${s.color}"
           data-tip="<b>${esc(r.label)}</b><br>${esc(s.label)}: ${s.value}"></span>`).join("");
      return `<div style="display:grid;grid-template-columns:190px 1fr 34px;gap:12px;align-items:center">
        <span style="font-size:12.5px;color:var(--ink-2);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.label)}">${esc(r.label)}</span>
        <span style="display:flex;height:20px;border-radius:6px;overflow:hidden;background:var(--surface-2);gap:2px">${segs}</span>
        <span style="font-weight:700;font-variant-numeric:tabular-nums">${total}</span>
      </div>`;
    }).join("") + `</div>`;
  }
  // Ranked horizontal bars: items [{label, value, color, tip}]
  function rankedBars(items, max) {
    return `<div style="display:grid;gap:8px">` + items.map((it) =>
      `<div style="display:grid;grid-template-columns:150px 1fr 32px;gap:10px;align-items:center">
        <span style="font-size:12.5px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(it.label)}">${esc(it.label)}</span>
        <span style="height:16px;background:var(--surface-2);border-radius:5px;overflow:hidden">
          <span style="display:block;height:100%;width:${(it.value / max) * 100}%;background:${it.color};border-radius:5px" data-tip="${esc(it.tip || it.label + ': ' + it.value)}"></span>
        </span>
        <span style="font-weight:700;font-variant-numeric:tabular-nums;text-align:right">${it.value}</span>
      </div>`
    ).join("") + `</div>`;
  }

  /* ---------------------------------------------------------------- metrics */
  const M = {
    experts: HOLDERS.length,
    domains: DOMAINS.length,
    expertiseAreas: TX.length,
    subdomains: new Set(TX.map((t) => t.domain + " > " + t.subdomain)).size,
    depts: new Set(HOLDERS.map((h) => h.department)).size,
    spof: GAPS.filter((g) => coverageStatus(g.status).cls === "serious").length,
    thin: GAPS.filter((g) => coverageStatus(g.status).cls === "warn").length,
    adequate: GAPS.filter((g) => coverageStatus(g.status).cls === "good").length,
    noCore: GAPS.filter((g) => coverageStatus(g.status).cls === "critical").length,
    highRisk: HOLDERS.filter((h) => riskFlag(h.flag).cls === "critical").length,
    moderateRisk: HOLDERS.filter((h) => riskFlag(h.flag).cls === "moderate").length,
    lowRisk: HOLDERS.filter((h) => riskFlag(h.flag).cls === "good").length,
    interviews: SHORTLIST.length,
  };

  /* ================================================================ VIEWS  */

  function renderOverview(el) {
    const cov = [
      { label: "Adequate (3+ core)", value: M.adequate, color: "var(--st-good)" },
      { label: "Thin (2 core)", value: M.thin, color: "var(--st-warn)" },
      { label: "Single core expert", value: M.spof, color: "var(--st-serious)" },
    ];
    const risk = [
      { label: "High Continuity Risk", value: M.highRisk, color: "var(--st-critical)" },
      { label: "Moderate Risk", value: M.moderateRisk, color: "var(--st-warn)" },
      { label: "Low / Standard", value: M.lowRisk, color: "var(--st-good)" },
    ];

    // Coverage by domain (stacked) — core taxonomy areas only (57)
    const byDomain = DOMAINS.map((d) => {
      const rows = GAPS.filter((g) => g.domain === d && g.in_taxonomy !== false);
      const c = { good: 0, warn: 0, serious: 0 };
      rows.forEach((g) => { const cl = coverageStatus(g.status).cls; if (c[cl] != null) c[cl]++; });
      return { label: d, total: rows.length,
        segs: [
          { value: c.good, color: "var(--st-good)", label: "Adequate" },
          { value: c.warn, color: "var(--st-warn)", label: "Thin (2 core)" },
          { value: c.serious, color: "var(--st-serious)", label: "Single core expert" },
        ] };
    }).sort((a, b) => b.total - a.total);
    const maxDomTotal = Math.max(...byDomain.map((d) => d.total));

    // Top continuity risks
    const topRisk = HOLDERS.slice().sort((a, b) => b.risk_index - a.risk_index).slice(0, 8)
      .map((h) => ({ label: h.name.trim(), value: h.risk_index, color: riskColor(riskFlag(h.flag).cls),
        tip: `<b>${esc(h.name.trim())}</b> (${esc(h.department)})<br>Risk index: ${h.risk_index} · Depth ${h.depth} · Scarcity ${h.scarcity} · Impact ${h.impact}` }));
    const maxRisk = Math.max(...HOLDERS.map((h) => h.risk_index));

    const kpi = (val, label, note, accent) =>
      `<div class="card kpi" style="--kpi-accent:${accent}">
        <div class="kpi__value">${val}</div><div class="kpi__label">${label}</div>
        ${note ? `<div class="kpi__note">${note}</div>` : ""}</div>`;

    el.innerHTML = `
      <div class="view__head">
        <h1>Workforce Knowledge Continuity</h1>
        <p>A live picture of where GCDC's core expertise lives, where losing one person would break a capability, and who to talk to first. Built from the core-taxonomy analysis: ${M.experts} staff across ${M.depts} departments, mapped to ${M.domains} domains and ${M.expertiseAreas} core expertise areas.</p>
      </div>

      <div class="grid grid--kpi">
        ${kpi(M.experts, "Staff assessed", `${M.depts} departments`, "var(--brand)")}
        ${kpi(M.expertiseAreas, "Core expertise areas", `${M.subdomains} sub-domains`, "var(--accent)")}
        ${kpi(M.spof, "Single core expert", "Only one core holder", "var(--st-serious)")}
        ${kpi(M.thin, "Thinly covered", "Only two core holders", "var(--st-warn)")}
        ${kpi(M.noCore, "No core expert", "Areas dropped from taxonomy", "var(--st-critical)")}
        ${kpi(M.highRisk, "High-risk experts", "Continuity flag", "var(--st-critical)")}
        ${kpi(M.interviews, "Interview shortlist", "Knowledge capture", "var(--brand)")}
      </div>

      <div class="grid grid--2" style="margin-top:16px">
        <div class="card">
          <div class="card__hd"><div class="card__title">Expertise coverage</div>
            <div class="card__sub">How many of the ${M.expertiseAreas} areas are resilient vs. fragile</div></div>
          <div class="donut-wrap">
            ${donut(cov, { centerNum: M.expertiseAreas, centerLbl: "areas", aria: "Expertise coverage distribution" })}
            <div style="flex:1;min-width:150px">${legend(cov)}
              <p class="card__sub" style="margin-top:12px">${Math.round((M.spof + M.thin) / M.expertiseAreas * 100)}% of all capabilities rest on one or two people.</p>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card__hd"><div class="card__title">Workforce continuity risk</div>
            <div class="card__sub">Staff by continuity-risk flag</div></div>
          <div class="donut-wrap">
            ${donut(risk, { centerNum: M.experts, centerLbl: "staff", aria: "Workforce risk distribution" })}
            <div style="flex:1;min-width:150px">${legend(risk)}
              <p class="card__sub" style="margin-top:12px">${M.highRisk} staff combine deep, scarce and high-impact expertise — the priority for knowledge capture.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid--2" style="margin-top:16px">
        <div class="card">
          <div class="card__hd"><div class="card__title">Coverage by domain</div>
            <div class="card__sub">Expertise areas per domain, by resilience</div></div>
          ${stackedRows(byDomain, maxDomTotal)}
          <div class="legend" style="margin-top:16px">
            <span class="legend__item"><span class="legend__swatch" style="background:var(--st-good)"></span>Adequate</span>
            <span class="legend__item"><span class="legend__swatch" style="background:var(--st-warn)"></span>Thin</span>
            <span class="legend__item"><span class="legend__swatch" style="background:var(--st-serious)"></span>Single point</span>
          </div>
        </div>
        <div class="card">
          <div class="card__hd"><div class="card__title">Highest continuity risk</div>
            <div class="card__sub">Top staff by risk index (depth × scarcity × impact)</div></div>
          ${rankedBars(topRisk, maxRisk)}
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------------- Holders */
  const holdersState = { sort: "risk_index", dir: -1, dept: "all", q: "" };
  function renderHolders(el) {
    const depts = ["all", ...Array.from(new Set(HOLDERS.map((h) => h.department)))];
    el.innerHTML = `
      <div class="view__head"><h1>Critical Experts</h1>
        <p>All ${M.experts} staff scored on knowledge depth, scarcity of their skills, and organisational impact. Risk index = depth × scarcity × impact. Sort or filter to explore.</p></div>
      <div class="toolbar">
        <div class="field"><input type="search" id="hq" placeholder="Search name or expertise…" aria-label="Search experts" value="${esc(holdersState.q)}"></div>
        <div class="field"><select id="hdept" aria-label="Filter by department">
          ${depts.map((d) => `<option value="${esc(d)}"${d === holdersState.dept ? " selected" : ""}>${d === "all" ? "All departments" : esc(d)}</option>`).join("")}
        </select></div>
        <span class="muted" id="hcount" style="margin-left:auto;font-size:13px"></span>
      </div>
      <div class="table-wrap"><table class="data" id="htable"></table></div>`;

    const cols = [
      { key: "rank", label: "#", num: true },
      { key: "name", label: "Name" },
      { key: "department", label: "Dept" },
      { key: "position", label: "Position" },
      { key: "years", label: "Tenure" },
      { key: "depth", label: "Depth", num: true },
      { key: "scarcity", label: "Scarce", num: true },
      { key: "impact", label: "Impact", num: true },
      { key: "risk_index", label: "Risk", num: true },
      { key: "core_areas", label: "Core expertise areas", sort: false },
      { key: "flag", label: "Flag" },
    ];

    function draw() {
      const q = holdersState.q.toLowerCase();
      let rows = HOLDERS.filter((h) =>
        (holdersState.dept === "all" || h.department === holdersState.dept) &&
        (!q || (h.name + " " + h.core_areas + " " + h.position).toLowerCase().includes(q)));
      const k = holdersState.sort, dir = holdersState.dir;
      rows = rows.slice().sort((a, b) => {
        let x = a[k], y = b[k];
        if (typeof x === "number") return (x - y) * dir;
        return String(x).localeCompare(String(y)) * dir;
      });
      const maxRisk = Math.max(...HOLDERS.map((h) => h.risk_index));
      const thead = `<thead><tr>${cols.map((c) => {
        const sortable = c.sort !== false;
        const active = holdersState.sort === c.key;
        const aria = active ? (dir === 1 ? "ascending" : "descending") : "none";
        return `<th class="${c.num ? "num " : ""}${sortable ? "" : "no-sort"}" ${sortable ? `data-k="${c.key}" aria-sort="${aria}"` : ""}>${esc(c.label)}${sortable ? ` <span class="arrow">${active ? (dir === 1 ? "▲" : "▼") : "↕"}</span>` : ""}</th>`;
      }).join("")}</tr></thead>`;
      const body = `<tbody>${rows.map((h) => {
        const f = riskFlag(h.flag);
        const core = h.core_areas ? esc(h.core_areas) : `<span class="muted">—</span>`;
        return `<tr>
          <td class="num muted">${h.rank}</td>
          <td class="name-cell">${esc(h.name.trim())}${h.leader ? ' <span title="Manager / leader" style="color:var(--st-warn)">★</span>' : ""}</td>
          <td><span class="dept-tag">${esc(h.department)}</span></td>
          <td>${esc(h.position)}</td>
          <td class="muted">${esc(h.years)}</td>
          <td class="num">${h.depth}</td>
          <td class="num">${h.scarcity}</td>
          <td class="num">${h.impact}</td>
          <td><span class="riskbar"><span class="riskbar__val">${h.risk_index}</span>
            <span class="riskbar__track"><span class="riskbar__fill" style="width:${h.risk_index / maxRisk * 100}%;background:${riskColor(f.cls)}"></span></span></span></td>
          <td class="rare-list">${core}</td>
          <td>${pill(f.cls, f.cls === "critical" ? "High" : f.cls === "moderate" ? "Moderate" : "Low")}</td>
        </tr>`;
      }).join("")}</tbody>`;
      $("#htable").innerHTML = thead + body;
      $("#hcount").textContent = `${rows.length} of ${HOLDERS.length} staff`;
      $$("#htable th[data-k]").forEach((th) => th.addEventListener("click", () => {
        const k = th.getAttribute("data-k");
        if (holdersState.sort === k) holdersState.dir *= -1;
        else { holdersState.sort = k; holdersState.dir = (k === "name" || k === "position") ? 1 : -1; }
        draw();
      }));
    }
    draw();
    $("#hq").addEventListener("input", (e) => { holdersState.q = e.target.value; draw(); });
    $("#hdept").addEventListener("change", (e) => { holdersState.dept = e.target.value; draw(); });
  }

  /* ---------------------------------------------------------------- Gaps */
  const gapsState = { status: "all", q: "" };
  function renderGaps(el) {
    // Heatmap domain × status
    const statusOrder = [
      { cls: "good", label: "Adequate", color: "var(--st-good)" },
      { cls: "warn", label: "Thin", color: "var(--st-warn)" },
      { cls: "serious", label: "Single core", color: "var(--st-serious)" },
      { cls: "critical", label: "No core", color: "var(--st-critical)" },
    ];
    const heatRows = DOMAINS.map((d) => {
      const counts = { good: 0, warn: 0, serious: 0, critical: 0 };
      GAPS.filter((g) => g.domain === d).forEach((g) => { const c = coverageStatus(g.status).cls; if (counts[c] != null) counts[c]++; });
      return { domain: d, counts };
    });
    const heat = `<table class="heat"><thead><tr><th class="row-h">Domain</th>
      ${statusOrder.map((s) => `<th>${s.label}</th>`).join("")}<th>Total</th></tr></thead><tbody>
      ${heatRows.map((r) => {
        const total = r.counts.good + r.counts.warn + r.counts.serious + r.counts.critical;
        return `<tr><td class="row-h">${esc(r.domain)}</td>
          ${statusOrder.map((s) => {
            const v = r.counts[s.cls];
            return `<td><span class="heat-cell ${v === 0 ? "zero" : ""}" style="${v ? `background:${s.color}` : ""}"
              data-tip="<b>${esc(r.domain)}</b><br>${s.label}: ${v}">${v}</span></td>`;
          }).join("")}
          <td><span class="heat-cell zero" style="font-weight:800;color:var(--ink)">${total}</span></td></tr>`;
      }).join("")}</tbody></table>`;

    el.innerHTML = `
      <div class="view__head"><h1>Knowledge Gaps</h1>
        <p>Core expertise areas rated by how many people hold each as <em>core</em> expertise. <b style="color:var(--st-serious)">Single core experts</b> (one holder) are the sharpest continuity risk; <b style="color:var(--st-critical)">no core expert</b> marks areas dropped from the taxonomy because nobody holds them at core level.</p></div>

      <div class="grid grid--kpi" style="margin-bottom:16px">
        <div class="card kpi" style="--kpi-accent:var(--st-good)"><div class="kpi__value">${M.adequate}</div><div class="kpi__label">Adequate (3+ core)</div></div>
        <div class="card kpi" style="--kpi-accent:var(--st-warn)"><div class="kpi__value">${M.thin}</div><div class="kpi__label">Thin coverage (2 core)</div></div>
        <div class="card kpi" style="--kpi-accent:var(--st-serious)"><div class="kpi__value">${M.spof}</div><div class="kpi__label">Single core expert</div></div>
        <div class="card kpi" style="--kpi-accent:var(--st-critical)"><div class="kpi__value">${M.noCore}</div><div class="kpi__label">No core expert</div></div>
      </div>

      <div class="card">
        <div class="card__hd"><div class="card__title">Coverage heatmap</div>
          <div class="card__sub">Expertise areas per domain, by resilience level</div></div>
        <div class="table-wrap" style="border:0;box-shadow:none">${heat}</div>
      </div>

      <div class="toolbar" style="margin-top:24px">
        <div class="field"><input type="search" id="gq" placeholder="Search expertise or domain…" aria-label="Search gaps" value="${esc(gapsState.q)}"></div>
        <div class="field"><select id="gstatus" aria-label="Filter by status">
          <option value="all">All statuses</option>
          <option value="serious">Single core expert</option>
          <option value="critical">No core expert</option>
          <option value="warn">Thin coverage</option>
          <option value="good">Adequate</option>
        </select></div>
        <span class="muted" id="gcount" style="margin-left:auto;font-size:13px"></span>
      </div>
      <div class="table-wrap"><table class="data" id="gtable"></table></div>`;

    $("#gstatus").value = gapsState.status;

    function draw() {
      const q = gapsState.q.toLowerCase();
      const rows = GAPS.filter((g) => {
        const st = coverageStatus(g.status).cls;
        return (gapsState.status === "all" || st === gapsState.status) &&
          (!q || (g.expertise + " " + g.domain + " " + g.subdomain).toLowerCase().includes(q));
      }).sort((a, b) => a.holders_n - b.holders_n || a.domain.localeCompare(b.domain));
      $("#gtable").innerHTML = `<thead><tr>
          <th>Expertise</th><th>Domain</th><th>Sub-domain</th>
          <th class="num">Core</th><th>Status</th><th>Sole core holder</th><th>Recommended action</th>
        </tr></thead><tbody>${rows.map((g) => {
          const s = coverageStatus(g.status);
          return `<tr>
            <td class="name-cell">${esc(g.expertise)}</td>
            <td><span class="dept-tag" style="background:color-mix(in srgb,${DOMAIN_COLOR[g.domain]} 18%,transparent);color:${DOMAIN_COLOR[g.domain]}">${esc(g.domain)}</span></td>
            <td class="muted">${esc(g.subdomain)}</td>
            <td class="num"><b>${g.holders_n}</b></td>
            <td>${pill(s.cls, s.label, s.icon)}</td>
            <td class="muted">${g.sole_holder ? esc(g.sole_holder) : "—"}</td>
            <td class="muted">${esc(g.recommendation)}</td>
          </tr>`;
        }).join("")}</tbody>`;
      $("#gcount").textContent = `${rows.length} of ${GAPS.length} areas`;
    }
    draw();
    $("#gq").addEventListener("input", (e) => { gapsState.q = e.target.value; draw(); });
    $("#gstatus").addEventListener("change", (e) => { gapsState.status = e.target.value; draw(); });
  }

  /* ---------------------------------------------------------------- Interviews */
  // Classify the interview status string → {cls, label}
  function interviewStatus(raw) {
    const s = String(raw || "");
    if (s.includes("✓") || /interviewed/i.test(s)) return { cls: "good", label: "Interviewed" };
    if (s.includes("◑") || /survey/i.test(s)) return { cls: "moderate", label: "Survey-validated" };
    return { cls: "neutral", label: "Pending interview" };
  }
  function renderInterviews(el) {
    const done = SHORTLIST.filter((s) => interviewStatus(s.interview_status).cls === "good").length;
    const totalMin = SHORTLIST.reduce((a, s) => a + (parseInt(s.duration, 10) || 0), 0);
    const cards = SHORTLIST.slice().sort((a, b) => a.order - b.order).map((s) => {
      const focus = String(s.focus || "").split(";").map(clean).filter(Boolean);
      const iv = interviewStatus(s.interview_status);
      return `<article class="iv">
        <div class="iv__rank">${s.order}</div>
        <div>
          <div class="iv__name">${esc(s.name.trim())} <span class="dept-tag">${esc(s.department)}</span></div>
          <div class="iv__meta">${esc(s.position)} · ${esc(s.profile_level)}</div>
        </div>
        <div class="iv__right">
          ${pill("critical", "Risk " + s.risk_index)}
          ${pill(iv.cls, iv.label)}
          <span class="muted" style="font-size:12px">${esc(s.duration)}</span>
        </div>
        <div class="iv__why">${focus.map((r) => `<span class="tag-chip">${esc(r)}</span>`).join("")}</div>
      </article>`;
    }).join("");

    el.innerHTML = `
      <div class="view__head"><h1>Knowledge-Capture Interview Plan</h1>
        <p>The structured deep-dive interview shortlist — all managers and strategic-profile staff, ordered by continuity risk. ${done} of ${SHORTLIST.length} interviews complete · about ${Math.round(totalMin / 60)} hours total.</p></div>
      <div class="iv-list">${cards}</div>`;
  }

  /* ---------------------------------------------------------------- Matrix */
  const matrixState = { q: "", domain: "all" };
  function renderMatrix(el) {
    // index coverage status by expertise path
    const statusByPath = {};
    GAPS.forEach((g) => { statusByPath[g.domain + ">" + g.subdomain + ">" + g.expertise] = g; });
    const holdersByPath = {};
    MATRIX.forEach((m) => { holdersByPath[m.domain + ">" + m.subdomain + ">" + m.expertise] = m; });

    el.innerHTML = `
      <div class="view__head"><h1>Expertise Matrix</h1>
        <p>The full taxonomy: ${M.domains} domains, ${M.subdomains} sub-domains and ${M.expertiseAreas} expertise areas, showing who holds each. Colour marks coverage resilience.</p></div>
      <div class="toolbar">
        <div class="field"><input type="search" id="mq" placeholder="Search expertise or person…" aria-label="Search matrix" value="${esc(matrixState.q)}"></div>
        <div class="field"><select id="mdomain" aria-label="Filter by domain">
          <option value="all">All domains</option>
          ${DOMAINS.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join("")}
        </select></div>
        <span class="muted" id="mcount" style="margin-left:auto;font-size:13px"></span>
      </div>
      <div id="mbody"></div>`;
    $("#mdomain").value = matrixState.domain;

    function draw() {
      const q = matrixState.q.toLowerCase();
      let shown = 0;
      const html = DOMAINS.filter((d) => matrixState.domain === "all" || d === matrixState.domain).map((d) => {
        const items = TX.filter((t) => t.domain === d).filter((t) => {
          const key = t.domain + ">" + t.subdomain + ">" + t.expertise;
          const m = holdersByPath[key];
          const hay = (t.expertise + " " + t.subdomain + " " + (m ? m.holders.join(" ") : "")).toLowerCase();
          return !q || hay.includes(q);
        });
        if (!items.length) return "";
        shown += items.length;
        const cards = items.map((t) => {
          const key = t.domain + ">" + t.subdomain + ">" + t.expertise;
          const m = holdersByPath[key]; const g = statusByPath[key];
          const s = coverageStatus(g ? g.status : "");
          const holders = m ? m.holders : [];
          return `<div class="exp">
            <div class="exp__hd">
              <div><div class="exp__name">${esc(t.expertise)}</div>
                <div class="exp__sub">${esc(t.subdomain)}</div></div>
              ${pill(s.cls, String(holders.length), s.icon)}
            </div>
            <div class="exp__holders">${holders.length
              ? holders.map((h) => `<span class="holder-chip">${esc(clean(h))}</span>`).join("")
              : `<span class="muted" style="font-size:12px">No holder recorded</span>`}</div>
          </div>`;
        }).join("");
        return `<div class="domain-block">
          <div class="domain-block__hd" style="--dom-color:${DOMAIN_COLOR[d]}">
            <h3>${esc(d)}</h3><span class="domain-block__count">${items.length} area${items.length !== 1 ? "s" : ""}</span>
          </div>
          <div class="exp-grid">${cards}</div>
        </div>`;
      }).join("");
      $("#mbody").innerHTML = html || `<div class="empty">No expertise areas match your search.</div>`;
      $("#mcount").textContent = `${shown} of ${TX.length} areas`;
    }
    draw();
    $("#mq").addEventListener("input", (e) => { matrixState.q = e.target.value; draw(); });
    $("#mdomain").addEventListener("change", (e) => { matrixState.domain = e.target.value; draw(); });
  }

  /* ---------------------------------------------------------------- Mapping (Coggle-style tree) */
  // Root → Domain (Tier 1) → Sub-domain (Tier 2) → Expertise (Tier 3) → Holders
  const mapState = { expanded: null, q: "", k: 1, tx: 24, ty: 24 };

  const MAP_TREE = (function buildTree() {
    const holdersByPath = {};
    MATRIX.forEach((m) => { holdersByPath[m.domain + ">" + m.subdomain + ">" + m.expertise] = m.holders; });
    const root = { id: "root", label: "GCDC Expertise", tier: 0, color: "var(--brand)", children: [] };
    DOMAINS.forEach((d, di) => {
      const dn = { id: "d" + di, label: d, tier: 1, color: DOMAIN_COLOR[d], children: [] };
      const subs = [];
      TX.forEach((t) => { if (t.domain === d && !subs.includes(t.subdomain)) subs.push(t.subdomain); });
      subs.forEach((s, si) => {
        const sn = { id: dn.id + "-s" + si, label: s, tier: 2, color: dn.color, children: [] };
        TX.filter((t) => t.domain === d && t.subdomain === s).forEach((t, ei) => {
          const holders = holdersByPath[d + ">" + s + ">" + t.expertise] || [];
          sn.children.push({
            id: sn.id + "-e" + ei, label: t.expertise, tier: 3, color: dn.color,
            children: holders.map((h, hi) => ({
              id: sn.id + "-e" + ei + "-h" + hi, label: clean(h), tier: 4, color: dn.color, children: [],
            })),
          });
        });
        dn.children.push(sn);
      });
      root.children.push(dn);
    });
    // descendant counts (expertise areas + holders) for collapsed-node badges
    (function count(n) {
      n.nExp = n.tier === 3 ? 1 : 0;
      n.nHold = n.tier === 4 ? 1 : 0;
      n.children.forEach((c) => { count(c); n.nExp += c.nExp; n.nHold += c.nHold; });
    })(root);
    return root;
  })();

  function mapDefaultExpanded() {
    return new Set(["root", ...MAP_TREE.children.map((d) => d.id)]);
  }

  function renderMapping(el) {
    if (!mapState.expanded) mapState.expanded = mapDefaultExpanded();

    el.innerHTML = `
      <div class="view__head"><h1>Expertise Mapping</h1>
        <p>The full knowledge hierarchy as an interactive tree — Root → Domain → Sub-domain → Expertise → Holders. Click a node to expand or collapse its branch; drag to pan and scroll to zoom.</p></div>
      <div class="toolbar">
        <div class="field"><input type="search" id="mapq" placeholder="Search the tree…" aria-label="Search mapping tree" value="${esc(mapState.q)}"></div>
        <button class="btn" id="mapExpand">Expand all</button>
        <button class="btn" id="mapCollapse">Collapse all</button>
        <button class="btn" id="mapReset">Reset view</button>
        <span class="muted" style="margin-left:auto;font-size:13px">${MAP_TREE.children.length} domains · ${M.subdomains} sub-domains · ${M.expertiseAreas} areas · ${M.experts} experts</span>
      </div>
      <div class="map-wrap card" id="mapWrap">
        <svg id="mapSvg" class="map-svg" role="tree" aria-label="Expertise hierarchy tree"><g id="mapPan"></g></svg>
      </div>
      <div class="legend" style="margin-top:12px">
        <span class="legend__item"><span class="legend__swatch" style="background:var(--brand)"></span>Root</span>
        <span class="legend__item"><span class="legend__swatch" style="background:var(--c2)"></span>Domain</span>
        <span class="legend__item"><span class="legend__swatch" style="background:var(--surface);border:2px solid var(--c2)"></span>Sub-domain</span>
        <span class="legend__item"><span class="legend__swatch" style="background:var(--surface-2);border:1px solid var(--border-strong)"></span>Expertise</span>
        <span class="legend__item"><span class="legend__swatch" style="background:var(--brand-soft);border-radius:8px"></span>Holder</span>
      </div>`;

    // Tier geometry: x offset and node width per tier
    const TIER_X = [0, 240, 520, 790, 1090];
    const TIER_W = [200, 240, 230, 260, 210];
    const ROW_H = 34, NODE_H = 26;

    function visibleChildren(n) {
      return mapState.expanded.has(n.id) ? n.children : [];
    }

    // With a search query, force-expand every ancestor of a match
    function applySearch() {
      const q = mapState.q.trim().toLowerCase();
      if (!q) return null;
      const open = new Set(["root"]), hits = new Set();
      (function walk(n, ancestors) {
        if (n.label.toLowerCase().includes(q)) {
          hits.add(n.id);
          ancestors.forEach((a) => open.add(a));
        }
        n.children.forEach((c) => walk(c, [...ancestors, n.id]));
      })(MAP_TREE, []);
      mapState.expanded = open;
      return hits;
    }

    function draw() {
      const hits = applySearch();
      let row = 0;
      const nodes = [], links = [];
      (function place(n, parent) {
        const kids = visibleChildren(n);
        const node = { n, x: TIER_X[n.tier], y: 0 };
        if (kids.length) {
          const placed = kids.map((c) => place(c, node));
          node.y = (placed[0].y + placed[placed.length - 1].y) / 2;
        } else {
          node.y = row++ * ROW_H;
        }
        nodes.push(node);
        if (parent) links.push({ from: parent, to: node, color: n.color });
        return node;
      })(MAP_TREE, null);

      const height = Math.max(row * ROW_H + 60, 200);
      const linkSvg = links.map((l) => {
        const x1 = l.from.x + TIER_W[l.from.n.tier], y1 = l.from.y + NODE_H / 2;
        const x2 = l.to.x, y2 = l.to.y + NODE_H / 2;
        const mx = (x1 + x2) / 2;
        return `<path class="map-link" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" style="stroke:${l.color}"/>`;
      }).join("");

      const nodeSvg = nodes.map(({ n, x, y }) => {
        const w = TIER_W[n.tier];
        const expandable = n.children.length > 0;
        const open = mapState.expanded.has(n.id);
        const hit = hits && hits.has(n.id);
        const badge = expandable && !open
          ? (n.tier <= 1 ? ` · ${n.nExp}▸` : n.tier === 2 ? ` · ${n.nExp}▸` : ` · ${n.nHold}▸`)
          : "";
        const arrow = expandable ? (open ? "▾ " : "▸ ") : "";
        const budget = Math.floor((w - 22) / 6.6) - badge.length - arrow.length;
        const label = n.label.length > budget ? n.label.slice(0, budget - 1) + "…" : n.label;
        const cls = `map-node map-node--t${n.tier}${expandable ? " is-toggle" : ""}${hit ? " is-hit" : ""}`;
        const style = n.tier === 1 ? `fill:${n.color}` :
                      n.tier === 2 ? `stroke:${n.color}` :
                      n.tier === 4 ? `fill:color-mix(in srgb, ${n.color} 14%, var(--surface))` : "";
        return `<g class="${cls}" transform="translate(${x},${y})" data-id="${n.id}" ${expandable ? 'data-toggle="1"' : ""}>
          <title>${esc(n.label)}${expandable ? ` — ${n.nExp} area${n.nExp !== 1 ? "s" : ""}, ${n.nHold} holder${n.nHold !== 1 ? "s" : ""}` : ""}</title>
          <rect width="${w}" height="${NODE_H}" rx="${n.tier === 4 ? 13 : 7}" style="${style}"/>
          <text x="11" y="${NODE_H / 2 + 4}">${esc(arrow + label)}${badge ? `<tspan class="map-badge">${esc(badge)}</tspan>` : ""}</text>
        </g>`;
      }).join("");

      $("#mapPan").innerHTML = linkSvg + nodeSvg;
      $("#mapPan").setAttribute("transform", `translate(${mapState.tx},${mapState.ty}) scale(${mapState.k})`);
      $("#mapSvg").style.minHeight = "560px";
      $("#mapSvg").dataset.contentHeight = height;
    }

    /* interactions ---------------------------------------------------- */
    const svg = $("#mapSvg");
    let drag = null, moved = 0, downTarget = null;
    svg.addEventListener("pointerdown", (e) => {
      drag = { x: e.clientX, y: e.clientY, tx: mapState.tx, ty: mapState.ty };
      moved = 0; downTarget = e.target.closest("[data-toggle]");
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
      mapState.tx = drag.tx + dx; mapState.ty = drag.ty + dy;
      $("#mapPan").setAttribute("transform", `translate(${mapState.tx},${mapState.ty}) scale(${mapState.k})`);
    });
    // Toggle on pointerup: pointer capture retargets the click event to the
    // svg itself, so the node must be resolved from the pointerdown target.
    svg.addEventListener("pointerup", () => {
      drag = null;
      if (moved > 5 || !downTarget) { downTarget = null; return; }
      const id = downTarget.getAttribute("data-id");
      downTarget = null;
      if (mapState.q) { mapState.q = ""; $("#mapq").value = ""; }
      if (mapState.expanded.has(id)) mapState.expanded.delete(id);
      else mapState.expanded.add(id);
      draw();
    });
    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const f = Math.exp(-e.deltaY * 0.0012);
      const k = Math.min(2.5, Math.max(0.35, mapState.k * f));
      const real = k / mapState.k;
      mapState.tx = mx - (mx - mapState.tx) * real;
      mapState.ty = my - (my - mapState.ty) * real;
      mapState.k = k;
      $("#mapPan").setAttribute("transform", `translate(${mapState.tx},${mapState.ty}) scale(${mapState.k})`);
    }, { passive: false });

    $("#mapq").addEventListener("input", (e) => { mapState.q = e.target.value; draw(); });
    $("#mapExpand").addEventListener("click", () => {
      mapState.q = ""; $("#mapq").value = "";
      const all = new Set();
      (function walk(n) { if (n.children.length) { all.add(n.id); n.children.forEach(walk); } })(MAP_TREE);
      mapState.expanded = all; draw();
    });
    $("#mapCollapse").addEventListener("click", () => {
      mapState.q = ""; $("#mapq").value = "";
      mapState.expanded = new Set(["root"]); draw();
    });
    $("#mapReset").addEventListener("click", () => {
      mapState.q = ""; $("#mapq").value = "";
      mapState.expanded = mapDefaultExpanded();
      mapState.k = 1; mapState.tx = 24; mapState.ty = 24; draw();
    });

    draw();
  }

  /* ---------------------------------------------------------------- router */
  const VIEWS = {
    overview: { el: "#view-overview", render: renderOverview, done: false },
    holders: { el: "#view-holders", render: renderHolders },
    gaps: { el: "#view-gaps", render: renderGaps },
    interviews: { el: "#view-interviews", render: renderInterviews },
    matrix: { el: "#view-matrix", render: renderMatrix },
    mapping: { el: "#view-mapping", render: renderMapping },
  };
  function go(name) {
    if (!VIEWS[name]) name = "overview";
    Object.keys(VIEWS).forEach((k) => { $(VIEWS[k].el).hidden = k !== name; });
    $$(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.view === name));
    const v = VIEWS[name];
    v.render($(v.el)); // re-render keeps filters via module-level state
    if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  $("#tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab"); if (btn) go(btn.dataset.view);
  });
  window.addEventListener("hashchange", () => go(location.hash.replace("#", "")));

  /* ---------------------------------------------------------------- theme */
  const root = document.documentElement;
  const saved = localStorage.getItem("gcdc-theme");
  if (saved) root.setAttribute("data-theme", saved);
  else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches)
    root.setAttribute("data-theme", "dark");
  $("#themeToggle").addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("gcdc-theme", next);
    // re-render current view so SVG colours pick up new tokens
    const active = $(".tab.is-active"); if (active) VIEWS[active.dataset.view].render($(VIEWS[active.dataset.view].el));
  });

  /* ---------------------------------------------------------------- site search */
  const siteSearch = $("#siteSearch");
  if (siteSearch) {
    const runSearch = () => {
      matrixState.q = siteSearch.value.trim();
      go("matrix");
      const mq = $("#mq"); if (mq) { mq.value = matrixState.q; }
    };
    siteSearch.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } });
  }

  /* ---------------------------------------------------------------- boot */
  $("#footerMeta").textContent = `${M.experts} staff · ${M.expertiseAreas} expertise areas · ${M.spof} single points of failure`;
  go(location.hash.replace("#", "") || "overview");
})();
