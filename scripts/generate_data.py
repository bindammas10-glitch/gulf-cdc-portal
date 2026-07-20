#!/usr/bin/env python3
"""Regenerate the portal's dataset from the master workbook.

Reads data/GulfCDC_KnowledgeMapping_MasterAnalysis_CoreTaxonomy.xlsx and writes:
  - assets/js/data.js  (embedded dataset the portal loads)
  - data/*.json        (readable JSON exports of each part)

Usage:  python3 scripts/generate_data.py
"""
import openpyxl, json, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(ROOT, "data", "GulfCDC_KnowledgeMapping_MasterAnalysis_CoreTaxonomy.xlsx")

def s(v): return "" if v is None else str(v).strip()

wb = openpyxl.load_workbook(XLSX, data_only=True)

# 01 Taxonomy — 57 core areas
tax = []
for r in wb["01_Taxonomy"].iter_rows(min_row=2, values_only=True):
    if not r[0] or not r[2]:
        continue
    tax.append(dict(domain=s(r[0]), subdomain=s(r[1]), expertise=s(r[2]),
                    holders_n=int(r[3]) if r[3] not in (None, "") else 0, path=s(r[4])))

# 03 Expertise Matrix — holders per area
mws = wb["03_Expertise_Matrix"]
hdr = list(next(mws.iter_rows(min_row=1, max_row=1, values_only=True)))
emp_cols = [(ci, re.sub(r"\s+", " ", s(hdr[ci]).replace("\n", " "))) for ci in range(4, len(hdr)) if s(hdr[ci])]
matrix = []
for r in mws.iter_rows(min_row=2, values_only=True):
    if not r[0] or not r[2]:
        continue
    holders = [nm for ci, nm in emp_cols if s(r[ci])]
    matrix.append(dict(domain=s(r[0]), subdomain=s(r[1]), expertise=s(r[2]),
                       holders_n=len(holders), holders=holders))

# 02 Master Dataset — all 30 staff
def flag_for(ri):
    if ri >= 80: return "\U0001F534 High Continuity Risk"
    if ri >= 40: return "\U0001F7E1 Moderate Risk"
    return "\U0001F7E2 Low/Standard"

master = []
for r in wb["02_Master_Dataset"].iter_rows(min_row=2, values_only=True):
    if not r[0]:
        continue
    master.append(dict(num=int(r[0]), name=s(r[1]), department=s(r[2]), position=s(r[3]),
        years=s(r[4]), profile_level=s(r[5]), depth=int(r[6]), scarcity=int(r[7]), impact=int(r[8]),
        risk_index=int(r[9]), core_count=int(r[10]) if r[10] not in (None, "") else 0,
        core_areas=s(r[11]), source=s(r[12]), leader=bool(s(r[13]))))

# 05 Critical Holders — continuity note keyed by name
cont = {}
for r in wb["05_Critical_Holders"].iter_rows(min_row=5, values_only=True):
    if not r[0] or r[0] == "Rank":
        continue
    cont[s(r[1])] = s(r[10])

# sole-held areas per person (from matrix, holders_n == 1)
sole = {}
for m in matrix:
    if m["holders_n"] == 1:
        sole.setdefault(m["holders"][0].split(" (")[0].strip(), []).append(m["expertise"])

holders_out = []
for m in sorted(master, key=lambda x: (-x["risk_index"], x["num"])):
    holders_out.append(dict(name=m["name"], department=m["department"], position=m["position"],
        years=m["years"], profile_level=m["profile_level"], depth=m["depth"], scarcity=m["scarcity"],
        impact=m["impact"], risk_index=m["risk_index"], core_count=m["core_count"],
        core_areas=m["core_areas"], rare_expertise="; ".join(sole.get(m["name"], [])) or "(none sole-held)",
        flag=flag_for(m["risk_index"]), leader=m["leader"], continuity=cont.get(m["name"], "")))
for i, h in enumerate(holders_out, 1):
    h["rank"] = i

# 06 Knowledge Gaps — 57 core areas (status from holders_n) + Section B "No Core Expert"
def status_for(n):
    if n >= 3: return "\U0001F7E2 Adequate"
    if n == 2: return "\U0001F7E1 Thin Coverage"
    if n == 1: return "\U0001F7E0 Single Core Expert (SPOF)"
    return "\U0001F534 No Core Expert"

gapmeta = {}
for r in wb["06_Knowledge_Gaps"].iter_rows(min_row=4, values_only=True):
    if not r[0] or r[0] == "Tier 1 – Domain" or str(r[0]).startswith("Section"):
        continue
    gapmeta[(s(r[0]), s(r[2]))] = dict(sole=s(r[5]), rec=s(r[6]), status=s(r[4]))

mat_by_key = {(m["domain"], m["expertise"]): m for m in matrix}
gaps = []
for t in tax:
    n = t["holders_n"]
    key = (t["domain"], t["expertise"])
    meta = gapmeta.get(key, {})
    m = mat_by_key.get(key)
    sole_holder = meta.get("sole", "") or (m["holders"][0] if m and n == 1 else "")
    if n >= 3:
        rec = "Maintain via documentation and knowledge champions."
    elif n == 2:
        rec = "Only two core holders — build redundancy and document SOPs."
    else:
        rec = meta.get("rec", "") or "Single core expert — capture knowledge and identify a successor."
    gaps.append(dict(domain=t["domain"], subdomain=t["subdomain"], expertise=t["expertise"],
        holders_n=n, status=status_for(n), sole_holder=sole_holder, recommendation=rec, in_taxonomy=True))
for r in wb["06_Knowledge_Gaps"].iter_rows(min_row=4, values_only=True):
    if r[0] and "No Core Expert" in s(r[4]):
        gaps.append(dict(domain=s(r[0]), subdomain=s(r[1]), expertise=s(r[2]), holders_n=0,
            status="\U0001F534 No Core Expert", sole_holder=s(r[5]), recommendation=s(r[6]), in_taxonomy=False))

# 07 Interview Shortlist
shortlist = []
for r in wb["07_Interview_Shortlist"].iter_rows(min_row=5, values_only=True):
    if not r[0] or r[0] == "Order":
        continue
    shortlist.append(dict(order=int(r[0]), name=s(r[1]), department=s(r[2]), position=s(r[3]),
        profile_level=s(r[4]), risk_index=int(r[5]), focus=s(r[6]), interview_status=s(r[7]), duration=s(r[8])))

taxonomy = [dict(domain=t["domain"], subdomain=t["subdomain"], expertise=t["expertise"], path=t["path"]) for t in tax]
out = dict(taxonomy=taxonomy, expertiseMatrix=matrix, knowledgeGaps=gaps,
           criticalHolders=holders_out, interviewShortlist=shortlist)

# write /data JSON exports (readable source)
def dump(name, obj):
    with open(os.path.join(ROOT, "data", name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
dump("taxonomy.json", taxonomy)
dump("expertise_matrix.json", matrix)
dump("knowledge_gaps.json", gaps)
dump("critical_holders.json", holders_out)
dump("interview_shortlist.json", shortlist)

banner = ("/* Gulf CDC Portal — embedded dataset.\n"
          "   Generated by scripts/generate_data.py from\n"
          "   data/GulfCDC_KnowledgeMapping_MasterAnalysis_CoreTaxonomy.xlsx.\n"
          "   Core taxonomy: 10 domains, 30 sub-domains, 57 core expertise areas, 30 staff. */\n")
with open(os.path.join(ROOT, "assets", "js", "data.js"), "w", encoding="utf-8") as f:
    f.write(banner + "window.GCDC_DATA = " + json.dumps(out, ensure_ascii=False, indent=2) + ";\n")

print("Regenerated: assets/js/data.js and data/*.json")
print(f"  taxonomy={len(taxonomy)} matrix={len(matrix)} gaps={len(gaps)} staff={len(holders_out)} interviews={len(shortlist)}")
