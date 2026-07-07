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
    if (s.includes("Single Point")) return { cls: "serious", icon: "▲", label: "Single Point of Failure" };
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
    highRisk: HOLDERS.filter((h) => riskFlag(h.flag).cls === "critical").length,
    moderateRisk: HOLDERS.filter((h) => riskFlag(h.flag).cls === "moderate").length,
    lowRisk: HOLDERS.filter((h) => riskFlag(h.flag).cls === "good").length,
    interviews: SHORTLIST.length,
  };

  /* ================================================================ VIEWS  */

  function renderOverview(el) {
    const cov = [
      { label: "Adequate", value: M.adequate, color: "var(--st-good)" },
      { label: "Thin Coverage", value: M.thin, color: "var(--st-warn)" },
      { label: "Single Point of Failure", value: M.spof, color: "var(--st-serious)" },
    ];
    const risk = [
      { label: "High Continuity Risk", value: M.highRisk, color: "var(--st-critical)" },
      { label: "Moderate Risk", value: M.moderateRisk, color: "var(--st-warn)" },
      { label: "Low / Standard", value: M.lowRisk, color: "var(--st-good)" },
    ];

    // Coverage by domain (stacked)
    const byDomain = DOMAINS.map((d) => {
      const rows = GAPS.filter((g) => g.domain === d);
      const c = { good: 0, warn: 0, serious: 0 };
      rows.forEach((g) => { c[coverageStatus(g.status).cls]++; });
      return { label: d, total: rows.length,
        segs: [
          { value: c.good, color: "var(--st-good)", label: "Adequate" },
          { value: c.warn, color: "var(--st-warn)", label: "Thin Coverage" },
          { value: c.serious, color: "var(--st-serious)", label: "Single Point of Failure" },
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
        <p>A live picture of where the Gulf CDC's critical expertise lives, where losing one person would break a capability, and who to talk to first. Assessed across ${M.experts} staff, ${M.domains} domains and ${M.expertiseAreas} expertise areas.</p>
      </div>

      <div class="grid grid--kpi">
        ${kpi(M.experts, "Staff assessed", `${M.depts} departments`, "var(--brand)")}
        ${kpi(M.expertiseAreas, "Expertise areas", `${M.subdomains} sub-domains`, "var(--accent)")}
        ${kpi(M.spof, "Single points of failure", "Only one holder", "var(--st-serious)")}
        ${kpi(M.thin, "Thinly covered", "Only two holders", "var(--st-warn)")}
        ${kpi(M.highRisk, "High-risk experts", "Continuity flag", "var(--st-critical)")}
        ${kpi(M.interviews, "Interviews planned", "Knowledge capture", "var(--brand)")}
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
      { key: "rare_expertise", label: "Rare / scarce expertise", sort: false },
      { key: "flag", label: "Flag" },
    ];

    function draw() {
      const q = holdersState.q.toLowerCase();
      let rows = HOLDERS.filter((h) =>
        (holdersState.dept === "all" || h.department === holdersState.dept) &&
        (!q || (h.name + " " + h.rare_expertise + " " + h.position).toLowerCase().includes(q)));
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
        const rare = h.rare_expertise && !/^\(none/.test(h.rare_expertise)
          ? esc(h.rare_expertise) : `<span class="muted">— none scarce —</span>`;
        return `<tr>
          <td class="num muted">${h.rank}</td>
          <td class="name-cell">${esc(h.name.trim())}</td>
          <td><span class="dept-tag">${esc(h.department)}</span></td>
          <td>${esc(h.position)}</td>
          <td class="muted">${esc(h.years)}</td>
          <td class="num">${h.depth}</td>
          <td class="num">${h.scarcity}</td>
          <td class="num">${h.impact}</td>
          <td><span class="riskbar"><span class="riskbar__val">${h.risk_index}</span>
            <span class="riskbar__track"><span class="riskbar__fill" style="width:${h.risk_index / maxRisk * 100}%;background:${riskColor(f.cls)}"></span></span></span></td>
          <td class="rare-list">${rare}</td>
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
      { cls: "serious", label: "Single point", color: "var(--st-serious)" },
    ];
    const heatRows = DOMAINS.map((d) => {
      const counts = { good: 0, warn: 0, serious: 0 };
      GAPS.filter((g) => g.domain === d).forEach((g) => counts[coverageStatus(g.status).cls]++);
      return { domain: d, counts };
    });
    const heat = `<table class="heat"><thead><tr><th class="row-h">Domain</th>
      ${statusOrder.map((s) => `<th>${s.label}</th>`).join("")}<th>Total</th></tr></thead><tbody>
      ${heatRows.map((r) => {
        const total = r.counts.good + r.counts.warn + r.counts.serious;
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
        <p>Every expertise area rated by how many people hold it. <b style="color:var(--st-serious)">Single points of failure</b> (one holder) and <b style="color:var(--st-warn)">thin coverage</b> (two holders) are where the organisation is most exposed.</p></div>

      <div class="grid grid--kpi" style="margin-bottom:16px">
        <div class="card kpi" style="--kpi-accent:var(--st-good)"><div class="kpi__value">${M.adequate}</div><div class="kpi__label">Adequate (3+ holders)</div></div>
        <div class="card kpi" style="--kpi-accent:var(--st-warn)"><div class="kpi__value">${M.thin}</div><div class="kpi__label">Thin coverage (2 holders)</div></div>
        <div class="card kpi" style="--kpi-accent:var(--st-serious)"><div class="kpi__value">${M.spof}</div><div class="kpi__label">Single point of failure</div></div>
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
          <option value="serious">Single point of failure</option>
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
          <th class="num">Holders</th><th>Status</th><th>Recommended action</th>
        </tr></thead><tbody>${rows.map((g) => {
          const s = coverageStatus(g.status);
          return `<tr>
            <td class="name-cell">${esc(g.expertise)}</td>
            <td><span class="dept-tag" style="background:color-mix(in srgb,${DOMAIN_COLOR[g.domain]} 18%,transparent);color:${DOMAIN_COLOR[g.domain]}">${esc(g.domain)}</span></td>
            <td class="muted">${esc(g.subdomain)}</td>
            <td class="num"><b>${g.holders_n}</b></td>
            <td>${pill(s.cls, s.label, s.icon)}</td>
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
  function parseFocus(raw) {
    return String(raw || "").split(/\n?\s*•\s*/).map(clean).filter(Boolean);
  }
  function renderInterviews(el) {
    const totalMin = SHORTLIST.reduce((a, s) => a + (parseInt(s.duration, 10) || 0), 0);
    const cards = SHORTLIST.slice().sort((a, b) => a.priority - b.priority).map((s) => {
      const focus = parseFocus(s.focus_areas);
      const reasons = String(s.why || "").split("|").map(clean).filter(Boolean);
      return `<article class="iv">
        <div class="iv__rank">${s.priority}</div>
        <div>
          <div class="iv__name">${esc(s.name.trim())} <span class="dept-tag">${esc(s.department)}</span></div>
          <div class="iv__meta">${esc(s.profile_level)} · ${esc(s.years)}</div>
        </div>
        <div class="iv__right">
          ${pill("critical", "Risk " + s.risk_index)}
          <span class="muted" style="font-size:12px">${esc(s.duration)}</span>
        </div>
        <div class="iv__why">${reasons.map((r) => `<span class="tag-chip">${esc(r)}</span>`).join("")}</div>
        <details class="iv__focus"><summary>Interview focus areas</summary>
          <ul>${focus.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
        </details>
      </article>`;
    }).join("");

    el.innerHTML = `
      <div class="view__head"><h1>Knowledge-Capture Interview Plan</h1>
        <p>A prioritised shortlist for structured knowledge-capture interviews — ordered by continuity risk and rarity of expertise. ${SHORTLIST.length} interviews · about ${Math.round(totalMin / 60)} hours total.</p></div>
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

  /* ---------------------------------------------------------------- router */
  const VIEWS = {
    overview: { el: "#view-overview", render: renderOverview, done: false },
    holders: { el: "#view-holders", render: renderHolders },
    gaps: { el: "#view-gaps", render: renderGaps },
    interviews: { el: "#view-interviews", render: renderInterviews },
    matrix: { el: "#view-matrix", render: renderMatrix },
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

  /* ---------------------------------------------------------------- boot */
  $("#footerMeta").textContent = `${M.experts} staff · ${M.expertiseAreas} expertise areas · ${M.spof} single points of failure`;
  go(location.hash.replace("#", "") || "overview");
})();
