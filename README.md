# Gulf CDC — Workforce Knowledge Continuity Portal

An interactive, dependency-free web portal that turns the Gulf CDC's workforce
knowledge-continuity assessment into a decision tool: where critical expertise
lives, where losing one person would break a capability, and who to interview
first to capture that knowledge.

## What it shows

| Section | Purpose |
|---|---|
| **Overview** | Headline KPIs, expertise-coverage and workforce-risk breakdowns, coverage-by-domain, and the highest continuity risks at a glance. |
| **Critical Experts** | All assessed staff scored on knowledge depth, skill scarcity, and impact. Sortable/filterable; risk index = depth × scarcity × impact. |
| **Knowledge Gaps** | Every core area rated by number of core holders, with a domain × resilience heatmap and recommended actions. Flags single core experts, thin coverage, and areas with no core expert. |
| **Interview Plan** | The knowledge-capture interview shortlist with per-person core-expertise focus and interview status. |
| **Expertise Matrix** | The full core taxonomy (domains → sub-domains → expertise) with the people holding each area, colour-coded by coverage resilience. |
| **Mapping** | The whole hierarchy as an interactive Coggle-style tree: Root → Domain → Sub-domain → Expertise → Holders. |

## Running it

It's a static site — no build, no server required.

```bash
# Simplest: open the file directly
open index.html            # macOS   (xdg-open on Linux)

# Or serve it (recommended for a clean URL / GitHub Pages parity)
python3 -m http.server 8000
# then visit http://localhost:8000
```

The dataset is embedded in `assets/js/data.js`, so the portal works fully offline
and even when opened straight from disk (`file://`).

## Data

The single source of truth is the master workbook:

- `data/GulfCDC_KnowledgeMapping_MasterAnalysis_CoreTaxonomy.xlsx`

It covers the **core-taxonomy** analysis: **10 domains → 30 sub-domains → 57 core
expertise areas**, and **30 staff**. An area counts only where someone holds it as
*core* expertise (not mere awareness); areas nobody holds at core level are flagged
**No Core Expert**.

To update the portal after editing the workbook, drop the new file in over the one
above (same name) and regenerate:

```bash
python3 scripts/generate_data.py
```

That reads the workbook and rewrites `assets/js/data.js` (the embedded dataset the
portal loads) plus readable JSON exports in `/data`:

- `taxonomy.json` — domain → sub-domain → core expertise structure
- `expertise_matrix.json` — core holders of each area
- `knowledge_gaps.json` — coverage status, sole holder & recommendation per area
- `critical_holders.json` — staff risk scoring (depth, scarcity, impact, risk index)
- `interview_shortlist.json` — the knowledge-capture interview plan

Requires Python with `openpyxl` (`pip install openpyxl`).

## Design notes

- **Vanilla HTML/CSS/JS** — no frameworks or external requests, so it loads instantly and hosts anywhere (GitHub Pages, S3, an intranet share).
- **Theme-aware** — light and dark, with the choice remembered; respects the OS preference on first load.
- **Reserved status colours** — green / amber / orange / red always carry an icon and a text label, never colour alone, so the state is legible to colour-blind users and in print.
- **Accessible** — keyboard-navigable tabs, sortable tables with `aria-sort`, a skip link, and reduced-motion support.

## Layout

```
index.html                # shell + navigation
assets/css/styles.css     # design tokens, layout, components
assets/js/data.js         # embedded dataset (generated)
assets/js/app.js          # views, charts, tables, routing
assets/img/               # GCDC logo (colour + reversed white)
scripts/generate_data.py  # rebuilds data.js + /data JSON from the workbook
data/*.xlsx               # master workbook — the source of truth
data/*.json               # generated JSON exports
```
