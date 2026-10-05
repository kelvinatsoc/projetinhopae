# -*- coding: utf-8 -*-
"""
Etapa 2: transforma scripts/cache/raw.json (gerado por fetch_squads.py) no banco de
dados inicial do jogo: src/data/database.json

- define a posição detalhada (GOL, ZAG, LD, LE, VOL, MC, MEI, PD, PE, ATA)
- estima o overall (OVR) e o potencial (POT) de cada jogador.
  Não existe fonte aberta de "notas" de jogadores, então a estimativa usa:
    força do clube + fama (nº de idiomas com artigo na Wikipedia) + idade.
  Depois o elenco é normalizado para a média do clube (campo "level" do catálogo).
- OVERRIDES permite corrigir à mão as notas de quem você achar injustiçado :)

Uso:
    python3 scripts/build_database.py
"""
import hashlib
import json
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from clubs_catalog import ALL_CLUBS  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "scripts", "cache", "raw.json")
OUT = os.path.join(ROOT, "src", "data", "database.json")
SEASON = 2026
REF_DATE = (2026, 1, 15)  # data de referência para idades (início da temporada)

# Correções manuais de overall/potencial: "Nome": (ovr, pot)
OVERRIDES = {
    # Flamengo
    "Giorgian de Arrascaeta": (85, 85), "Lucas Paquetá": (84, 85), "Pedro": (82, 82),
    "Jorginho": (81, 81), "Agustín Rossi": (81, 82), "Danilo": (79, 79), "Alex Sandro": (78, 78),
    "Léo Ortiz": (80, 81), "Léo Pereira": (79, 79), "Saúl Ñíguez": (79, 79), "Samuel Lino": (79, 81),
    "Nicolás de la Cruz": (79, 79), "Jorge Carrascal": (79, 81), "Erick Pulgar": (78, 78),
    "Guillermo Varela": (77, 77), "Gonzalo Plata": (78, 80), "Bruno Henrique": (76, 76),
    "Emerson Royal": (77, 77), "Ayrton Lucas": (76, 76), "Luiz Araújo": (77, 77), "flamengo:Vitão": (77, 78),
    # outros destaques da Série A
    "Neymar": (81, 81), "Philippe Coutinho": (76, 76), "Gabriel Barbosa": (76, 76), "santos:Arthur": (79, 79),
    "Hugo Souza": (78, 79), "Memphis Depay": (81, 81), "Yuri Alberto": (77, 78), "Rodrigo Garro": (77, 78),
    "Jesse Lingard": (77, 77), "cruzeiro:Matheus Pereira": (80, 80), "Kaio Jorge": (80, 84),
    "Matías Viña": (78, 78), "Alan Patrick": (78, 78), "Sergio Rochet": (78, 78), "Everson": (76, 76),
    "Gustavo Scarpa": (77, 77), "Hulk": (75, 75), "Thiago Silva": (75, 75), "Lucho Acosta": (79, 79),
    "Vitor Roque": (80, 88), "Gustavo Gómez": (81, 81), "José Manuel López": (80, 82),
    "Lucas Moura": (77, 77), "Jonathan Calleri": (75, 75), "Arthur Cabral": (76, 76),
    "Cristian Pavon": (78, 78), "Alex Telles": (78, 78), "Hakim Ziyech": (78, 78), "Everton Ribeiro": (74, 74),
}

NAT = {
    "brazil": "BRA", "argentina": "ARG", "uruguay": "URU", "chile": "CHI", "colombia": "COL",
    "ecuador": "ECU", "paraguay": "PAR", "peru": "PER", "bolivia": "BOL", "venezuela": "VEN",
    "spain": "ESP", "italy": "ITA", "portugal": "POR", "france": "FRA", "germany": "GER",
    "england": "ENG", "netherlands": "NED", "belgium": "BEL", "united states": "USA", "usa": "USA",
    "mexico": "MEX", "japan": "JPN", "south korea": "KOR", "korea republic": "KOR", "china": "CHN",
    "angola": "ANG", "nigeria": "NGA", "ghana": "GHA", "cameroon": "CMR", "ivory coast": "CIV",
    "côte d'ivoire": "CIV", "senegal": "SEN", "cape verde": "CPV", "guinea-bissau": "GNB",
    "mozambique": "MOZ", "haiti": "HAI", "costa rica": "CRC", "honduras": "HON", "panama": "PAN",
    "cuba": "CUB", "dominican republic": "DOM", "canada": "CAN", "australia": "AUS", "croatia": "CRO",
    "serbia": "SRB", "switzerland": "SUI", "austria": "AUT", "poland": "POL", "russia": "RUS",
    "ukraine": "UKR", "greece": "GRE", "turkey": "TUR", "türkiye": "TUR", "israel": "ISR",
    "morocco": "MAR", "algeria": "ALG", "tunisia": "TUN", "egypt": "EGY", "scotland": "SCO",
    "wales": "WAL", "ireland": "IRL", "republic of ireland": "IRL", "northern ireland": "NIR",
    "denmark": "DEN", "sweden": "SWE", "norway": "NOR", "finland": "FIN", "czech republic": "CZE",
    "czechia": "CZE", "slovakia": "SVK", "hungary": "HUN", "romania": "ROU", "bulgaria": "BUL",
    "georgia": "GEO", "armenia": "ARM", "equatorial guinea": "EQG", "guinea": "GUI", "mali": "MLI",
    "burkina faso": "BFA", "togo": "TOG", "benin": "BEN", "congo": "CGO", "dr congo": "COD",
    "democratic republic of the congo": "COD", "gabon": "GAB", "zambia": "ZAM", "zimbabwe": "ZIM",
    "south africa": "RSA", "kenya": "KEN", "suriname": "SUR", "guyana": "GUY",
    "trinidad and tobago": "TRI", "jamaica": "JAM", "el salvador": "SLV", "guatemala": "GUA",
    "nicaragua": "NCA", "lebanon": "LBN", "syria": "SYR", "iran": "IRN", "iraq": "IRQ",
    "saudi arabia": "KSA", "qatar": "QAT", "india": "IND", "indonesia": "IDN", "philippines": "PHI",
    "thailand": "THA", "vietnam": "VIE", "palestine": "PLE", "slovenia": "SVN",
    "bosnia and herzegovina": "BIH", "montenegro": "MNE", "north macedonia": "MKD", "albania": "ALB",
    "kosovo": "KVX", "luxembourg": "LUX", "iceland": "ISL", "estonia": "EST", "latvia": "LVA",
    "lithuania": "LTU", "belarus": "BLR", "moldova": "MDA", "kazakhstan": "KAZ", "uzbekistan": "UZB",
    "new zealand": "NZL", "curaçao": "CUW", "curacao": "CUW", "puerto rico": "PUR", "sierra leone": "SLE",
    "liberia": "LBR", "gambia": "GAM", "the gambia": "GAM", "mauritania": "MTN", "niger": "NIG",
    "chad": "CHA", "sudan": "SDN", "ethiopia": "ETH", "uganda": "UGA", "tanzania": "TAN",
    "rwanda": "RWA", "burundi": "BDI", "madagascar": "MAD", "são tomé and príncipe": "STP",
}

POS_LABELS = [
    ("goalkeeper", "GOL"),
    ("centre-back", "ZAG"), ("center-back", "ZAG"), ("central defender", "ZAG"), ("centre back", "ZAG"),
    ("sweeper", "ZAG"), ("libero", "ZAG"), ("stopper", "ZAG"), ("inside forward", "MEI"),
    ("right-back", "LD"), ("right back", "LD"), ("right wing-back", "LD"),
    ("left-back", "LE"), ("left back", "LE"), ("left wing-back", "LE"),
    ("full-back", "FB"), ("fullback", "FB"), ("wing-back", "FB"), ("wing half", "VOL"),
    ("defensive midfielder", "VOL"), ("holding midfielder", "VOL"),
    ("attacking midfielder", "MEI"), ("playmaker", "MEI"), ("number 10", "MEI"),
    ("right winger", "PD"), ("right midfielder", "PD"), ("left winger", "PE"), ("left midfielder", "PE"),
    ("winger", "W"), ("wide midfielder", "W"), ("outside forward", "W"),
    ("central midfielder", "MC"), ("box-to-box", "MC"), ("midfielder", "MC"),
    ("second striker", "ATA"), ("centre-forward", "ATA"), ("center forward", "ATA"),
    ("centre forward", "ATA"), ("striker", "ATA"), ("forward", "ATA"), ("attacker", "ATA"),
    ("defender", "DF"),
]
GROUP_OF = {"GOL": "GK", "ZAG": "DF", "LD": "DF", "LE": "DF", "VOL": "MF", "MC": "MF", "MEI": "MF",
            "PD": "FW", "PE": "FW", "ATA": "FW"}
FILL = {"DF": ["ZAG", "LD", "LE", "ZAG"], "MF": ["VOL", "MC", "MEI", "MC"], "FW": ["ATA", "PD", "PE", "ATA"]}
HEIGHT = {"GOL": 189, "ZAG": 186, "LD": 177, "LE": 177, "VOL": 180, "MC": 178, "MEI": 175, "PD": 174, "PE": 174, "ATA": 182}


PT = os.path.join(ROOT, "scripts", "cache", "pt_squads.json")
PT_POS = {"G": "GOL", "Z": "ZAG", "LD": "LD", "LE": "LE", "V": "VOL", "M": "M", "A": "A", "PD": "PD", "PE": "PE"}

# Correções manuais de posição: "Nome" ou "clube:Nome" -> (posição, [secundárias])
POS_OVERRIDES = {
    "Giorgian de Arrascaeta": ("MEI", ["MC"]), "Lucas Paquetá": ("MEI", ["MC"]), "Jorge Carrascal": ("MEI", ["PD"]),
    "Gonzalo Plata": ("PD", ["ATA"]), "Luiz Araújo": ("PD", ["PE"]), "Samuel Lino": ("PE", ["LE"]),
    "flamengo:Bruno Henrique": ("PE", ["ATA"]), "flamengo:Danilo": ("ZAG", ["LD"]),
    "Neymar": ("PE", ["MEI", "ATA"]), "Philippe Coutinho": ("MEI", ["MC"]), "Gabriel Barbosa": ("ATA", []),
    "Everton Cebolinha": ("PE", ["ATA"]), "palmeiras:Paulinho": ("PE", ["ATA"]),
    "cruzeiro:Gerson": ("MC", ["MEI"]), "cruzeiro:Matheus Pereira": ("MEI", ["MC"]),
    "Renan Lodi": ("LE", []), "Ángelo Preciado": ("LD", []), "Gustavo Scarpa": ("MEI", ["PE"]),
    "atletico-mg:Bernard": ("MEI", ["PE"]), "Reinier": ("MEI", ["ATA"]), "atletico-mg:Dudu": ("PE", ["PD"]),
    "Alan Patrick": ("MEI", []), "Memphis Depay": ("ATA", ["PE"]), "Jesse Lingard": ("MEI", ["PD"]),
    "Rodrigo Garro": ("MEI", []), "Hakim Ziyech": ("PD", ["MEI"]), "Hulk": ("ATA", ["PD"]),
    "Lucas Moura": ("MEI", ["PD"]), "Jonathan Calleri": ("ATA", []), "Thiago Silva": ("ZAG", []),
    "Ganso": ("MEI", []), "Lucho Acosta": ("MEI", []), "Yeferson Soteldo": ("PE", ["MEI"]),
    "Gabriel Batista": ("GOL", []), "Everton Ribeiro": ("MEI", ["PD"]), "Michel Araújo": ("MEI", []),
    "Luciano Juba": ("LE", []), "Cristian Pavon": ("PD", []), "Tetê": ("PD", ["PE"]),
}

# Estádios que a Wikipedia não traz direito: id -> (nome, capacidade)
STADIUMS = {
    "flamengo": ("Maracanã", 78838), "fluminense": ("Maracanã", 78838), "sao-paulo": ("MorumBIS", 66795),
    "coritiba": ("Couto Pereira", 40502), "botafogo-sp": ("Santa Cruz", 29292), "amazonas": ("Carlos Zamith", 5000),
    "santa-cruz": ("Arruda", 60044), "remo": ("Mangueirão", 53635), "vasco": ("São Januário", 21880),
    "mirassol": ("Maião", 15023), "botafogo": ("Nilton Santos", 46831), "vitoria": ("Barradão", 30793),
    "corinthians": ("Neo Química Arena", 48905), "santos": ("Vila Belmiro", 16068), "bahia": ("Arena Fonte Nova", 50025),
}

# posições secundárias plausíveis para cada posição principal
SEC_OK = {"GOL": [], "ZAG": ["VOL", "LD", "LE"], "LD": ["ZAG", "PD", "LE"], "LE": ["ZAG", "PE", "LD"],
          "VOL": ["MC", "ZAG"], "MC": ["VOL", "MEI"], "MEI": ["MC", "PD", "PE", "ATA"],
          "PD": ["PE", "MEI", "ATA"], "PE": ["PD", "MEI", "ATA"], "ATA": ["PD", "PE", "MEI"]}


def norm(s):
    import unicodedata
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z ]", " ", s)


def tokens(s):
    stop = {"de", "da", "do", "dos", "das", "e", "futebolista", "jr", "junior", "filho", "neto"}
    return {t for t in norm(s).split() if len(t) > 2 and t not in stop}


def pt_match(x, pt_list):
    """Acha o jogador correspondente na lista em português (número da camisa + nome)."""
    xt = tokens(x["name"])
    best, best_score = None, 0
    for q in pt_list:
        qt = tokens(q["label"]) | tokens(q.get("link") or "")
        common = len(xt & qt)
        score = common * 2 + (3 if x["no"] and q["num"] and re.sub(r"[^0-9]", "", x["no"]) == q["num"] else 0)
        if common == 0 and score < 3:
            continue
        if common == 0 and norm(q["label"]).strip() not in norm(x["name"]):
            continue
        if score > best_score:
            best, best_score = q, score
    return best if best_score >= 2 else None


def h01(*parts):
    """Número pseudo-aleatório determinístico em [0, 1) a partir de strings."""
    d = hashlib.md5("|".join(str(p) for p in parts).encode()).hexdigest()
    return int(d[:8], 16) / 0xFFFFFFFF


def gauss_det(*parts):
    u1 = max(h01(*parts, "a"), 1e-9)
    u2 = h01(*parts, "b")
    return math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)


def map_nat(raw):
    if not raw:
        return "BRA"
    s = raw.strip()
    if re.fullmatch(r"[A-Z]{3}", s):
        return s
    return NAT.get(s.lower(), s[:3].upper())


def clean_name(n):
    n = re.sub(r"\s*\((?:captain|vice-captain|c|vc)\)\s*", " ", n, flags=re.I)
    n = re.sub(r"\s+", " ", n).strip(" ,;*")
    return n


def foot_of(p):
    f = (p.get("foot") or "").lower()
    if "ambi" in f or "both" in f:
        return "A"
    if "left" in f:
        return "E"
    if "right" in f:
        return "D"
    return "E" if h01(p["name"], "foot") < 0.24 else "D"


def wd_positions(p, foot):
    out = []
    for label in p.get("positions") or []:
        l = label.lower()
        for key, code in POS_LABELS:
            if key in l:
                if code == "FB":
                    code = "LE" if foot == "E" else "LD"
                elif code == "W":
                    code = ("PE" if h01(p["name"], "w") < 0.6 else "PD") if foot == "E" else \
                           ("PD" if h01(p["name"], "w") < 0.6 else "PE")
                if code not in out:
                    out.append(code)
                break
    return out


def age_of(p, kind):
    dob = p.get("dob")
    if dob and re.match(r"\d{4}-\d{2}-\d{2}", dob):
        y, m, d = (int(x) for x in dob.split("-"))
        if 1970 < y < 2015:
            age = REF_DATE[0] - y - ((REF_DATE[1], REF_DATE[2]) < (m, d))
            return age, y, True
    base = 18.5 if kind == "youth" else 25
    sd = 1.2 if kind == "youth" else 4
    age = int(round(base + gauss_det(p["name"], "age") * sd))
    age = max(16, min(36 if kind == "first" else 21, age))
    return age, SEASON - age, False


def fame_adj(sl):
    return max(-7.0, min(9.0, 3.0 * math.log1p(sl) - 7))


def age_adj(age):
    table = {16: -9, 17: -7.5, 18: -6, 19: -4.5, 20: -3, 21: -2, 22: -1.2, 23: -0.5}
    if age in table:
        return table[age]
    if age < 16:
        return -10
    if age <= 31:
        return 0
    return -(age - 31) * 0.9


def potential(ovr, age, fame, name):
    r = h01(name, "pot")
    if age <= 17:
        g = 10 + r * 15
    elif age <= 19:
        g = 7 + r * 13
    elif age <= 21:
        g = 4 + r * 10
    elif age <= 23:
        g = 2 + r * 7
    elif age <= 25:
        g = r * 4
    elif age <= 28:
        g = r * 2
    else:
        g = 0
    if age <= 21 and fame >= 10:
        g += 3
    return int(min(94, max(ovr, round(ovr + g))))


def main():
    with open(RAW, encoding="utf-8") as f:
        raw = json.load(f)
    pt_all = {}
    if os.path.exists(PT):
        with open(PT, encoding="utf-8") as f:
            pt_all = json.load(f)
    clubs_out, players_out = [], []
    seen_links = set()
    for c in ALL_CLUBS:
        rc = raw["clubs"].get(c["id"], {"infobox": {}, "players": []})
        info = rc.get("infobox", {})
        colors = c["colors"]
        if not colors:
            body = info.get("body1") or "#1B3E8F"
            sec = info.get("shorts1") or info.get("socks1") or "#FFFFFF"
            if sec == body:
                sec = "#FFFFFF" if body.upper() != "#FFFFFF" else "#111111"
            colors = [body, sec]
        while len(colors) < 3:
            colors = colors + ["#FFFFFF" if colors[0].upper() != "#FFFFFF" else "#111111"]
        stadium = (info.get("ground") or "").split(",")[0].strip() or f"Estádio de {c['city'] or c['name']}"
        stadium = re.sub(r"\s*\(.*?\)\s*", " ", stadium).strip()
        capacity = info.get("capacity") or int(4000 + c["rep"] * 300)
        if capacity < 1500 or capacity > 120000:
            capacity = int(4000 + c["rep"] * 300)
        if c["id"] in STADIUMS:
            stadium, capacity = STADIUMS[c["id"]]
        country = "BRA" if c["div"] != "F" else c["region"]
        clubs_out.append({
            "id": c["id"], "name": c["name"], "full": c["full"] or info.get("fullname") or c["name"],
            "abbr": c["abbr"], "region": c["region"], "city": c["city"] or "", "country": country,
            "div": c["div"], "level": c["level"], "rep": c["rep"], "colors": colors[:3],
            "crest": c["crest"], "stadium": stadium, "capacity": capacity,
            "founded": (info.get("founded") or "")[:40], "nickname": (info.get("nickname") or "")[:60],
        })

        # ---------------- jogadores
        cand = []
        for p in rc.get("players", []):
            key = p.get("link") or (c["id"] + ":" + p["name"])
            if key in seen_links:
                continue
            name = clean_name(p["name"])
            if not name or len(name) > 40:
                continue
            seen_links.add(key)
            kind = p["kind"]
            foot = foot_of(p)
            grp = {"GK": "GK", "DF": "DF", "MF": "MF", "FW": "FW"}.get(p.get("pos", "")[:2], None)
            wdp = wd_positions(p, foot)
            if grp is None:
                grp = GROUP_OF[wdp[0]] if wdp else "MF"
            primary = None
            for code in wdp:
                if GROUP_OF.get(code) == grp or (grp == "MF" and code in ("PD", "PE")) or \
                   (grp == "FW" and code == "MEI"):
                    primary = code
                    break
            if grp == "GK":
                primary = "GOL"
            sec = [x for x in wdp if x != primary and x in GROUP_OF][:2]
            age, born, known = age_of(p, kind)
            cand.append({
                "name": name, "nat": map_nat(p.get("nat")), "grp": grp, "pos": primary, "sec": sec,
                "age": age, "born": born, "foot": foot, "height": p.get("height") or None,
                "fame": int(p.get("sl") or 0), "kind": kind, "no": p.get("no") or "",
            })
        # posições detalhadas da Wikipedia em português
        pt_list = pt_all.get(c["id"]) or []
        for x in cand:
            q = pt_match(x, pt_list) if pt_list else None
            if not q:
                continue
            code = PT_POS.get(q["pos"])
            if code == "M":
                x["grp"] = "MF"
                x["pos"] = x["pos"] if x["pos"] in ("MC", "MEI") else None
            elif code == "A":
                x["grp"] = "FW"
                x["pos"] = x["pos"] if x["pos"] in ("ATA", "PD", "PE") else None
            elif code:
                x["pos"] = code
                x["grp"] = GROUP_OF[code]
            x["sec"] = [z for z in x["sec"] if z != x["pos"]]
        for x in cand:
            o = POS_OVERRIDES.get(c["id"] + ":" + x["name"]) or POS_OVERRIDES.get(x["name"])
            if o:
                x["pos"], x["sec"] = o[0], list(o[1])
                x["grp"] = GROUP_OF[o[0]]
        # completa posições genéricas equilibrando o elenco
        counts = {}
        for x in cand:
            if x["pos"]:
                counts[x["pos"]] = counts.get(x["pos"], 0) + 1
        for x in sorted(cand, key=lambda z: -z["fame"]):
            if x["pos"]:
                continue
            opts = FILL[x["grp"]] if x["grp"] != "GK" else ["GOL"]
            target = {"ZAG": 1.6, "LD": 1, "LE": 1, "VOL": 1.2, "MC": 1.2, "MEI": 1, "ATA": 1.3, "PD": 1, "PE": 1}
            x["pos"] = min(opts, key=lambda o: counts.get(o, 0) / target[o] + h01(x["name"], o) * 0.01)
            counts[x["pos"]] = counts.get(x["pos"], 0) + 1
        for x in cand:
            if not x["height"] or not (150 < x["height"] < 210):
                x["height"] = int(round(HEIGHT[x["pos"]] + gauss_det(x["name"], "h") * 5))

        # limita o elenco principal a 32 (os excedentes mais jovens vão para a base)
        first = [x for x in cand if x["kind"] == "first"]
        if len(first) > 32:
            first.sort(key=lambda z: (z["fame"], -abs(z["age"] - 27)), reverse=True)
            for x in first[32:]:
                x["kind"] = "youth" if x["age"] <= 20 else "drop"
        cand = [x for x in cand if x["kind"] != "drop"]
        youth = [x for x in cand if x["kind"] == "youth"]
        if len(youth) > 14:
            youth.sort(key=lambda z: (z["fame"], -z["age"]), reverse=True)
            for x in youth[14:]:
                x["kind"] = "drop"
        cand = [x for x in cand if x["kind"] != "drop"]

        # ---------------- notas
        lvl = c["level"]
        for x in cand:
            r = lvl + fame_adj(x["fame"]) + age_adj(x["age"]) + gauss_det(x["name"], c["id"], "ovr") * 2.0
            if x["kind"] == "youth":
                r -= 6
            x["raw"] = r
        first = sorted([x for x in cand if x["kind"] == "first"], key=lambda z: -z["raw"])
        if first:
            top = first[:16]
            mean16 = sum(x["raw"] for x in top) / len(top)
            shift = (lvl + 1.0) - mean16 if len(first) >= 11 else 0
        else:
            shift = 0
        cap = min(91, lvl + 11)
        for x in cand:
            o = x["raw"] + shift
            if x["kind"] == "youth":
                o = min(o, lvl - 3)
            x["ovr"] = int(round(max(42, min(cap, o))))
            x["pot"] = potential(x["ovr"], x["age"], x["fame"], x["name"])
            ov = OVERRIDES.get(c["id"] + ":" + x["name"]) or OVERRIDES.get(x["name"])
            if ov and c["div"] == "A":
                x["ovr"], x["pot"] = ov
            x["sec"] = [z for z in x["sec"] if z in SEC_OK[x["pos"]]][:2]
            num = re.sub(r"[^\d]", "", x["no"])
            players_out.append({
                "c": c["id"], "n": x["name"], "nat": x["nat"], "p": x["pos"], "s": x["sec"],
                "b": x["born"], "h": x["height"], "f": x["foot"], "o": x["ovr"], "pt": x["pot"],
                "fm": x["fame"], "y": 1 if x["kind"] == "youth" else 0,
                **({"no": int(num)} if num and int(num) < 100 else {}),
            })

    db = {"fetchedAt": raw.get("fetchedAt"), "season": SEASON, "clubs": clubs_out, "players": players_out}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, separators=(",", ":"))
    print(f"ok -> {OUT}: {len(clubs_out)} clubes, {len(players_out)} jogadores "
          f"({os.path.getsize(OUT) // 1024} KB)")


if __name__ == "__main__":
    main()
