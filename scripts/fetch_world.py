# -*- coding: utf-8 -*-
"""World data: coleta resumível (cache em scripts/cache/world/) das ligas/seleções de world_catalog.py.

Etapas (cada uma pode ser interrompida e retomada; o que já está no cache não é baixado de novo):
  wiki     wikitext (index.php?action=raw, 4 s) dos clubes, seleções e "2026 FIFA World Cup squads"
           -> scripts/cache/world/squads.json
  details  Wikidata SPARQL (3 s): título -> QID, nascimento, altura, pé, posições, nº de idiomas
           -> scripts/cache/world/details.json
  teams    TheSportsDB (2 s): searchteams (escudo, cores, estádio) + lookupvenue (foto do estádio)
           -> scripts/cache/world/teams.json
  media    escudos 256px (public/media/crests/<id>.webp, nt-XXX.webp) e fotos de estádio 640x360
           (public/media/stadiums/tsdb-<idVenue>.webp)
  photos   cutouts do TheSportsDB por jogador (estrelas primeiro), conferindo time/QID + ano
           -> scripts/cache/world/photos.json (o build mescla em src/data/sportsdbPhotos.json)
Uso: python3 scripts/fetch_world.py <etapa> [--max-seconds N]
"""
import json
import os
import re
import sys
import time
import unicodedata

sys.path.insert(0, os.path.dirname(__file__))
import world_http as H  # noqa: E402
from fetch_squads import (classify, extract_template, parse_infobox, parse_name,  # noqa: E402
                          split_template_args, strip_markup)
from world_catalog import NATIONS, WC_SQUADS_ARTICLE, clubs  # noqa: E402

ROOT = H.ROOT
CW = H.CACHE
SQUADS = os.path.join(CW, "squads.json")
DETAILS = os.path.join(CW, "details.json")
TEAMS = os.path.join(CW, "teams.json")
PHOTOS = os.path.join(CW, "photos.json")
MEDIA = os.path.join(ROOT, "public", "media")
T0 = time.time()
MAX_S = float(sys.argv[sys.argv.index("--max-seconds") + 1]) if "--max-seconds" in sys.argv else 1e12

PLAYER_RE = re.compile(r"\{\{\s*(?:fs|football squad|nat fs g|nat fs r|nat fs|national football squad) player\s*\|", re.I)
HEADING_RE = re.compile(r"^(={2,6})\s*(.*?)\s*\1\s*$", re.M)


def load(path, default):
    try:
        return json.load(open(path, encoding="utf-8"))
    except (OSError, ValueError):
        return default


def save(path, data):
    tmp = path + ".tmp"
    json.dump(data, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
    os.replace(tmp, path)


def out_of_time():
    return time.time() - T0 > MAX_S


def birth_year(s):
    m = re.search(r"\{\{\s*(?:birth date and age|bda|birth date|dob)\s*\|\s*(?:df=y\w*\s*\|\s*|mf=y\w*\s*\|\s*)?(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})", s or "", re.I)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    m = re.search(r"(19[6-9]\d|20[01]\d)", strip_markup(s or ""))
    return f"{m.group(1)}-07-01" if m else None


def parse_players(text, only_sections=None):
    """Templates de jogador (fs player / nat fs g player / nat fs r player) com a seção onde estão."""
    heads = [(m.start(), strip_markup(m.group(2))) for m in HEADING_RE.finditer(text)]
    out = []
    for m in PLAYER_RE.finditer(text):
        body, _ = extract_template(text, m.start())
        kv = {}
        for a in split_template_args(body)[1:]:
            if "=" in a:
                k, v = a.split("=", 1)
                kv[k.strip().lower()] = v.strip()
        if not kv.get("name"):
            continue
        heading = ""
        for pos, h in heads:
            if pos < m.start():
                heading = h
            else:
                break
        kind = classify(heading)
        other = strip_markup(kv.get("other", "")).lower()
        if only_sections is None and (kind == "skip" or "on loan to" in other):
            continue
        name, link = parse_name(kv["name"])
        if not name:
            continue
        club_raw = kv.get("club", "")
        cm = re.search(r"\[\[([^\]|#]+)", club_raw)
        out.append({
            "name": name, "link": link, "no": strip_markup(kv.get("no", "")),
            "nat": strip_markup(kv.get("nat", "")), "pos": strip_markup(kv.get("pos", "")).upper(),
            "kind": kind, "heading": heading, "dob": birth_year(kv.get("age", "")),
            "club": cm.group(1).strip() if cm else strip_markup(club_raw),
            "clubnat": strip_markup(kv.get("clubnat", "")),
            "recent": "r player" in text[m.start():m.start() + 40].lower(),
        })
    return out


def wc_sections(text):
    """Divide o artigo das convocações da Copa por seleção (títulos ===País===)."""
    res = {}
    heads = [(m.start(), m.end(), len(m.group(1)), strip_markup(m.group(2))) for m in HEADING_RE.finditer(text)]
    for i, (s, e, lvl, h) in enumerate(heads):
        if lvl != 3:
            continue
        end = len(text)
        for s2, _, l2, _ in heads[i + 1:]:
            if l2 <= 3:
                end = s2
                break
        res[h] = parse_players(text[e:end], only_sections=True)
    return res


# ---------------------------------------------------------------- etapa wiki
def step_wiki():
    sq = load(SQUADS, {"clubs": {}, "nations": {}, "wc": {}})
    for c in clubs():
        if c["id"] in sq["clubs"]:
            continue
        if out_of_time():
            break
        text, final = H.wiki_raw(c["wiki"])
        if text is None and not os.path.exists(H._cpath("wt_en", c["wiki"])):
            continue  # falha de rede: tenta na próxima
        players = parse_players(text or "")
        seen, uniq = set(), []
        for p in players:
            k = p["link"] or p["name"]
            if k not in seen:
                seen.add(k); uniq.append(p)
        sq["clubs"][c["id"]] = {"title": final, "infobox": parse_infobox(text or ""), "players": uniq}
        print(f"{c['league']} {c['id']:<24} {sum(p['kind'] == 'first' for p in uniq):>3} jogadores", flush=True)
        save(SQUADS, sq)
    for code, _, _, _, _, wiki in NATIONS:
        if code in sq["nations"] or out_of_time():
            continue
        text, final = H.wiki_raw(wiki)
        if text is None:
            continue
        ps = [p for p in parse_players(text, only_sections=True)
              if re.search(r"current squad|recent call|squad", p["heading"], re.I) or p["recent"]]
        sq["nations"][code] = {"title": final, "infobox": parse_infobox(text), "players": ps}
        print(f"seleção {code}: {len(ps)}", flush=True)
        save(SQUADS, sq)
    if not sq.get("wc") and not out_of_time():
        text, _ = H.wiki_raw(WC_SQUADS_ARTICLE)
        if text:
            sq["wc"] = wc_sections(text)
            print("copa 2026:", {k: len(v) for k, v in sq["wc"].items()}, flush=True)
            save(SQUADS, sq)


# ---------------------------------------------------------------- etapa details (Wikidata)
SPARQL = """
SELECT ?title ?item ?dob ?height ?sl
  (GROUP_CONCAT(DISTINCT ?posLabel; separator="|") AS ?positions)
  (SAMPLE(?footLabel) AS ?foot) (SAMPLE(?natCode) AS ?nat) WHERE {
  VALUES ?title { %s }
  ?article schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?title.
  OPTIONAL { ?item wdt:P569 ?dob. }
  OPTIONAL { ?item wdt:P2048 ?height. }
  OPTIONAL { ?item wikibase:sitelinks ?sl. }
  OPTIONAL { ?item wdt:P413 ?pos. ?pos rdfs:label ?posLabel. FILTER(LANG(?posLabel) = "en") }
  OPTIONAL { ?item wdt:P552 ?f. ?f rdfs:label ?footLabel. FILTER(LANG(?footLabel) = "en") }
  OPTIONAL { ?item wdt:P1532 ?cty. ?cty wdt:P3441 ?natCode. }
} GROUP BY ?title ?item ?dob ?height ?sl
"""


def all_links(sq):
    links = set()
    for grp in ("clubs", "nations"):
        for v in sq[grp].values():
            links.update(p["link"] for p in v["players"] if p.get("link"))
    for v in sq.get("wc", {}).values():
        links.update(p["link"] for p in v if p.get("link"))
    return links


def step_details():
    sq = load(SQUADS, None)
    det = load(DETAILS, {})
    todo = sorted(t for t in all_links(sq) if t not in det)
    print(f"details: {len(todo)} títulos pendentes", flush=True)
    for i in range(0, len(todo), 80):
        if out_of_time():
            break
        batch = todo[i:i + 80]
        vals = " ".join('"%s"@en' % (t[0].upper() + t[1:]).replace("\\", "\\\\").replace('"', '\\"') for t in batch)
        rows = H.sparql(SPARQL % vals, "d-" + "|".join(batch))
        if rows is None:
            continue
        got = {}
        for b in rows:
            t = b["title"]["value"]
            d = got.setdefault(t, {"qid": b["item"]["value"].rsplit("/", 1)[-1], "dob": None, "height": None,
                                   "sl": 0, "positions": [], "foot": None, "wdnat": None})
            if "dob" in b and not d["dob"]:
                d["dob"] = b["dob"]["value"][:10]
            if "height" in b and not d["height"]:
                try:
                    h = float(b["height"]["value"])
                    d["height"] = round(h * 100) if h < 3 else round(h)
                except ValueError:
                    pass
            if "sl" in b:
                d["sl"] = max(d["sl"], int(b["sl"]["value"]))
            for p in (b.get("positions", {}).get("value") or "").split("|"):
                if p and p not in d["positions"]:
                    d["positions"].append(p)
            if b.get("foot", {}).get("value") and not d["foot"]:
                d["foot"] = b["foot"]["value"]
            if b.get("nat", {}).get("value") and not d["wdnat"]:
                d["wdnat"] = b["nat"]["value"]
        for t in batch:
            det[t] = got.get(t[0].upper() + t[1:]) or {"miss": 1}
        save(DETAILS, det)
        print(f"  details {min(i + 80, len(todo))}/{len(todo)}", flush=True)


# ---------------------------------------------------------------- etapa teams (TheSportsDB)
def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return " ".join(t for t in re.split(r"[^a-z0-9]+", s) if t and t not in
                    {"fc", "cf", "sc", "ac", "afc", "club", "de", "the", "football", "cd", "sk", "fk", "sv", "a", "f", "c", "s"})


TSDB_LEAGUE = {"eng1": "English Premier League", "esp1": "Spanish La Liga", "ita1": "Italian Serie A",
               "ger1": "German Bundesliga", "fra1": "French Ligue 1", "por1": "Portuguese Primeira Liga",
               "ned1": "Dutch Eredivisie", "tur1": "Turkish Super Lig", "sco1": "Scottish Premier League",
               "arg1": "Argentinian Primera Division", "ksa1": "Saudi-Arabian Pro League",
               "jpn1": "Japanese J1 League", "usa1": "American Major League Soccer"}
TSDB_COUNTRY = {"eng1": "England", "esp1": "Spain", "ita1": "Italy", "ger1": "Germany", "fra1": "France",
                "por1": "Portugal", "ned1": "Netherlands", "tur1": "Turkey", "sco1": "Scotland", "arg1": "Argentina",
                "ksa1": "Saudi Arabia", "jpn1": "Japan", "usa1": "USA"}


def pick_team(cands, names, country=None, national=False):
    best, score = None, 0
    targets = {norm(n) for n in names if n}
    for t in cands or []:
        if t.get("strSport") != "Soccer" or (t.get("strGender") or "Male") != "Male":
            continue
        alt = [t.get("strTeam")] + (t.get("strTeamAlternate") or "").split(",")
        al = {norm(a) for a in alt if a}
        s = 0
        if al & targets:
            s += 3
        elif any(a and (a in x or x in a) for a in al for x in targets):
            s += 1
        if country and (t.get("strCountry") == country):
            s += 2
        if national and "national" not in (t.get("strTeam") or "").lower() and "u2" not in (t.get("strTeam") or "").lower():
            s += 0.5 if t.get("strLeague") in ("FIFA World Cup", "International Friendlies") or "Qualif" in (t.get("strLeague") or "") else 0
        if re.search(r"\b(U\d\d|Women|B|II|Reserves)\b", t.get("strTeam") or ""):
            s -= 3
        if s > score:
            best, score = t, s
    return best if score >= 3 else None


TSDB_NAME = {  # nomes como o TheSportsDB grafa (quando a busca pelo nome curto falha)
    "inter-milan": "Inter Milan", "psg": "Paris SG", "bayern-munich": "Bayern Munich", "liverpool-eng": "Liverpool",
    "barcelona-esp": "Barcelona", "athletic-bilbao": "Athletic Bilbao", "atletico-madrid": "Atletico Madrid",
    "gladbach": "Borussia Monchengladbach", "koln": "FC Koln", "hamburger-sv": "Hamburger SV", "nacional-por": "Nacional",
    "sporting-cp": "Sporting CP", "vitoria-guimaraes": "Vitoria Guimaraes", "ac-milan": "AC Milan",
    "deportivo-la-coruna": "Deportivo La Coruna", "celta-vigo": "Celta Vigo", "fenerbahce": "Fenerbahce",
    "galatasaray": "Galatasaray", "besiktas": "Besiktas", "basaksehir": "Istanbul Basaksehir", "rizespor": "Rizespor",
    "lafc": "Los Angeles FC", "nycfc": "New York City FC", "ny-red-bulls": "New York Red Bulls",
}


def step_teams():
    teams = load(TEAMS, {})
    jobs = [(c["id"], [TSDB_NAME.get(c["id"]), c["name"], c["wiki"]], TSDB_COUNTRY[c["league"]], False) for c in clubs()]
    en_names = {code: wiki.replace(" national football team", "").replace(" men's national soccer team", "")
                for code, _, _, _, _, wiki in NATIONS}
    jobs += [("nt-" + code, [en_names[code]], None, True) for code, *_ in NATIONS]
    for tid, names, country, national in jobs:
        if tid in teams or out_of_time():
            continue
        hit = None
        for n in [x for x in names if x]:
            q = re.sub(r"\s*\(.*?\)", "", n)
            res = H.tsdb("searchteams.php", t=q)
            if res is None:
                break
            hit = pick_team(res.get("teams"), names, country, national)
            if hit:
                break
        rec = {"miss": 1}
        if hit:
            rec = {k: hit.get(k) for k in ("idTeam", "strTeam", "strTeamShort", "intFormedYear", "strStadium", "idVenue",
                                           "strLocation", "strColour1", "strColour2", "strColour3", "strBadge",
                                           "strEquipment", "strKeywords", "strCountry", "strLeague")}
            if hit.get("idVenue") and hit["idVenue"] != "0" and not national:
                v = H.tsdb("lookupvenue.php", id=hit["idVenue"])
                vv = ((v or {}).get("venues") or [{}])[0]
                rec["venue"] = {k: vv.get(k) for k in ("strVenue", "intCapacity", "strThumb", "strLocation")}
        teams[tid] = rec
        save(TEAMS, teams)
        print(f"  {tid:<24} {rec.get('strTeam', '-- não achado')}", flush=True)


# ---------------------------------------------------------------- etapa media
def step_media():
    from fetch_club_media import to_logo_webp, to_stadium_webp
    teams = load(TEAMS, {})
    ok = miss = 0
    for tid, t in teams.items():
        if out_of_time():
            break
        out = os.path.join(MEDIA, "crests", tid + ".webp")
        if t.get("strBadge") and not os.path.exists(out):
            data = H.download(t["strBadge"])
            if data and to_logo_webp(data, out):
                ok += 1
            else:
                miss += 1
        v = t.get("venue") or {}
        if v.get("strThumb") and t.get("idVenue"):
            out = os.path.join(MEDIA, "stadiums", f"tsdb-{t['idVenue']}.webp")
            if not os.path.exists(out):
                data = H.download(v["strThumb"])
                try:
                    if data:
                        to_stadium_webp(data, out)
                except Exception as e:  # imagem corrompida
                    print("  estádio falhou", tid, e)
    print(f"media: {ok} escudos novos, {miss} falhas", flush=True)


# ---------------------------------------------------------------- etapa photos
PREFIX = "https://r2.thesportsdb.com/images/media/player/"


def photo_jobs():
    """(chave, nome, ano, qid, nomes aceitos do time) — estrelas (4 por clube) primeiro."""
    sq, det, teams = load(SQUADS, {}), load(DETAILS, {}), load(TEAMS, {})
    stars, rest = [], []
    for cid, v in sq.get("clubs", {}).items():
        t = teams.get(cid, {})
        tnames = {norm(t.get("strTeam"))} | {norm(x) for x in [cid.replace("-", " ")]}
        ps = []
        for p in v["players"]:
            if p["kind"] != "first":
                continue
            d = det.get(p.get("link") or "", {})
            dob = d.get("dob") or p.get("dob")
            if not dob:
                continue
            ps.append((d.get("sl", 0), p["name"], int(dob[:4]), d.get("qid"), tnames))
        ps.sort(key=lambda x: -x[0])
        stars += ps[:4]
        rest += ps[4:]
    return stars + rest


def step_photos():
    done = load(PHOTOS, {})
    jobs = photo_jobs()
    n_new = 0
    for sl, name, born, qid, tnames in jobs:
        key = f"{name}|{born}"
        if key in done:
            continue
        if out_of_time():
            break
        hit = None
        variants = [name]
        nd = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
        if nd != name:
            variants.append(nd)
        for v in variants:
            res = H.tsdb("searchplayers.php", p=v.replace(" ", "_"))
            if res is None:
                break
            for c in res.get("player") or []:
                if (c.get("strSport") or "Soccer") != "Soccer":
                    continue
                b = (c.get("dateBorn") or "")[:4]
                same_q = qid and c.get("idWikidata") == qid
                team_ok = norm(c.get("strTeam")) in tnames or any(
                    tn and (tn in norm(c.get("strTeam")) or norm(c.get("strTeam")) in tn) for tn in tnames if len(tn) > 3)
                year_ok = b.isdigit() and abs(int(b) - born) <= 1
                if same_q or (team_ok and year_ok) or (year_ok and b.isdigit() and int(b) == born and
                                                       norm(c.get("strPlayer")) == norm(name)):
                    img = c.get("strCutout") or c.get("strThumb")
                    if img and img.startswith(PREFIX):
                        hit = img[len(PREFIX):]
                        break
            if hit or res.get("player"):
                break
        done[key] = hit or ""
        n_new += 1
        if n_new % 25 == 0:
            save(PHOTOS, done)
            print(f"  fotos: {sum(1 for x in done.values() if x)}/{len(done)} de {len(jobs)}", flush=True)
    save(PHOTOS, done)
    print(f"fotos: {sum(1 for x in done.values() if x)}/{len(done)} (total {len(jobs)})",
          "COMPLETO" if len(done) >= len(jobs) else "PARCIAL", flush=True)


if __name__ == "__main__":
    steps = {"wiki": step_wiki, "details": step_details, "teams": step_teams, "media": step_media, "photos": step_photos}
    for s in [a for a in sys.argv[1:] if a in steps]:
        steps[s]()
