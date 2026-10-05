# -*- coding: utf-8 -*-
"""
Etapa 1b: busca na Wikipedia em português a predefinição "Elenco atual de futebol"
de cada clube brasileiro. Ela traz posições detalhadas (G, LD, LE, Z, V, M, A) e o
número da camisa, que usamos para refinar as posições dos jogadores.

Saída: scripts/cache/pt_squads.json
"""
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from clubs_catalog import BR_CLUBS  # noqa: E402
from fetch_squads import CACHE_DIR, WD_API, get  # noqa: E402

PT_RAW = "https://pt.wikipedia.org/w/index.php"
OUT = os.path.join(CACHE_DIR, "pt_squads.json")


def pt_titles():
    """Título do artigo em português de cada clube (via Wikidata)."""
    titles = [c["wiki"] for c in BR_CLUBS]
    out = {}
    for i in range(0, len(titles), 50):
        batch = titles[i:i + 50]
        r = get(WD_API, {"action": "wbgetentities", "sites": "enwiki", "titles": "|".join(batch),
                         "props": "sitelinks", "sitefilter": "enwiki|ptwiki", "format": "json"})
        for e in r.json().get("entities", {}).values():
            sl = e.get("sitelinks", {})
            if "enwiki" in sl and "ptwiki" in sl:
                out[sl["enwiki"]["title"]] = sl["ptwiki"]["title"]
    return out


def raw_pt(title):
    path = os.path.join(CACHE_DIR, "pt", re.sub(r"[^\w\-]+", "_", title) + ".txt")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return f.read() or None
    r = get(PT_RAW, {"title": title, "action": "raw"})
    text = r.text if r is not None else ""
    m = re.match(r"\s*#(?:REDIRECT|REDIRECIONAMENTO)\s*\[\[([^\]|#]+)", text or "", re.I)
    if m:
        time.sleep(1)
        r = get(PT_RAW, {"title": m.group(1).strip(), "action": "raw"})
        text = r.text if r is not None else ""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    time.sleep(1.2)
    return text or None


POS_B = {"g": "G", "z": "Z", "ld": "LD", "le": "LE", "v": "V", "vol": "V", "m": "M", "ma": "M",
         "a": "A", "pd": "PD", "pe": "PE", "ata": "A"}


def _link_label(nome):
    nome = re.sub(r"\{\{[A-Z]{3}b?\}\}", "", nome).strip()
    lm = re.search(r"\[\[([^|\]]+)(?:\|([^\]]+))?\]\]", nome)
    if lm:
        link = lm.group(1).strip()
        return (lm.group(2) or link).strip(), link
    return re.sub(r"\{\{[^}]*\}\}|<[^>]+>", "", nome).strip(), None


def parse_elenco(text):
    out = []
    # formato "Elenco atual de futebol": |c1_j1_num / _pos / _nome
    players = {}
    for m in re.finditer(r"\|\s*c(\d+)_j(\d+)_(num|pos|nome)\s*=\s*([^\n]*)", text):
        players.setdefault((int(m.group(1)), int(m.group(2))), {})[m.group(3)] = m.group(4).strip()
    for key in sorted(players):
        p = players[key]
        label, link = _link_label(p.get("nome", ""))
        if label:
            out.append({"num": re.sub(r"[^\d]", "", p.get("num", "")), "pos": p.get("pos", "").strip().upper(),
                        "label": label, "link": link})
    if out:
        return out
    # formato "Elenco de Futebol": |g1= / |g1num= / |z1= ...
    vals, nums = {}, {}
    for m in re.finditer(r"\|\s*(g|z|ld|le|vol|v|ma|m|pd|pe|ata|a)(\d+)(num)?\s*=\s*([^\n]*)", text, re.I):
        key = (m.group(1).lower(), int(m.group(2)))
        (nums if m.group(3) else vals)[key] = m.group(4).strip()
    for key, v in vals.items():
        label, link = _link_label(v)
        if label:
            out.append({"num": re.sub(r"[^\d]", "", nums.get(key, "")), "pos": POS_B[key[0]], "label": label, "link": link})
    return out


GENERIC = {"elenco atual de futebol", "elenco de futebol"}


def main():
    titles = pt_titles()
    result = {}
    for c in BR_CLUBS:
        t = titles.get(c["wiki"])
        if not t:
            print(f"!! sem artigo pt: {c['id']}")
            continue
        text = raw_pt(t) or ""
        squad = parse_elenco(text)
        if not squad:
            for m in re.finditer(r"\{\{\s*(?:Predefinição:)?(Elenco[^}|\n]+)", text):
                name = m.group(1).strip()
                if name.lower() in GENERIC:
                    continue
                squad = parse_elenco(raw_pt("Predefinição:" + name) or "")
                if squad:
                    break
        result[c["id"]] = squad
        print(f"{c['id']:<18} {len(squad):>2} jogadores ({t})")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print(f"ok -> {OUT}")


if __name__ == "__main__":
    main()
