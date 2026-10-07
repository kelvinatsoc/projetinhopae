#!/usr/bin/env python3
"""Coleta a geografia real de cada clube para o mapa 3D da sede (src/ui/hq/).

Para cada clube do banco (src/data/database.json), prioriza Série A e B:
  * estádio  -> coordenada P625 do item do estádio no Wikidata (stadiumImg é o Q-id);
                se faltar, busca no Nominatim pelo nome do estádio + cidade;
  * sede     -> P159 (sede) / P625 do próprio clube no Wikidata; senão Nominatim "sede <clube>";
  * CT       -> Nominatim ("Centro de Treinamento <clube>", "CT <clube>"...), aceito só se estiver
                a menos de 80 km do estádio;
  * contexto -> Overpass: ruas principais, áreas verdes e água num raio em volta de cada local,
                simplificadas (Douglas-Peucker) e gravadas em metros relativos ao local.

Fontes abertas apenas: Wikidata (CC0) e OpenStreetMap (ODbL). Nada de Google Maps.
Educado com as APIs: 1 requisição/s no Nominatim/Overpass, User-Agent identificado.

É retomável: grava src/data/clubSites.json depois de cada clube e pula os que já estão lá.
Uso:
  python3 scripts/fetch_club_sites.py                # Série A e B
  python3 scripts/fetch_club_sites.py --divs A,B,C   # escolher divisões
  python3 scripts/fetch_club_sites.py --redo flamengo
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "src", "data", "database.json")
OUT = os.path.join(ROOT, "src", "data", "clubSites.json")
UA = "LendasDaBaseBot/0.2 (jogo de tecnico de futebol; mapa da sede; respeita 1 req/s)"
WD_SPARQL = "https://query.wikidata.org/sparql"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
OVERPASS = [  # espelhos públicos, na ordem; o primeiro que responder vence
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
RADIUS = 520  # m em volta de cada local
_last = {"osm": 0.0}


def _get(url: str, params: dict | None = None, accept: str = "application/json", data: bytes | None = None, tries: int = 4, timeout: int = 90):
    if params:
        url = url + "?" + urllib.parse.urlencode(params)
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, "Accept": accept})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            # 429: o serviço pediu calma (o WDQS às vezes limita a 1 req/min)
            wait = int(e.headers.get("Retry-After") or 0) or (65 if e.code == 429 else 5 * (i + 1))
            print(f"   ! HTTP {e.code} (nova tentativa em {wait}s)", file=sys.stderr)
            time.sleep(min(wait, 120))
        except Exception as e:  # noqa: BLE001
            wait = 5 * (i + 1)
            print(f"   ! {type(e).__name__}: {e} (nova tentativa em {wait}s)", file=sys.stderr)
            time.sleep(wait)
    return None


def osm_wait():
    dt = time.time() - _last["osm"]
    if dt < 1.1:
        time.sleep(1.1 - dt)
    _last["osm"] = time.time()


def sparql(q: str):
    r = _get(WD_SPARQL, {"query": q, "format": "json"}, accept="application/sparql-results+json", tries=2)
    return r["results"]["bindings"] if r else []


def parse_point(wkt: str):
    # "Point(lon lat)"
    a = wkt[wkt.index("(") + 1: wkt.index(")")].split()
    return float(a[1]), float(a[0])


def dist_m(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(h))


def _norm(t: str) -> str:
    import unicodedata
    t = unicodedata.normalize("NFKD", t.lower())
    return "".join(ch for ch in t if not unicodedata.combining(ch))


def nominatim(q: str, near=None, max_km=80.0, must=None):
    """Busca no Nominatim. `must`: palavras que precisam aparecer no nome do resultado."""
    osm_wait()
    r = _get(NOMINATIM, {"q": q, "format": "json", "limit": 6, "countrycodes": "br", "accept-language": "pt-BR"})
    for it in r or []:
        p = (float(it["lat"]), float(it["lon"]))
        if near and dist_m(p, near) > max_km * 1000:
            continue
        if it.get("class") in ("highway", "boundary", "place") and it.get("type") not in ("stadium",):
            continue
        name = it.get("display_name", "").split(",")[0]
        if must and not any(_norm(m) in _norm(it.get("display_name", "")) for m in must):
            continue
        return {"lat": round(p[0], 6), "lon": round(p[1], 6), "name": name, "src": "osm"}
    return None


# Nomes conhecidos dos CTs e sedes (conhecimento público) usados como consulta no Nominatim.
# O resultado só é aceito se o nome bater com a consulta e ficar a menos de 80 km do estádio.
CT_NAMES = {
    "flamengo": ["Ninho do Urubu", "Centro de Treinamento George Helal"],
    "palmeiras": ["Academia de Futebol Palmeiras", "Academia de Futebol"],
    "sao-paulo": ["Centro de Treinamento Barra Funda", "CT da Barra Funda", "CT Rei Pelé São Paulo"],
    "corinthians": ["Centro de Treinamento Joaquim Grava", "CT Joaquim Grava"],
    "santos": ["CT Rei Pelé", "Centro de Treinamento Rei Pelé"],
    "gremio": ["CT Luiz Carvalho", "Centro de Treinamento Presidente Luiz Carvalho"],
    "internacional": ["CT Parque Gigante", "Centro de Treinamento Parque Gigante"],
    "atletico-mg": ["Cidade do Galo"],
    "cruzeiro": ["Toca da Raposa II", "Toca da Raposa"],
    "fluminense": ["CT Carlos Castilho", "Centro de Treinamento Carlos Castilho"],
    "botafogo": ["Espaço Lonier", "CT Lonier"],
    "vasco": ["CT Moacyr Barbosa", "Centro de Treinamento Moacyr Barbosa"],
    "bahia": ["CT Evaristo de Macedo", "Cidade Tricolor"],
    "fortaleza": ["CT Ribamar Bezerra", "Centro de Excelência Alcides Santos"],
    "athletico-pr": ["CT do Caju", "Centro de Treinamento Alfredo Gottardi"],
    "bragantino": ["CT Red Bull Bragantino", "Centro de Treinamento Red Bull"],
    "red-bull-bragantino": ["CT Red Bull Bragantino", "Centro de Treinamento Red Bull"],
    "vitoria": ["Toca do Leão", "CT Manoel Pontes Tanajura"],
    "sport": ["CT José de Andrade Médicis", "CT do Sport"],
    "ceara": ["CT Vovozão", "Cidade Vozão"],
    "juventude": ["CT Juventude", "Centro de Treinamento do Juventude"],
    "mirassol": ["CT do Mirassol"],
    "coritiba": ["CT da Graciosa", "Centro de Treinamento Bayard Osna"],
    "goias": ["CT Edmo Pinheiro", "Centro de Treinamento Edmo Pinheiro"],
    "america-mg": ["CT Lanna Drumond", "Centro de Treinamento Lanna Drumond"],
    "chapecoense": ["CT da Chapecoense"],
    "remo": ["CT do Remo", "Baenão"],
    "criciuma": ["CT Antenor Angeloni"],
    "avai": ["CT do Avaí"],
    "ponte-preta": ["CT Jardim Eulina", "CT da Ponte Preta"],
    "guarani": ["CT Guarani"],
    "novorizontino": ["CT do Novorizontino"],
    "cuiaba": ["CT Manoel Dresch"],
    "atletico-go": ["CT do Dragão", "CT Urias Magalhães"],
    "vila-nova": ["CT do Vila Nova", "OBA Vila Nova"],
    "nautico": ["CT Wilson Campos", "CT do Náutico"],
    "operario-pr": ["CT do Operário Ferroviário"],
    "crb": ["CT Ninho do Galo", "CT do CRB"],
    "athletic": ["CT do Athletic Club"],
    "botafogo-sp": ["CT Botafogo Ribeirão Preto"],
    "londrina": ["CT do Londrina"],
    "paysandu": ["CT do Paysandu", "Curuzu"],
    "amazonas": ["CT do Amazonas FC"],
    "ferroviaria": ["CT da Ferroviária"],
}
SEDE_NAMES = {
    "flamengo": ["Sede da Gávea Flamengo", "Clube de Regatas do Flamengo Gávea"],
    "palmeiras": ["Sociedade Esportiva Palmeiras sede social"],
    "corinthians": ["Parque São Jorge"],
    "fluminense": ["Fluminense Football Club Laranjeiras", "Estádio das Laranjeiras"],
    "botafogo": ["General Severiano"],
    "vasco": ["Sede Náutica do Calabouço", "São Januário"],
    "gremio": ["Grêmio Foot-Ball Porto Alegrense sede"],
    "internacional": ["Sport Club Internacional sede"],
    "cruzeiro": ["Sede do Barro Preto Cruzeiro", "Cruzeiro Esporte Clube Barro Preto"],
    "atletico-mg": ["Sede de Lourdes Atlético Mineiro", "Vila Olímpica Atlético"],
    "bahia": ["Fazendão"],
    "athletico-pr": ["Athletico Paranaense sede"],
}

# ---------------------------------------------------------------- geometria
def project(lat0, lon0, lat, lon):
    x = (lon - lon0) * math.cos(math.radians(lat0)) * 111320.0
    y = (lat - lat0) * 110540.0
    return x, -y  # z para o "sul" positivo (three.js: +z em direção à câmera)


def dp(pts, eps):
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    n = math.hypot(dx, dy) or 1e-9
    imax, dmax = 0, 0.0
    for i in range(1, len(pts) - 1):
        d = abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / n
        if d > dmax:
            imax, dmax = i, d
    if dmax > eps:
        return dp(pts[: imax + 1], eps)[:-1] + dp(pts[imax:], eps)
    return [pts[0], pts[-1]]


ROAD_W = {"motorway": 5, "trunk": 5, "primary": 4, "secondary": 3, "tertiary": 2, "residential": 1, "unclassified": 1}


def overpass_context(site):
    lat, lon = site["lat"], site["lon"]
    q = f"""[out:json][timeout:60];
(
  way(around:{RADIUS},{lat},{lon})[highway~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified)$"];
  way(around:{RADIUS},{lat},{lon})[leisure~"^(park|pitch|stadium|sports_centre|garden)$"];
  way(around:{RADIUS},{lat},{lon})[landuse~"^(grass|recreation_ground|forest|meadow)$"];
  way(around:{RADIUS},{lat},{lon})[natural~"^(water|wood)$"];
  way(around:{RADIUS},{lat},{lon})[building];
);
out geom;"""
    r = None
    for ep in OVERPASS:
        osm_wait()
        r = _get(ep, {"data": q}, tries=1, timeout=120)
        if r:
            break
    if not r:
        return None
    roads, green, water, pitches, buildings = [], [], [], [], []
    for el in r.get("elements", []):
        g = el.get("geometry")
        if not g:
            continue
        tags = el.get("tags", {})
        pts = [project(lat, lon, p["lat"], p["lon"]) for p in g]
        pts = [(max(-RADIUS * 1.6, min(RADIUS * 1.6, x)), max(-RADIUS * 1.6, min(RADIUS * 1.6, y))) for x, y in pts]
        simp = dp(pts, 4.0)
        flat = [v for p in simp for v in (round(p[0]), round(p[1]))]
        if len(flat) < 4:
            continue
        if "highway" in tags:
            roads.append([ROAD_W.get(tags["highway"], 1), flat])
        elif tags.get("leisure") in ("pitch", "stadium") or tags.get("sport") == "soccer":
            pitches.append(flat)
        elif tags.get("natural") == "water":
            water.append(flat)
        elif "building" in tags:
            if len(buildings) < 260:
                lv = tags.get("building:levels")
                try:
                    lv = max(1, min(30, int(float(lv))))
                except (TypeError, ValueError):
                    lv = 0
                buildings.append([lv, flat])
        else:
            green.append(flat)
    roads.sort(key=lambda r: -r[0])
    return {"roads": roads[:160], "green": green[:60], "water": water[:20], "pitches": pitches[:30], "buildings": buildings}


# ---------------------------------------------------------------- Wikidata em lote
def wikidata_stadiums(qids):
    out = {}
    for i in range(0, len(qids), 60):
        vals = " ".join(f"wd:{q}" for q in qids[i:i + 60])
        for b in sparql(f"SELECT ?s ?coord WHERE {{ VALUES ?s {{ {vals} }} ?s wdt:P625 ?coord }}"):
            q = b["s"]["value"].rsplit("/", 1)[1]
            out.setdefault(q, parse_point(b["coord"]["value"]))
        time.sleep(1)
    return out


def wikidata_clubs(clubs):
    """Uma única consulta para todos os clubes (o WDQS pode estar limitado a 1 req/min).
    Procura pelo rótulo em português; devolve {id do clube: (lat, lon) da sede}."""
    by_label = {}
    for c in clubs:
        for l in {c.get("full", ""), c["name"]}:
            if l:
                by_label.setdefault(l, c["id"])
    out = {}
    labels = list(by_label)
    for i in range(0, len(labels), 80):
        vals = " ".join(json.dumps(x) + "@pt" for x in labels[i:i + 80])
        q = f"""SELECT ?l ?cc ?hc WHERE {{
  VALUES ?l {{ {vals} }}
  ?c rdfs:label ?l ; wdt:P31/wdt:P279* wd:Q476028 .
  OPTIONAL {{ ?c wdt:P625 ?cc }}
  OPTIONAL {{ ?c p:P159 ?st . ?st pq:P625 ?hc }}
}}"""
        for b in sparql(q):
            cid = by_label.get(b["l"]["value"])
            hc = b.get("hc") or b.get("cc")
            if cid and hc and cid not in out:
                out[cid] = parse_point(hc["value"])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--divs", default="A,B")
    ap.add_argument("--redo", default="")
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    divs = a.divs.split(",")
    db = json.load(open(DB, encoding="utf-8"))
    clubs = [c for c in db["clubs"] if c.get("div") in divs]
    clubs.sort(key=lambda c: (divs.index(c["div"]), -c.get("level", 0)))
    out = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    out.setdefault("source", "Wikidata (CC0) e © colaboradores do OpenStreetMap (ODbL)")
    out.setdefault("clubs", {})
    redo = set(a.redo.split(",")) if a.redo else set()

    st_q = [c["stadiumImg"] for c in clubs if c.get("stadiumImg") and c["id"] not in out["clubs"]]
    print(f"Wikidata: {len(st_q)} estádios…")
    st_coord = wikidata_stadiums(st_q) if st_q else {}
    todo = [c for c in clubs if c["id"] not in out["clubs"] or c["id"] in redo]
    print(f"Wikidata: sede de {len(todo)} clubes…")
    hq_coord = wikidata_clubs(todo) if todo else {}

    n = 0
    for c in clubs:
        cid = c["id"]
        if cid in out["clubs"] and cid not in redo:
            continue
        if a.limit and n >= a.limit:
            break
        n += 1
        print(f"[{c['div']}] {c['name']}")
        sites = {}
        sc = st_coord.get(c.get("stadiumImg") or "")
        prev = out["clubs"].get(cid, {}).get("sites", {})
        if not sc and prev.get("stadium", {}).get("src") == "wikidata":
            sc = (prev["stadium"]["lat"], prev["stadium"]["lon"])  # reaproveita (WDQS pode estar fora)
        if sc:
            sites["stadium"] = {"lat": round(sc[0], 6), "lon": round(sc[1], 6), "name": c.get("stadium", ""), "src": "wikidata"}
        else:
            s = nominatim(f"{c.get('stadium', '')} {c.get('city', '')}") if c.get("stadium") else None
            if s:
                s["name"] = c.get("stadium", s["name"])
                sites["stadium"] = s
        near = (sites["stadium"]["lat"], sites["stadium"]["lon"]) if "stadium" in sites else None
        # sede
        hq = hq_coord.get(cid)
        if hq and (not near or 120 < dist_m(hq, near) < 80000):
            sites["sede"] = {"lat": round(hq[0], 6), "lon": round(hq[1], 6), "name": "Sede", "src": "wikidata"}
        else:
            qs = [(n, [w for w in _norm(n).split() if len(w) > 3][:2] or [n]) for n in SEDE_NAMES.get(cid, [])]
            qs += [(f"Sede {c.get('full', c['name'])}", ["sede", _norm(c["name"])]), (f"Sede social {c['name']} {c.get('city', '')}", ["sede"])]
            for q, must in qs:
                s = nominatim(q, near, must=must)
                if s and (not near or dist_m((s["lat"], s["lon"]), near) > 120):
                    sites["sede"] = s
                    break
        # CT: primeiro os nomes conhecidos, depois buscas genéricas (o nome precisa citar CT/treinamento/clube)
        cands = [(n, [w for w in _norm(n).split() if len(w) > 3][:2] or [n]) for n in CT_NAMES.get(cid, [])]
        cands += [(f"Centro de Treinamento {c['name']}", ["treinamento", "ct "]), (f"CT {c['name']} {c.get('city', '')}", ["ct ", "treinamento", _norm(c["name"])])]
        for q, must in cands:
            s = nominatim(q, near, must=must)
            if s and (not near or dist_m((s["lat"], s["lon"]), near) > 150):
                sites["ct"] = s
                break
        osm = {}
        for k, s in sites.items():
            ctx = overpass_context(s)
            if ctx:
                osm[k] = ctx
        out["clubs"][cid] = {"sites": sites, "osm": osm}
        print("   locais:", ", ".join(f"{k}={v['src']}" for k, v in sites.items()) or "nenhum (layout padrão)")
        tmp = OUT + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, OUT)
    print(f"ok: {len(out['clubs'])} clubes em {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
