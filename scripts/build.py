#!/usr/bin/env python3
"""Construit Agora IA à partir des données et des sources du site.

Entrées
  data/corpus.json        corpus de recherche (sources, personnes, relations, questions,
                          courants, axes, positions des courants, métiers exposés)
  data/site/layout.json   familles et disposition 3D des planètes
  data/site/tours.json    parcours guidés
  data/site/thread.json   fil transversal « Productivité »
  src/                    index.html, body.html, styles.css, app.js
  vendor/three-r128/      three.js r128 (MIT), servi localement
  vendor/fonts/           polices auto-hébergées (OFL)

Sorties (dossier dist/, ignoré par git)
  dist/index.html         site autonome, prêt à héberger (GitHub Pages, serveur statique)
  dist/assets/…           styles.css, app.js, data.js (window.AGORA_DATA)
  dist/vendor/…           copie de three.js et des polices
  dist/artifact.html      version mono-fichier pour un Artifact claude.ai (three.js et polices via CDN)

Usage
  python3 scripts/build.py            valide puis construit
  python3 scripts/build.py --check    valide seulement (utile en CI)
  python3 scripts/build.py --date 2026-11-05   fixe la date affichée « construit le »

Aucune dépendance : bibliothèque standard Python 3.9+.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import shutil
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SRC = ROOT / "src"
VENDOR = ROOT / "vendor"
DIST = ROOT / "dist"

SITE_TITLE = "Agora IA"
SITE_URL = "https://igocreate.github.io/agoraia/"
SITE_DESC = ("Un univers à explorer pour débattre des risques, de l'éthique et des choix de société "
             "liés à l'IA : thématiques, courants de pensée, citations vérifiées et parcours guidés.")

CDN_SCRIPTS = [
    "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
    "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js",
    "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/renderers/CSS2DRenderer.js",
]
VENDOR_SCRIPTS = ["three.min.js", "OrbitControls.js", "CSS2DRenderer.js"]

# Le site sert ses polices lui-même (aucun appel à un tiers) ; l'Artifact ne peut charger que Google Fonts.
SITE_FONTS = '<link rel="stylesheet" href="vendor/fonts/fonts.css">'
GOOGLE_FONTS = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700'
    '&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=JetBrains+Mono:wght@400;600&display=swap">'
)

# Région d'une source = région majoritaire de ses auteurs (pays ISO-2 dans corpus.people[].country).
# Égalité : International > Amérique du Nord > Asie > Océanie > Europe. Pays absent : International.
REGION = {
    **{c: "Amérique du Nord" for c in ("US", "CA")},
    **{c: "Europe" for c in ("FR", "GB", "DE", "CH", "ES", "IT", "NL", "BE", "IE", "AT", "DK", "FI",
                             "SE", "NO", "PT", "PL", "VA", "EU")},
    **{c: "Asie" for c in ("CN", "TW", "HK", "JP", "KR", "IN", "SG", "MY", "IL", "TR")},
    "AU": "Océanie",
}
REGION_TIEBREAK = ["International", "Amérique du Nord", "Asie", "Océanie", "Europe"]

QUOTE_STATUS = {"verifiee", "a_verifier", "transcription"}
# « fiction » s'affiche comme un miroir, pas comme une preuve ; « outil » a sa propre carte et un octaèdre en 3D.
SOURCE_KINDS = {"article", "rapport", "étude", "déclaration", "entretien", "essai", "loi", "discours",
                "livre", "vidéo", "podcast", "fiction", "outil"}


def load(path: Path):
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def seed(sid: str) -> int:
    return int(hashlib.md5(sid.encode()).hexdigest()[:8], 16) % 100000


def region(authors: list[str], people: dict) -> str:
    regs = [REGION.get(people[a].get("country", ""), "International") for a in authors if a in people]
    if not regs:
        return "International"
    n = Counter(regs)
    return max(n, key=lambda r: (n[r], -REGION_TIEBREAK.index(r)))


# ------------------------------------------------------------------ validation
class Report:
    def __init__(self):
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def err(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)


def validate(corpus, layout, tours, thread) -> Report:
    r = Report()
    ids = {}
    for key in ("planets", "currents", "sources", "people"):
        seen = Counter(x["id"] for x in corpus[key])
        for i, n in seen.items():
            if n > 1:
                r.err(f"{key}: id en double « {i} »")
        ids[key] = set(seen)
    P, CU, S, PE = ids["planets"], ids["currents"], ids["sources"], ids["people"]
    S_by = {s["id"]: s for s in corpus["sources"]}
    cutoff = corpus["meta"].get("cutoff", "1900-01-01")

    for s in corpus["sources"]:
        sid = s["id"]
        for p in s.get("planets", []):
            if p not in P:
                r.err(f"{sid}: planète inconnue « {p} »")
        if not s.get("planets"):
            r.err(f"{sid}: aucune planète")
        for c in s.get("currents", []):
            if c not in CU:
                r.err(f"{sid}: courant inconnu « {c} »")
        for a in s.get("authors", []):
            if a not in PE:
                r.err(f"{sid}: auteur inconnu « {a} »")
        if not re.fullmatch(r"\d{4}(-\d{2}(-\d{2})?)?", s.get("date", "")):
            r.err(f"{sid}: date invalide « {s.get('date')} »")
        elif s["date"] < cutoff and s.get("kind") != "outil":
            r.warn(f"{sid}: antérieure à la date limite du corpus ({s['date']} < {cutoff})")
        if s.get("kind") not in SOURCE_KINDS:
            r.warn(f"{sid}: type « {s.get('kind')} » non répertorié dans SOURCE_KINDS")
        if not str(s.get("url", "")).startswith("http"):
            r.err(f"{sid}: URL manquante")
        for i, q in enumerate(s.get("quotes", [])):
            if q.get("status") not in QUOTE_STATUS:
                r.err(f"{sid}#{i}: statut de citation invalide « {q.get('status')} »")
            sp = q.get("speaker")
            if sp and sp not in PE:
                r.err(f"{sid}#{i}: locuteur inconnu « {sp} »")
            if not q.get("text", "").strip():
                r.err(f"{sid}#{i}: citation vide")

    nodes = P | CU | S | PE
    for rel in corpus["relations"]:
        for end in ("from", "to"):
            if rel[end] not in nodes:
                r.err(f"relation {rel['from']}→{rel['to']}: extrémité inconnue « {rel[end]} »")
    for q in corpus["questions"]:
        if q["planet"] not in P:
            r.err(f"question: planète inconnue « {q['planet']} »")
    for p in corpus["people"]:
        for c in p.get("currents", []):
            if c not in CU:
                r.err(f"{p['id']}: courant inconnu « {c} »")
    for o in corpus.get("occupations", []):
        if o.get("source_id") and o["source_id"] not in S:
            r.err(f"{o['id']}: source inconnue « {o['source_id']} »")

    fams = {f["id"] for f in layout["families"]} | {"centre"}
    lp = layout["planets"]
    for p in P - set(lp):
        r.err(f"layout.json: planète « {p} » sans position")
    for p, v in lp.items():
        if p not in P:
            r.err(f"layout.json: planète « {p} » absente du corpus")
        if v["fam"] not in fams:
            r.err(f"layout.json: famille inconnue « {v['fam']} » pour {p}")

    for t in tours:
        for k, st in enumerate(t["steps"]):
            where = f"parcours {t['id']} étape {k + 1}"
            if st.get("planet") and st["planet"] not in P:
                r.err(f"{where}: planète inconnue « {st['planet']} »")
            for sid, qi in st.get("quotes", []):
                if sid not in S_by:
                    r.err(f"{where}: source inconnue « {sid} »")
                elif qi >= len(S_by[sid]["quotes"]):
                    r.err(f"{where}: citation {qi} absente de {sid}")
                elif S_by[sid]["quotes"][qi]["status"] != "verifiee":
                    r.warn(f"{where}: cite une citation non vérifiée ({sid}#{qi})")

    branches = {b["id"] for b in thread["branches"]}
    for p in thread["planets"]:
        if p not in P:
            r.err(f"fil: planète inconnue « {p} »")
    for b in thread["branches"]:
        for sid in b["sources"]:
            if sid not in S:
                r.err(f"fil, branche {b['id']}: source inconnue « {sid} »")
    for s in corpus["sources"]:
        if s.get("branch") and s["branch"] not in branches:
            r.err(f"{s['id']}: branche inconnue « {s['branch']} »")
    return r


# ------------------------------------------------------------------ transformation
def compact(corpus, layout, tours, thread, built: str) -> dict:
    people = {p["id"]: p for p in corpus["people"]}

    def quote(q):
        return {k: v for k, v in q.items()}

    sources = []
    for s in corpus["sources"]:
        o = {
            "id": s["id"], "t": s["title"], "a": s.get("authors", []), "pub": s.get("publisher", ""),
            "d": s["date"], "u": s["url"], "l": s.get("lang", ""), "k": s.get("kind", ""),
            "pl": s["planets"], "cu": s.get("currents", []), "th": s.get("thesis", ""),
            "kf": s.get("key_facts", []), "q": [quote(q) for q in s.get("quotes", [])],
            "rel": s.get("reliability", ""), "n": s.get("notes", ""),
            "rg": region(s.get("authors", []), people), "seed": seed(s["id"]),
        }
        sources.append(o)

    planets = []
    for p in corpus["planets"]:
        lp = layout["planets"][p["id"]]
        o = {"id": p["id"], "label": p["label"], "desc": p["desc"]}
        if p.get("kind"):
            o["kind"] = p["kind"]
        planets.append({**o, "fam": lp["fam"], "pos": lp["pos"], "w": lp["w"]})

    th = json.loads(json.dumps(thread))
    for b in th["branches"]:
        extra = [s["id"] for s in corpus["sources"] if s.get("branch") == b["id"] and s["id"] not in b["sources"]]
        b["sources"] += extra

    return {
        "meta": {"built": built, "cutoff": corpus["meta"]["cutoff"], "n_sources": len(sources)},
        "planets": planets,
        "families": layout["families"],
        "currents": corpus["currents"],
        "axes": corpus["axes"],
        "cpos": corpus["current_pos"],
        "sources": sources,
        "people": [{"id": p["id"], "n": p["name"], "r": p.get("role", ""), "c": p.get("country", ""),
                    "cu": p.get("currents", [])} for p in corpus["people"]],
        "rels": [{"f": x["from"], "t": x["to"], "ty": x["type"], "w": x.get("why", "")} for x in corpus["relations"]],
        "questions": corpus["questions"],
        "tours": tours,
        "thread": th,
        "occupations": corpus.get("occupations", []),
    }


def js_data(data: dict) -> str:
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    # Empêche une chaîne du corpus de fermer la balise <script> en version mono-fichier.
    raw = raw.replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    return "window.AGORA_DATA = " + raw + ";"


def short_hash(text: str) -> str:
    return hashlib.sha1(text.encode()).hexdigest()[:10]


def build(data: dict):
    css = (SRC / "styles.css").read_text(encoding="utf-8")
    js = (SRC / "app.js").read_text(encoding="utf-8")
    body = (SRC / "body.html").read_text(encoding="utf-8")
    shell = (SRC / "index.html").read_text(encoding="utf-8")
    djs = js_data(data)

    if DIST.exists():
        shutil.rmtree(DIST)
    (DIST / "assets").mkdir(parents=True)
    shutil.copytree(VENDOR, DIST / "vendor", ignore=shutil.ignore_patterns(".DS_Store"))
    for name, text in (("styles.css", css), ("app.js", js), ("data.js", djs + "\n")):
        (DIST / "assets" / name).write_text(text, encoding="utf-8")

    v = {k: short_hash(t) for k, t in (("css", css), ("js", js), ("data", djs))}
    scripts = "\n".join(
        [f'<script src="assets/data.js?v={v["data"]}"></script>']
        + [f'<script src="vendor/three-r128/{n}"></script>' for n in VENDOR_SCRIPTS]
        + [f'<script src="assets/app.js?v={v["js"]}"></script>']
    )
    html = (shell.replace("{{TITLE}}", SITE_TITLE).replace("{{DESCRIPTION}}", SITE_DESC).replace("{{URL}}", SITE_URL)
            .replace("{{FONTS}}", SITE_FONTS).replace("{{CSS_HREF}}", f"assets/styles.css?v={v['css']}")
            .replace("{{BODY}}", body.rstrip()).replace("{{SCRIPTS}}", scripts))
    (DIST / "index.html").write_text(html, encoding="utf-8")
    (DIST / ".nojekyll").write_text("", encoding="utf-8")

    # Artifact claude.ai : pas de doctype/head/body (ajoutés à la publication), tout en ligne, three.js via CDN.
    artifact = "\n".join(
        [f"<title>{SITE_TITLE}</title>", GOOGLE_FONTS, "<style>", css.rstrip(), "</style>", "", body.rstrip(), "",
         f"<script>{djs}</script>"]
        + [f'<script src="{u}"></script>' for u in CDN_SCRIPTS]
        + ["<script>", js.rstrip(), "</script>", ""]
    )
    (DIST / "artifact.html").write_text(artifact, encoding="utf-8")
    return html, artifact


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="valider les données sans construire")
    ap.add_argument("--date", default=dt.date.today().isoformat(), help="date de construction affichée")
    ap.add_argument("-q", "--quiet", action="store_true", help="ne pas lister les avertissements")
    args = ap.parse_args(argv)

    corpus = load(DATA / "corpus.json")
    layout = load(DATA / "site" / "layout.json")
    tours = load(DATA / "site" / "tours.json")["tours"]
    thread = load(DATA / "site" / "thread.json")["thread"]

    rep = validate(corpus, layout, tours, thread)
    if rep.warnings and not args.quiet:
        print(f"{len(rep.warnings)} avertissement(s) :")
        for w in rep.warnings:
            print("  ·", w)
    if rep.errors:
        print(f"{len(rep.errors)} erreur(s) :", file=sys.stderr)
        for e in rep.errors:
            print("  ✗", e, file=sys.stderr)
        return 1

    nq = sum(len(s["quotes"]) for s in corpus["sources"])
    nv = sum(q["status"] == "verifiee" for s in corpus["sources"] for q in s["quotes"])
    print(f"Données valides : {len(corpus['sources'])} sources, {nq} citations ({nv} vérifiées), "
          f"{len(corpus['people'])} personnes, {len(tours)} parcours.")
    if args.check:
        return 0

    data = compact(corpus, layout, tours, thread, args.date)
    html, artifact = build(data)
    print(f"dist/index.html ({len(html.encode()) // 1024} Ko + assets) · dist/artifact.html ({len(artifact.encode()) // 1024} Ko)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
