# -*- coding: utf-8 -*-
"""
Mídia real dos clubes: escudos oficiais, fotos dos estádios e logos dos campeonatos.

Fontes (sempre pela Wikimedia, via scripts/wm.py, que controla a taxa de acesso):
  - Wikidata: QID do clube, P154 (logotipo), P115 (estádio), P1083 (capacidade), P18 (imagem),
    P571 (fundação), P373 (categoria no Commons)
  - Wikipedia em português: campo "imagem" e "alcunhas" da Info/Clube de futebol
  - Wikipedia em inglês: campo "image"/"logo" (pode ser logotipo não livre local) e o link
    do campo "ground"/"stadium" (estádio coerente com o nome usado no banco de dados)

Saídas:
  public/media/crests/<clubId>.webp          escudo 256x256 com transparência
  public/media/stadiums/<QIDdoEstádio>.webp  foto 640x360 (16:9)
  public/media/comps/<chave>.webp            logo do campeonato 256x256
  scripts/cache/club_media.json              dados coletados (QIDs, arquivos, estádios, fundação,
                                             apelidos) — lido por build_database.py
  scripts/cache/credits_clubs.json           autoria/licença de cada arquivo publicado

O script é retomável: arquivos brutos ficam em scripts/cache/club_media_raw/ e nada é
baixado de novo. Rode por etapas (ou "all"):
    python3 scripts/fetch_club_media.py all
    python3 scripts/fetch_club_media.py resolve|entities|venues|info|crests|stadiums|comps|credits|qa
    (--force refaz as conversões já feitas)
"""
from __future__ import annotations

import hashlib
import html
import io
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm  # noqa: E402
from clubs_catalog import ALL_CLUBS  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "scripts", "cache")
DATA = os.path.join(CACHE, "club_media.json")
CREDITS = os.path.join(CACHE, "credits_clubs.json")
RAWDIR = os.path.join(CACHE, "club_media_raw")
MEDIA = os.path.join(ROOT, "public", "media")
QA_DIR = "/tmp/claude-0/qa"
EN_API = "https://en.wikipedia.org/w/api.php"
PT_API = "https://pt.wikipedia.org/w/api.php"
BR_IDS = {c["id"] for c in ALL_CLUBS if c["div"] != "F"}

# Campeonatos do jogo -> título do artigo na Wikipedia em inglês
COMPS = {
    "serieA": "Campeonato Brasileiro Série A",
    "serieB": "Campeonato Brasileiro Série B",
    "serieC": "Campeonato Brasileiro Série C",
    "copaBR": "Copa do Brasil",
    "liberta": "Copa Libertadores",
    "sula": "Copa Sudamericana",
}

# Títulos da Wikipedia em inglês que mudaram em relação ao catálogo
TITLE_OVERRIDES = {
    "amazonas": "Amazonas Futebol Clube",
    # o catálogo aponta o Barra de Teresópolis (RJ); o clube do jogo é o de Balneário Camboriú (SC)
    "barra-sc": "Barra Futebol Clube (SC)",
}

# Correções manuais depois da conferência visual.
# Escudo: clubId -> (arquivo, "commons" | "en")
CREST_OVERRIDES: dict[str, tuple[str, str]] = {}
# Estádio do clube: clubId -> QID do estádio (quando o link da Wikipedia/P115 não bate com o
# estádio usado no banco de dados, inclusive os nomes fixados em build_database.STADIUMS)
VENUE_OVERRIDES: dict[str, str] = {
    "remo": "Q1370732",  # Mangueirão (nome fixado em STADIUMS); a Wikipedia em inglês aponta o Baenão
    "medellin": "Q6156079",  # Estádio Atanasio Girardot (a P115 aponta o complexo esportivo)
    "puerto-cabello": "Q28790440",  # Estadio de Fútbol Puerto Cabello (só existe na Wikipedia em espanhol)
}
# Foto do estádio: QID -> arquivo do Commons (quando a P18 é ruim: mapa, planta, foto escura...)
STADIUM_IMG_OVERRIDES: dict[str, str] = {}
# Estádios cuja P18 não serve e que devem ficar sem foto (se não houver alternativa)
STADIUM_IMG_REJECT: set[str] = set()
# Logo de campeonato: chave -> (arquivo, "commons" | "en")
COMP_OVERRIDES: dict[str, tuple[str, str]] = {}
# Fundação: clubId -> ano (quando as fontes discordam e a conferência manual decidiu)
FOUNDED_OVERRIDES: dict[str, str] = {}

# P31 aceitos como "clube de futebol"
CLUB_TYPES = {"Q476028", "Q847017", "Q103229495", "Q15944511", "Q1194951", "Q20639856", "Q17270000"}


# ---------------------------------------------------------------- utilidades
def load(path, default):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return default


def save(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1, sort_keys=True)
    os.replace(tmp, path)


def chunks(seq, n):
    seq = list(seq)
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def claim_value(c):
    s = c.get("mainsnak", {})
    if s.get("snaktype") != "value":
        return None
    v = s.get("datavalue", {}).get("value")
    if isinstance(v, dict):
        if "id" in v:
            return v["id"]
        if "amount" in v:
            try:
                return int(float(v["amount"]))
            except ValueError:
                return None
        if "time" in v:
            return v["time"]
    return v


def qual_time(c, prop):
    vals = []
    for q in c.get("qualifiers", {}).get(prop, []):
        t = q.get("datavalue", {}).get("value", {})
        if isinstance(t, dict) and t.get("time"):
            vals.append(t["time"])
    return max(vals) if vals else ""


def ranked(claims, prop, time_prop="P580"):
    """Valores de uma propriedade do mais atual para o mais antigo:
    sem data de término (P582) > posto preferido > início (ou data) mais recente.
    A ordenação é estável: empates mantêm a ordem do Wikidata."""
    out = []
    for c in claims.get(prop, []):
        if c.get("rank") == "deprecated":
            continue
        v = claim_value(c)
        if v is None:
            continue
        ended = bool(c.get("qualifiers", {}).get("P582"))
        out.append({
            "value": v, "rank": c.get("rank"), "ended": ended,
            "start": qual_time(c, time_prop), "end": qual_time(c, "P582"),
        })
    out.sort(key=lambda x: (not x["ended"], x["rank"] == "preferred", x["start"]), reverse=True)
    return out


def current(vals):
    """Primeiro valor atual (sem P582) de uma lista devolvida por ranked()."""
    for x in vals or []:
        if not x.get("ended"):
            return x["value"]
    return None


def raw_path(wiki, name, width):
    h = hashlib.md5(f"{wiki}|{wm.norm_file(name)}|{width}".encode()).hexdigest()[:16]
    return os.path.join(RAWDIR, h + ".bin")


def thumb_urls(files, width, wiki="commons"):
    """URLs diretas das miniaturas (ou do original, se for menor), 50 arquivos por requisição.
    Evita o redirecionamento de Special:FilePath e a segunda tentativa sem miniatura."""
    api = wm.COMMONS_API if wiki == "commons" else EN_API
    out = {}
    for batch in chunks(sorted(set(files)), 50):
        r = wm.api(api, {"action": "query", "titles": "|".join("File:" + f for f in batch),
                         "prop": "imageinfo", "iiprop": "url|size|mime", "iiurlwidth": str(width)})
        if not r:
            continue
        q = r.get("query", {})
        norm = {x["to"]: x["from"] for x in q.get("normalized", [])}
        for pg in q.get("pages", []):
            orig = norm.get(pg["title"], pg["title"]).split(":", 1)[1]
            ii = (pg.get("imageinfo") or [{}])[0]
            url = ii.get("thumburl") or ii.get("url")
            if ii.get("mime") == "image/svg+xml" and not ii.get("thumburl"):
                url = None
            out[orig] = url
    return out


def fetch_url(name, width, wiki, url):
    """Baixa a URL direta (com o mesmo cache de fetch_raw)."""
    p = raw_path(wiki, name, width)
    if os.path.exists(p) and os.path.getsize(p) > 0:
        with open(p, "rb") as f:
            return f.read()
    if not url:
        return fetch_raw(name, width, wiki)
    r = wm.get(url)
    if r is None or r.status_code != 200 or not r.headers.get("content-type", "").startswith("image/"):
        return fetch_raw(name, width, wiki)
    os.makedirs(RAWDIR, exist_ok=True)
    with open(p, "wb") as f:
        f.write(r.content)
    return r.content


def fetch_raw(name, width, wiki="commons"):
    """Baixa (com cache) um arquivo da Wikimedia. wiki: "commons" ou "en".
    Tenta a miniatura na largura pedida e, se não der (raster menor que a largura), o original."""
    host = "commons.wikimedia.org" if wiki == "commons" else "en.wikipedia.org"
    os.makedirs(RAWDIR, exist_ok=True)
    tries = [width, None] if width else [None]
    for w in tries:
        p = raw_path(wiki, name, w)
        if os.path.exists(p):
            if os.path.getsize(p) == 0:
                continue  # tentativa anterior falhou
            with open(p, "rb") as f:
                return f.read()
        data = wm.download(name, w, wiki=host)
        if data and not data[:200].lstrip().startswith((b"<?xml", b"<svg", b"<!DOCTYPE svg")):
            with open(p, "wb") as f:
                f.write(data)
            return data
        # SVG original (sem miniatura) não serve: marca a falha e tenta o próximo
        with open(p, "wb") as f:
            f.write(b"")
    return None


def strip_html(s):
    s = re.sub(r"<[^>]+>", "", s or "")
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def field_raw(text, names):
    """Valor bruto (uma linha) do primeiro campo de infobox encontrado entre os nomes dados.
    Usa [ \\t]* para não "pular" para a linha seguinte quando o campo está vazio."""
    if not text:
        return None
    for nm in names:
        m = re.search(r"^[ \t]*\|[ \t]*" + nm + r"[ \t]*=[ \t]*([^\n]*)", text, re.M | re.I)
        if m and m.group(1).strip():
            return m.group(1)
    return None


def infobox_field(text, names):
    """Arquivo de imagem citado num campo da infobox (primeiro nome que tiver um arquivo)."""
    if not text:
        return None
    for nm in names:
        v = field_raw(text, [nm])
        if not v:
            continue
        v = re.sub(r"<!--.*?-->", "", v).strip()
        fm = re.search(r"\[\[(?:File|Ficheiro|Arquivo|Imagem|Image):([^|\]]+)", v, re.I)
        if fm:
            v = fm.group(1)
        v = v.split("|")[0].strip()
        if re.search(r"\.(svg|png|jpe?g|gif|webp|tiff?)$", v, re.I):
            return wm.norm_file(v).replace("_", " ")
    return None


def wiki_text(api, title, cache_name):
    """Wikitext de um artigo (cache em club_media_raw/)."""
    if not title:
        return ""
    os.makedirs(RAWDIR, exist_ok=True)
    path = os.path.join(RAWDIR, cache_name + ".txt")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return f.read()
    r = wm.api(api, {"action": "query", "titles": title, "redirects": 1, "prop": "revisions",
                     "rvprop": "content", "rvslots": "main"})
    txt = ""
    try:
        txt = r["query"]["pages"][0]["revisions"][0]["slots"]["main"]["content"]
    except (TypeError, KeyError, IndexError):
        if r is None:
            return ""  # falha de rede: não grava cache
    with open(path, "w", encoding="utf-8") as f:
        f.write(txt)
    return txt


def safe_name(title):
    return re.sub(r"[^\w\-]+", "_", title)


def prefetch_texts(api, items):
    """Baixa de uma vez (50 títulos por requisição) os wikitexts ainda fora do cache.
    items: [(título, nome_do_cache)] no mesmo formato de wiki_text()."""
    todo = [(t, n) for t, n in items if t and not os.path.exists(os.path.join(RAWDIR, n + ".txt"))]
    os.makedirs(RAWDIR, exist_ok=True)
    for batch in chunks(todo, 50):
        r = wm.api(api, {"action": "query", "titles": "|".join(t for t, _ in batch), "redirects": 1,
                         "prop": "revisions", "rvprop": "content", "rvslots": "main"})
        if not r:
            continue
        q = r.get("query", {})
        norm = {x["from"]: x["to"] for x in q.get("normalized", [])}
        redir = {x["from"]: x["to"] for x in q.get("redirects", [])}
        pages = {p["title"]: p for p in q.get("pages", [])}
        for t0, name in batch:
            t = norm.get(t0, t0)
            t = redir.get(t, t)
            p = pages.get(t)
            if p is None:
                continue  # resposta incompleta: tenta de novo depois
            try:
                txt = p["revisions"][0]["slots"]["main"]["content"]
            except (KeyError, IndexError):
                txt = ""
            with open(os.path.join(RAWDIR, name + ".txt"), "w", encoding="utf-8") as f:
                f.write(txt)


def pt_title_cached(title):
    path = os.path.join(CACHE, "pt", safe_name(title) + ".txt")
    return os.path.exists(path) and os.path.getsize(path) > 0


def prefetch_club_texts(db):
    """Artigos pt dos clubes, predefinições de infobox pt e artigos en ausentes, em lote."""
    clubs = db["clubs"]
    prefetch_texts(PT_API, [(v.get("ptTitle"), "pt_" + safe_name(v["ptTitle"]))
                            for v in clubs.values() if v.get("ptTitle") and not pt_title_cached(v["ptTitle"])])
    tpl = []
    for v in clubs.values():
        t = v.get("ptTitle")
        if not t:
            continue
        txt = pt_text_base(t)
        if not field_raw(txt, ["imagem", "img", "alcunhas"]):
            m = re.search(r"\{\{\s*(Info/[^}|\n]+?)\s*\}\}", txt)
            if m and m.group(1).strip().lower() not in ("info/clube de futebol", "info/futebol/clube"):
                name = "Predefinição:" + m.group(1).strip()
                tpl.append((name, "pt_" + safe_name(name)))
    prefetch_texts(PT_API, tpl)
    en = []
    for c in ALL_CLUBS:
        if c["id"] in TITLE_OVERRIDES or not os.path.exists(os.path.join(CACHE, "wikitext", c["id"] + ".txt")):
            en.append((clubs[c["id"]].get("enTitle"), "en_" + c["id"]))
    prefetch_texts(EN_API, en)


def pt_text_base(title):
    path = os.path.join(CACHE, "pt", safe_name(title) + ".txt")
    if os.path.exists(path) and os.path.getsize(path) > 0:
        with open(path, encoding="utf-8") as f:
            return f.read()
    return wiki_text(PT_API, title, "pt_" + safe_name(title))


def pt_text(title):
    """Wikitext em português: usa scripts/cache/pt/ (fetch_pt_positions.py) ou baixa.
    Se a infobox estiver numa predefinição própria ({{Info/Sport Club Corinthians Paulista}}),
    acrescenta o texto dela."""
    if not title:
        return ""
    txt = pt_text_base(title)
    if not field_raw(txt, ["imagem", "img", "alcunhas"]):
        m = re.search(r"\{\{\s*(Info/[^}|\n]+?)\s*\}\}", txt)
        if m and m.group(1).strip().lower() not in ("info/clube de futebol", "info/futebol/clube"):
            name = "Predefinição:" + m.group(1).strip()
            txt += "\n" + wiki_text(PT_API, name, "pt_" + safe_name(name))
    return txt


def en_text(cid, title):
    path = os.path.join(CACHE, "wikitext", cid + ".txt")
    if cid not in TITLE_OVERRIDES and os.path.exists(path) and os.path.getsize(path) > 0:
        with open(path, encoding="utf-8") as f:
            return f.read()
    return wiki_text(EN_API, title, "en_" + cid)


def page_qids(api, titles):
    """Título -> QID (segue redirecionamentos)."""
    out = {}
    for batch in chunks(sorted(set(titles)), 50):
        r = wm.api(api, {"action": "query", "titles": "|".join(batch), "redirects": 1,
                         "prop": "pageprops", "ppprop": "wikibase_item"})
        if not r:
            continue
        q = r.get("query", {})
        norm = {x["from"]: x["to"] for x in q.get("normalized", [])}
        redir = {x["from"]: x["to"] for x in q.get("redirects", [])}
        pages = {p["title"]: p for p in q.get("pages", [])}
        for t0 in batch:
            t = norm.get(t0, t0)
            t = redir.get(t, t)
            out[t0] = pages.get(t, {}).get("pageprops", {}).get("wikibase_item")
    return out


# ---------------------------------------------------------------- etapa 1: QIDs
def resolve(db):
    clubs = db.setdefault("clubs", {})
    todo = [c for c in ALL_CLUBS if not clubs.get(c["id"], {}).get("qid")
            or (c["id"] in TITLE_OVERRIDES and clubs[c["id"]].get("enTitle") != TITLE_OVERRIDES[c["id"]])]
    print(f"resolve: {len(todo)} clubes sem QID")
    for batch in chunks(todo, 50):
        titles = [TITLE_OVERRIDES.get(c["id"], c["wiki"]) for c in batch]
        r = wm.api(EN_API, {"action": "query", "titles": "|".join(titles), "redirects": 1,
                            "prop": "pageprops", "ppprop": "wikibase_item"})
        if not r:
            print("  falha na API da Wikipedia")
            continue
        q = r.get("query", {})
        norm = {x["from"]: x["to"] for x in q.get("normalized", [])}
        redir = {x["from"]: x["to"] for x in q.get("redirects", [])}
        pages = {p["title"]: p for p in q.get("pages", [])}
        for c in batch:
            t0 = TITLE_OVERRIDES.get(c["id"], c["wiki"])
            t = norm.get(t0, t0)
            t = redir.get(t, t)
            p = pages.get(t, {})
            qid = p.get("pageprops", {}).get("wikibase_item")
            clubs.setdefault(c["id"], {}).update({"enTitle": t, "qid": qid})
            if not qid:
                print(f"  sem QID: {c['id']} ({c['wiki']})")
    save(DATA, db)


# ---------------------------------------------------------------- etapa 2: entidades
def wbget(ids):
    out = {}
    for batch in chunks(sorted(set(ids)), 50):
        r = wm.api(wm.WIKIDATA_API, {"action": "wbgetentities", "ids": "|".join(batch),
                                     "props": "claims|labels|sitelinks", "languages": "pt|en"})
        if not r:
            print("  falha no Wikidata")
            continue
        out.update(r.get("entities", {}))
    return out


def label(e, lang):
    return (e.get("labels", {}).get(lang) or {}).get("value")


def year_of(t):
    m = re.match(r"^\+?(\d{4})-", t or "")
    return m.group(1) if m else None


def venue_info(e):
    cl = e.get("claims", {})
    caps = ranked(cl, "P1083", time_prop="P585")
    # capacidade: posto preferido > medição mais recente
    caps.sort(key=lambda x: (x["rank"] == "preferred", x["start"]), reverse=True)
    return {
        "labelPt": label(e, "pt"), "labelEn": label(e, "en"),
        "capacity": caps[0]["value"] if caps else None,
        "p18": [x["value"] for x in ranked(cl, "P18")],
        "p373": (ranked(cl, "P373") or [{}])[0].get("value"),
        "p31": [x["value"] for x in ranked(cl, "P31")],
        "enTitle": (e.get("sitelinks", {}).get("enwiki") or {}).get("title"),
        "ptTitle": (e.get("sitelinks", {}).get("ptwiki") or {}).get("title"),
    }


def entities(db):
    clubs = db["clubs"]
    ids = sorted({v["qid"] for v in clubs.values() if v.get("qid")})
    print(f"entities: {len(ids)} clubes")
    ents = wbget(ids)
    for cid, v in clubs.items():
        e = ents.get(v.get("qid") or "")
        if not e:
            continue
        cl = e.get("claims", {})
        p31 = [x["value"] for x in ranked(cl, "P31")]
        v["p31"] = p31
        v["isClub"] = bool(set(p31) & CLUB_TYPES)
        v["labelPt"] = label(e, "pt")
        v["ptTitle"] = (e.get("sitelinks", {}).get("ptwiki") or {}).get("title")
        v["p154"] = ranked(cl, "P154")
        v["p115"] = ranked(cl, "P115")
        v["p571"] = sorted({y for y in (year_of(x["value"]) for x in ranked(cl, "P571", "P585")) if y})
        if not v["isClub"]:
            print(f"  ATENÇÃO {cid}: P31={p31} (não parece clube de futebol)")
    save(DATA, db)


# ---------------------------------------------------------------- etapa 3: estádios (QIDs)
def ground_link(text):
    """Destino do primeiro link do campo ground/stadium da infobox em inglês."""
    g = field_raw(text, ["ground", "stadium"])
    if not g:
        return None
    lk = re.search(r"\[\[([^|\]#]+)", g)
    if not lk or lk.group(1).strip().startswith(":"):
        return None
    t = html.unescape(lk.group(1)).replace("\xa0", " ")
    return re.sub(r"\s+", " ", t).strip()


def club_venue(v, cid):
    if cid in VENUE_OVERRIDES:
        return VENUE_OVERRIDES[cid], "manual"
    if v.get("groundQid"):
        return v["groundQid"], "enwiki"
    q = current(v.get("p115"))
    if q:
        return q, "wikidata"
    return None, None


def venues_stage(db):
    clubs = db["clubs"]
    links = {}
    for c in ALL_CLUBS:
        v = clubs[c["id"]]
        v["groundLink"] = ground_link(en_text(c["id"], v.get("enTitle")))
        if v["groundLink"]:
            links[c["id"]] = v["groundLink"]
    qids = page_qids(EN_API, links.values())
    for c in ALL_CLUBS:
        v = clubs[c["id"]]
        v["groundQid"] = qids.get(v["groundLink"]) if v["groundLink"] else None
    venues = db.setdefault("venues", {})
    need = set()
    for c in ALL_CLUBS:
        v = clubs[c["id"]]
        q, src = club_venue(v, c["id"])
        v["venue"], v["venueSrc"] = q, src
        if q:
            need.add(q)
    fetch = sorted(q for q in need if q not in venues or "enTitle" not in venues[q])
    for q, e in wbget(fetch).items():
        old = venues.get(q, {})
        venues[q] = {**venue_info(e), **{k: old[k] for k in ("image", "imgDone") if k in old}}
    save(DATA, db)
    print(f"venues: {len(need)} estádios")
    for c in ALL_CLUBS:
        v = clubs[c["id"]]
        q = v["venue"]
        p115 = current(v.get("p115"))
        ven = venues.get(q or "", {})
        flag = "" if q == p115 else f"  (P115={p115})"
        print(f"  {c['id']:<24} {str(q):<10} {v['venueSrc'] or '-':<8} "
              f"{(ven.get('labelPt') or ven.get('labelEn') or '')[:44]:<44} cap={ven.get('capacity')}{flag}")


# ---------------------------------------------------------------- etapa 4: fundação e apelidos
def _years(s):
    return re.findall(r"(?<!\d)(1[89]\d\d|20[0-2]\d)(?!\d)", s or "")


def founded_years(text, names):
    """Primeiro ano citado no campo (data de fundação do clube, não do departamento)."""
    v = field_raw(text, names)
    if not v:
        return None
    v = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>|\{\{(?:refn|efn|ref)[^}]*\}\}", "", v, flags=re.S | re.I)
    ys = _years(v)
    return ys[0] if ys else None


def clean_nick_list(v, english=False):
    """Lista de apelidos de um campo de infobox: sem refs, links, glosas em inglês, ≤3."""
    if not v:
        return []
    v = re.sub(r"<ref[^>]*/>", "", v, flags=re.I)
    v = re.sub(r"<ref[^>]*>.*?</ref>", "", v, flags=re.S | re.I)
    v = re.sub(r"<ref[^>]*>.*$", "", v, flags=re.S | re.I)
    v = re.sub(r"<!--.*?-->", "", v, flags=re.S)
    v = re.sub(r"\{\{\s*(?:efn|refn|ref|citation needed|cn|sfn|nota|nota de rodapé)[^{}]*\}\}", "", v, flags=re.I)
    v = re.sub(r"\{\{\s*(?:small|pequeno|nowrap|lang\|[a-z-]+)\|([^{}]*)\}\}", r"\1", v, flags=re.I)
    v = re.sub(r"\{\{\s*(?:plainlist|plain list|unbulleted list|ubl|flatlist|lista simples|collapsible list|"
               r"lista expansível)\s*\|?", "", v, flags=re.I)
    v = re.sub(r"\b(?:title|titulo|título)\s*=[^|]*\|", "", v, flags=re.I)
    v = re.sub(r"''\s+''", ",", v)  # ''Apelido1'' ''Apelido2
    v = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", v)
    v = re.sub(r"<br\s*/?\s*>?|\n|\*|;|•|\|", ",", v, flags=re.I)
    v = re.sub(r"\{\{|\}\}", ",", v)
    v = re.sub(r"<[^>]+>", "", v)
    v = re.sub(r"\([^)]*\)|\[[^\]]*\]", "", v)  # glosas/traduções entre parênteses
    v = v.replace("''", "").replace('"', "").replace("“", "").replace("”", "").replace("«", "").replace("»", "")
    out = []
    for part in re.split(r",| / | ou ", v):
        p = re.sub(r"\s+", " ", html.unescape(part)).strip(" .:-–—'")
        if not p or len(p) > 32 or "=" in p or "http" in p:
            continue
        if p.lower() in (x.lower() for x in out):
            continue
        out.append(p)
        if len(out) >= 3:
            break
    return out


def info_stage(db):
    """Fundação (ano) e apelidos de cada clube, para build_database.py."""
    clubs = db["clubs"]
    prefetch_club_texts(db)
    for c in ALL_CLUBS:
        cid = c["id"]
        v = clubs[cid]
        en = en_text(cid, v.get("enTitle"))
        pt = pt_text(v.get("ptTitle"))
        y_en = founded_years(en, ["founded", "founded_date"])
        y_pt = founded_years(pt, ["fundadoem", "fundação", "fundado em", "fundado"])
        y_wd = (v.get("p571") or [None])[0]
        v["foundedSrc"] = {"en": y_en, "pt": y_pt, "wd": y_wd}
        if cid in FOUNDED_OVERRIDES:
            y = FOUNDED_OVERRIDES[cid]
        else:
            votes = [y_pt, y_wd, y_en] if cid in BR_IDS else [y_wd, y_en, y_pt]
            votes = [y for y in votes if y]
            # maioria; em empate vale a ordem de prioridade (pt > Wikidata > en para brasileiros)
            y = max(votes, key=lambda y: (votes.count(y), -votes.index(y))) if votes else None
        v["founded"] = y
        nick_pt = clean_nick_list(field_raw(pt, ["alcunhas", "alcunha", "apelidos", "apelido"]))
        nick_en = clean_nick_list(field_raw(en, ["nickname", "nicknames"]))
        v["nicknames"] = (nick_pt or nick_en) if cid in BR_IDS else (nick_en or nick_pt)
    save(DATA, db)
    for c in ALL_CLUBS:
        v = clubs[c["id"]]
        s = v["foundedSrc"]
        flag = "" if len({x for x in s.values() if x}) <= 1 else "  <-- divergem"
        print(f"  {c['id']:<24} {v['founded']} {s}{flag} | {', '.join(v['nicknames'])}")


# ---------------------------------------------------------------- etapa 5: escudos
def file_repos(files, api=EN_API):
    """Para arquivos citados numa Wikipedia: "local" (não livre) ou "shared" (Commons)."""
    out = {}
    for batch in chunks(sorted(set(files)), 50):
        r = wm.api(api, {"action": "query", "titles": "|".join("File:" + f for f in batch),
                         "prop": "imageinfo", "iiprop": "size|mime"})
        if not r:
            continue
        q = r.get("query", {})
        norm = {x["to"]: x["from"] for x in q.get("normalized", [])}
        for p in q.get("pages", []):
            t = p["title"]
            orig = norm.get(t, t).split(":", 1)[1]
            ii = (p.get("imageinfo") or [{}])[0]
            out[orig] = {"repo": p.get("imagerepository") or ("missing" if p.get("missing") else ""),
                         "w": ii.get("width"), "h": ii.get("height"), "mime": ii.get("mime")}
    return out


def crest_candidates(db):
    """Define o arquivo de escudo de cada clube:
    P154 atual > imagem da infobox pt (Commons) > imagem da infobox en (Commons ou local) > P154 antigo."""
    clubs = db["clubs"]
    prefetch_club_texts(db)
    en_files, pt_files = set(), set()
    for c in ALL_CLUBS:
        v = clubs.setdefault(c["id"], {})
        v["enInfobox"] = infobox_field(en_text(c["id"], v.get("enTitle")), ["image", "logo", "clubcrest", "crest"])
        v["ptInfobox"] = infobox_field(pt_text(v.get("ptTitle")), ["imagem", "img", "escudo", "logo"])
        if v["enInfobox"]:
            en_files.add(v["enInfobox"])
        if v["ptInfobox"]:
            pt_files.add(v["ptInfobox"])
    en_repos = db.setdefault("enRepos", {})
    need = [f for f in en_files if f not in en_repos]
    if need:
        en_repos.update(file_repos(need, EN_API))
    pt_repos = db.setdefault("ptRepos", {})
    need = [f for f in pt_files if f not in pt_repos]
    if need:
        pt_repos.update(file_repos(need, PT_API))
    for c in ALL_CLUBS:
        v = clubs[c["id"]]
        cur = current(v.get("p154"))
        pt_ok = v.get("ptInfobox") and pt_repos.get(v["ptInfobox"], {}).get("repo") == "shared"
        en_repo = en_repos.get(v.get("enInfobox") or "", {}).get("repo")
        if c["id"] in CREST_OVERRIDES:
            f, w = CREST_OVERRIDES[c["id"]]
            v["crest"] = {"file": f, "wiki": w, "source": "manual"}
        elif cur:
            v["crest"] = {"file": cur, "wiki": "commons", "source": "wikidata"}
        elif pt_ok:
            v["crest"] = {"file": v["ptInfobox"], "wiki": "commons", "source": "ptwiki"}
        elif en_repo in ("local", "shared"):
            v["crest"] = {"file": v["enInfobox"], "wiki": "en" if en_repo == "local" else "commons",
                          "source": "enwiki"}
        elif v.get("p154"):
            v["crest"] = {"file": v["p154"][0]["value"], "wiki": "commons", "source": "wikidata-old"}
        else:
            v["crest"] = None
    save(DATA, db)


def _img():
    from PIL import Image  # noqa: F401
    return Image


def knock_out_background(im):
    """Imagem sem transparência (JPG/PNG opaco): torna transparente o fundo branco
    ligado às bordas (preenchimento a partir das bordas, tolerância pequena)."""
    import numpy as np
    from collections import deque
    a = np.asarray(im.convert("RGBA")).copy()
    h, w = a.shape[:2]
    rgb = a[:, :, :3].astype(int)
    near_white = (rgb.min(axis=2) >= 236) & ((rgb.max(axis=2) - rgb.min(axis=2)) <= 18)
    seen = np.zeros((h, w), bool)
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if near_white[y, x] and not seen[y, x]:
                seen[y, x] = True
                dq.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if near_white[y, x] and not seen[y, x]:
                seen[y, x] = True
                dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx] and near_white[ny, nx]:
                seen[ny, nx] = True
                dq.append((ny, nx))
    a[seen, 3] = 0
    return _img().fromarray(a, "RGBA")


def to_logo_webp(data, out_path, box=256, pad=2):
    """Recorta margens transparentes/brancas e centraliza num quadro box x box."""
    import numpy as np
    Image = _img()
    im = Image.open(io.BytesIO(data))
    im.load()
    im = im.convert("RGBA")
    alpha = np.asarray(im)[:, :, 3]
    if alpha.min() >= 250:
        im = knock_out_background(im)
        alpha = np.asarray(im)[:, :, 3]
    ys, xs = np.where(alpha > 10)
    if len(xs) == 0:
        return False
    im = im.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    inner = box - 2 * pad
    s = min(inner / im.width, inner / im.height)
    nw, nh = max(1, round(im.width * s)), max(1, round(im.height * s))
    im = im.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    canvas.paste(im, ((box - nw) // 2, (box - nh) // 2), im)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    canvas.save(out_path, "WEBP", quality=90, method=6, exact=False)
    return True


def crests(db, force=False):
    crest_candidates(db)
    clubs = db["clubs"]
    ok, miss = 0, []
    todo = {"commons": set(), "en": set()}
    for c in ALL_CLUBS:
        v, out = clubs[c["id"]], os.path.join(MEDIA, "crests", c["id"] + ".webp")
        cr = v.get("crest")
        if cr and (force or not os.path.exists(out) or v.get("crestDone") != f"{cr['wiki']}|{cr['file']}") \
                and not os.path.exists(raw_path(cr["wiki"], cr["file"], 500 if cr["wiki"] == "commons" else 250)):
            todo[cr["wiki"]].add(cr["file"])
    urls = {"commons": thumb_urls(todo["commons"], 500, "commons") if todo["commons"] else {},
            "en": thumb_urls(todo["en"], 250, "en") if todo["en"] else {}}
    for c in ALL_CLUBS:
        v = clubs[c["id"]]
        out = os.path.join(MEDIA, "crests", c["id"] + ".webp")
        cr = v.get("crest")
        if not cr:
            miss.append(c["id"])
            continue
        stamp = f"{cr['wiki']}|{cr['file']}"
        if not force and os.path.exists(out) and v.get("crestDone") == stamp:
            ok += 1
            continue
        width = 500 if cr["wiki"] == "commons" else 250
        data = fetch_url(cr["file"], width, cr["wiki"], urls[cr["wiki"]].get(cr["file"]))
        if not data or not to_logo_webp(data, out):
            print(f"  falhou: {c['id']} {cr}")
            miss.append(c["id"])
            continue
        v["crestDone"] = stamp
        ok += 1
        if ok % 20 == 0:
            save(DATA, db)
            print(f"  {ok} escudos")
    save(DATA, db)
    src = {}
    for c in ALL_CLUBS:
        cr = clubs[c["id"]].get("crest")
        if cr and clubs[c["id"]].get("crestDone"):
            k = f"{cr['source']}/{cr['wiki']}"
            src[k] = src.get(k, 0) + 1
    print(f"crests: {ok} ok, faltando: {miss or 'nenhum'}; fontes: {src}")


# ---------------------------------------------------------------- etapa 6: fotos dos estádios
def to_stadium_webp(data, out_path):
    Image = _img()
    from PIL import ImageOps
    im = Image.open(io.BytesIO(data))
    im = ImageOps.exif_transpose(im).convert("RGB")
    tw, th = 640, 360
    r = im.width / im.height
    if r > 16 / 9:
        nw = round(im.height * 16 / 9)
        x0 = (im.width - nw) // 2
        im = im.crop((x0, 0, x0 + nw, im.height))
    else:
        nh = round(im.width * 9 / 16)
        y0 = (im.height - nh) // 2
        im = im.crop((0, y0, im.width, y0 + nh))
    im = im.resize((tw, th), Image.LANCZOS)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    im.save(out_path, "WEBP", quality=72, method=6)
    return True


def venue_article_image(v):
    """Imagem da infobox do artigo do estádio (pt, depois en), só se for do Commons."""
    for api, title, tag, names in ((PT_API, v.get("ptTitle"), "ptv_", ["imagem", "image"]),
                                   (EN_API, v.get("enTitle"), "env_", ["image", "imagem"])):
        if not title:
            continue
        f = infobox_field(wiki_text(api, title, tag + safe_name(title)), names)
        if f and not f.lower().endswith((".svg", ".gif")):
            return f
    return None


BAD_PHOTO = re.compile(r"map|mapa|plan|planta|logo|escudo|ingresso|ticket|placa|plaque|maquete|projeto|"
                       r"render|vesti[aá]rio|banheiro|locker|svg|seat|cadeira|bilhete|entrada_?de|"
                       r"diagram|croqui|desenho|drawing|camisa|shirt|jersey|trof|troph", re.I)
GOOD_PHOTO = re.compile(r"a[eé]rea|aerial|vista|panor|view|fachada|facade|exterior|est[aá]dio|stadium|estadio", re.I)


def category_image(cat):
    """Melhor candidata a foto do estádio na categoria do Commons (P373): JPG grande, paisagem,
    sem cara de mapa/planta/ingresso. A conferência visual decide se fica."""
    if not cat:
        return None
    r = wm.api(wm.COMMONS_API, {"action": "query", "generator": "categorymembers",
                                "gcmtitle": "Category:" + cat, "gcmtype": "file", "gcmlimit": "100",
                                "prop": "imageinfo", "iiprop": "size|mime"})
    best, best_score = None, 0
    for p in (r or {}).get("query", {}).get("pages", []):
        ii = (p.get("imageinfo") or [{}])[0]
        name = p["title"].split(":", 1)[1]
        w, h = ii.get("width") or 0, ii.get("height") or 1
        if ii.get("mime") != "image/jpeg" or w < 1000 or not (1.25 <= w / h <= 2.6) or BAD_PHOTO.search(name):
            continue
        score = 1 + (2 if GOOD_PHOTO.search(name) else 0) + min(w, 4000) / 4000
        if score > best_score:
            best, best_score = name, score
    return best


def stadiums(db, force=False):
    clubs, venues = db["clubs"], db.setdefault("venues", {})
    need = sorted({clubs[c["id"]].get("venue") for c in ALL_CLUBS if clubs[c["id"]].get("venue")})
    missing_ents = [q for q in need if q not in venues]
    if missing_ents:
        for q, e in wbget(missing_ents).items():
            venues[q] = venue_info(e)
    ok, miss = 0, []
    for q in need:
        v = venues.get(q, {})
        img = STADIUM_IMG_OVERRIDES.get(q)
        if not img and q not in STADIUM_IMG_REJECT:
            img = (v.get("p18") or [None])[0]
            if img and img.lower().endswith((".svg", ".gif")):
                img = None
            if not img:
                img = venue_article_image(v)
            if not img:
                if "catImage" not in v:
                    v["catImage"] = category_image(v.get("p373"))
                img = v["catImage"]
        v["image"] = img
        out = os.path.join(MEDIA, "stadiums", q + ".webp")
        if not img:
            v.pop("imgDone", None)
            if os.path.exists(out):
                os.remove(out)
            miss.append(q)
            continue
        if not force and os.path.exists(out) and v.get("imgDone") == img:
            ok += 1
            continue
        data = fetch_raw(img, 960, "commons")
        if not data:
            print(f"  falhou: {q} {img}")
            miss.append(q)
            continue
        try:
            to_stadium_webp(data, out)
        except Exception as ex:  # noqa: BLE001
            print(f"  erro ao converter {q}: {ex}")
            miss.append(q)
            continue
        v["imgDone"] = img
        ok += 1
        if ok % 20 == 0:
            save(DATA, db)
            print(f"  {ok} estádios")
    save(DATA, db)
    print(f"stadiums: {ok} com foto, {len(miss)} sem foto, {len(need)} estádios")
    for q in miss:
        v = venues.get(q, {})
        users = [c["id"] for c in ALL_CLUBS if clubs[c["id"]].get("venue") == q]
        print(f"  sem foto: {q} {v.get('labelPt') or v.get('labelEn')} ({', '.join(users)}) cat={v.get('p373')}")


# ---------------------------------------------------------------- etapa 7: campeonatos
def comps(db):
    cdb = db.setdefault("comps", {})
    qids = page_qids(EN_API, COMPS.values())
    for key, title in COMPS.items():
        cdb.setdefault(key, {}).update({"enTitle": title, "qid": qids.get(title)})
    ents = wbget([v["qid"] for v in cdb.values() if v.get("qid")])
    en_logo = set()
    for key, v in cdb.items():
        e = ents.get(v.get("qid") or "", {})
        v["p154"] = ranked(e.get("claims", {}), "P154")
        txt = wiki_text(EN_API, v["enTitle"], "en_comp_" + key)
        v["enInfobox"] = infobox_field(txt, ["logo", "image"])
        if v["enInfobox"]:
            en_logo.add(v["enInfobox"])
    repos = file_repos(list(en_logo)) if en_logo else {}
    for key, v in cdb.items():
        cur = current(v["p154"])
        if key in COMP_OVERRIDES:
            f, w = COMP_OVERRIDES[key]
            v["logo"] = {"file": f, "wiki": w, "source": "manual"}
        elif cur:
            v["logo"] = {"file": cur, "wiki": "commons", "source": "wikidata"}
        elif v.get("enInfobox") and repos.get(v["enInfobox"], {}).get("repo") in ("local", "shared"):
            repo = repos[v["enInfobox"]]["repo"]
            v["logo"] = {"file": v["enInfobox"], "wiki": "en" if repo == "local" else "commons",
                         "source": "enwiki"}
        else:
            v["logo"] = None
        lg = v["logo"]
        if not lg:
            print(f"  sem logo: {key}")
            continue
        data = fetch_raw(lg["file"], 500 if lg["wiki"] == "commons" else 250, lg["wiki"])
        out = os.path.join(MEDIA, "comps", key + ".webp")
        if data and to_logo_webp(data, out):
            print(f"  {key}: {lg['file']} ({lg['source']}) p154={[x['value'] for x in v['p154']]} en={v.get('enInfobox')}")
        else:
            print(f"  falhou: {key} {lg}")
    save(DATA, db)


# ---------------------------------------------------------------- etapa 8: créditos
NONFREE_AUTHOR = {"crests": "logotipo oficial do clube (marca registrada)",
                  "comps": "logotipo oficial da competição (marca registrada)"}


def commons_meta(files, cache):
    need = [f for f in sorted(set(files)) if f not in cache]
    for batch in chunks(need, 50):
        r = wm.api(wm.COMMONS_API, {"action": "query", "titles": "|".join("File:" + f for f in batch),
                                    "prop": "imageinfo", "iiprop": "extmetadata|url",
                                    "iiextmetadatafilter": "Artist|LicenseShortName|LicenseUrl|Credit"})
        if not r:
            continue
        q = r.get("query", {})
        norm = {x["to"]: x["from"] for x in q.get("normalized", [])}
        redir = {x["to"]: x["from"] for x in q.get("redirects", [])}
        for p in q.get("pages", []):
            t = redir.get(p["title"], p["title"])
            orig = norm.get(t, t).split(":", 1)[1]
            ii = (p.get("imageinfo") or [{}])[0]
            md = ii.get("extmetadata", {})
            author = strip_html(md.get("Artist", {}).get("value")) or strip_html(md.get("Credit", {}).get("value"))
            cache[orig] = {
                "author": (author or "desconhecido")[:160],
                "license": strip_html(md.get("LicenseShortName", {}).get("value")) or "ver página do arquivo",
                "url": ii.get("descriptionurl") or "https://commons.wikimedia.org/wiki/File:" + wm.norm_file(orig),
            }
    return cache


def credits(db):
    entries = {}
    for c in ALL_CLUBS:
        v = db["clubs"].get(c["id"], {})
        cr = v.get("crest")
        if cr and v.get("crestDone") and os.path.exists(os.path.join(MEDIA, "crests", c["id"] + ".webp")):
            entries[f"crests/{c['id']}.webp"] = (cr["file"], cr["wiki"], "crests")
    for q, v in db.get("venues", {}).items():
        if v.get("imgDone") and os.path.exists(os.path.join(MEDIA, "stadiums", q + ".webp")):
            entries[f"stadiums/{q}.webp"] = (v["imgDone"], "commons", "stadiums")
    for key, v in db.get("comps", {}).items():
        lg = v.get("logo")
        if lg and os.path.exists(os.path.join(MEDIA, "comps", key + ".webp")):
            entries[f"comps/{key}.webp"] = (lg["file"], lg["wiki"], "comps")
    meta = db.setdefault("commonsMeta", {})
    commons_meta([wm.norm_file(f).replace("_", " ") for f, w, _ in entries.values() if w == "commons"], meta)
    out = {}
    for path, (f, w, kind) in sorted(entries.items()):
        fn = wm.norm_file(f).replace("_", " ")
        if w == "commons":
            m = meta.get(fn) or {}
            out[path] = {"file": fn, "author": m.get("author", "desconhecido"),
                         "license": m.get("license", "ver página do arquivo"),
                         "url": m.get("url") or "https://commons.wikimedia.org/wiki/File:" + wm.norm_file(f)}
        else:
            out[path] = {"file": fn, "author": NONFREE_AUTHOR.get(kind, "marca registrada"),
                         "license": "uso não livre (Wikipedia)",
                         "url": "https://en.wikipedia.org/wiki/File:" + wm.norm_file(f)}
    save(DATA, db)
    with open(CREDITS, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1, sort_keys=True)
    print(f"credits: {len(out)} arquivos -> {CREDITS}")


# ---------------------------------------------------------------- conferência visual
def qa(db):
    """Folhas de contato em /tmp/claude-0/qa/ (escudos em fundo escuro e claro, estádios)."""
    Image = _img()
    from PIL import ImageDraw
    os.makedirs(QA_DIR, exist_ok=True)
    ids = [c["id"] for c in ALL_CLUBS]
    for bg, tag in (((12, 23, 18), "dark"), ((240, 240, 236), "light")):
        for part in range(0, len(ids), 60):
            sub = ids[part:part + 60]
            cols, cell = 10, 120
            rows = (len(sub) + cols - 1) // cols
            sheet = Image.new("RGB", (cols * cell, rows * (cell + 14)), bg)
            d = ImageDraw.Draw(sheet)
            for i, cid in enumerate(sub):
                x, y = (i % cols) * cell, (i // cols) * (cell + 14)
                p = os.path.join(MEDIA, "crests", cid + ".webp")
                if os.path.exists(p):
                    im = Image.open(p).convert("RGBA").resize((100, 100), Image.LANCZOS)
                    sheet.paste(im, (x + 10, y + 4), im)
                d.text((x + 4, y + cell - 4), cid[:18], fill=(255, 80, 80) if tag == "dark" else (160, 0, 0))
            sheet.save(os.path.join(QA_DIR, f"crests_{tag}_{part // 60}.png"))
    venues = sorted({db["clubs"][c].get("venue") for c in ids if db["clubs"].get(c, {}).get("venue")})
    files = [q for q in venues if os.path.exists(os.path.join(MEDIA, "stadiums", q + ".webp"))]
    for part in range(0, len(files), 30):
        sub = files[part:part + 30]
        cols, cw, ch = 5, 256, 144
        rows = (len(sub) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * cw, rows * (ch + 14)), (20, 20, 20))
        d = ImageDraw.Draw(sheet)
        for i, q in enumerate(sub):
            x, y = (i % cols) * cw, (i // cols) * (ch + 14)
            im = Image.open(os.path.join(MEDIA, "stadiums", q + ".webp")).resize((cw - 4, ch), Image.LANCZOS)
            sheet.paste(im, (x + 2, y))
            v = db["venues"].get(q, {})
            d.text((x + 4, y + ch), f"{q} {(v.get('labelPt') or v.get('labelEn') or '')[:30]}", fill=(255, 255, 0))
        sheet.save(os.path.join(QA_DIR, f"stadiums_{part // 30}.png"))
    comps_ = [k for k in COMPS if os.path.exists(os.path.join(MEDIA, "comps", k + ".webp"))]
    if comps_:
        sheet = Image.new("RGB", (len(comps_) * 140, 280), (12, 23, 18))
        sheet.paste(Image.new("RGB", (len(comps_) * 140, 140), (240, 240, 236)), (0, 140))
        for i, k in enumerate(comps_):
            im = Image.open(os.path.join(MEDIA, "comps", k + ".webp")).convert("RGBA").resize((120, 120))
            sheet.paste(im, (i * 140 + 10, 10), im)
            sheet.paste(im, (i * 140 + 10, 150), im)
        sheet.save(os.path.join(QA_DIR, "comps.png"))
    print(f"qa: folhas em {QA_DIR}")


def main():
    stages = sys.argv[1:] or ["all"]
    force = "--force" in stages
    stages = [s for s in stages if not s.startswith("--")]
    if stages == ["all"]:
        stages = ["resolve", "entities", "venues", "info", "crests", "stadiums", "comps", "credits", "qa"]
    db = load(DATA, {})
    t0 = time.time()
    for st in stages:
        if st == "resolve":
            resolve(db)
        elif st == "entities":
            entities(db)
        elif st == "venues":
            venues_stage(db)
        elif st == "info":
            info_stage(db)
        elif st == "crests":
            crests(db, force)
        elif st == "stadiums":
            stadiums(db, force)
        elif st == "comps":
            comps(db)
        elif st == "credits":
            credits(db)
        elif st == "qa":
            qa(db)
        else:
            print(f"etapa desconhecida: {st}")
    print(f"pronto em {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
