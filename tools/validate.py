"""Kontrollerar att datafilerna hänger ihop. Kör: python3 tools/validate.py"""
import json, re, sys
from pathlib import Path
D = Path(__file__).resolve().parent.parent / "data"
load = lambda n: json.loads((D / f"{n}.json").read_text(encoding="utf-8"))
P = {p["id"]: p for p in load("persons")}
R, V, I = load("relations"), load("views"), load("images")
OK_STATUS = {"verified", "family", "strong", "candidate", "lead", "excluded"}
err = []
for p in P.values():
    if p["status"] not in OK_STATUS: err.append(f"person {p['id']}: okänd status {p['status']}")
    if not p.get("sources"): err.append(f"person {p['id']}: källa saknas")
    if p["status"] == "verified" and not any(s.get("primary") for s in p.get("sources", [])):
        err.append(f"person {p['id']}: verified kräver en källa markerad \"primary\": true (arkiv, fond/opis/delo, bild/sida)")
    if p.get("living"):
        # Levande: bara namn, släktband och födelseår
        b = (p.get("born") or {})
        if b and (not re.fullmatch(r"\d{4}", str(b.get("date", ""))) or b.get("place")):
            err.append(f"person {p['id']}: levande person får bara ha födelseår, inga datum eller platser")
        for k in ("died", "places", "timeline"):
            if p.get(k): err.append(f"person {p['id']}: levande person har {k}")
for r in R:
    if r["status"] not in OK_STATUS: err.append(f"relation {r['id']}: okänd status")
    for k in r.get("parents", []) + [r.get("child"), r.get("a"), r.get("b")]:
        if k and k not in P: err.append(f"relation {r['id']}: okänd person {k}")
    if not r.get("basis"): err.append(f"relation {r['id']}: grund saknas")
    if r["status"] == "verified" and not r.get("source"):
        err.append(f"relation {r['id']}: verified kräver fältet \"source\" med primärkälla")
for v in V:
    for k in v["pos"]:
        if k not in P: err.append(f"vy {v['id']}: okänd person {k}")
for i in I:
    for k in i["persons"]:
        if k not in P: err.append(f"bild {i['id']}: okänd person {k}")
placed = set().union(*[set(v["pos"]) for v in V])
for k in set(P) - placed: err.append(f"person {k} är inte placerad i någon vy")
print("\n".join(err) or f"OK: {len(P)} personer, {len(R)} relationer, {len(I)} bildposter, {len(V)} vyer")
sys.exit(1 if err else 0)
