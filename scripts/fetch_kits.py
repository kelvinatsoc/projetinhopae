# -*- coding: utf-8 -*-
"""
Uniformes reais (titular, reserva e terceiro) de cada clube, desenhados como na Wikipedia.

A predefinição "Football kit" da Wikipedia em inglês monta o uniforme com cinco caixas
(geometria em pixels, 100x135):

    braço esquerdo   x=0   y=0   31x59     cor "leftarm"  + padrão "Kit left arm<p>.png"
    corpo            x=31  y=0   38x59     cor "body"     + padrão "Kit body<p>.png"
    braço direito    x=69  y=0   31x59     cor "rightarm" + padrão "Kit right arm<p>.png"
    calção           x=0   y=59  100x36    cor "shorts"   + padrão "Kit shorts<p>.png"
    meias            x=0   y=95  100x40    cor "socks"    + padrão "Kit socks<p>.png"

Cada caixa tem a cor de fundo, por cima o padrão (PNG transparente, quando existe) e por
cima de tudo o contorno/sombreado ("Kit left arm.svg", "Kit body.svg", "Kit right arm.svg",
"Kit shorts.svg", "Kit socks long.svg"). A infobox de clube não repassa "filetype", então os
padrões são sempre .png. Padrão inexistente na Commons = só a cor (igual à Wikipedia).

Fontes: infobox da Wikipedia em inglês (pattern_la1, body1, ...) e, para clubes brasileiros,
a "Info/Clube de futebol" da Wikipedia em português (skin1, skin_be1, corpo1, ...). Para cada
clube usamos a fonte mais atual (ano da temporada no nome dos padrões, ex.: _flamengo26h).

Saídas:
  src/data/kits.json               {clubId: [{name, la, b, ra, sh, so, pla?, pb?, pra?, psh?, pso?}]}
  public/media/kits/*.png|svg      padrões e contornos (nomes saneados, minúsculos)
  public/media/kits/credits.json   {"kits/<arquivo>": {file, author, license, url}}

Uso (retomável; cache de consultas em $KITS_CACHE, padrão /tmp/lendas_kits):
    timeout 540 python3 scripts/fetch_kits.py [parse|info|download|build|qa ...]
"""
from __future__ import annotations

import html
import json
import os
import re
import sys
import tempfile
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm  # noqa: E402
from clubs_catalog import ALL_CLUBS, BR_CLUBS  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCACHE = os.path.join(ROOT, "scripts", "cache")
MEDIA = os.path.join(ROOT, "public", "media", "kits")
OUT_JSON = os.path.join(ROOT, "src", "data", "kits.json")
CREDITS = os.path.join(MEDIA, "credits.json")
WORK = os.environ.get("KITS_CACHE", os.path.join(tempfile.gettempdir(), "lendas_kits"))
EN_API = "https://en.wikipedia.org/w/api.php"
PT_API = "https://pt.wikipedia.org/w/api.php"
CUR_SEASON = 26  # temporada atual (2026)

PARTS = ("la", "b", "ra", "sh", "so")
# prefixo do arquivo de padrão de cada parte (Template:Football kit)
PREFIX = {"la": "Kit left arm", "b": "Kit body", "ra": "Kit right arm", "sh": "Kit shorts", "so": "Kit socks"}
# contornos/sombreados desenhados por cima de cada parte
OVERLAYS = {"la": "Kit left arm.svg", "b": "Kit body.svg", "ra": "Kit right arm.svg",
            "sh": "Kit shorts.svg", "so": "Kit socks long.svg"}
EN_COLOR = {"la": "leftarm", "b": "body", "ra": "rightarm", "sh": "shorts", "so": "socks"}
PT_COLOR = {"la": "braçoesquerdo", "b": "corpo", "ra": "braçodireito", "sh": "calções", "so": "meias"}
PT_SKIN = {"la": "skin_be", "b": "skin", "ra": "skin_bd", "sh": "skin_calção", "so": "skin_meia"}
KIT_NAMES = ("Titular", "Reserva", "Terceiro")
# artigos do catálogo que apontam para outro clube homônimo
TITLE_FIX = {"barra-sc": "Barra Futebol Clube (SC)"}

CSS_COLORS = {
    "black": "000000", "white": "FFFFFF", "red": "FF0000", "green": "008000", "blue": "0000FF",
    "yellow": "FFFF00", "orange": "FFA500", "purple": "800080", "navy": "000080", "maroon": "800000",
    "gray": "808080", "grey": "808080", "silver": "C0C0C0", "gold": "FFD700", "lime": "00FF00",
    "aqua": "00FFFF", "cyan": "00FFFF", "teal": "008080", "olive": "808000", "fuchsia": "FF00FF",
    "magenta": "FF00FF", "pink": "FFC0CB", "brown": "A52A2A", "skyblue": "87CEEB", "darkblue": "00008B",
    "darkred": "8B0000", "darkgreen": "006400", "lightblue": "ADD8E6", "royalblue": "4169E1",
    "crimson": "DC143C", "violet": "EE82EE", "indigo": "4B0082", "beige": "F5F5DC", "khaki": "F0E68C",
    "darkgray": "A9A9A9", "darkgrey": "A9A9A9", "lightgray": "D3D3D3", "lightgrey": "D3D3D3",
    "turquoise": "40E0D0", "salmon": "FA8072", "tan": "D2B48C", "coral": "FF7F50", "ivory": "FFFFF0",
    "dodgerblue": "1E90FF", "steelblue": "4682B4", "midnightblue": "191970", "firebrick": "B22222",
}


# ---------------------------------------------------------------- utilidades
def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save(path, obj, indent=1):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=indent, sort_keys=True)
    os.replace(tmp, path)


def chunks(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def strip_html(s):
    s = re.sub(r"<[^>]+>", "", s or "")
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def title_key(name: str) -> str:
    """Nome canônico de arquivo da Wikimedia ("Kit body_x.png" -> "Kit body x.png")."""
    n = wm.norm_file(name).replace("_", " ").strip()
    return n[:1].upper() + n[1:]


def local_name(fname: str) -> str:
    """Nome saneado (minúsculo, ASCII) do arquivo em public/media/kits/."""
    base, ext = os.path.splitext(title_key(fname))
    base = unicodedata.normalize("NFKD", base).encode("ascii", "ignore").decode()
    base = re.sub(r"[^a-z0-9]+", "_", base.lower()).strip("_")
    return f"{base}{ext.lower()}"


def norm_color(v: str | None) -> str | None:
    """Cor da infobox -> "#RRGGBB" (aceita sem #, 3 dígitos e nomes CSS)."""
    if not v:
        return None
    s = v.strip().strip(";").strip().lower().replace(" ", "")
    s = s.lstrip("#")
    if s in CSS_COLORS:
        return "#" + CSS_COLORS[s]
    if re.fullmatch(r"[0-9a-f]{3}", s):
        s = "".join(c * 2 for c in s)
    if re.fullmatch(r"[0-9a-f]{8}", s):
        s = s[:6]
    if re.fullmatch(r"[0-9a-f]{6}", s):
        return "#" + s.upper()
    return None


# ---------------------------------------------------------------- leitura de predefinições
def clean_wikitext(t: str) -> str:
    t = re.sub(r"<!--.*?-->", "", t, flags=re.S)
    t = re.sub(r"<ref[^>/]*/>", "", t, flags=re.I)
    t = re.sub(r"<ref[^>]*>.*?</ref>", "", t, flags=re.I | re.S)
    return t


def template_params(text: str, names_re: str) -> dict | None:
    """Parâmetros (nível superior) da primeira predefinição cujo nome casa com names_re."""
    m = re.search(r"\{\{\s*(?:" + names_re + r")\s*(?=\||\}\}|\n)", text, re.I)
    if not m:
        return None
    i, depth, start = m.end(), 1, m.end()
    parts, cur = [], start
    sq = 0
    while i < len(text) and depth > 0:
        two = text[i:i + 2]
        if two == "{{":
            depth += 1
            i += 2
            continue
        if two == "}}":
            depth -= 1
            if depth == 0:
                parts.append(text[cur:i])
                break
            i += 2
            continue
        if two == "[[":
            sq += 1
            i += 2
            continue
        if two == "]]":
            sq = max(0, sq - 1)
            i += 2
            continue
        if text[i] == "|" and depth == 1 and sq == 0:
            parts.append(text[cur:i])
            cur = i + 1
        i += 1
    out = {}
    for p in parts[1:] if parts and not parts[0].strip() else parts:
        if "=" not in p:
            continue
        k, v = p.split("=", 1)
        out[k.strip()] = v.strip()
    return out


EN_INFOBOX = r"Infobox[ _]+football[ _]+club|Football[ _]+club[ _]+infobox|Infobox[ _]+Football[ _]+club"
PT_INFOBOX = r"Info/Clube[ _]+de[ _]+futebol|Info/Clube[ _]+futebol"


def kits_from_params(p: dict, pat_keys: dict, col_keys: dict, en: bool) -> list:
    """Lista de até 3 uniformes {la..so: cor|None, pla..pso: padrão|None}."""
    kits = []
    for n in (1, 2, 3):
        keys = [f"{pat_keys[x]}{n}" for x in PARTS] + [f"{col_keys[x]}{n}" for x in PARTS]
        if not any(p.get(k, "").strip() for k in keys):
            kits.append(None)
            continue
        k = {}
        for x in PARTS:
            k[x] = norm_color(p.get(f"{col_keys[x]}{n}"))
            pat = p.get(f"{pat_keys[x]}{n}")
            pat = pat.strip() if pat else ""
            # "_unknown" (padrão da infobox quando pattern_b falta) é um "?" -> ignoramos
            if pat.lower() in ("", "_unknown", "none"):
                pat = None
            k["p" + x] = pat
        kits.append(k)
    while kits and kits[-1] is None:
        kits.pop()
    return kits


def season_of(pattern: str | None) -> int | None:
    """Ano (2 dígitos, fim da temporada) contido no nome do padrão. Ex.: _fla2526h -> 26."""
    if not pattern:
        return None
    best = None
    for g in re.findall(r"(?<!\d)(\d{2}|\d{4}|\d{6}|\d{8})(?!\d)", pattern):
        y = None
        if len(g) == 2:
            y = int(g)
        elif len(g) == 4:
            a, b = int(g[:2]), int(g[2:])
            if b == (a + 1) % 100 or g[:2] in ("19", "20"):
                y = b
        elif len(g) == 6:  # 202526 / 2025-26
            if g[:2] in ("19", "20"):
                y = int(g[4:])
        elif len(g) == 8:  # 20252026
            if g[:2] in ("19", "20") and g[4:6] in ("19", "20"):
                y = int(g[6:])
        if y is not None and 0 <= y <= CUR_SEASON + 1:
            best = y if best is None else max(best, y)
    return best


def kits_season(kits: list) -> tuple:
    """(temporada do uniforme titular, maior temporada citada) para comparar fontes."""
    home = None
    allmax = None
    for i, k in enumerate(kits):
        if not k:
            continue
        for x in PARTS:
            s = season_of(k["p" + x])
            if s is None:
                continue
            allmax = s if allmax is None else max(allmax, s)
            if i == 0:
                home = s if home is None else max(home, s)
    return home, allmax


# ---------------------------------------------------------------- etapa 1: leitura das infoboxes
def work(name):
    return os.path.join(WORK, name)


def resolve_titles() -> dict:
    """{clubId: {"en": título atual no enwiki|None, "pt": título no ptwiki|None}} (em cache).
    Segue redirecionamentos; se o título do catálogo não existir, tenta o nome oficial."""
    path = work("titles.json")
    out = load(path, None)
    if out is not None:
        return out
    cands = {}
    for c in ALL_CLUBS:
        first = TITLE_FIX.get(c["id"], c["wiki"])
        cands[c["id"]] = [first] + ([c["full"]] if c.get("full") and c["id"] not in TITLE_FIX else [])
    resolved = {}
    allt = sorted({t for ts in cands.values() for t in ts})
    for batch in chunks(allt, 50):
        r = wm.api(EN_API, {"action": "query", "titles": "|".join(batch), "redirects": 1})
        q = (r or {}).get("query", {})
        step = {}
        for x in q.get("normalized", []):
            step[x["from"]] = x["to"]
        redir = {x["from"]: x["to"] for x in q.get("redirects", [])}
        exists = {p["title"] for p in q.get("pages", []) if not p.get("missing") and not p.get("invalid")}
        for t in batch:
            u = step.get(t, t)
            u = redir.get(u, u)
            resolved[t] = u if u in exists else None
    out = {}
    for c in ALL_CLUBS:
        en = next((resolved.get(t) for t in cands[c["id"]] if resolved.get(t)), None)
        out[c["id"]] = {"en": en, "pt": None}
    br = {out[c["id"]]["en"]: c["id"] for c in BR_CLUBS if out[c["id"]]["en"]}
    for batch in chunks(sorted(br), 50):
        r = wm.api(wm.WIKIDATA_API, {"action": "wbgetentities", "sites": "enwiki", "titles": "|".join(batch),
                                     "props": "sitelinks", "sitefilter": "enwiki|ptwiki"})
        for e in (r or {}).get("entities", {}).values():
            sl = e.get("sitelinks", {})
            if "enwiki" in sl and "ptwiki" in sl and sl["enwiki"]["title"] in br:
                out[br[sl["enwiki"]["title"]]]["pt"] = sl["ptwiki"]["title"]
    save(path, out)
    return out


def raw_page(wiki: str, title: str, cache_path: str | None) -> str:
    """Wikitexto de um artigo (usa o cache dos outros scripts; senão baixa para $KITS_CACHE)."""
    if cache_path and os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as f:
            t = f.read()
        if t.strip():
            return t
    safe = re.sub(r"[^\w-]+", "_", title)
    mine = work(f"{wiki}_{safe}.txt")
    if os.path.exists(mine):
        with open(mine, encoding="utf-8") as f:
            return f.read()
    text = ""
    for _ in range(3):
        r = wm.get(f"https://{wiki}.wikipedia.org/w/index.php", {"title": title, "action": "raw"})
        text = r.text if r is not None and r.status_code == 200 else ""
        m = re.match(r"\s*#(?:REDIRECT|REDIRECIONAMENTO)\s*\[\[([^\]|#]+)", text, re.I)
        if not m:
            break
        title = m.group(1).strip()
    os.makedirs(WORK, exist_ok=True)
    with open(mine, "w", encoding="utf-8") as f:
        f.write(text)
    return text


def parse():
    """Lê as infoboxes (en + pt) e escolhe, por clube, a fonte mais atual."""
    titles = resolve_titles()
    specs = {}
    for c in ALL_CLUBS:
        cid = c["id"]
        en_title = titles[cid]["en"] or c["wiki"]
        shared = None if cid in TITLE_FIX else os.path.join(SCACHE, "wikitext", cid + ".txt")
        en_t = raw_page("en", en_title, shared)
        en_p = template_params(clean_wikitext(en_t), EN_INFOBOX) or {}
        en_k = kits_from_params(en_p, {x: "pattern_" + x for x in PARTS}, EN_COLOR, True)
        pt_k = []
        if titles[cid]["pt"]:
            title = titles[cid]["pt"]
            pt_t = raw_page("pt", title, os.path.join(SCACHE, "pt", re.sub(r"[^\w\-]+", "_", title) + ".txt"))
            pt_p = template_params(clean_wikitext(pt_t), PT_INFOBOX) or {}
            if pt_p.get("modelo", "padrão").strip().lower() in ("padrão", "padrao", ""):
                pt_k = kits_from_params(pt_p, PT_SKIN, PT_COLOR, False)
        en_s, pt_s = kits_season(en_k), kits_season(pt_k)
        src = "en"
        if not any(en_k) and any(pt_k):
            src = "pt"
        elif any(pt_k):
            eh, ea = en_s
            ph, pa = pt_s
            # pt só ganha se o titular (ou, sem ano no titular, qualquer uniforme) for mais novo
            e_key = eh if eh is not None else ea
            p_key = ph if ph is not None else pa
            if p_key is not None and (e_key is None or p_key > e_key):
                src = "pt"
        specs[cid] = {"src": src, "en": en_k, "pt": pt_k, "enSeason": en_s, "ptSeason": pt_s}
    save(work("specs.json"), specs)
    n_en = sum(1 for s in specs.values() if s["src"] == "en" and any(s["en"]))
    n_pt = sum(1 for s in specs.values() if s["src"] == "pt")
    none = [k for k, s in specs.items() if not any(s[s["src"]])]
    print(f"parse: {len(specs)} clubes; fonte en={n_en} pt={n_pt}; sem dados={len(none)} {none}")
    return specs


# ---------------------------------------------------------------- etapa 2: arquivos na Wikimedia
def chosen(specs: dict) -> dict:
    """{clubId: lista de uniformes da fonte escolhida (sem buracos)}."""
    return {cid: [k for k in s[s["src"]] if k] for cid, s in specs.items()}


def pattern_file(part: str, pattern: str) -> str:
    return title_key(f"{PREFIX[part]}{pattern}.png")


def needed_files(specs: dict) -> list:
    files = set(title_key(v) for v in OVERLAYS.values())
    for kits in chosen(specs).values():
        for k in kits:
            for x in PARTS:
                if k["p" + x]:
                    files.add(pattern_file(x, k["p" + x]))
    return sorted(files)


def query_info(api: str, names: list, info: dict, repo: str, path: str | None = None):
    """imageinfo (tamanho, tipo, URL e metadados de autoria) em lotes de 50."""
    for bi, batch in enumerate(chunks(names, 50)):
        if path and bi:
            save(path, info)
        r = wm.api(api, {"action": "query", "titles": "|".join("File:" + n for n in batch), "redirects": 1,
                         "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata",
                         "iiextmetadatafilter": "Artist|LicenseShortName|LicenseUrl|Credit"})
        if not r:
            print(f"  falha na consulta ({len(batch)} arquivos)")
            continue
        q = r.get("query", {})
        back = {}
        for n in batch:
            back["File:" + n] = n
        for x in q.get("normalized", []):
            if x["from"] in back:
                back[x["to"]] = back[x["from"]]
        for x in q.get("redirects", []):
            if x["from"] in back:
                back[x["to"]] = back[x["from"]]
        for p in q.get("pages", []):
            orig = back.get(p["title"])
            if orig is None:
                continue
            ii = (p.get("imageinfo") or [None])[0]
            if p.get("missing") and not ii or not ii:
                info.setdefault(orig, {"exists": False})
                continue
            md = ii.get("extmetadata", {})
            info[orig] = {
                "exists": True, "repo": repo, "title": p["title"][5:],
                "url": ii.get("url"), "w": ii.get("width"), "h": ii.get("height"), "mime": ii.get("mime"),
                "desc": ii.get("descriptionurl"),
                "author": strip_html(md.get("Artist", {}).get("value")) or
                strip_html(md.get("Credit", {}).get("value")) or "desconhecido",
                "license": strip_html(md.get("LicenseShortName", {}).get("value")) or "ver página do arquivo",
            }


def info(specs: dict | None = None) -> dict:
    specs = specs or load(work("specs.json"), None) or parse()
    path = work("info.json")
    inf = load(path, {})
    need = [n for n in needed_files(specs) if n not in inf]
    print(f"info: {len(need)} arquivos a consultar (de {len(needed_files(specs))})")
    query_info(wm.COMMONS_API, need, inf, "commons", path)
    save(path, inf)
    # o que não está na Commons pode ser arquivo local da Wikipedia em inglês
    miss = [n for n in needed_files(specs) if not inf.get(n, {}).get("exists") and not inf.get(n, {}).get("enChecked")]
    if miss:
        query_info(EN_API, miss, inf, "en", path)
        for n in miss:  # a API do enwiki também enxerga a Commons: confere pelo endereço
            if inf.get(n, {}).get("exists") and "commons.wikimedia.org" in (inf[n].get("desc") or ""):
                inf[n]["repo"] = "commons"
            inf.setdefault(n, {"exists": False})["enChecked"] = True
    for n in need:
        inf.setdefault(n, {"exists": False})
    save(path, inf)
    ok = sum(1 for n in needed_files(specs) if inf.get(n, {}).get("exists"))
    print(f"info: {ok} existem, {len(needed_files(specs)) - ok} inexistentes")
    return inf


# ---------------------------------------------------------------- etapa 3: download
def local_names(inf: dict) -> dict:
    """{arquivo na Wikimedia: nome local} sem colisões (sistemas de arquivos sem caixa)."""
    out, used = {}, {}
    for n in sorted(k for k, v in inf.items() if v.get("exists")):
        base = local_name(n)
        name, i = base, 2
        while name in used and used[name] != n:
            stem, ext = os.path.splitext(base)
            name = f"{stem}-{i}{ext}"
            i += 1
        used[name] = n
        out[n] = name
    return out


def valid_file(data: bytes | None, name: str) -> bool:
    if not data:
        return False
    if name.endswith(".png"):
        return data[:8] == b"\x89PNG\r\n\x1a\n"
    if name.endswith(".svg"):
        return b"<svg" in data[:4000]
    return True


def download(specs: dict | None = None):
    specs = specs or load(work("specs.json"), None) or parse()
    inf = load(work("info.json"), None) or info(specs)
    names = local_names(inf)
    os.makedirs(MEDIA, exist_ok=True)
    need = [n for n in needed_files(specs) if n in names]
    todo = [n for n in need if not os.path.exists(os.path.join(MEDIA, names[n]))]
    print(f"download: {len(todo)} de {len(need)} arquivos")
    failed = load(work("failed.json"), {})
    for i, n in enumerate(todo):
        meta = inf[n]
        wiki = "en.wikipedia.org" if meta.get("repo") == "en" else "commons.wikimedia.org"
        data = wm.download(meta.get("title") or n, wiki=wiki)
        if not valid_file(data, names[n]):
            failed[n] = failed.get(n, 0) + 1
            print(f"  falhou: {n}")
            continue
        with open(os.path.join(MEDIA, names[n]), "wb") as f:
            f.write(data)
        failed.pop(n, None)
        if (i + 1) % 50 == 0:
            print(f"  {i + 1}/{len(todo)}")
            save(work("failed.json"), failed)
    save(work("failed.json"), failed)
    have = sum(1 for n in need if os.path.exists(os.path.join(MEDIA, names[n])))
    print(f"download: {have}/{len(need)} arquivos em {MEDIA}")
