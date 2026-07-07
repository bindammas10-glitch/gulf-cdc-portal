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
| **Knowledge Gaps** | Every expertise area rated by number of holders, with a domain × resilience heatmap and recommended actions. Flags single points of failure and thin coverage. |
| **Interview Plan** | A prioritised knowledge-capture interview shortlist with rationale and per-person focus areas. |
| **Expertise Matrix** | The full taxonomy (domains → sub-domains → expertise) with the people holding each area, colour-coded by coverage resilience. |

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

Source data lives in `/data` as JSON and is the single source of truth:

- `taxonomy.json` — domain → sub-domain → expertise structure
- `expertise_matrix.json` — holders of each expertise area
- `knowledge_gaps.json` — coverage status & recommendation per area
- `critical_holders.json` — staff risk scoring (depth, scarcity, impact, risk index)
- `interview_shortlist.json` — prioritised interview plan

`assets/js/data.js` is regenerated from these files:

```bash
node -e '
const fs=require("fs"), r=f=>JSON.parse(fs.readFileSync("data/"+f,"utf8"));
const out={taxonomy:r("taxonomy.json"),expertiseMatrix:r("expertise_matrix.json"),
knowledgeGaps:r("knowledge_gaps.json"),criticalHolders:r("critical_holders.json"),
interviewShortlist:r("interview_shortlist.json")};
fs.writeFileSync("assets/js/data.js","window.GCDC_DATA = "+JSON.stringify(out,null,2)+";\n");'
```

## Design notes

- **Vanilla HTML/CSS/JS** — no frameworks or external requests, so it loads instantly and hosts anywhere (GitHub Pages, S3, an intranet share).
- **Theme-aware** — light and dark, with the choice remembered; respects the OS preference on first load.
- **Reserved status colours** — green / amber / orange / red always carry an icon and a text label, never colour alone, so the state is legible to colour-blind users and in print.
- **Accessible** — keyboard-navigable tabs, sortable tables with `aria-sort`, a skip link, and reduced-motion support.

## Layout

```
index.html            # shell + navigation
assets/css/styles.css # design tokens, layout, components
assets/js/data.js     # embedded dataset (generated from /data)
assets/js/app.js       # views, charts, tables, routing
data/*.json           # source data
```
