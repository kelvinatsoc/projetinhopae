#!/usr/bin/env python3
"""Busca fotos de jogadores reais no TheSportsDB (API gratuita, chave "3").

Para cada jogador de src/data/database.json procura pelo nome (nome completo e variações curtas)
e só ACEITA quando o time do TheSportsDB (strTeam) bate com o clube do jogador e, quando há data,
o ano de nascimento bate (±1). Prefere strCutout (recorte), senão strThumb.

Saída: src/data/sportsdbPhotos.json  {"<nome>|<ano>": "cutout/abc123.png", ...}
(caminho relativo a https://r2.thesportsdb.com/images/media/player/ ; o app usa a variante /small).
Só guardamos URLs: as imagens NÃO são empacotadas, o app carrega da CDN em tempo de execução.

Cache em scripts/cache/sportsdb/ (uma resposta por consulta) -> pode ser interrompido e retomado.
Uso: python3 scripts/fetch_sportsdb.py [--max-seconds N] [--offline]
"""
import json, os, re, sys, time, unicodedata, urllib.parse, urllib.request, urllib.error, hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "src/data/database.json")
OUT = os.path.join(ROOT, "src/data/sportsdbPhotos.json")
CACHE = os.path.join(ROOT, "scripts/cache/sportsdb")
API = "https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p="
PREFIX = "https://r2.thesportsdb.com/images/media/player/"
DELAY = 1.5

# nomes alternativos usados pelo TheSportsDB (além de name/full do banco)
ALIASES = {
    "atletico-mg": ["Atletico Mineiro"], "athletico-pr": ["Athletico Paranaense", "Atletico Paranaense"],
    "america-mg": ["America Mineiro"], "atletico-go": ["Atletico Goianiense"], "bragantino": ["RB Bragantino", "Bragantino"],
    "vasco": ["Vasco da Gama", "Vasco"], "botafogo-sp": ["Botafogo SP", "Botafogo-SP"], "sport": ["Sport Recife", "Sport Club do Recife"],
    "operario-pr": ["Operario Ferroviario", "Operario PR"], "athletic": ["Athletic Club", "Athletic MG"], "gremio": ["Gremio"],
    "internacional": ["Internacional", "SC Internacional"], "sao-bernardo": ["Sao Bernardo"], "novorizontino": ["Gremio Novorizontino"],
    "vitoria": ["Vitoria", "EC Vitoria"], "bahia": ["Bahia", "EC Bahia"], "crb": ["CRB"], "goias": ["Goias"], "ceara": ["Ceara"],
    "fortaleza": ["Fortaleza"], "cuiaba": ["Cuiaba"], "criciuma": ["Criciuma"], "avai": ["Avai"], "nautico": ["Nautico"],
    "ponte-preta": ["Ponte Preta"], "vila-nova": ["Vila Nova"], "chapecoense": ["Chapecoense"], "remo": ["Remo", "Clube do Remo"],
    "botafogo-pb": ["Botafogo PB"], "inter-limeira": ["Inter de Limeira"], "ypiranga-rs": ["Ypiranga", "Ypiranga RS"],
    "america-rn": ["America RN"], "ferroviario-ce": ["Ferroviario"], "brasil-pelotas": ["Brasil de Pelotas"],
    "nacional-uru": ["Nacional", "Club Nacional"], "nacional-par": ["Nacional Asuncion", "Club Nacional Asuncion"],
    "liverpool-uru": ["Liverpool Montevideo", "Liverpool"], "racing-uru": ["Racing Montevideo"], "juventud-uru": ["Juventud", "Juventud Las Piedras"],
    "mvd-city-torque": ["Montevideo City Torque", "Torque"], "libertad-par": ["Libertad"], "guarani-par": ["Guarani"],
    "u-catolica-ecu": ["Universidad Catolica Ecuador", "Universidad Catolica Quito"], "libertad-ecu": ["Libertad FC"],
    "velez": ["Velez Sarsfield", "Velez"], "riestra": ["Deportivo Riestra"], "racing": ["Racing Club"], "u-de-chile": ["Universidad de Chile"],
    "u-catolica": ["Universidad Catolica"], "ldu-quito": ["LDU Quito", "Liga de Quito"], "santa-fe": ["Independiente Santa Fe", "Santa Fe"],
    "medellin": ["Independiente Medellin"], "tolima": ["Deportes Tolima"], "junior": ["Junior", "Junior Barranquilla"],
}
GENERIC = {"fc", "ec", "sc", "ac", "cf", "club", "clube", "esporte", "esportivo", "futebol", "football", "de", "do", "da", "dos", "del",
           "la", "el", "cd", "ca", "se", "cr", "sad", "saf", "sociedade", "associacao", "regatas"}
# clubes brasileiros com nome igual a clubes estrangeiros: exige o sufixo/estado (já está no alias)


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    toks = [t for t in re.split(r"[^a-z0-9]+", s) if t and t not in GENERIC]
    return " ".join(toks)


def fetch(q):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, hashlib.sha1(q.encode()).hexdigest() + ".json")
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f), False
    if OFFLINE:
        return None, False
    url = API + urllib.parse.quote(q.replace(" ", "_"))
    wait = 30
    for _ in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "lendas-da-base/1.0"}), timeout=30) as r:
                data = json.loads(r.read().decode() or "{}")
            break
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                print(f"  {e.code}; aguardando {wait}s", flush=True)
                time.sleep(wait); wait = min(wait * 2, 600); continue
            raise
        except Exception as e:  # rede instável
            print(f"  erro {e}; aguardando {wait}s", flush=True)
            time.sleep(wait); wait = min(wait * 2, 600)
    else:
        return None, True
    res = {"q": q, "player": data.get("player") or []}
    with open(path, "w") as f:
        json.dump(res, f)
    time.sleep(DELAY)
    return res, True


def variants(name):
    toks = name.split()
    out = [name]
    if len(toks) >= 3:
        out += [f"{toks[0]} {toks[-1]}", f"{toks[0]} {toks[1]}"]
    nd = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    if nd != name:
        out.append(nd)
    seen, res = set(), []
    for v in out:
        if v.lower() not in seen:
            seen.add(v.lower()); res.append(v)
    return res


def accept(dp, cands, aliases):
    for c in cands:
        if (c.get("strSport") or "Soccer") != "Soccer":
            continue
        if norm(c.get("strTeam")) not in aliases:
            continue
        born = (c.get("dateBorn") or "")[:4]
        if born.isdigit() and dp.get("b") and abs(int(born) - dp["b"]) > 1:
            continue
        img = c.get("strCutout") or c.get("strThumb")
        if img and img.startswith(PREFIX):
            return img[len(PREFIX):]
    return None


def main():
    global OFFLINE
    OFFLINE = "--offline" in sys.argv
    max_s = float(sys.argv[sys.argv.index("--max-seconds") + 1]) if "--max-seconds" in sys.argv else 1e12
    t0 = time.time()
    db = json.load(open(DB))
    clubs = {c["id"]: c for c in db["clubs"]}
    order = {"A": 0, "B": 1, "C": 2, "D": 3}
    players = sorted(db["players"], key=lambda p: (order.get(clubs[p["c"]]["div"], 4), p["c"]))
    out, stats, teams_seen = {}, {}, {}
    done_all = True
    for dp in players:
        club = clubs[dp["c"]]
        aliases = {norm(a) for a in [club["name"], club.get("full", ""), *ALIASES.get(club["id"], [])] if a}
        aliases.discard("")
        div = club["div"]
        st = stats.setdefault(div, [0, 0, 0])
        hit, tried = None, True
        for v in variants(dp["n"]):
            if time.time() - t0 > max_s:
                tried = False; done_all = False; break
            res, _ = fetch(v)
            if res is None:
                tried = False; done_all = False; break
            for c in res["player"]:
                if c.get("strSport") == "Soccer":
                    teams_seen.setdefault(club["id"], set()).add(c.get("strTeam"))
            hit = accept(dp, res["player"], aliases)
            if hit:
                break
        if not tried:
            continue
        st[0] += 1
        if hit:
            st[1] += 1
            out[f"{dp['n']}|{dp.get('b')}"] = hit
    with open(OUT, "w") as f:
        json.dump(dict(sorted(out.items())), f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    for d in sorted(stats):
        n, h, _ = stats[d]
        print(f"div {d}: {h}/{n} aceitos ({100 * h / max(n, 1):.0f}%)")
    with open(os.path.join(CACHE, "_teams_seen.json"), "w") as f:
        json.dump({k: sorted(x for x in v if x) for k, v in teams_seen.items()}, f, ensure_ascii=False, indent=0)
    print("COMPLETO" if done_all else "PARCIAL", len(out), flush=True)


if __name__ == "__main__":
    main()
