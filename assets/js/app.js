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

  // Fixed categorical colour per domain (order of first appearance in taxonomy)
  const DOMAINS = [];
  TX.forEach((t) => { if (!DOMAINS.includes(t.domain)) DOMAINS.push(t.domain); });
  const DOMAIN_COLOR = {};
  DOMAINS.forEach((d, i) => { DOMAIN_COLOR[d] = `var(--c${(i % 9) + 1})`; });

  function pill(cls, label, icon) {
    return `<span class="pill pill--${cls}"><span class="pill__dot"></span>${icon ? esc(icon) + " " : ""}${esc(label)}</span>`;
  }

  /* ---------------------------------------------------------------- UX helpers */
  // Escape first, then wrap matches — highlighting without an injection path.
  function hl(text, q) {
    const safe = esc(text);
    const needle = esc(String(q || "").trim());
    if (!needle) return safe;
    const re = new RegExp("(" + needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
    return safe.replace(re, '<mark class="hl">$1</mark>');
  }

  // Polite screen-reader announcement (filter results, copy confirmations, …)
  function announce(msg) { const l = $("#live"); if (l) l.textContent = msg; }

  // Transient confirmation toast
  let toastTimer = null;
  function toast(msg) {
    let t = $("#toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast"; t.className = "toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-on"), 2200);
    announce(msg);
  }

  // Active-filter chips — each individually removable
  function filterChips(items) {
    const on = items.filter((i) => i.value);
    if (!on.length) return "";
    return `<div class="chips">
      <span class="chips__lbl">Filtered by</span>
      ${on.map((i) => `<button type="button" class="chip" data-clear="${esc(i.clear)}"
        aria-label="Remove filter ${esc(i.label)}: ${esc(i.value)}">
        ${esc(i.label)}: <b>${esc(i.value)}</b> <span aria-hidden="true">✕</span></button>`).join("")}
      ${on.length > 1 ? `<button type="button" class="chip chip--all" data-clear="all">Clear all</button>` : ""}
    </div>`;
  }

  // Export rows to CSV (Excel-friendly: BOM + CRLF)
  function downloadCsv(filename, header, rows) {
    const cell = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
    toast(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"} to ${filename}`);
  }

  // Cross-view navigation: apply state to the target view, then switch to it
  function jumpTo(view, patch) {
    const target = { core: coreState, contacts: contactsState, matrix: matrixState }[view];
    if (target && patch) Object.assign(target, patch);
    go(view);
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
  // Ranked horizontal bars: items [{label, value, color, tip, action}]
  // An item with `action` becomes a keyboard-operable button.
  function rankedBars(items, max) {
    return `<div class="bars">` + items.map((it) => {
      const act = it.action
        ? ` role="button" tabindex="0" data-action="${esc(it.action)}" title="${esc(it.actionHint || "Show details")}"`
        : "";
      return `<div class="bar-row${it.action ? " is-clickable" : ""}"${act}>
        <span class="bar-row__label" title="${esc(it.label)}">${esc(it.label)}</span>
        <span class="bar-row__track">
          <span class="bar-row__fill" style="width:${(it.value / max) * 100}%;background:${it.color}"
            data-tip="${esc(it.tip || it.label + ': ' + it.value)}"></span>
        </span>
        <span class="bar-row__val">${it.value}</span>
      </div>`;
    }).join("") + `</div>`;
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
    // Coverage by department — core areas each department has ≥1 core holder in
    const deptOf = (h) => { const m = /\(([^)]+)\)\s*$/.exec(h); return m ? m[1].trim() : ""; };
    const DEPTS = Array.from(new Set(HOLDERS.map((h) => h.department)));
    const deptCov = DEPTS.map((d, i) => {
      const areas = MATRIX.filter((m) => m.holders.some((h) => deptOf(h) === d)).length;
      const staff = HOLDERS.filter((h) => h.department === d).length;
      return { label: d, value: areas, staff, color: `var(--c${(i % 9) + 1})`,
        tip: `<b>${esc(d)}</b><br>${areas} of ${M.expertiseAreas} core areas · ${staff} staff<br><i>Click to see this department's experts</i>`,
        action: `dept:${d}`, actionHint: `Show ${d} in Core Expertise` };
    }).sort((a, b) => b.value - a.value);
    const maxDeptCov = Math.max(...deptCov.map((d) => d.value), 1);

    // A KPI with an `action` is a real button (click + Enter/Space)
    const kpi = (val, label, note, accent, action, hint) => {
      const tag = action ? "button" : "div";
      const attrs = action ? ` type="button" data-action="${esc(action)}" title="${esc(hint || "")}"` : "";
      return `<${tag} class="card kpi${action ? " is-clickable" : ""}" style="--kpi-accent:${accent}"${attrs}>
        <div class="kpi__value">${val}</div><div class="kpi__label">${label}</div>
        ${note ? `<div class="kpi__note">${note}</div>` : ""}
        ${action ? `<span class="kpi__go" aria-hidden="true">→</span>` : ""}</${tag}>`;
    };

    el.innerHTML = `
      <div class="view__head">
        <h1>Knowledge Mapping</h1>
        <p>A live picture of where GCDC's core expertise lives and where it is thinly held. Built from the core-taxonomy analysis: ${M.experts} staff across ${M.depts} departments, mapped to ${M.domains} domains and ${M.expertiseAreas} core expertise areas.</p>
      </div>

      <div class="grid grid--kpi">
        ${kpi(M.experts, "Staff assessed", `${M.depts} departments`, "var(--brand)", "view:contacts", "Open the staff directory")}
        ${kpi(M.expertiseAreas, "Core expertise areas", `${M.subdomains} sub-domains`, "var(--accent)", "view:matrix", "Browse the expertise matrix")}
        ${kpi(M.spof, "Single core expert", "Only one core holder", "var(--st-serious)", "view:matrix", "See which areas have a single holder")}
        ${kpi(M.thin, "Thinly covered", "Only two core holders", "var(--st-warn)", "view:matrix", "See thinly covered areas")}
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
          <div class="card__hd"><div class="card__title">Coverage by department</div>
            <div class="card__sub">Core expertise areas each department covers (of ${M.expertiseAreas})</div></div>
          ${rankedBars(deptCov, maxDeptCov)}
          <p class="card__sub" style="margin-top:12px">Select a department to see its experts.</p>
        </div>
      </div>`;

    // KPI tiles and department bars act as navigation
    const run = (action) => {
      if (!action) return;
      if (action.startsWith("view:")) return jumpTo(action.slice(5), null);
      if (action.startsWith("dept:")) {
        const d = action.slice(5);
        return jumpTo("core", { dept: d, q: "" });
      }
    };
    // Assignment (not addEventListener): every go() re-renders this view, and
    // repeated addEventListener calls would stack duplicate handlers.
    el.onclick = (e) => {
      const t = e.target.closest("[data-action]");
      if (t) run(t.getAttribute("data-action"));
    };
    el.onkeydown = (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const t = e.target.closest("[data-action][role='button']");
      if (t) { e.preventDefault(); run(t.getAttribute("data-action")); }
    };
  }


  /* ---------------------------------------------------------------- Core Expertise */
  const coreState = { dept: "all", q: "", sort: "name", dir: 1, expanded: new Set() };
  const CHIP_LIMIT = 4; // areas shown before "+N more"

  function renderCore(el) {
    const depts = ["all", ...Array.from(new Set(HOLDERS.map((h) => h.department)))];
    el.innerHTML = `
      <div class="view__head"><h1>Core Expertise</h1>
        <p>Every staff member and the areas they hold at <em>core</em> expertise level. Filter by department, or search by name or expertise.</p></div>
      <div class="toolbar">
        <div class="field field--search">
          <span class="field__icon" aria-hidden="true">⌕</span>
          <input type="search" id="cq" data-view-search placeholder="Search name or expertise…  (press /)"
                 aria-label="Search core expertise" value="${esc(coreState.q)}">
        </div>
        <div class="field"><select id="cdept" aria-label="Filter by department">
          ${depts.map((d) => `<option value="${esc(d)}"${d === coreState.dept ? " selected" : ""}>${d === "all" ? "All departments" : esc(d)}</option>`).join("")}
        </select></div>
        <button type="button" class="btn btn--ghost" id="cexport" title="Download the filtered list as CSV">⭳ Export CSV</button>
        <span class="count" id="ccount" role="status"></span>
      </div>
      <div id="cchips"></div>
      <div class="table-wrap"><table class="data data--stack" id="ctable"></table></div>`;

    const cols = [
      { key: "name", label: "Name" },
      { key: "department", label: "Department" },
      { key: "core_areas", label: "Core expertise areas", sort: false },
    ];

    function currentRows() {
      const q = coreState.q.trim().toLowerCase();
      const rows = HOLDERS.filter((h) =>
        (coreState.dept === "all" || h.department === coreState.dept) &&
        (!q || (h.name + " " + h.core_areas).toLowerCase().includes(q)));
      const k = coreState.sort, dir = coreState.dir;
      return rows.slice().sort((a, b) => {
        const x = String(a[k] || ""), y = String(b[k] || "");
        return x.localeCompare(y) * dir || a.name.localeCompare(b.name);
      });
    }

    function draw() {
      const rows = currentRows();
      const q = coreState.q.trim();

      $("#cchips").innerHTML = filterChips([
        { label: "Department", value: coreState.dept === "all" ? "" : coreState.dept, clear: "dept" },
        { label: "Search", value: q, clear: "q" },
      ]);

      const thead = `<thead><tr>${cols.map((c) => {
        if (c.sort === false) return `<th class="no-sort">${esc(c.label)}</th>`;
        const active = coreState.sort === c.key;
        const aria = active ? (coreState.dir === 1 ? "ascending" : "descending") : "none";
        return `<th data-k="${c.key}" aria-sort="${aria}" title="Sort by ${esc(c.label)}">
          ${esc(c.label)} <span class="arrow">${active ? (coreState.dir === 1 ? "▲" : "▼") : "↕"}</span></th>`;
      }).join("")}</tr></thead>`;

      const body = rows.length ? `<tbody>${rows.map((h) => {
        const areas = String(h.core_areas || "").split(";").map(clean).filter(Boolean);
        const open = coreState.expanded.has(h.name);
        const shown = open ? areas : areas.slice(0, CHIP_LIMIT);
        const rest = areas.length - shown.length;
        return `<tr>
          <td data-label="Name" class="name-cell">
            <button type="button" class="link-name" data-person="${esc(h.name)}"
              title="Open ${esc(h.name.trim())} in Contacts">${hl(h.name.trim(), q)}</button>
            ${h.leader ? ' <span class="star" title="Manager / leader">★</span>' : ""}
          </td>
          <td data-label="Department">
            <button type="button" class="dept-tag dept-tag--btn" data-dept="${esc(h.department)}"
              title="Filter by ${esc(h.department)}">${esc(h.department)}</button>
          </td>
          <td data-label="Core expertise areas">
            ${areas.length ? `<span class="chip-list">
              ${shown.map((a) => `<button type="button" class="tag-chip tag-chip--btn" data-area="${esc(a)}"
                  title="Search for “${esc(a)}”">${hl(a, q)}</button>`).join("")}
              ${rest > 0 ? `<button type="button" class="more-btn" data-more="${esc(h.name)}">+${rest} more</button>` : ""}
              ${open && areas.length > CHIP_LIMIT ? `<button type="button" class="more-btn" data-more="${esc(h.name)}">show less</button>` : ""}
            </span>` : '<span class="muted">—</span>'}
          </td>
        </tr>`;
      }).join("")}</tbody>`
      : `<tbody><tr><td colspan="3">
          <div class="empty">
            <div class="empty__icon" aria-hidden="true">🔍</div>
            <p><b>No staff match these filters.</b></p>
            <p class="muted">Try a different search term or department.</p>
            <button type="button" class="btn" data-clear="all">Clear all filters</button>
          </div></td></tr></tbody>`;

      $("#ctable").innerHTML = thead + body;
      $("#ccount").textContent = `${rows.length} of ${HOLDERS.length} staff`;
      announce(`${rows.length} of ${HOLDERS.length} staff shown`);
    }

    draw();

    $("#cq").addEventListener("input", (e) => { coreState.q = e.target.value; draw(); });
    $("#cdept").addEventListener("change", (e) => { coreState.dept = e.target.value; draw(); });
    $("#cexport").addEventListener("click", () => downloadCsv(
      "gcdc-core-expertise.csv",
      ["Name", "Department", "Position", "Core expertise areas"],
      currentRows().map((h) => [h.name.trim(), h.department, h.position, h.core_areas])));

    el.onclick = (e) => {
      const t = e.target;
      const sortTh = t.closest("th[data-k]");
      if (sortTh) {
        const k = sortTh.getAttribute("data-k");
        if (coreState.sort === k) coreState.dir *= -1; else { coreState.sort = k; coreState.dir = 1; }
        return draw();
      }
      const clear = t.closest("[data-clear]");
      if (clear) {
        const what = clear.getAttribute("data-clear");
        if (what === "all") { coreState.dept = "all"; coreState.q = ""; }
        if (what === "dept") coreState.dept = "all";
        if (what === "q") coreState.q = "";
        $("#cq").value = coreState.q; $("#cdept").value = coreState.dept;
        return draw();
      }
      const more = t.closest("[data-more]");
      if (more) {
        const n = more.getAttribute("data-more");
        coreState.expanded.has(n) ? coreState.expanded.delete(n) : coreState.expanded.add(n);
        return draw();
      }
      const dept = t.closest("[data-dept]");
      if (dept) { coreState.dept = dept.getAttribute("data-dept"); $("#cdept").value = coreState.dept; return draw(); }
      const area = t.closest("[data-area]");
      if (area) { coreState.q = area.getAttribute("data-area"); $("#cq").value = coreState.q; return draw(); }
      const person = t.closest("[data-person]");
      if (person) return jumpTo("contacts", { q: person.getAttribute("data-person"), dept: "all" });
    };
  }

  /* ---------------------------------------------------------------- Contacts */
  const contactsState = { dept: "all", q: "" };
  function initials(name) {
    const parts = clean(name).split(" ").filter(Boolean);
    const skip = /^(dr|mr|ms|mrs)\.?$/i;
    const use = parts.filter((p) => !skip.test(p));
    return ((use[0] || "")[0] || "").toUpperCase() + ((use[1] || "")[0] || "").toUpperCase();
  }
  function renderContacts(el) {
    const depts = ["all", ...Array.from(new Set(HOLDERS.map((h) => h.department)))];
    el.innerHTML = `
      <div class="view__head"><h1>Contacts</h1>
        <p>Directory of all ${M.experts} staff — role, core expertise, and work email. Filter by department, or search by name or expertise.</p></div>
      <div class="toolbar">
        <div class="field field--search">
          <span class="field__icon" aria-hidden="true">⌕</span>
          <input type="search" id="ctq" data-view-search placeholder="Search name, expertise or email…  (press /)"
                 aria-label="Search contacts" value="${esc(contactsState.q)}">
        </div>
        <div class="field"><select id="ctdept" aria-label="Filter by department">
          ${depts.map((d) => `<option value="${esc(d)}"${d === contactsState.dept ? " selected" : ""}>${d === "all" ? "All departments" : esc(d)}</option>`).join("")}
        </select></div>
        <button type="button" class="btn btn--ghost" id="ctexport" title="Download the filtered list as CSV">⭳ Export CSV</button>
        <span class="count" id="ctcount" role="status"></span>
      </div>
      <div id="ctchips"></div>
      <div class="contact-grid" id="ctgrid"></div>`;

    function currentRows() {
      const q = contactsState.q.trim().toLowerCase();
      return HOLDERS.filter((h) =>
        (contactsState.dept === "all" || h.department === contactsState.dept) &&
        (!q || (h.name + " " + h.core_areas + " " + h.email).toLowerCase().includes(q))
      ).slice().sort((a, b) => a.name.localeCompare(b.name));
    }

    function draw() {
      const rows = currentRows();
      const q = contactsState.q.trim();
      const deptList = Array.from(new Set(HOLDERS.map((x) => x.department)));
      const deptColor = (n) => `var(--c${(deptList.indexOf(n) % 9) + 1})`;

      $("#ctchips").innerHTML = filterChips([
        { label: "Department", value: contactsState.dept === "all" ? "" : contactsState.dept, clear: "dept" },
        { label: "Search", value: q, clear: "q" },
      ]);

      $("#ctgrid").innerHTML = rows.length ? rows.map((h) => {
        const areas = String(h.core_areas || "").split(";").map(clean).filter(Boolean);
        return `<article class="contact">
          <div class="contact__hd">
            <span class="contact__avatar" style="background:${deptColor(h.department)}" aria-hidden="true">${esc(initials(h.name))}</span>
            <div class="contact__id">
              <div class="contact__name">${hl(h.name.trim(), q)}${h.leader ? ' <span class="star" title="Manager / leader">★</span>' : ""}</div>
              <div class="contact__role">${esc(h.position)} ·
                <button type="button" class="dept-tag dept-tag--btn" data-dept="${esc(h.department)}"
                  title="Filter by ${esc(h.department)}">${esc(h.department)}</button></div>
            </div>
          </div>
          <dl class="contact__meta">
            <div><dt>Profile</dt><dd>${esc(h.profile_level)}</dd></div>
            <div><dt>Core areas</dt><dd>${areas.length}</dd></div>
          </dl>
          <div class="contact__areas">${areas.map((a) =>
            `<button type="button" class="tag-chip tag-chip--btn" data-area="${esc(a)}"
              title="Search for “${esc(a)}”">${hl(a, q)}</button>`).join("")}</div>
          <div class="contact__actions">
            <a class="contact__email" href="mailto:${esc(h.email)}" title="Send an email">
              <span aria-hidden="true">✉</span> <span>${h.email ? hl(h.email, q) : "—"}</span>
            </a>
            ${h.email ? `<button type="button" class="icon-btn" data-copy="${esc(h.email)}"
              title="Copy email address" aria-label="Copy ${esc(h.email)}">⧉</button>` : ""}
          </div>
        </article>`;
      }).join("") : `<div class="empty">
          <div class="empty__icon" aria-hidden="true">🔍</div>
          <p><b>No staff match these filters.</b></p>
          <p class="muted">Try a different search term or department.</p>
          <button type="button" class="btn" data-clear="all">Clear all filters</button>
        </div>`;

      $("#ctcount").textContent = `${rows.length} of ${HOLDERS.length} staff`;
      announce(`${rows.length} of ${HOLDERS.length} staff shown`);
    }

    draw();

    $("#ctq").addEventListener("input", (e) => { contactsState.q = e.target.value; draw(); });
    $("#ctdept").addEventListener("change", (e) => { contactsState.dept = e.target.value; draw(); });
    $("#ctexport").addEventListener("click", () => downloadCsv(
      "gcdc-contacts.csv",
      ["Name", "Department", "Position", "Email", "Core expertise areas"],
      currentRows().map((h) => [h.name.trim(), h.department, h.position, h.email, h.core_areas])));

    el.onclick = async (e) => {
      const copy = e.target.closest("[data-copy]");
      if (copy) {
        const addr = copy.getAttribute("data-copy");
        try {
          await navigator.clipboard.writeText(addr);
          toast(`Copied ${addr}`);
        } catch {
          // Clipboard API unavailable (older browser / insecure context)
          const ta = document.createElement("textarea");
          ta.value = addr; document.body.appendChild(ta); ta.select();
          document.execCommand("copy"); ta.remove();
          toast(`Copied ${addr}`);
        }
        return;
      }
      const clear = e.target.closest("[data-clear]");
      if (clear) {
        const what = clear.getAttribute("data-clear");
        if (what === "all") { contactsState.dept = "all"; contactsState.q = ""; }
        if (what === "dept") contactsState.dept = "all";
        if (what === "q") contactsState.q = "";
        $("#ctq").value = contactsState.q; $("#ctdept").value = contactsState.dept;
        return draw();
      }
      const dept = e.target.closest("[data-dept]");
      if (dept) { contactsState.dept = dept.getAttribute("data-dept"); $("#ctdept").value = contactsState.dept; return draw(); }
      const area = e.target.closest("[data-area]");
      if (area) { contactsState.q = area.getAttribute("data-area"); $("#ctq").value = contactsState.q; return draw(); }
    };
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
        <div class="field field--search">
          <span class="field__icon" aria-hidden="true">⌕</span>
          <input type="search" id="mq" data-view-search placeholder="Search expertise or person…  (press /)"
                 aria-label="Search matrix" value="${esc(matrixState.q)}">
        </div>
        <div class="field"><select id="mdomain" aria-label="Filter by domain">
          <option value="all">All domains</option>
          ${DOMAINS.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join("")}
        </select></div>
        <span class="count" id="mcount" role="status"></span>
      </div>
      <div id="mchips"></div>
      <div id="mbody"></div>`;
    $("#mdomain").value = matrixState.domain;

    function draw() {
      const qRaw = matrixState.q.trim();
      const q = qRaw.toLowerCase();
      $("#mchips").innerHTML = filterChips([
        { label: "Domain", value: matrixState.domain === "all" ? "" : matrixState.domain, clear: "domain" },
        { label: "Search", value: qRaw, clear: "q" },
      ]);
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
              <div><div class="exp__name">${hl(t.expertise, qRaw)}</div>
                <div class="exp__sub">${esc(t.subdomain)}</div></div>
              ${pill(s.cls, String(holders.length), s.icon)}
            </div>
            <div class="exp__holders">${holders.length
              ? holders.map((h) => {
                  const label = clean(h);
                  const person = label.replace(/\s*\([^)]*\)\s*$/, "");
                  return `<button type="button" class="holder-chip holder-chip--btn" data-person="${esc(person)}"
                    title="Open ${esc(person)} in Contacts">${hl(label, qRaw)}</button>`;
                }).join("")
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
      $("#mbody").innerHTML = html || `<div class="empty">
          <div class="empty__icon" aria-hidden="true">🔍</div>
          <p><b>No expertise areas match these filters.</b></p>
          <p class="muted">Try a different search term or domain.</p>
          <button type="button" class="btn" data-clear="all">Clear all filters</button>
        </div>`;
      $("#mcount").textContent = `${shown} of ${TX.length} areas`;
      announce(`${shown} of ${TX.length} expertise areas shown`);
    }
    draw();
    $("#mq").addEventListener("input", (e) => { matrixState.q = e.target.value; draw(); });
    $("#mdomain").addEventListener("change", (e) => { matrixState.domain = e.target.value; draw(); });
    el.onclick = (e) => {
      const person = e.target.closest("[data-person]");
      if (person) return jumpTo("contacts", { q: person.getAttribute("data-person"), dept: "all" });
      const clear = e.target.closest("[data-clear]");
      if (clear) {
        const what = clear.getAttribute("data-clear");
        if (what === "all") { matrixState.domain = "all"; matrixState.q = ""; }
        if (what === "domain") matrixState.domain = "all";
        if (what === "q") matrixState.q = "";
        $("#mq").value = matrixState.q; $("#mdomain").value = matrixState.domain;
        draw();
      }
    };
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
        const isPerson = n.tier === 4;
        const person = isPerson ? n.label.replace(/\s*\([^)]*\)\s*$/, "") : "";
        const cls = `map-node map-node--t${n.tier}${expandable ? " is-toggle" : ""}${isPerson ? " is-person" : ""}${hit ? " is-hit" : ""}`;
        const style = n.tier === 1 ? `fill:${n.color}` :
                      n.tier === 2 ? `stroke:${n.color}` :
                      n.tier === 4 ? `fill:color-mix(in srgb, ${n.color} 14%, var(--surface))` : "";
        return `<g class="${cls}" transform="translate(${x},${y})" data-id="${n.id}"
          ${expandable ? 'data-toggle="1"' : ""}${isPerson ? ` data-person="${esc(person)}"` : ""}>
          <title>${esc(n.label)}${expandable
            ? ` — ${n.nExp} area${n.nExp !== 1 ? "s" : ""}, ${n.nHold} holder${n.nHold !== 1 ? "s" : ""}`
            : isPerson ? " — open in Contacts" : ""}</title>
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
      moved = 0; downTarget = e.target.closest("[data-toggle],[data-person]");
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
      const node = downTarget;
      downTarget = null;
      // A holder leaf opens that person in Contacts; anything else expands/collapses.
      const person = node.getAttribute("data-person");
      if (person) return jumpTo("contacts", { q: person, dept: "all" });
      const id = node.getAttribute("data-id");
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

  /* ---------------------------------------------------------------- Home */
  function renderHome(el) {
    el.innerHTML = `
      <div class="hero">
        <div class="hero__inner">
          <img class="hero__logo" src="assets/img/km-logo.svg" alt="Knowledge Mapping" />
          <div class="hero__ar" dir="rtl">خريطة المعرفة</div>
          <div class="hero__en">KNOWLEDGE MAPPING</div>
          <div class="hero__tag">Right Knowledge. Right People. Right Time.</div>
        </div>
      </div>

      <div class="grid grid--2" style="margin-top:26px">
        <div class="card">
          <div class="card__hd"><div class="card__title">About Knowledge Mapping</div></div>
          <p style="color:var(--ink-2)">An institutional initiative to develop a comprehensive map of health expertise across the Center and GCC countries. It identifies and documents employees’ specialized knowledge and skills, classifies them within a unified public health framework, and serves as a reference for determining areas of expertise, proficiency levels, and their distribution across departments.</p>
        </div>
        <div class="card">
          <div class="card__hd"><div class="card__title">Purpose</div></div>
          <p style="color:var(--ink-2)">To identify, document, and connect knowledge and expertise across the organization, ensuring access to the right knowledge at the right time. This supports informed decision-making, ensures business continuity, maximizes the use of institutional expertise, and reduces the risk of knowledge loss.</p>
        </div>
      </div>

      <div class="home-stats">
        <div class="card home-stat">
          <div class="home-stat__num">30</div>
          <div class="home-stat__label">Employees contributed</div>
        </div>
        <div class="card home-stat">
          <div class="home-stat__num">4</div>
          <div class="home-stat__label">Departments</div>
        </div>
        <div class="card home-stat">
          <div class="home-stat__num">10</div>
          <div class="home-stat__label">Domains of experience</div>
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------------- router */
  const VIEWS = {
    home: { el: "#view-home", render: renderHome },
    overview: { el: "#view-overview", render: renderOverview, done: false },
    core: { el: "#view-core", render: renderCore },
    contacts: { el: "#view-contacts", render: renderContacts },
    matrix: { el: "#view-matrix", render: renderMatrix },
    mapping: { el: "#view-mapping", render: renderMapping },
  };
  function go(name) {
    if (!VIEWS[name]) name = "home";
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
  /* ---------------------------------------------------------------- global UX */
  // "/" focuses the current view's search box; Escape clears it.
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
    if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
      const box = $(".view:not([hidden]) [data-view-search]") || $("#siteSearch");
      if (box) { e.preventDefault(); box.focus(); box.select(); }
      return;
    }
    if (e.key === "Escape" && typing) {
      const box = document.activeElement;
      if (box.value) {
        box.value = "";
        box.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        box.blur();
      }
    }
  });

  // Back-to-top button appears once the page is scrolled
  const toTop = document.createElement("button");
  toTop.type = "button";
  toTop.id = "toTop";
  toTop.className = "to-top";
  toTop.title = "Back to top";
  toTop.setAttribute("aria-label", "Back to top");
  toTop.innerHTML = '<span aria-hidden="true">↑</span>';
  toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  document.body.appendChild(toTop);
  const onScroll = () => toTop.classList.toggle("is-on", window.scrollY > 400);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Handled in JS (not an inline onsubmit) so a strict CSP can forbid inline scripts.
  const siteSearchForm = $("#siteSearchForm");
  if (siteSearchForm) siteSearchForm.addEventListener("submit", (e) => e.preventDefault());
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
  go(location.hash.replace("#", "") || "home");
})();
