# -*- coding: utf-8 -*-
"""Acesso educado e com cache às fontes do world-data (Wikipedia, Wikidata, TheSportsDB).

- Wikipedia: SÓ index.php?action=raw (nunca api.php), 1 requisição a cada 4 s;
- Wikidata (SPARQL / Special:EntityData): 1 a cada 3 s;
- TheSportsDB (chave gratuita "3"): 1 a cada 2 s.
O intervalo é compartilhado entre processos (arquivo de trava por host) e 429/5xx
fazem backoff exponencial (respeitando Retry-After). Tudo fica em scripts/cache/world/.
"""
from __future__ import annotations

import fcntl
import hashlib
import json
import os
import re
import time
import urllib.parse

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "scripts", "cache", "world")
UA = "LendasDaBaseBot/1.0 (https://github.com/kelvinatsoc/projetinhopae; uso pessoal) python-requests"
INTERVAL = {"wiki": 4.0, "wd": 3.0, "tsdb": 2.0, "img": 1.0}

session = requests.Session()
session.headers["User-Agent"] = UA


def _throttle(host):
    os.makedirs(CACHE, exist_ok=True)
    with open(os.path.join(CACHE, f".rate_{host}.lock"), "a+") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            f.seek(0)
            raw = f.read().strip()
            nxt = float(raw) if raw else 0.0
            now = time.time()
            if nxt > now:
                time.sleep(nxt - now)
            f.seek(0)
            f.truncate()
            f.write(repr(max(nxt, now) + INTERVAL[host]))
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def get(host, url, params=None, tries=7, **kw):
    wait = 10
    for _ in range(tries):
        _throttle(host)
        try:
            r = session.get(url, params=params, timeout=60, **kw)
        except requests.RequestException as e:
            print(f"  [{host}] erro {e}; aguardando {wait}s", flush=True)
            time.sleep(wait); wait = min(wait * 2, 600)
            continue
        if r.status_code == 429 or r.status_code >= 500:
            ra = r.headers.get("retry-after", "")
            w = int(ra) if ra.isdigit() else wait
            print(f"  [{host}] HTTP {r.status_code}; aguardando {w}s", flush=True)
            time.sleep(min(w, 900)); wait = min(wait * 2, 600)
            continue
        return r
    return None


def _cpath(kind, key, ext="json"):
    d = os.path.join(CACHE, kind)
    os.makedirs(d, exist_ok=True)
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", key)[:80]
    return os.path.join(d, f"{safe}-{hashlib.sha1(key.encode()).hexdigest()[:10]}.{ext}")


def wiki_raw(title, lang="en", offline=False):
    """Wikitext de um artigo (segue #REDIRECT). Retorna (texto, título_final) ou (None, title)."""
    path = _cpath(f"wt_{lang}", title)
    if os.path.exists(path):
        d = json.load(open(path, encoding="utf-8"))
        return d["text"], d["title"]
    if offline:
        return None, title
    t, text = title, None
    for _ in range(3):
        r = get("wiki", f"https://{lang}.wikipedia.org/w/index.php", {"title": t, "action": "raw"})
        if r is None:
            return None, title  # sem cache: tenta de novo numa próxima execução
        text = r.text if r.status_code == 200 else None
        m = re.match(r"\s*#REDIRECT\s*\[\[([^\]|#]+)", text or "", re.I)
        if not m:
            break
        t = m.group(1).strip()
    json.dump({"title": t, "text": text}, open(path, "w", encoding="utf-8"), ensure_ascii=False)
    return text, t


def tsdb(endpoint, offline=False, **params):
    key = endpoint + "?" + urllib.parse.urlencode(sorted(params.items()))
    path = _cpath("tsdb", key)
    if os.path.exists(path):
        return json.load(open(path, encoding="utf-8"))
    if offline:
        return None
    r = get("tsdb", f"https://www.thesportsdb.com/api/v1/json/3/{endpoint}", params)
    if r is None or r.status_code != 200:
        return None
    try:
        data = r.json() if r.text.strip() else {}
    except ValueError:
        return None
    json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False)
    return data


def sparql(query, cache_key):
    path = _cpath("sparql", cache_key)
    if os.path.exists(path):
        return json.load(open(path, encoding="utf-8"))
    wait = 10
    for _ in range(6):
        _throttle("wd")
        try:
            r = session.post("https://query.wikidata.org/sparql", data={"query": query},
                             headers={"Accept": "application/sparql-results+json"}, timeout=120)
        except requests.RequestException:
            time.sleep(wait); wait *= 2; continue
        if r.status_code == 200:
            rows = r.json()["results"]["bindings"]
            json.dump(rows, open(path, "w", encoding="utf-8"))
            return rows
        print(f"  [wd] HTTP {r.status_code}; aguardando {wait}s", flush=True)
        time.sleep(wait); wait = min(wait * 2, 600)
    return None


def download(url, host="img"):
    r = get(host, url)
    if r is None or r.status_code != 200:
        return None
    return r.content
