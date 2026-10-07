"""Sons da torcida brasileira (public/media/audio/br/), só de fontes livres do Wikimedia Commons.

Para cada som: baixa o arquivo original (vídeo ou áudio) com o cliente educado de wm.py, acha
trechos SEM narração/fala (faster-whisper, modelo "tiny", se instalado; senão usa o trecho
pedido), corta, deixa mono, normaliza loudness e codifica em AAC ~64 kbps (.m4a).
Grava os créditos (autor, licença, URL) em public/media/audio/credits.json e no índice geral
public/media/credits.json (a tela de Créditos lê de lá).

Uso:
    python3 scripts/fetch_torcida.py            # baixa o que faltar e gera os .m4a
    python3 scripts/fetch_torcida.py --dry-run  # só mostra os trechos escolhidos

Nunca usar YouTube ou gravações com músicas protegidas: só arquivos do Commons com licença livre.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "media", "audio", "br")
SRC = os.path.join(wm.CACHE, "torcida")
CREDITS = os.path.join(ROOT, "public", "media", "audio", "credits.json")
INDEX = os.path.join(ROOT, "public", "media", "credits.json")

# nome de saída -> (arquivo no Commons, duração desejada em s, laço?, início preferido em s ou None)
SOUNDS: dict[str, tuple[str, float, bool, float | None]] = {
    "arquibancada": ("Torcedores enchem Arena Corinthians no primeiro jogo da Copa do Mundo.webm", 24, True, None),
    "canto": ("-GRITO DE PAZ! - Cruzeiro 1 x 1 Atlético - Mineirão - Belo Horizonte.webm", 20, True, None),
    "gol": ("Pablo Vegetti marca um gol contra o Puerto Cabello pela Copa Sul-americana 2025.webm", 8, False, None),
    "gol2": ("Dimitri Payet faz um gol de pênalti pelo CR Vasco da Gama em 2024.webm", 8, False, None),
    "uh": ("Pablo Vegetti faz um gol de pênalti contra o EC Bahia pelo Campeonato Brasileiro de Futebol de 2023 - Série A, 22ª rodada.webm", 2.5, False, 0.0),
    "vaia": ("Soundgoats - Audience Booing.wav", 5.4, True, 0.0),
    "ole": ("Torcedores fazem \"ola\" durante amistoso entre Brasil e Austrália no estádio Mané Garrincha.webm", 6, False, None),
    "selecao": ("Torcedores enchem Arena Corinthians no primeiro jogo da Copa do Mundo.webm", 24, True, 60.0),
    "selecao-canto": ("Torcedores fazem \"ola\" durante amistoso entre Brasil e Austrália no estádio Mané Garrincha.webm", 16, True, None),
    "vasco-canto": ("Torcida do Vasco da Gama comemorando uma vitória contra o Atlético Mineiro pela 20ª rodada do Campeonato Brasileiro de 2023.webm", 9, True, 0.0),
    "vasco-gol": ("Pablo Vegetti marca um gol contra o Puerto Cabello pela Copa Sul-americana 2025.webm", 8, False, None),
    "gremio-gol": ("Grêmio 1 x 0 Lanus - Final da Libertadores 2017.webm", 9, False, None),
}


def src_path(name: str) -> str:
    return os.path.join(SRC, re.sub(r"[^\w.-]+", "_", name))


def fetch(name: str) -> str | None:
    os.makedirs(SRC, exist_ok=True)
    p = src_path(name)
    if os.path.exists(p):
        return p
    b = wm.download(name)
    if not b:
        print("  falhou o download:", name)
        return None
    open(p, "wb").write(b)
    return p


def duration(p: str) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def speech_spans(p: str) -> list[tuple[float, float]]:
    """Trechos com fala (narração/entrevista). Vazio se o whisper não estiver instalado."""
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        return []
    m = WhisperModel("tiny", device="cpu", compute_type="int8")
    segs, _ = m.transcribe(p, language="pt", vad_filter=False, no_speech_threshold=0.5)
    out = []
    for s in segs:
        words = len(s.text.split())
        # torcida cantando também vira "texto"; só conta como fala se tiver cara de frase
        if s.no_speech_prob < 0.5 and words >= 4 and (s.end - s.start) < words * 0.8:
            out.append((s.start, s.end))
    return out


def loudness(p: str, start: float, dur: float) -> float:
    r = subprocess.run(["ffmpeg", "-hide_banner", "-ss", str(start), "-t", str(dur), "-i", p, "-af", "volumedetect", "-f", "null", "-"],
                       capture_output=True, text=True)
    m = re.search(r"mean_volume: (-?[\d.]+) dB", r.stderr)
    return float(m.group(1)) if m else -99


def pick(p: str, want: float, pref: float | None) -> float:
    total = duration(p)
    if pref is not None or total <= want + 0.5:
        return min(pref or 0.0, max(0.0, total - want))
    speech = speech_spans(p)
    best, best_l = 0.0, -1e9
    t = 0.0
    while t + want <= total:
        if not any(a < t + want and b > t for a, b in speech):
            l = loudness(p, t, want)
            if l > best_l:
                best, best_l = t, l
        t += max(1.0, want / 3)
    return best


def encode(p: str, start: float, dur: float, loop: bool, dst: str):
    fade = "" if loop else f",afade=t=in:d=0.05,afade=t=out:st={max(0, dur - 0.6)}:d=0.6"
    xf = ",afade=t=in:d=0.3,afade=t=out:st={0}:d=0.3".format(max(0, dur - 0.3)) if loop else ""
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", str(start), "-t", str(dur), "-i", p, "-vn", "-ac", "1", "-ar", "44100",
                    "-af", f"highpass=f=60,loudnorm=I=-18:TP=-2:LRA=11{fade}{xf}", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", dst], check=True)


def meta(names: list[str]) -> dict[str, dict]:
    out = {}
    for i in range(0, len(names), 40):
        d = wm.api(wm.COMMONS_API, {"action": "query", "titles": "|".join("File:" + n for n in names[i:i + 40]), "prop": "imageinfo", "iiprop": "extmetadata"})
        for pg in (d or {}).get("query", {}).get("pages", []):
            m = (pg.get("imageinfo") or [{}])[0].get("extmetadata", {})
            g = lambda k: re.sub(r"<[^>]+>", "", m.get(k, {}).get("value", "")).strip()  # noqa: E731
            n = pg["title"][5:]
            out[wm.norm_file(n)] = {"author": g("Artist") or g("Credit"), "license": g("LicenseShortName")}
    return out


def main():
    dry = "--dry-run" in sys.argv
    os.makedirs(OUT, exist_ok=True)
    info = meta(sorted({v[0] for v in SOUNDS.values()}))
    credits = json.load(open(CREDITS)) if os.path.exists(CREDITS) else {}
    for key, (name, want, loop, pref) in SOUNDS.items():
        dst = os.path.join(OUT, key + ".m4a")
        p = fetch(name)
        if not p:
            continue
        start = pick(p, want, pref)
        print(f"{key}: {name} @ {start:.1f}s ({want}s)")
        if dry:
            continue
        encode(p, start, want, loop, dst)
        m = info.get(wm.norm_file(name), {})
        credits[f"audio/br/{key}.m4a"] = {
            "author": m.get("author", ""), "file": wm.norm_file(name), "license": m.get("license", ""),
            "url": "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(wm.norm_file(name)),
        }
    if dry:
        return
    json.dump(dict(sorted(credits.items())), open(CREDITS, "w"), ensure_ascii=False, indent=1)
    idx = json.load(open(INDEX))
    idx.update({k: v for k, v in credits.items() if k.startswith("audio/")})
    json.dump(dict(sorted(idx.items())), open(INDEX, "w"), ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
