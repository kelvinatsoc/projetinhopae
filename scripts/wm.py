"""Acesso "educado" aos servidores da Wikimedia (Commons, Wikidata, Wikipedia).

Todos os scripts de coleta usam este módulo para respeitar a política de robôs:
- User-Agent identificado;
- intervalo mínimo entre requisições, compartilhado entre processos (arquivo de trava);
- respeito ao Retry-After quando o servidor responde 429/5xx (a espera vale para todos os processos).

As miniaturas precisam usar larguras padronizadas (https://w.wiki/GHai), senão o servidor
responde 400. Use as constantes de THUMB_WIDTHS.
"""
from __future__ import annotations

import fcntl
import os
import time
import urllib.parse

import requests

UA = "LendasDaBaseBot/1.0 (https://github.com/kelvinatsoc/projetinhopae) python-requests"
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
LOCK = os.path.join(CACHE, ".wm_rate.lock")
MIN_INTERVAL = float(os.environ.get("WM_INTERVAL", "0.5"))
THUMB_WIDTHS = (120, 250, 330, 500, 960, 1280)

session = requests.Session()
session.headers["User-Agent"] = UA


def _with_lock(fn):
    os.makedirs(CACHE, exist_ok=True)
    with open(LOCK, "a+") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            f.seek(0)
            raw = f.read().strip()
            nxt = float(raw) if raw else 0.0
            new = fn(nxt)
            f.seek(0)
            f.truncate()
            f.write(repr(new))
            f.flush()
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def _throttle():
    """Espera até o próximo horário livre (compartilhado entre processos)."""
    def step(nxt):
        now = time.time()
        if nxt > now:
            time.sleep(nxt - now)
        return max(nxt, now) + MIN_INTERVAL
    _with_lock(step)


def _penalize(seconds: float):
    """Empurra o próximo horário livre para frente (todos os processos esperam)."""
    _with_lock(lambda nxt: max(nxt, time.time() + seconds))


def get(url: str, params: dict | None = None, tries: int = 8, **kw) -> requests.Response | None:
    """GET com limite de taxa e novas tentativas. Devolve None se não conseguir.
    Respostas 404/400 são devolvidas normalmente (quem chama decide)."""
    for i in range(tries):
        _throttle()
        try:
            r = session.get(url, params=params, timeout=60, **kw)
        except requests.RequestException:
            time.sleep(2 * (i + 1))
            continue
        if r.status_code == 429 or r.status_code >= 500:
            ra = r.headers.get("retry-after", "")
            wait = int(ra) if ra.isdigit() else 5 * (i + 1)
            wait = min(max(wait, 3), 900)
            _penalize(wait)
            continue
        return r
    return None


def norm_file(name: str) -> str:
    name = urllib.parse.unquote(name.strip())
    for pre in ("File:", "Ficheiro:", "Arquivo:", "Imagem:", "Image:", "file:"):
        if name.startswith(pre):
            name = name[len(pre):]
    return name.replace(" ", "_")


def file_url(name: str, width: int | None = None, wiki: str = "commons.wikimedia.org") -> str:
    """URL de Special:FilePath (redireciona para o arquivo ou para a miniatura).
    wiki="en.wikipedia.org" serve para arquivos locais (não livres) da Wikipedia em inglês."""
    if width is not None and width not in THUMB_WIDTHS:
        raise ValueError(f"largura {width} não é padrão: use uma de {THUMB_WIDTHS}")
    u = f"https://{wiki}/wiki/Special:FilePath/{urllib.parse.quote(norm_file(name))}"
    return u + (f"?width={width}" if width else "")


def download(name: str, width: int | None = None, wiki: str = "commons.wikimedia.org") -> bytes | None:
    """Baixa um arquivo (ou miniatura) da Wikimedia. None se não existir/falhar."""
    r = get(file_url(name, width, wiki))
    if r is None or r.status_code != 200:
        return None
    ctype = r.headers.get("content-type", "")
    if not (ctype.startswith("image/") or ctype.startswith("audio/") or ctype.startswith("video/")
            or ctype.startswith("application/ogg")):
        return None
    return r.content


def api(endpoint: str, params: dict) -> dict | None:
    """Chamada JSON à API MediaWiki (ex.: https://commons.wikimedia.org/w/api.php)."""
    p = {"format": "json", "formatversion": "2", **params}
    r = get(endpoint, p)
    if r is None or r.status_code != 200:
        return None
    try:
        return r.json()
    except ValueError:
        return None


COMMONS_API = "https://commons.wikimedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
SPARQL = "https://query.wikidata.org/sparql"


def sparql(query: str) -> list[dict]:
    r = get(SPARQL, {"query": query, "format": "json"})
    if r is None or r.status_code != 200:
        return []
    return r.json().get("results", {}).get("bindings", [])
