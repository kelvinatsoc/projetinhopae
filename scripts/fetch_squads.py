# -*- coding: utf-8 -*-
"""
Etapa 1: baixa da Wikipedia (inglês) o elenco atual e os dados básicos de cada
clube do catálogo, e enriquece os jogadores com dados do Wikidata
(data de nascimento, posição, altura, pé preferido e "fama" = nº de idiomas
em que o jogador tem artigo).

Saída: scripts/cache/raw.json  (usado pela etapa 2, build_database.py)

Uso:
    python3 scripts/fetch_squads.py
"""
import json
import os
import re
import sys
import time

import requests

sys.path.insert(0, os.path.dirname(__file__))
from clubs_catalog import ALL_CLUBS  # noqa: E402

WP_API = "https://en.wikipedia.org/w/api.php"
WD_SPARQL = "https://query.wikidata.org/sparql"
WP_RAW = "https://en.wikipedia.org/w/index.php"
WD_API = "https://www.wikidata.org/w/api.php"
HEADERS = {"User-Agent": "projetinhopae-football-manager/1.0 (https://github.com/kelvinatsoc/projetinhopae)"}
CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")
OUT = os.path.join(CACHE_DIR, "raw.json")

session = requests.Session()
session.headers.update(HEADERS)


def get(url, params, tries=6):
    """GET que respeita limites de taxa (HTTP 429 -> espera e tenta de novo)."""
    for i in range(tries):
        try:
            r = session.get(url, params=params, timeout=60)
            if r.status_code == 200:
                return r
            if r.status_code == 404:
                return None
            wait = int(r.headers.get("Retry-After", "0") or 0) or 5 * (2 ** i)
            print(f"  HTTP {r.status_code}; aguardando {wait}s", file=sys.stderr)
            time.sleep(min(wait, 120))
        except requests.RequestException as e:
            print(f"  erro {e}", file=sys.stderr)
            time.sleep(5 * (i + 1))
    raise RuntimeError(f"falhou: {url} {params}")


# ---------------------------------------------------------------- wikitext
def fetch_wikitext(club_id, title):
    """Wikitext de um artigo (com cache em disco e seguindo #REDIRECT)."""
    path = os.path.join(CACHE_DIR, "wikitext", club_id + ".txt")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return f.read() or None
    text = None
    for _ in range(3):
        r = get(WP_RAW, {"title": title, "action": "raw"})
        text = r.text if r is not None else None
        m = re.match(r"\s*#REDIRECT\s*\[\[([^\]|#]+)", text or "", re.I)
        if not m:
            break
        title = m.group(1).strip()
        time.sleep(1)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text or "")
    time.sleep(1.2)
    return text


REF_RE = re.compile(r"<ref[^>/]*/>|<ref[^>]*>.*?</ref>", re.S | re.I)
COMMENT_RE = re.compile(r"<!--.*?-->", re.S)


def strip_markup(s):
    s = REF_RE.sub("", s)
    s = COMMENT_RE.sub("", s)
    s = re.sub(r"\{\{\s*(?:nowrap|small|nobr)\s*\|([^{}]*)\}\}", r"\1", s, flags=re.I)
    s = re.sub(r"\{\{\s*formatnum:\s*([^{}]*)\}\}", r"\1", s, flags=re.I)
    s = re.sub(r"\{\{\s*sortname\s*\|([^|{}]*)\|([^|{}]*)(\|[^{}]*)?\}\}", r"\1 \2", s, flags=re.I)
    s = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"<br\s*/?>", ", ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("'''", "").replace("''", "")
    return re.sub(r"\s+", " ", s).strip(" ,;")


def parse_infobox(text):
    info = {}
    m = re.search(r"\{\{\s*Infobox (?:football|soccer) club", text, re.I)
    if not m:
        return info
    chunk = text[m.start(): m.start() + 12000]
    keys = ["fullname", "nickname", "short name", "founded", "ground", "capacity",
            "body1", "shorts1", "socks1", "leftarm1", "pattern_b1"]
    for k in keys:
        mm = re.search(r"^\s*\|\s*" + re.escape(k) + r"\s*=\s*(.*)$", chunk, re.M | re.I)
        if mm:
            info[k] = mm.group(1).strip()
    if "capacity" in info:
        num = re.search(r"\d[\d,\.\s]*\d|\d", strip_markup(info["capacity"]))
        info["capacity"] = int(re.sub(r"[^\d]", "", num.group(0))) if num else None
    for k in ("fullname", "nickname", "short name", "ground", "founded"):
        if k in info:
            info[k] = strip_markup(info[k])
    for k in ("body1", "shorts1", "socks1", "leftarm1"):
        if k in info:
            v = re.sub(r"[^0-9A-Fa-f]", "", info[k])
            info[k] = ("#" + v.upper()) if len(v) == 6 else None
    return info


HEADING_RE = re.compile(r"^(={2,6})\s*(.*?)\s*\1\s*$", re.M)
PLAYER_RE = re.compile(r"\{\{\s*(?:fs|football squad) player\s*\|", re.I)
SKIP_WORDS = ["loan", "notable", "former", "retired", "record", "captain", "staff",
              "hall of fame", "famous", "historic", "management", "coach", "president",
              "top scorer", "most appearances", "world cup", "honours", "legends"]
YOUTH_WORDS = ["reserve", "academy", "under-", "under ", "u-2", "u20", "u-23", "u23",
               "u-19", "u19", "u-17", "u17", "youth", "b team", "sub-", "development",
               "juvenil", "second team", "ii"]


def classify(heading):
    h = heading.lower()
    if any(w in h for w in SKIP_WORDS):
        return "skip"
    if any(w in h for w in YOUTH_WORDS):
        return "youth"
    return "first"


def split_template_args(body):
    """Divide os argumentos de um template respeitando [[...]] e {{...}} aninhados."""
    args, depth_l, depth_t, cur = [], 0, 0, []
    i = 0
    while i < len(body):
        c2 = body[i:i + 2]
        if c2 == "[[":
            depth_l += 1; cur.append(c2); i += 2; continue
        if c2 == "]]":
            depth_l -= 1; cur.append(c2); i += 2; continue
        if c2 == "{{":
            depth_t += 1; cur.append(c2); i += 2; continue
        if c2 == "}}":
            depth_t -= 1; cur.append(c2); i += 2; continue
        c = body[i]
        if c == "|" and depth_l == 0 and depth_t == 0:
            args.append("".join(cur)); cur = []
        else:
            cur.append(c)
        i += 1
    args.append("".join(cur))
    return args


def extract_template(text, start):
    """Retorna o conteúdo de um template que começa em text[start] ('{{')."""
    depth, i = 0, start
    while i < len(text):
        if text.startswith("{{", i):
            depth += 1; i += 2; continue
        if text.startswith("}}", i):
            depth -= 1; i += 2
            if depth == 0:
                return text[start + 2: i - 2], i
            continue
        i += 1
    return text[start + 2:], len(text)


def parse_name(raw):
    raw = COMMENT_RE.sub("", REF_RE.sub("", raw)).strip()
    link = None
    m = re.search(r"\{\{\s*sortname\s*\|([^{}]*)\}\}", raw, re.I)
    if m:
        parts = [p.strip() for p in m.group(1).split("|")]
        pos_parts = [p for p in parts if "=" not in p]
        flags = [p for p in parts if "=" in p]
        name = " ".join(x for x in pos_parts[:2] if x)
        if len(pos_parts) >= 3 and pos_parts[2]:
            link = pos_parts[2]
        elif not any(f.startswith("nolink") for f in flags):
            link = name
        return name, link
    m = re.search(r"\[\[([^|\]]+)(?:\|([^\]]+))?\]\]", raw)
    if m:
        link = m.group(1).strip()
        name = (m.group(2) or re.sub(r"\s*\(.*?\)\s*$", "", link)).strip()
        return name, link
    return strip_markup(raw), None


def parse_squads(text):
    # posições dos títulos de seção
    heads = [(m.start(), m.group(2)) for m in HEADING_RE.finditer(text)]
    players = []
    for m in PLAYER_RE.finditer(text):
        body, _ = extract_template(text, m.start())
        args = split_template_args(body)[1:]
        kv = {}
        for a in args:
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
        kind = classify(strip_markup(heading))
        other = strip_markup(kv.get("other", "")).lower()
        if kind == "skip" or "on loan to" in other:
            continue
        name, link = parse_name(kv["name"])
        if not name:
            continue
        players.append({
            "name": name, "link": link, "no": strip_markup(kv.get("no", "")),
            "nat": strip_markup(kv.get("nat", "")), "pos": strip_markup(kv.get("pos", "")).upper(),
            "kind": kind, "loanIn": "on loan from" in other,
        })
    return players


# ---------------------------------------------------------------- wikidata
def titles_to_qids(titles):
    """Mapeia títulos da Wikipedia -> QID do Wikidata (wbgetentities; redirects via API da Wikipedia)."""
    path = os.path.join(CACHE_DIR, "qids.json")
    out = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            out = json.load(f)
    norm = lambda t: t[0].upper() + t[1:]
    todo = sorted(t for t in titles if t and t not in out)
    for i in range(0, len(todo), 50):
        batch = [norm(t) for t in todo[i:i + 50]]
        r = get(WD_API, {"action": "wbgetentities", "sites": "enwiki", "titles": "|".join(batch),
                         "props": "sitelinks", "sitefilter": "enwiki", "format": "json"})
        for q, e in r.json().get("entities", {}).items():
            t = e.get("sitelinks", {}).get("enwiki", {}).get("title")
            if q.startswith("Q") and t:
                out[t] = q
        print(f"  qids {min(i + 50, len(todo))}/{len(todo)}")
        time.sleep(0.5)
    for t in todo:
        if t not in out and norm(t) in out:
            out[t] = out[norm(t)]
    missing = [t for t in todo if t not in out]
    print(f"  {len(missing)} títulos sem QID direto; resolvendo redirects...")
    for i in range(0, len(missing), 50):
        batch = missing[i:i + 50]
        r = get(WP_API, {"action": "query", "prop": "pageprops", "ppprop": "wikibase_item",
                         "titles": "|".join(batch), "redirects": 1, "format": "json", "formatversion": 2})
        q = r.json()["query"]
        alias = {}
        for n in q.get("normalized", []) + q.get("redirects", []):
            alias[n["from"]] = n["to"]
        found = {p["title"]: p.get("pageprops", {}).get("wikibase_item")
                 for p in q.get("pages", []) if not p.get("missing")}
        for t in batch:
            final = t
            for _ in range(3):
                final = alias.get(final, final)
            if found.get(final):
                out[t] = found[final]
        time.sleep(3)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    return out


SPARQL = """
SELECT ?item ?dob ?height ?sl
  (GROUP_CONCAT(DISTINCT ?posLabel; separator="|") AS ?positions)
  (SAMPLE(?footLabel) AS ?foot) WHERE {
  VALUES ?item { %s }
  OPTIONAL { ?item wdt:P569 ?dob. }
  OPTIONAL { ?item wdt:P2048 ?height. }
  OPTIONAL { ?item wikibase:sitelinks ?sl. }
  OPTIONAL { ?item wdt:P413 ?pos. ?pos rdfs:label ?posLabel. FILTER(LANG(?posLabel) = "en") }
  OPTIONAL { ?item wdt:P552 ?f. ?f rdfs:label ?footLabel. FILTER(LANG(?footLabel) = "en") }
} GROUP BY ?item ?dob ?height ?sl
"""


def wikidata_details(qids):
    path = os.path.join(CACHE_DIR, "details.json")
    out = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            out = json.load(f)
    qids = sorted(set(qids) - set(out))
    for i in range(0, len(qids), 150):
        batch = qids[i:i + 150]
        query = SPARQL % " ".join("wd:" + q for q in batch)
        r = None
        for t in range(4):
            try:
                r = session.post(WD_SPARQL, data={"query": query},
                                 headers={"Accept": "application/sparql-results+json"}, timeout=90)
                if r.status_code == 200:
                    break
                print(f"  SPARQL HTTP {r.status_code}", file=sys.stderr)
            except requests.RequestException as e:
                print(f"  SPARQL erro {e}", file=sys.stderr)
            time.sleep(3 * (t + 1))
        if not r or r.status_code != 200:
            print("  lote do wikidata falhou; seguindo sem ele", file=sys.stderr)
            continue
        for b in r.json()["results"]["bindings"]:
            q = b["item"]["value"].rsplit("/", 1)[-1]
            d = out.setdefault(q, {"dob": None, "height": None, "sl": 0, "positions": [], "foot": None})
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
            if b.get("positions", {}).get("value"):
                for p in b["positions"]["value"].split("|"):
                    if p and p not in d["positions"]:
                        d["positions"].append(p)
            if b.get("foot", {}).get("value") and not d["foot"]:
                d["foot"] = b["foot"]["value"]
        print(f"  wikidata {min(i + 150, len(qids))}/{len(qids)}")
        time.sleep(1)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    return out


def main():
    os.makedirs(CACHE_DIR, exist_ok=True)
    result = {"fetchedAt": time.strftime("%Y-%m-%d"), "clubs": {}}
    texts = {}
    for i, c in enumerate(ALL_CLUBS):
        texts[c["wiki"]] = fetch_wikitext(c["id"], c["wiki"])
        if (i + 1) % 10 == 0:
            print(f"wikitext {i + 1}/{len(ALL_CLUBS)}")

    all_links = set()
    for c in ALL_CLUBS:
        text = texts.get(c["wiki"])
        if not text:
            print(f"!! sem artigo: {c['id']} ({c['wiki']})")
            result["clubs"][c["id"]] = {"infobox": {}, "players": [], "missing": True}
            continue
        info = parse_infobox(text)
        players = parse_squads(text)
        # remove duplicados dentro do mesmo clube
        seen, uniq = set(), []
        for p in players:
            key = p["link"] or p["name"]
            if key in seen:
                continue
            seen.add(key)
            uniq.append(p)
        result["clubs"][c["id"]] = {"infobox": info, "players": uniq}
        for p in uniq:
            if p["link"]:
                all_links.add(p["link"])
        first = sum(1 for p in uniq if p["kind"] == "first")
        youth = sum(1 for p in uniq if p["kind"] == "youth")
        print(f"{c['id']:<26} elenco={first:>2} base={youth:>2}  estádio={info.get('ground', '?')}")

    print(f"\nresolvendo {len(all_links)} artigos de jogadores no Wikidata...")
    qmap = titles_to_qids(all_links)
    details = wikidata_details(qmap.values())
    for cid, c in result["clubs"].items():
        for p in c["players"]:
            q = qmap.get(p["link"]) if p["link"] else None
            p["qid"] = q
            if q and q in details:
                p.update(details[q])
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print(f"\nok -> {OUT}")


if __name__ == "__main__":
    main()
