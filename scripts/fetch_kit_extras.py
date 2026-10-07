# -*- coding: utf-8 -*-
"""
Complementos dos uniformes: foto real da camisa da temporada (TheSportsDB) e fornecedora /
patrocinador master (Wikidata) dos clubes que ainda não estão em sponsorsReal.json.

1) TheSportsDB (chave pública "3", 1 req/2 s): searchteams.php?t=<nome> -> idTeam e strEquipment
   (camisa titular atual, PNG transparente). lookupequipment.php?id=<idTeam> -> camisas 1st/2nd/3rd
   por temporada (fica com a temporada mais nova). Baixa a variante /small (200 px).
   Saída: public/media/kits/photo/<clubId>-<1|2|3>.png e src/data/kitPhotos.json
          {clubId: {sdb, season, files: {"1": "kits/photo/x-1.png", ...}}}
2) Wikidata (P5995 fornecedora, P859 patrocinador; só declarações sem data de fim) para clubes do
   exterior e seleções sem dado; depois WORLD_FIX (conferência manual 2026/27).
   Saída: mescla em src/data/sponsorsReal.json (sem sobrescrever o que já existe).

Retomável: cada resposta fica em scripts/cache/kit_extras/. Uso:
    python3 scripts/fetch_kit_extras.py [sdb] [wikidata]
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import unicodedata

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm  # noqa: E402
from clubs_catalog import ALL_CLUBS  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "scripts", "cache", "kit_extras")
PHOTO_DIR = os.path.join(ROOT, "public", "media", "kits", "photo")
OUT_PHOTOS = os.path.join(ROOT, "src", "data", "kitPhotos.json")
OUT_SPONSORS = os.path.join(ROOT, "src", "data", "sponsorsReal.json")
WORLD_JSON = os.path.join(ROOT, "src", "data", "world.json")
SDB = "https://www.thesportsdb.com/api/v1/json/3/"
SDB_INTERVAL = float(os.environ.get("SDB_INTERVAL", "2"))

COUNTRY = {"BRA": "Brazil", "ENG": "England", "ESP": "Spain", "ITA": "Italy", "GER": "Germany", "FRA": "France",
           "POR": "Portugal", "NED": "Netherlands", "ARG": "Argentina", "URU": "Uruguay", "MEX": "Mexico",
           "USA": "USA", "KSA": "Saudi Arabia", "BEL": "Belgium", "TUR": "Turkey", "SCO": "Scotland",
           "COL": "Colombia", "CHI": "Chile", "PAR": "Paraguay", "ECU": "Ecuador", "PER": "Peru", "BOL": "Bolivia",
           "VEN": "Venezuela", "JPN": "Japan"}

# Seleções: fornecedora 2026 (Copa do Mundo). Seleções não têm patrocinador master.
NATION_KIT = {
    "BRA": "Nike", "ARG": "adidas", "FRA": "Nike", "ENG": "Nike", "ESP": "adidas", "GER": "adidas",
    "POR": "Puma", "NED": "Nike", "BEL": "adidas", "ITA": "adidas", "CRO": "Nike", "URU": "Nike",
    "COL": "adidas", "MEX": "adidas", "USA": "Nike", "JPN": "adidas", "KOR": "Nike", "MAR": "Puma",
    "SEN": "Puma", "SUI": "Puma", "DEN": "Hummel", "AUT": "Puma", "NOR": "Nike", "SCO": "adidas",
    "ECU": "Marathon", "PAR": "Puma", "CAN": "Nike", "AUS": "Nike", "IRN": "Merooj", "KSA": "adidas",
    "QAT": "Nike", "EGY": "Puma", "ALG": "adidas", "TUN": "Kappa", "GHA": "Puma", "CIV": "Puma",
    "RSA": "Le Coq Sportif", "CPV": "Tempo", "NZL": "Nike", "JOR": "Jako", "UZB": "Joma", "PAN": "Reebok",
    "HAI": "Saeta", "CUW": "Kappa", "TUR": "Nike", "CZE": "Puma", "BIH": "Macron", "SWE": "adidas",
    "COD": "Le Coq Sportif", "IRQ": "Jako", "CHI": "adidas", "PER": "adidas", "VEN": "adidas",
    "BOL": "Marathon", "POL": "Nike", "UKR": "Joma", "SRB": "Puma", "WAL": "adidas", "IRL": "Castore",
    "NGA": "Nike", "CMR": "One All Sports", "HUN": "adidas", "GRE": "Nike", "ROU": "Joma", "CRC": "New Balance", "JAM": "adidas",
}

# Conferência manual 2026/27 dos clubes do exterior mais conhecidos.
WORLD_FIX = {
    "arsenal": {"kit": "adidas", "shirt": "Emirates"}, "chelsea": {"kit": "Nike"},
    "liverpool-eng": {"kit": "adidas", "shirt": "Standard Chartered"},
    "manchester-city": {"kit": "Puma", "shirt": "Etihad Airways"},
    "manchester-united": {"kit": "adidas", "shirt": "Snapdragon"},
    "tottenham": {"kit": "Nike", "shirt": "AIA"}, "newcastle-united": {"kit": "adidas", "shirt": "Sela"},
    "aston-villa": {"kit": "adidas", "shirt": "Betano"}, "everton": {"kit": "Castore", "shirt": "Stake"},
    "real-madrid": {"kit": "adidas", "shirt": "Emirates"}, "barcelona-esp": {"kit": "Nike", "shirt": "Spotify"},
    "atletico-madrid": {"kit": "Nike", "shirt": "Riyadh Air"}, "athletic-bilbao": {"kit": "Castore", "shirt": "Kutxabank"},
    "bayern-munich": {"kit": "adidas", "shirt": "Telekom"}, "borussia-dortmund": {"kit": "Puma", "shirt": "Vodafone"},
    "bayer-leverkusen": {"kit": "New Balance", "shirt": "Barmenia Gothaer"},
    "juventus": {"kit": "adidas", "shirt": "Save the Children"}, "inter-milan": {"kit": "Nike", "shirt": "Betsson"},
    "ac-milan": {"kit": "Puma", "shirt": "Emirates"}, "napoli": {"kit": "EA7", "shirt": "MSC"},
    "roma": {"kit": "adidas", "shirt": "Eurobet"}, "psg": {"kit": "Nike", "shirt": "Qatar Airways"},
    "marseille": {"kit": "Puma", "shirt": "CMA CGM"}, "benfica": {"kit": "adidas", "shirt": "Emirates"},
    "porto": {"kit": "New Balance", "shirt": "Betano"}, "sporting-cp": {"kit": "Nike", "shirt": "Betano"},
    "boca-juniors": {"kit": "adidas", "shirt": "Betsson"}, "river-plate": {"kit": "adidas", "shirt": "Codere"},
    "al-hilal": {"kit": "Puma", "shirt": "Savvy Games"}, "al-nassr": {"kit": "adidas", "shirt": "KAFD"},
    "inter-miami": {"kit": "adidas", "shirt": "Royal Caribbean"},
}

BRAND_NORM = {"adidas ag": "adidas", "adidas": "adidas", "nike, inc.": "Nike", "nike": "Nike", "puma se": "Puma",
              "puma": "Puma", "new balance athletics": "New Balance", "new balance": "New Balance",
              "umbro": "Umbro", "kappa": "Kappa", "macron": "Macron", "joma": "Joma", "hummel": "Hummel",
              "castore": "Castore", "le coq sportif": "Le Coq Sportif", "under armour": "Under Armour",
              "emporio armani": "EA7", "ea7": "EA7", "erreà": "Erreà", "errea": "Erreà"}


def load(p, d):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return d


def save(p, obj):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p + ".tmp", "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(p + ".tmp", p)


def fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def entries():
    """[(id, nome de busca, alternativas, país TheSportsDB, wiki en)]"""
    out = []
    for c in ALL_CLUBS:
        out.append({"id": c["id"], "names": [c["name"], c.get("full") or ""], "country": "Brazil", "wiki": c["wiki"]})
    w = load(WORLD_JSON, {})
    try:
        import world_catalog as WC
        wiki = {c["id"]: c["wiki"] for c in WC.clubs()}
        nwiki = {n[0]: n[5] for n in WC.NATIONS}
    except ImportError:
        wiki, nwiki = {}, {}
    for c in w.get("clubs", []):
        out.append({"id": c["id"], "names": [c["name"], c.get("full") or ""],
                    "country": COUNTRY.get(c.get("country"), ""), "wiki": wiki.get(c["id"])})
    for n in w.get("nationalTeams", []):
        title = nwiki.get(n["fifa"]) or ""
        en = re.sub(r" (men's )?national (association )?football team$", "", title)
        out.append({"id": n["id"], "names": [en, n["name"]], "country": "", "nation": n["fifa"], "wiki": title})
    return out


# ---------------------------------------------------------------- TheSportsDB
_last = [0.0]
sess = requests.Session()
sess.headers["User-Agent"] = wm.UA


def sdb_get(endpoint: str, key: str):
    path = os.path.join(CACHE, "sdb", re.sub(r"[^\w\-]+", "_", key) + ".json")
    if os.path.exists(path):
        return load(path, None)
    for attempt in range(6):
        wait = _last[0] + SDB_INTERVAL - time.time()
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            r = sess.get(SDB + endpoint, timeout=30)
        except requests.RequestException:
            time.sleep(5 * (attempt + 1))
            continue
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(min(120, 10 * 2 ** attempt))
            continue
        try:
            data = r.json() if r.text.strip() else {}
        except ValueError:
            data = {}
        save(path, data)
        return data
    return None


def pick_team(e, teams):
    cands = [t for t in teams or [] if t.get("strSport") == "Soccer" and (t.get("strGender") or "Male") == "Male"]
    if e.get("nation"):
        cands = [t for t in cands if "national" in (t.get("strLeague") or "").lower() or
                 "world cup" in (t.get("strLeague") or "").lower() or "friendl" in (t.get("strLeague") or "").lower()
                 or fold(t.get("strTeam")) == fold(e["names"][0])] or cands
    elif e.get("country"):
        cands = [t for t in cands if t.get("strCountry") == e["country"]] or []
    names = {fold(n) for n in e["names"] if n}
    for t in cands:
        alts = {fold(t.get("strTeam"))} | {fold(a) for a in (t.get("strTeamAlternate") or "").split(",")}
        if names & alts:
            return t
    return cands[0] if len(cands) == 1 else None


def season_key(s: str) -> int:
    m = re.findall(r"\d{4}", s or "")
    return max(int(x) for x in m) if m else 0


def download_png(url: str, dst: str) -> bool:
    if os.path.exists(dst):
        return True
    for attempt in range(4):
        wait = _last[0] + SDB_INTERVAL / 2 - time.time()
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            r = sess.get(url + "/small", timeout=60)
        except requests.RequestException:
            time.sleep(5)
            continue
        if r.status_code == 200 and r.content[:8] == b"\x89PNG\r\n\x1a\n":
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(dst + ".tmp", "wb") as f:
                f.write(r.content)
            os.replace(dst + ".tmp", dst)
            return True
        if r.status_code == 404:
            return False
        time.sleep(10 * (attempt + 1))
    return False


def sdb():
    out = load(OUT_PHOTOS, {})
    ents = entries()
    for i, e in enumerate(ents):
        cid = e["id"]
        team = None
        for n in [x for x in e["names"] if x][:2]:
            d = sdb_get("searchteams.php?t=" + requests.utils.quote(n), "t_" + fold(n))
            team = pick_team(e, (d or {}).get("teams"))
            if team:
                break
        if not team:
            continue
        rec = {"sdb": team["idTeam"], "files": {}}
        eq = sdb_get(f"lookupequipment.php?id={team['idTeam']}", "eq_" + team["idTeam"])
        best = {}
        for x in (eq or {}).get("equipment") or []:
            typ = {"1st": "1", "2nd": "2", "3rd": "3"}.get(x.get("strType"))
            if typ and x.get("strEquipment") and season_key(x.get("strSeason")) >= season_key(best.get(typ, {}).get("strSeason", "")):
                best[typ] = x
        cur = team.get("strEquipment")
        newest = max([season_key(x.get("strSeason")) for x in best.values()] or [0])
        urls = {}
        if cur:
            urls["1"] = cur  # strEquipment do time = camisa titular atual
        for typ, x in best.items():
            # só temporadas recentes (2025 ou 2026); senão fica só a camisa atual
            if season_key(x.get("strSeason")) >= 2025 and season_key(x.get("strSeason")) == newest and typ not in urls:
                urls[typ] = x["strEquipment"]
        rec["season"] = newest or None
        for typ, url in urls.items():
            fn = f"{cid}-{typ}.png"
            if download_png(url, os.path.join(PHOTO_DIR, fn)):
                rec["files"][typ] = "kits/photo/" + fn
        if rec["files"]:
            out[cid] = rec
        if i % 20 == 0:
            save(OUT_PHOTOS, dict(sorted(out.items())))
            print(f"sdb: {i + 1}/{len(ents)} ({len(out)} com foto)", flush=True)
    save(OUT_PHOTOS, dict(sorted(out.items())))
    print(f"sdb: {len(out)} clubes com foto real da camisa")


# ---------------------------------------------------------------- Wikidata
def wd_api(params):
    """API do Wikidata com ritmo próprio (1 req/2 s, backoff); não usa a trava da Commons."""
    for attempt in range(3):
        time.sleep(2)
        try:
            r = sess.get(wm.WIKIDATA_API, params={"format": "json", "formatversion": "2", **params}, timeout=60)
        except requests.RequestException:
            time.sleep(5 * (attempt + 1))
            continue
        if r.status_code == 200:
            try:
                return r.json()
            except ValueError:
                return None
        time.sleep(min(30, 5 * 2 ** attempt))
    return None


def wikidata():
    real = load(OUT_SPONSORS, {})
    ents = [e for e in entries() if e["id"] not in real and e.get("wiki")]
    qpath = os.path.join(CACHE, "wd_entities.json")
    ent = load(qpath, {})
    todo = [e for e in ents if e["wiki"] not in ent]
    for i in range(0, len(todo), 40):
        batch = todo[i:i + 40]
        r = wd_api({"action": "wbgetentities", "sites": "enwiki", "redirects": "yes",
                                     "titles": "|".join(e["wiki"] for e in batch), "props": "claims|sitelinks",
                                     "sitefilter": "enwiki"})
        got = {}
        for q in (r or {}).get("entities", {}).values():
            t = q.get("sitelinks", {}).get("enwiki", {}).get("title")
            if t:
                cl = q.get("claims", {})
                got[t] = {p: [c["mainsnak"].get("datavalue", {}).get("value", {}).get("id") for c in cl.get(p, [])
                              if c.get("rank") != "deprecated" and "P582" not in (c.get("qualifiers") or {})]
                          for p in ("P5995", "P859")}
        for e in batch:
            ent[e["wiki"]] = got.get(e["wiki"].replace("_", " "), {})
        save(qpath, ent)
    qs = sorted({q for v in ent.values() for p in v.values() for q in p if q})
    lpath = os.path.join(CACHE, "wd_labels.json")
    labels = load(lpath, {})
    need = [q for q in qs if q not in labels]
    for i in range(0, len(need), 50):
        r = wd_api({"action": "wbgetentities", "ids": "|".join(need[i:i + 50]),
                                     "props": "labels", "languages": "en"})
        for q, v in (r or {}).get("entities", {}).items():
            labels[q] = v.get("labels", {}).get("en", {}).get("value")
        save(lpath, labels)

    def lab(q):
        s = labels.get(q) or ""
        return BRAND_NORM.get(s.lower(), s) or None

    added = 0
    for e in entries():
        cid = e["id"]
        if cid in real and "wikidata" not in real[cid].get("src", "") and cid not in WORLD_FIX:
            continue
        rec = {}
        v = ent.get(e.get("wiki") or "", {})
        if v.get("P5995"):
            rec["kit"] = lab(v["P5995"][-1])
        if v.get("P859") and not e.get("nation"):
            rec["shirt"] = lab(v["P859"][-1])
        if rec.get("shirt") in set(BRAND_NORM.values()):  # marca de material marcada como patrocinador
            rec.pop("shirt")
        rec = {k: x for k, x in rec.items() if x}
        src = "wikidata" if rec else ""
        if e.get("nation") and NATION_KIT.get(e["nation"]):
            rec = {"kit": NATION_KIT[e["nation"]]}
            src = "manual"
        if cid in WORLD_FIX:
            rec.update(WORLD_FIX[cid])
            src = (src + "+manual").strip("+")
        if rec:
            rec["src"] = src
            real[cid] = {**real.get(cid, {}), **rec}
            added += 1
    with open(OUT_SPONSORS, "w", encoding="utf-8") as f:
        json.dump(real, f, ensure_ascii=False, indent=1)
    print(f"wikidata: {added} clubes/seleções acrescentados; total {len(real)}")


if __name__ == "__main__":
    args = sys.argv[1:] or ["wikidata", "sdb"]
    os.makedirs(CACHE, exist_ok=True)
    if "wikidata" in args:
        wikidata()
    if "sdb" in args:
        sdb()
