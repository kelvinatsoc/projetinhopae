# -*- coding: utf-8 -*-
"""Monta src/data/world.json (contrato em src/data/worldTypes.ts) a partir do cache de fetch_world.py.

- mesmas posições e o mesmo estimador de notas do build_database.py; a calibração entre ligas vem do
  `level` de cada clube em world_catalog.py (mesma escala do database.json);
- no máximo 25 jogadores por clube (22 na J1/MLS);
- seleções: pool/wc2026 = chaves "nome|ano" que resolvem para UM jogador do world.json ou do database.json;
- supersedes: jogadores do database.json que agora estão num clube do world.json;
- mescla as fotos do TheSportsDB em src/data/sportsdbPhotos.json.
Asserções: ids disjuntos (database.json, estaduais, nt-*), nat = código FIFA, pool resolve uma vez,
world.json <= 2 MB.
Uso: python3 scripts/build_world.py
"""
import json
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(__file__))
import build_database as B  # noqa: E402
from fetch_world import CW, DETAILS, PHOTOS, SQUADS, TEAMS, load  # noqa: E402
from world_catalog import C, LEAGUES, NATIONS, WC_NAMES, clubs as new_clubs, league_ids  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "data", "world.json")
DB = os.path.join(ROOT, "src", "data", "database.json")
ESTADUAIS = os.path.join(ROOT, "src", "data", "estaduais.ts")
PHOTOS_OUT = os.path.join(ROOT, "src", "data", "sportsdbPhotos.json")
MEDIA = os.path.join(ROOT, "public", "media")
SEASON = 2026
VERSION = 1
MAX_SIZE = 2 * 1024 * 1024

# códigos FIFA válidos (os do NAT do build_database + extras)
FIFA = set(B.NAT.values()) | {"ENG", "SCO", "WAL", "NIR", "KSA", "UAE", "OMA", "BHR", "KUW", "JOR", "PRK", "HKG",
                              "MAS", "SIN", "CYP", "MLT", "FRO", "AND", "LIE", "SMR", "GIB", "AZE", "COM", "LBY",
                              "SSD", "ERI", "NAM", "BOT", "LES", "SWZ", "MWI", "MRI", "SEY", "CTA", "TPE", "NCL",
                              "TAH", "FIJ", "PNG", "SOL", "VAN", "GRN", "LCA", "VIN", "SKN", "ATG", "BRB", "BAH",
                              "BER", "CAY", "ARU", "BLZ", "GYF", "MTQ", "GLP", "SXM", "KGZ", "TJK", "TKM", "AFG",
                              "BAN", "NEP", "SRI", "MYA", "CAM", "LAO", "MNG", "GUM", "YEM", "MDV", "BHU", "TLS"}
NAT_EXTRA = {"united arab emirates": "UAE", "oman": "OMA", "bahrain": "BHR", "kuwait": "KUW", "jordan": "JOR",
             "cyprus": "CYP", "malta": "MLT", "faroe islands": "FRO", "azerbaijan": "AZE", "libya": "LBY",
             "comoros": "COM", "namibia": "NAM", "malawi": "MWI", "central african republic": "CTA",
             "south sudan": "SSD", "republic of the congo": "CGO", "north korea": "PRK", "hong kong": "HKG",
             "malaysia": "MAS", "singapore": "SIN", "kyrgyzstan": "KGZ", "tajikistan": "TJK", "turkmenistan": "TKM",
             "afghanistan": "AFG", "bangladesh": "BAN", "grenada": "GRN", "bermuda": "BER", "aruba": "ARU",
             "belize": "BLZ", "french guiana": "GYF", "martinique": "MTQ", "guadeloupe": "GLP", "zaire": "COD",
             "cape verde islands": "CPV", "united states of america": "USA", "korea": "KOR", "czech": "CZE",
             "bosnia": "BIH", "ire": "IRL", "kosovo": "KVX", "dr congo": "COD"}
# códigos não-FIFA que aparecem em templates (IOC/ISO) -> FIFA
CODE_FIX = {"GBR": "ENG", "DZA": "ALG", "DEU": "GER", "NLD": "NED", "PRT": "POR", "CHE": "SUI", "HRV": "CRO",
            "DNK": "DEN", "GRC": "GRE", "SAU": "KSA", "ZAF": "RSA", "NGR": "NGA", "CIV": "CIV", "KOS": "KVX",
            "URY": "URU", "PRY": "PAR", "CHL": "CHI", "IRI": "IRN", "MAD": "MAD", "SVK": "SVK", "SLO": "SVN",
            "LAT": "LVA", "BUL": "BUL", "ROM": "ROU", "SER": "SRB", "MNT": "MNE", "TRI": "TRI", "HAI": "HAI",
            "CUR": "CUW", "COG": "CGO", "CPV": "CPV", "GNB": "GNB", "EQG": "EQG", "GEQ": "EQG", "TAN": "TAN"}

COUNTRY_OF = {lg: v[2] for lg, v in LEAGUES.items()}
CONFED_OF = {lg: v[3] for lg, v in LEAGUES.items()}
CAP = {"jpn1": 22, "usa1": 22}


def norm_name(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return " ".join(re.split(r"[^a-z0-9]+", s)).strip()


def to_fifa(raw, wdnat=None, fallback="---"):
    s = (raw or "").strip()
    if re.fullmatch(r"[A-Z]{3}", s):
        s = CODE_FIX.get(s, s)
        if s in FIFA:
            return s
    low = s.lower()
    if low in B.NAT and B.NAT[low] in FIFA:
        return B.NAT[low]
    if low in NAT_EXTRA:
        return NAT_EXTRA[low]
    if wdnat:
        w = CODE_FIX.get(wdnat, wdnat)
        if w in FIFA:
            return w
    return fallback


def hexcol(c):
    c = (c or "").strip()
    return c.upper() if re.fullmatch(r"#[0-9A-Fa-f]{6}", c) else None


def has_media(p):
    return os.path.exists(os.path.join(MEDIA, p))


# Notas à mão dos craques (o estimador não distingue bem a elite): "Nome": ovr
STARS = {
    "Kylian Mbappé": 91, "Erling Haaland": 91, "Mohamed Salah": 89, "Vinícius Júnior": 89, "Jude Bellingham": 89,
    "Lamine Yamal": 90, "Rodri": 89, "Harry Kane": 90, "Ousmane Dembélé": 90, "Kevin De Bruyne": 86,
    "Virgil van Dijk": 89, "Raphinha": 89, "Pedri": 89, "Bukayo Saka": 88, "Declan Rice": 88, "Martin Ødegaard": 87,
    "Florian Wirtz": 88, "Jamal Musiala": 88, "Lautaro Martínez": 88, "Federico Valverde": 88, "Thibaut Courtois": 89,
    "Alisson": 89, "Gianluigi Donnarumma": 88, "Joshua Kimmich": 88, "Achraf Hakimi": 88, "Vitinha": 88,
    "Khvicha Kvaratskhelia": 87, "Cole Palmer": 87, "Phil Foden": 86, "William Saliba": 88, "Rúben Dias": 87,
    "Alexis Mac Allister": 87, "Bruno Fernandes": 87, "Antoine Griezmann": 85, "Robert Lewandowski": 86,
    "Frenkie de Jong": 87, "Marc-André ter Stegen": 85, "Jan Oblak": 87, "Alessandro Bastoni": 87, "Nicolò Barella": 87,
    "Hakan Çalhanoğlu": 85, "Victor Osimhen": 86, "Rafael Leão": 85, "Kenan Yıldız": 84, "Scott McTominay": 85,
    "Kevin Diks": 80, "Joško Gvardiol": 86, "Marquinhos": 86, "Nuno Mendes": 87, "Désiré Doué": 86,
    "João Neves": 87, "Bradley Barcola": 85, "Michael Olise": 88, "Luis Díaz": 87, "Alexander Isak": 88,
    "Hugo Ekitiké": 85, "Viktor Gyökeres": 86, "Mikel Oyarzabal": 84, "Nico Williams": 85, "Julián Álvarez": 88,
    "Antonio Rüdiger": 86, "Éder Militão": 85, "Trent Alexander-Arnold": 85, "Eduardo Camavinga": 84,
    "Aurélien Tchouaméni": 85, "Rodrygo": 84, "Arda Güler": 84, "Brahim Díaz": 81, "Andriy Lunin": 80,
    "Cristiano Ronaldo": 85, "Karim Benzema": 85, "Sadio Mané": 82, "Riyad Mahrez": 81, "Lionel Messi": 86,
    "Luis Suárez": 79, "Son Heung-min": 83, "Leroy Sané": 84, "Serge Gnabry": 83, "Piero Hincapié": 83,
    "Marc Guéhi": 84, "Mike Maignan": 87, "Emiliano Martínez": 86, "Ollie Watkins": 84, "Morgan Rogers": 83,
    "Bruno Guimarães": 86, "Sandro Tonali": 85, "Moisés Caicedo": 87, "Enzo Fernández": 85, "João Pedro": 84,
    "Dušan Vlahović": 83, "Paulo Dybala": 82, "Ademola Lookman": 84, "Christian Pulisic": 85, "Luka Modrić": 83,
}


def estimate(cid, lvl, cand):
    """Mesmo estimador do build_database.py (força do clube + fama + idade, normalizado ao level)."""
    for x in cand:
        x["raw"] = lvl + B.fame_adj(x["fame"]) + B.age_adj(x["age"]) + B.gauss_det(x["name"], cid, "ovr") * 1.0
    first = sorted(cand, key=lambda z: -z["raw"])
    shift = 0
    if len(first) >= 11:
        top = first[:16]
        shift = (lvl - 0.5) - sum(x["raw"] for x in top) / len(top)
    # elencos de liga estrangeira: espalha menos que no Brasil (fama do Wikidata satura nos grandes)
    mean = (lvl - 0.5)
    cap = min(93, lvl + 6)
    for x in cand:
        o = mean + (x["raw"] + shift - mean) * 0.8
        x["ovr"] = int(round(max(45, min(cap, o))))
        if x["name"] in STARS and x["fame"] >= 40:  # homônimos pouco conhecidos ficam de fora
            x["ovr"] = STARS[x["name"]]
        x["pot"] = B.potential(x["ovr"], x["age"], x["fame"], x["name"])


def player_records(cid, league, lvl, raw_players, det):
    cand = []
    seen = set()
    for p in raw_players:
        if p["kind"] != "first":
            continue
        name = B.clean_name(p["name"])
        if not name or len(name) > 40 or name in seen:
            continue
        seen.add(name)
        d = det.get(p.get("link") or "", {})
        q = {**p, **{k: v for k, v in d.items() if v}}
        foot = B.foot_of(q)
        grp = {"GK": "GK", "DF": "DF", "MF": "MF", "FW": "FW"}.get(p.get("pos", "")[:2])
        wdp = B.wd_positions(q, foot)
        if grp is None:
            grp = B.GROUP_OF[wdp[0]] if wdp else "MF"
        primary = None
        for code in wdp:
            if B.GROUP_OF.get(code) == grp or (grp == "MF" and code in ("PD", "PE")) or (grp == "FW" and code == "MEI"):
                primary = code
                break
        if grp == "GK":
            primary = "GOL"
        age, born, _ = B.age_of({"name": name, "dob": d.get("dob") or p.get("dob")}, "first")
        cand.append({"name": name, "nat": to_fifa(p.get("nat"), d.get("wdnat"), COUNTRY_OF[league]),
                     "grp": grp, "pos": primary, "sec": [x for x in wdp if x != primary][:2], "age": age, "born": born,
                     "foot": foot, "height": d.get("height"), "fame": int(d.get("sl") or 0), "no": p.get("no") or "",
                     "q": d.get("qid")})
    cand.sort(key=lambda z: -z["fame"])
    keep = cand[:CAP.get(league, 25)]
    counts = {}
    for x in keep:
        if x["pos"]:
            counts[x["pos"]] = counts.get(x["pos"], 0) + 1
    target = {"ZAG": 1.6, "LD": 1, "LE": 1, "VOL": 1.2, "MC": 1.2, "MEI": 1, "ATA": 1.3, "PD": 1, "PE": 1}
    for x in keep:
        if not x["pos"]:
            opts = B.FILL[x["grp"]] if x["grp"] != "GK" else ["GOL"]
            x["pos"] = min(opts, key=lambda o: counts.get(o, 0) / target.get(o, 1) + B.h01(x["name"], o) * 0.01)
            counts[x["pos"]] = counts.get(x["pos"], 0) + 1
        if not x["height"] or not (150 < x["height"] < 210):
            x["height"] = int(round(B.HEIGHT[x["pos"]] + B.gauss_det(x["name"], "h") * 5))
    estimate(cid, lvl, keep)
    out = []
    for x in keep:
        num = re.sub(r"[^\d]", "", x["no"])
        out.append({"c": cid, "n": x["name"], "nat": x["nat"], "p": x["pos"],
                    "s": [z for z in x["sec"] if z in B.SEC_OK[x["pos"]]][:2], "b": x["born"], "h": x["height"],
                    "f": x["foot"], "o": x["ovr"], "pt": x["pot"], "fm": x["fame"], "y": 0,
                    **({"no": int(num)} if num and int(num) < 100 else {}), **({"q": x["q"]} if x["q"] else {})})
    return out


CREST_STYLE = ["solid", "vstripes", "hoops", "band", "halves", "sash"]


def club_record(c, sq, teams):
    info = sq.get("infobox", {})
    t = teams.get(c["id"], {})
    v = t.get("venue") or {}
    cols = [hexcol(t.get("strColour1")), hexcol(t.get("strColour2")), hexcol(t.get("strColour3"))]
    cols = [x for x in cols if x] or [x for x in (info.get("body1"), info.get("shorts1")) if x] or ["#1B3E8F"]
    while len(cols) < 3:
        cols.append("#FFFFFF" if cols[0] != "#FFFFFF" else "#111111")
    stadium = re.sub(r"\s*\(.*?\)\s*", " ", (info.get("ground") or "").split(",")[0]).strip() or t.get("strStadium") or v.get("strVenue") or f"Estádio {c['name']}"
    cap = info.get("capacity") or 0
    try:
        vcap = int(v.get("intCapacity") or 0)
    except ValueError:
        vcap = 0
    if not (1500 <= cap <= 120000):
        cap = vcap if 1500 <= vcap <= 120000 else int(5000 + c["level"] * 300)
    loc = (t.get("strLocation") or v.get("strLocation") or "").split(",")[0].strip()
    nick = B.join_max(B.clean_nicks(info.get("nickname")), 60)
    country = COUNTRY_OF[c["league"]]
    rec = {"id": c["id"], "name": c["name"], "full": info.get("fullname") or t.get("strTeam") or c["name"],
           "abbr": c["abbr"][:4], "region": country, "city": loc, "country": country, "div": "F",
           "level": c["level"], "rep": max(30, min(100, int((c["level"] - 60) * 3.6))), "colors": cols[:3],
           "crest": CREST_STYLE[int(B.h01(c["id"], "crest") * len(CREST_STYLE))], "stadium": stadium,
           "capacity": cap, "founded": B.year_only(info.get("founded")) or (t.get("intFormedYear") or ""),
           "nickname": nick, "league": c["league"], "confed": CONFED_OF[c["league"]]}
    if has_media(f"crests/{c['id']}.webp"):
        rec["logo"] = 1
    if t.get("idVenue") and has_media(f"stadiums/tsdb-{t['idVenue']}.webp"):
        rec["stadiumImg"] = f"tsdb-{t['idVenue']}"
    return rec


MLS_EAST = {"atlanta-united", "charlotte-fc", "chicago-fire", "columbus-crew", "dc-united", "fc-cincinnati",
            "inter-miami", "cf-montreal", "nashville-sc", "new-england", "nycfc", "ny-red-bulls", "orlando-city",
            "philadelphia-union", "toronto-fc"}


def zones():
    """Zonas da Argentina (tabelas "Zone A/B" do artigo da temporada) e conferências da MLS (E/W)."""
    from world_http import wiki_raw
    out = {cid: ("E" if cid in MLS_EAST else "W") for cid in league_ids("usa1")}
    text, _ = wiki_raw("2026 Argentine Primera División")
    seasons = json.load(open(os.path.join(CW, "seasons.json"), encoding="utf-8"))
    by_title = dict(zip(seasons["arg1"], league_ids("arg1")))
    for z in ("A", "B"):
        i = (text or "").find(f"=====Zone {z}=====")
        if i < 0:
            continue
        chunk = text[i:i + 6000].split("=====", 3)[2] if z == "A" else text[i:i + 6000]
        chunk = chunk.split("=====Zone B=====")[0] if z == "A" else chunk.split("=====", 3)[2]
        for t in re.findall(r"\|name_[A-Z]+=\[\[([^\]|]+)", chunk):
            if t.strip() in by_title:
                out[by_title[t.strip()]] = z
    return out


def main():
    db = json.load(open(DB, encoding="utf-8"))
    sq, det, teams = load(SQUADS, None), load(DETAILS, {}), load(TEAMS, {})
    db_ids = {c["id"] for c in db["clubs"]}
    est_ids = set(re.findall(r'"([a-z0-9][a-z0-9-]+)"', open(ESTADUAIS, encoding="utf-8").read()))
    gaps = []

    clubs_out, players_out = [], []
    for c in new_clubs():
        assert c["id"] not in db_ids, f"id colide com database.json: {c['id']}"
        assert c["id"] not in est_ids, f"id colide com estaduais.ts: {c['id']}"
        assert not c["id"].startswith("nt-")
        s = sq["clubs"].get(c["id"])
        if not s:
            gaps.append(f"sem wikitext: {c['id']}")
            s = {"infobox": {}, "players": []}
        clubs_out.append(club_record(c, s, teams))
        ps = player_records(c["id"], c["league"], c["level"], s["players"], det)
        if len(ps) < 16:
            gaps.append(f"elenco curto: {c['id']} ({len(ps)})")
        players_out += ps
    for lg in C:
        for r in C[lg]:
            if r[0].startswith("db:"):
                assert r[0][3:] in db_ids, f"clube argentino reaproveitado não existe: {r[0]}"

    # um jogador aparece uma vez só no world (empréstimos listados em dois clubes: fica o 1º, por QID/nome+ano)
    seen, uniq = set(), []
    for p in players_out:
        k = p.get("q") or f"{norm_name(p['n'])}|{p['b']}"
        if k in seen:
            continue
        seen.add(k)
        uniq.append(p)
    players_out = uniq
    for p in players_out:
        assert p["nat"] in FIFA, f"nat não-FIFA: {p['n']} {p['nat']}"

    # índice de resolução: world primeiro, depois database (nome normalizado + ano; QID)
    idx_name, idx_q = {}, {}
    for src, ps in (("world", players_out), ("db", db["players"])):
        for p in ps:
            idx_name.setdefault((norm_name(p["n"]), p["b"]), []).append((src, p))
            if p.get("q"):
                idx_q.setdefault(p["q"], []).append((src, p))

    # supersedes: jogador do database.json que agora está num clube do world.json
    supersedes = set()
    for p in players_out:
        hits = idx_q.get(p.get("q"), []) if p.get("q") else []
        hits = hits or idx_name.get((norm_name(p["n"]), p["b"]), [])
        for src, dp in hits:
            if src == "db":
                supersedes.add(f"{dp['n']}|{dp['b']}")
    sup_starters = [k for k in supersedes
                    if any(f"{p['n']}|{p['b']}" == k and p["o"] >= 72 for p in db["players"])]

    def resolve(rp):
        d = det.get(rp.get("link") or "", {})
        cands = []
        if d.get("qid"):
            cands = [x for x in idx_q.get(d["qid"], []) if not (x[0] == "db" and f"{x[1]['n']}|{x[1]['b']}" in supersedes)]
        if not cands:
            dob = d.get("dob") or rp.get("dob")
            if dob:
                y = int(dob[:4])
                for yy in (y, y - 1, y + 1):
                    cands = [x for x in idx_name.get((norm_name(B.clean_name(rp["name"])), yy), [])
                             if not (x[0] == "db" and f"{x[1]['n']}|{x[1]['b']}" in supersedes)]
                    if cands:
                        break
        if not cands:
            return None
        src, p = max(cands, key=lambda x: (x[0] == "world", x[1]["o"]))
        return f"{p['n']}|{p['b']}"

    en_to_code = {wiki.replace(" national football team", "").replace(" men's national soccer team", ""): code
                  for code, _, _, _, _, wiki in NATIONS}
    en_to_code.update({w.replace(" men's national football team", "").replace(" national soccer team", ""): code
                       for code, _, _, _, _, w in NATIONS})
    en_to_code.update(WC_NAMES)
    wc_missing = [h for h, ps in (sq.get("wc") or {}).items() if ps and h not in en_to_code]
    assert not wc_missing, f"seleções da Copa fora do catálogo: {wc_missing}"
    nts = []
    for code, name, confed, tier, lvl, wiki in NATIONS:
        ns = sq["nations"].get(code, {"players": [], "infobox": {}})
        pool = []
        for rp in ns["players"]:
            k = resolve(rp)
            if k and k not in pool:
                pool.append(k)
        t = teams.get("nt-" + code, {})
        cols = [x for x in (hexcol(t.get("strColour1")), hexcol(t.get("strColour2")), hexcol(t.get("strColour3"))) if x]
        while len(cols) < 3:
            cols.append("#FFFFFF" if not cols or cols[0] != "#FFFFFF" else "#111111")
        nt = {"id": "nt-" + code, "fifa": code, "name": name, "confed": confed, "rankingTier": tier, "level": lvl,
              "colors": cols[:3], "pool": pool}
        assert "nt-" + code not in db_ids
        if has_media(f"crests/nt-{code}.webp"):
            nt["logo"] = 1
        wc = None
        for heading, ps in (sq.get("wc") or {}).items():
            if en_to_code.get(heading) == code or heading == wiki.split(" national")[0]:
                wc = [k for k in (resolve(rp) for rp in ps) if k]
        if wc:
            nt["wc2026"] = list(dict.fromkeys(wc))
        if len(pool) < 11:
            gaps.append(f"seleção com pool curto: {code} ({len(pool)} de {len(ns['players'])})")
        nts.append(nt)

    # toda chave de pool resolve para exatamente UM jogador (world ou database não-substituído)
    live = {}
    for p in players_out:
        live.setdefault(f"{p['n']}|{p['b']}", []).append(p)
    for p in db["players"]:
        k = f"{p['n']}|{p['b']}"
        if k not in supersedes:
            live.setdefault(k, []).append(p)
    for nt in nts:
        for k in nt["pool"] + nt.get("wc2026", []):
            assert len(live.get(k, [])) >= 1, f"pool não resolve: {nt['id']} {k}"
            if len(live[k]) > 1:
                gaps.append(f"chave ambígua no pool {nt['id']}: {k} ({len(live[k])}; vence o de maior ovr)")

    leagues = []
    zone = zones()
    for c in clubs_out:
        if c["id"] in zone:
            c["zone"] = zone[c["id"]]
    for lg, (name, short, country, confed, cal, rel, color) in LEAGUES.items():
        ids = league_ids(lg)
        d = {"id": lg, "name": name, "short": short, "country": country, "confed": confed,
             "size": len(ids), "calendar": cal, "relegation": rel, "color": color, "clubs": ids}
        zl = {cid: zone[cid] for cid in ids if cid in zone}
        if zl:  # cobre também os clubes argentinos que vivem no database.json
            d["zones"] = zl
            assert len(zl) == len(ids), f"zona faltando em {lg}: {set(ids) - set(zl)}"
        leagues.append(d)

    world = {"version": VERSION, "fetchedAt": __import__("time").strftime("%Y-%m-%d"), "season": SEASON,
             "leagues": leagues, "clubs": clubs_out, "players": players_out, "nationalTeams": nts,
             "supersedes": sorted(supersedes)}
    data = json.dumps(world, ensure_ascii=False, separators=(",", ":"))
    assert len(data.encode()) <= MAX_SIZE, f"world.json grande demais: {len(data.encode())} bytes"
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(data)

    # fotos (TheSportsDB) -> sportsdbPhotos.json (chave nome|ano), só para jogadores existentes
    photos = load(PHOTOS, {})
    cur = load(PHOTOS_OUT, {})
    keys = {f"{p['n']}|{p['b']}" for p in players_out}
    raw_name = {}
    for c in sq["clubs"].values():
        for rp in c["players"]:
            raw_name.setdefault(rp["name"], B.clean_name(rp["name"]))
    added = 0
    for k, v in photos.items():
        if not v:
            continue
        n, y = k.rsplit("|", 1)
        k2 = f"{raw_name.get(n, n)}|{y}"
        if k2 in keys and cur.get(k2) != v:
            cur[k2] = v
            added += 1
    with open(PHOTOS_OUT, "w", encoding="utf-8") as f:
        json.dump(dict(sorted(cur.items())), f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")

    # relatório
    print(f"ok -> {OUT} ({len(data.encode()) // 1024} KB): {len(clubs_out)} clubes, {len(players_out)} jogadores, "
          f"{len(nts)} seleções, supersedes {len(supersedes)} (com ovr>=72 no Brasil: {len(sup_starters)})")
    for lg in LEAGUES:
        cs = [c for c in clubs_out if c["league"] == lg]
        ps = [p for p in players_out if any(p["c"] == c["id"] for c in cs)]
        ph = sum(1 for p in ps if f"{p['n']}|{p['b']}" in cur)
        top = sorted(ps, key=lambda p: -p["o"])[:3]
        print(f"  {lg}: {len(cs)} clubes novos, {len(ps)} jogadores, escudos {sum(1 for c in cs if c.get('logo'))}, "
              f"estádios {sum(1 for c in cs if c.get('stadiumImg'))}, fotos {ph} "
              f"({100 * ph // max(1, len(ps))}%); top: {', '.join(p['n'] + ' ' + str(p['o']) for p in top)}")
    print(f"  seleções: escudos {sum(1 for n in nts if n.get('logo'))}/{len(nts)}, pool médio "
          f"{sum(len(n['pool']) for n in nts) // len(nts)}, com wc2026 {sum(1 for n in nts if n.get('wc2026'))}")
    print(f"  fotos novas mescladas: {added}; total sportsdbPhotos: {len(cur)}")
    json.dump(gaps, open(os.path.join(CW, "gaps.json"), "w"), ensure_ascii=False, indent=0)
    print(f"  lacunas: {len(gaps)} (scripts/cache/world/gaps.json)")
    for g in gaps[:40]:
        print("   -", g)


if __name__ == "__main__":
    main()
