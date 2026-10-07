#!/usr/bin/env python3
"""Coleta a geografia real de cada clube para o mapa 3D da sede (src/ui/hq/).

Para cada clube do banco (src/data/database.json), prioriza Série A e B:
  * estádio  -> coordenada P625 do item do estádio no Wikidata (stadiumImg é o Q-id);
                se faltar, busca no Nominatim pelo nome do estádio + cidade;
  * sede     -> P159 (sede) / P625 do próprio clube no Wikidata; senão Nominatim "sede <clube>";
  * CT       -> Nominatim ("Centro de Treinamento <clube>", "CT <clube>"...), aceito só se estiver
                a menos de 80 km do estádio;
  * contexto -> API 0.6 do OSM (/map): ruas, trilhos, rios, água, áreas verdes, campos, árvores,
                prédios com altura real (height / building:levels), o contorno do estádio e os
                prédios do clube (CT/sede), simplificados (Douglas-Peucker) em metros relativos ao local;
  * estádios marcantes -> src/data/stadiumModels.json traz a coordenada de referência (usada quando
                o Wikidata/Nominatim falha ou erra feio).

Fontes abertas apenas: Wikidata (CC0) e OpenStreetMap (ODbL). Nada de Google Maps.
Educado com as APIs: 1 requisição/s no Nominatim/Overpass, User-Agent identificado.

É retomável: grava src/data/clubSites.json depois de cada clube e pula os que já estão lá.
Uso:
  python3 scripts/fetch_club_sites.py                # Série A e B
  python3 scripts/fetch_club_sites.py --divs A,B,C   # escolher divisões
  python3 scripts/fetch_club_sites.py --redo flamengo
  python3 scripts/fetch_club_sites.py --osm-only     # só baixa de novo o contexto do OSM de todos
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
RADIUS = 600  # m em volta de cada local
MODELS = os.path.join(ROOT, "src", "data", "stadiumModels.json")
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
        if must and not any(_norm(m) in _norm(name) for m in must):  # só no nome (o endereço cita a cidade)
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

# Sedes cujo ponto genérico do Wikidata/Nominatim erra: a feição exata no OSM (conferida à mão).
SEDE_OSM = {
    "flamengo": "relation/5520117",   # Sede do Clube de Regatas do Flamengo (Gávea)
    "botafogo": "way/866731003",      # Botafogo, General Severiano
    "cruzeiro": "way/292382598",      # Sede Administrativa do Cruzeiro (Barro Preto)
}
SEDE_AT_STADIUM = {"sao-paulo"}  # a sede social do São Paulo fica no próprio Morumbis


def osm_element_center(ref: str):
    """Centro (lat, lon) de um nó/caminho/relação do OSM pela API 0.6 (/full)."""
    import xml.etree.ElementTree as ET
    typ, oid = ref.split("/")
    osm_wait()
    url = f"https://api.openstreetmap.org/api/0.6/{typ}/{oid}" + ("" if typ == "node" else "/full")
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
            root = ET.fromstring(r.read())
    except Exception as e:  # noqa: BLE001
        print(f"   ! {ref}: {e}", file=sys.stderr)
        return None
    pts = [(float(n.get("lat")), float(n.get("lon"))) for n in root.iter("node")]
    if not pts:
        return None
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


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


def dp_ring(pts, eps):
    """Douglas-Peucker para anel fechado (o dp comum colapsa um anel em 2 pontos)."""
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    if len(pts) < 4:
        return pts
    x0, y0 = pts[0]
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - x0) ** 2 + (pts[i][1] - y0) ** 2)
    a = dp(pts[: far + 1], eps)
    b = dp(pts[far:] + [pts[0]], eps)
    return a[:-1] + b[:-1]


def flat(pts):
    return [v for p in pts for v in (round(p[0]), round(p[1]))]


def poly_area(pts):
    return abs(sum(pts[i][0] * pts[i - 1][1] - pts[i - 1][0] * pts[i][1] for i in range(len(pts)))) / 2


def centroid(pts):
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def inside(pt, poly):
    x, y = pt
    c = False
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i - 1], poly[i]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-9) + x1:
            c = not c
    return c


def hull(pts):
    pts = sorted(set(pts))
    if len(pts) < 3:
        return pts
    cross = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0:
            up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]


def min_rect(pts):
    """Retângulo de área mínima: [cx, cz, meia-largura (eixo longo), meia-altura, ângulo em graus]."""
    h = hull(pts)
    best = None
    for i in range(len(h)):
        (x1, y1), (x2, y2) = h[i - 1], h[i]
        ang = math.atan2(y2 - y1, x2 - x1)
        c, s = math.cos(ang), math.sin(ang)
        us = [p[0] * c + p[1] * s for p in h]
        vs = [-p[0] * s + p[1] * c for p in h]
        area = (max(us) - min(us)) * (max(vs) - min(vs))
        if best is None or area < best[0]:
            best = (area, ang, (max(us) + min(us)) / 2, (max(vs) + min(vs)) / 2, (max(us) - min(us)) / 2, (max(vs) - min(vs)) / 2)
    _, ang, cu, cv, hw, hh = best
    c, s = math.cos(ang), math.sin(ang)
    cx, cy = cu * c - cv * s, cu * s + cv * c
    if hh > hw:
        hw, hh, ang = hh, hw, ang + math.pi / 2
    deg = math.degrees(ang) % 180
    return [round(cx, 1), round(cy, 1), round(hw, 1), round(hh, 1), round(deg, 1)]


ROAD_W = {"motorway": 5, "trunk": 5, "primary": 4, "secondary": 3, "tertiary": 2, "residential": 1,
          "unclassified": 1, "living_street": 1, "service": 0, "pedestrian": 0}
RAIL = {"rail", "subway", "light_rail", "monorail"}
RIVER_W = {"river": 24, "canal": 12, "stream": 4, "drain": 3}
GREEN_LEISURE = {"park", "garden", "golf_course", "nature_reserve", "recreation_ground", "common"}
GREEN_LANDUSE = {"grass", "recreation_ground", "forest", "meadow", "village_green", "cemetery", "orchard"}
WOOD = {"wood", "scrub", "forest"}
OSM_API = "https://api.openstreetmap.org/api/0.6/map"


def _height(tags):
    for k in ("height", "building:height"):
        v = tags.get(k)
        if v:
            try:
                return max(2.5, min(320.0, float(v.replace("m", "").replace(",", ".").strip())))
            except ValueError:
                pass
    lv = tags.get("building:levels")
    if lv:
        try:
            return max(1.0, min(90.0, float(lv.replace(",", ".")))) * 3.1 + 1.0
        except ValueError:
            pass
    return 0.0


def _fetch_map(lat, lon, half):
    """Todos os dados do OSM num quadrado de lado 2*half (API 0.6 /map). Encolhe se passar do limite de nós."""
    import xml.etree.ElementTree as ET
    for k in (1.0, 0.8, 0.62):
        h = half * k
        dl = h / 110540.0
        do = h / (111320.0 * math.cos(math.radians(lat)))
        osm_wait()
        url = f"{OSM_API}?bbox={lon - do:.6f},{lat - dl:.6f},{lon + do:.6f},{lat + dl:.6f}"
        for i in range(3):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=120) as r:
                    return ET.fromstring(r.read())
            except urllib.error.HTTPError as e:
                print(f"   ! OSM API HTTP {e.code}", file=sys.stderr)
                if e.code == 400:  # área com nós demais: tenta um quadrado menor
                    break
                time.sleep(5 * (i + 1))
            except Exception as e:  # noqa: BLE001
                print(f"   ! OSM API {type(e).__name__}: {e}", file=sys.stderr)
                time.sleep(5 * (i + 1))
    return None


def _rings(members, ways):
    """Junta os caminhos 'outer' de uma multipolígono em anéis."""
    segs = [list(ways[m]) for m in members if m in ways and len(ways[m]) > 1]
    rings = []
    while segs:
        cur = segs.pop(0)
        changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == cur[-1]:
                    cur += s[1:]
                elif s[-1] == cur[-1]:
                    cur += s[::-1][1:]
                elif s[-1] == cur[0]:
                    cur = s[:-1] + cur
                elif s[0] == cur[0]:
                    cur = s[::-1][:-1] + cur
                else:
                    continue
                segs.pop(i)
                changed = True
                break
        if len(cur) >= 4:
            rings.append(cur)
    return rings


def osm_context(site, kind):
    """Contexto urbano real em volta do local (metros relativos ao local; x = leste, z = sul)."""
    lat, lon = site["lat"], site["lon"]
    root = _fetch_map(lat, lon, RADIUS + 80)
    if root is None:
        return None
    nodes = {}
    trees = []
    for n in root.iter("node"):
        p = project(lat, lon, float(n.get("lat")), float(n.get("lon")))
        nodes[n.get("id")] = p
        for t in n.iter("tag"):
            if t.get("k") == "natural" and t.get("v") == "tree" and abs(p[0]) < RADIUS and abs(p[1]) < RADIUS:
                trees.append(p)
    ways, wtags = {}, {}
    for w in root.iter("way"):
        refs = [nodes[x.get("ref")] for x in w.iter("nd") if x.get("ref") in nodes]
        ways[w.get("id")] = refs
        wtags[w.get("id")] = {t.get("k"): t.get("v") for t in w.iter("tag")}
    # multipolígonos (prédios grandes, parques, lagoas e estádios costumam ser relações)
    items = [(wtags[i], ways[i], i) for i in ways]
    for rel in root.iter("relation"):
        tags = {t.get("k"): t.get("v") for t in rel.iter("tag")}
        if tags.get("type") not in ("multipolygon", "building"):
            continue
        # type=building usa o papel "outline" para o contorno
        outer = [m.get("ref") for m in rel.iter("member") if m.get("type") == "way" and m.get("role") in ("outer", "", "outline")]
        for ring in _rings(outer, ways):
            items.append((tags, ring, "r" + rel.get("id")))

    lim = RADIUS * 1.15
    near = lambda pts: any(abs(x) < lim and abs(y) < lim for x, y in pts)
    roads, rail, rivers, green, water, pitches, blds, stadia, areas = [], [], [], [], [], [], [], [], []
    for tags, pts, wid in items:
        if len(pts) < 2 or not near(pts):
            continue
        closed = len(pts) > 3 and pts[0] == pts[-1]
        hw = tags.get("highway")
        if tags.get("tunnel") in ("yes", "building_passage") or tags.get("layer", "0").startswith("-"):
            continue
        if hw in ROAD_W and not tags.get("area") == "yes":
            roads.append([ROAD_W[hw], flat(dp(pts, 2.0))])
        elif tags.get("railway") in RAIL:
            rail.append(flat(dp(pts, 2.0)))
        elif tags.get("waterway") in RIVER_W and not closed:
            rivers.append([RIVER_W[tags["waterway"]], flat(dp(pts, 3.0))])
        elif not closed:
            continue
        elif tags.get("natural") == "water" or tags.get("landuse") in ("reservoir", "basin") or tags.get("waterway") == "riverbank":
            water.append(flat(dp_ring(pts, 2.5)))
        elif "building" in tags or "building:part" in tags:
            r = dp_ring(pts, 0.8)
            if len(r) >= 3:
                blds.append((_height(tags), r, tags))
            if tags.get("building") == "stadium" or tags.get("leisure") == "stadium":
                stadia.append((2, r, _height(tags)))
        elif tags.get("leisure") == "stadium":
            stadia.append((1, dp_ring(pts, 1.0), _height(tags)))
        elif tags.get("leisure") == "pitch":
            pitches.append([1 if "soccer" in tags.get("sport", "") else 0, flat(dp_ring(pts, 1.0))])
        elif tags.get("leisure") in GREEN_LEISURE or tags.get("landuse") in GREEN_LANDUSE or tags.get("natural") in WOOD | {"grassland", "heath"}:
            woody = tags.get("natural") in WOOD or tags.get("landuse") == "forest"
            green.append([1 if woody else 0, flat(dp_ring(pts, 2.5))])
        if closed and (tags.get("leisure") in ("sports_centre", "stadium", "track") or tags.get("club") or tags.get("landuse") == "recreation_ground" or tags.get("amenity") in ("training", "community_centre")):
            areas.append(dp_ring(pts, 1.5))

    out = {"roads": sorted(roads, key=lambda r: -r[0])[:700], "rail": rail[:40], "rivers": rivers[:40],
           "green": green[:160], "water": water[:60], "pitches": pitches[:80]}
    # o estádio: contorno real do prédio (building=stadium) ou da área (leisure=stadium) mais próxima
    bowl = None
    if kind == "stadium" and stadia:
        def score(s):
            c = centroid(s[1])
            d = 0 if inside((0, 0), s[1]) else math.hypot(*c)
            return (d > 450, -s[0], d)
        best = min(stadia, key=score)
        if not (score(best)[0]):
            outline = best[1]
            # se só há a área (leisure), procura um prédio grande dentro dela
            if best[0] == 1:
                inner = [b for b in blds if inside(centroid(b[1]), outline) and poly_area(b[1]) > 4000]
                if inner:
                    outline = max(inner, key=lambda b: poly_area(b[1]))[1]
            h = best[2] or max((b[0] for b in blds if inside(centroid(b[1]), outline)), default=0)
            bowl = {"rect": min_rect(outline), "h": round(h, 1), "outline": flat(outline),
                    "fill": round(poly_area(outline) / max(1.0, 4 * min_rect(outline)[2] * min_rect(outline)[3]), 3)}
            out["bowl"] = bowl
    # prédios vizinhos: altura real em metros (0 = desconhecida); os do próprio estádio ficam de fora
    blds.sort(key=lambda b: math.hypot(*centroid(b[1])))
    keep = []
    for h, r, tags in blds:
        c = centroid(r)
        if abs(c[0]) > lim or abs(c[1]) > lim:
            continue
        if bowl and (inside(c, [(bowl["outline"][i], bowl["outline"][i + 1]) for i in range(0, len(bowl["outline"]), 2)])):
            continue
        keep.append([round(h, 1), flat(r)])
        if len(keep) >= 1400:
            break
    out["buildings"] = keep
    # prédios do clube (CT/sede): os que ficam dentro da área do clube que contém o ponto, ou bem perto dele
    if kind in ("ct", "sede"):
        area = next((a for a in sorted(areas, key=poly_area) if inside((0, 0), a) and poly_area(a) < 600000), None)
        idx = []
        for i, (h, f) in enumerate(keep):
            pts = [(f[j], f[j + 1]) for j in range(0, len(f), 2)]
            c = centroid(pts)
            if (area and inside(c, area)) or math.hypot(*c) < (55 if kind == "sede" else 120):
                idx.append((poly_area(pts), i))
        idx.sort(reverse=True)
        out["club"] = sorted(i for _, i in idx[:14])
        if area:
            out["area"] = flat(area)
    out["trees"] = [v for p in trees[:900] for v in (round(p[0]), round(p[1]))]
    return out


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


def load_models():
    """Estádios marcantes (src/data/stadiumModels.json): clube -> (chave, lat, lon)."""
    if not os.path.exists(MODELS):
        return {}
    m = json.load(open(MODELS, encoding="utf-8"))["models"]
    return {c: (k, v["lat"], v["lon"]) for k, v in m.items() for c in v.get("clubs", [])}


def save(out):
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, OUT)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--divs", default="A,B")
    ap.add_argument("--redo", default="")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--osm-only", action="store_true", help="mantém os locais e baixa de novo só o contexto do OSM")
    ap.add_argument("--only", default="", help="lista de clubes para --osm-only")
    a = ap.parse_args()
    divs = a.divs.split(",")
    db = json.load(open(DB, encoding="utf-8"))
    clubs = [c for c in db["clubs"] if c.get("div") in divs]
    clubs.sort(key=lambda c: (divs.index(c["div"]), -c.get("level", 0)))
    out = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    out.setdefault("source", "Wikidata (CC0) e © colaboradores do OpenStreetMap (ODbL)")
    out.setdefault("clubs", {})
    out["v"] = 2
    redo = set(a.redo.split(",")) if a.redo else set()
    models = load_models()

    if a.osm_only:
        only = set(a.only.split(",")) if a.only else None
        for c in clubs:
            cid = c["id"]
            e = out["clubs"].get(cid)
            if not e or (only and cid not in only):
                continue
            print(f"[{c['div']}] {c['name']} (OSM)")
            osm = {}
            for k, s in e["sites"].items():
                ctx = osm_context(s, k)
                if ctx:
                    osm[k] = ctx
                    print(f"   {k}: {len(ctx['buildings'])} prédios, {len(ctx['roads'])} ruas" + (" + estádio" if "bowl" in ctx else ""))
            if osm:
                e["osm"] = osm
            save(out)
        return

    st_q = [c["stadiumImg"] for c in clubs if c.get("stadiumImg") and (c["id"] not in out["clubs"] or c["id"] in redo)]
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
        if not sc and prev.get("stadium", {}).get("src") in ("wikidata", "modelo"):
            sc = (prev["stadium"]["lat"], prev["stadium"]["lon"])  # reaproveita (WDQS pode estar fora)
        if sc:
            sites["stadium"] = {"lat": round(sc[0], 6), "lon": round(sc[1], 6), "name": c.get("stadium", ""), "src": "wikidata"}
        else:
            s = nominatim(f"{c.get('stadium', '')} {c.get('city', '')}") if c.get("stadium") else None
            if s:
                s["name"] = c.get("stadium", s["name"])
                sites["stadium"] = s
        mod = models.get(cid)
        if mod and ("stadium" not in sites or dist_m((sites["stadium"]["lat"], sites["stadium"]["lon"]), mod[1:]) > 1500):
            sites["stadium"] = {"lat": mod[1], "lon": mod[2], "name": c.get("stadium", ""), "src": "modelo"}
        near = (sites["stadium"]["lat"], sites["stadium"]["lon"]) if "stadium" in sites else None
        # sede
        hq = hq_coord.get(cid)
        if cid in SEDE_NAMES:
            hq = None  # nome conhecido da sede é mais preciso que o ponto genérico do Wikidata
        if cid in SEDE_OSM:
            p = osm_element_center(SEDE_OSM[cid])
            if p:
                sites["sede"] = {"lat": round(p[0], 6), "lon": round(p[1], 6), "name": "Sede", "src": "osm"}
        elif cid in SEDE_AT_STADIUM:
            pass
        elif hq and (not near or 120 < dist_m(hq, near) < 80000):
            sites["sede"] = {"lat": round(hq[0], 6), "lon": round(hq[1], 6), "name": "Sede", "src": "wikidata"}
        else:
            qs = [(n, [w for w in _norm(n).split() if len(w) > 3][:2] or [n]) for n in SEDE_NAMES.get(cid, [])]
            qs += [(f"Sede {c.get('full', c['name'])}", [_norm(c["name"])]), (f"Sede social {c['name']} {c.get('city', '')}", [_norm(c["name"])])]
            for q, must in qs:
                s = nominatim(q, near, must=must)
                if s and (not near or dist_m((s["lat"], s["lon"]), near) > 120):
                    sites["sede"] = s
                    break
        if "sede" not in sites and prev.get("sede") and cid not in SEDE_AT_STADIUM and cid not in SEDE_OSM:
            sites["sede"] = prev["sede"]
        # CT: primeiro os nomes conhecidos, depois buscas genéricas (o nome precisa citar CT/treinamento/clube)
        cands = [(n, [w for w in _norm(n).split() if len(w) > 3][:2] or [n]) for n in CT_NAMES.get(cid, [])]
        # nas buscas genéricas o resultado precisa citar o clube (evita "CT de xadrez" e afins)
        cands += [(f"Centro de Treinamento {c['name']}", [_norm(c["name"])]), (f"CT {c['name']} {c.get('city', '')}", [_norm(c["name"])])]
        for q, must in cands:
            s = nominatim(q, near, must=must)
            if s and (not near or dist_m((s["lat"], s["lon"]), near) > 150):
                sites["ct"] = s
                break
        if "ct" not in sites and prev.get("ct") and (not near or dist_m((prev["ct"]["lat"], prev["ct"]["lon"]), near) < 80000):
            sites["ct"] = prev["ct"]  # Nominatim fora do ar: mantém o CT já conhecido (se for da mesma cidade)
        osm = {}
        for k, s in sites.items():
            ctx = osm_context(s, k)
            if ctx:
                osm[k] = ctx
        out["clubs"][cid] = {"sites": sites, "osm": osm}
        print("   locais:", ", ".join(f"{k}={v['src']}" for k, v in sites.items()) or "nenhum (layout padrão)")
        save(out)
    print(f"ok: {len(out['clubs'])} clubes em {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
