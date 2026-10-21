import subprocess
import os

ROOT = r"C:\Users\kelvi\OneDrive\Área de Trabalho\Claude\projetinhopae"
CACHE = os.path.join(ROOT, "scripts", "cache")
OUT = os.path.join(ROOT, "public", "media", "audio", "br")
os.makedirs(OUT, exist_ok=True)

def encode_audio(src, start, dur, dst, loop=True, gain_db=0):
    fade = ",afade=t=in:d=0.3,afade=t=out:st={0}:d=0.3".format(max(0, dur - 0.3)) if loop else ",afade=t=in:d=0.04,afade=t=out:st={0}:d=0.4".format(max(0, dur - 0.4))
    vol = f",volume={gain_db}dB" if gain_db else ""
    af = f"highpass=f=65,loudnorm=I=-18:TP=-2:LRA=11{vol}{fade}"
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-ss", str(start), "-t", str(dur),
        "-i", src,
        "-vn", "-ac", "1", "-ar", "44100",
        "-af", af,
        "-c:a", "aac", "-b:a", "64k",
        "-movflags", "+faststart",
        dst
    ]
    subprocess.run(cmd, check=True)
    size = os.path.getsize(dst)
    print(f"Generated {os.path.basename(dst)}: {size/1024:.1f} KB")

# 1. São Paulo - Torcida Independente "Como eu te amo Tricolor"
spfc_src = os.path.join(CACHE, "audio_test", "spfc_como_eu_te_amo.mp3")
encode_audio(spfc_src, start=1.0, dur=28.0, dst=os.path.join(OUT, "spfc-canto.m4a"), loop=True)

# 2. São Paulo - Torcida Independente "Domingo eu vou lá no Morumbi"
spfc_morumbi_src = os.path.join(CACHE, "audio_test", "spfc_domingo_morumbi.mp3")
encode_audio(spfc_morumbi_src, start=0.5, dur=26.0, dst=os.path.join(OUT, "spfc-canto2.m4a"), loop=True)

# 3. Corinthians - Gaviões da Fiel
cor_src = os.path.join(CACHE, "audio_test", "corinthians_gavioes.mp3")
encode_audio(cor_src, start=2.0, dur=24.0, dst=os.path.join(OUT, "corinthians-canto.m4a"), loop=True)

# 4. Palmeiras - Mancha Verde
pal_src = os.path.join(CACHE, "audio_test", "palmeiras_mancha.mp3")
encode_audio(pal_src, start=5.0, dur=24.0, dst=os.path.join(OUT, "palmeiras-canto.m4a"), loop=True)

# 5. Flamengo - Torcida Rubro-Negra
fla_src = os.path.join(CACHE, "audio_test", "flamengo_torcida.mp3")
encode_audio(fla_src, start=1.0, dur=24.0, dst=os.path.join(OUT, "flamengo-canto.m4a"), loop=True)

# 6. Grito de GOL de jogo ("GOL!"):
# Usar a explosão com o grito de narrador de gol
gol_src = os.path.join(CACHE, "myinstants", "gol-galvao-copa-epj.mp3")
encode_audio(gol_src, start=1.5, dur=7.5, dst=os.path.join(OUT, "gol-jogo.m4a"), loop=False, gain_db=2)

# Variação 2 do gol com explosão
estadio_gol_src = os.path.join(CACHE, "audio_test", "estadio_grito_gol.mp3")
encode_audio(estadio_gol_src, start=3.8, dur=8.0, dst=os.path.join(OUT, "gol-estadio.m4a"), loop=False, gain_db=2)

# 7. Canto genérico da torcida brasileira (substituir o antigo que tinha falas):
# Usar bateria e coro da arquibancada limpo
canto_gen_src = os.path.join(CACHE, "audio_test", "spfc_sou_tricolor.mp3")
encode_audio(canto_gen_src, start=4.0, dur=22.0, dst=os.path.join(OUT, "canto.m4a"), loop=True)

# 8. Ambiente de arquibancada limpo sem repórteres falando:
# Usar o ruído constante de arquibancada sem entrevistas
crowd_clean_src = os.path.join(ROOT, "public", "media", "audio", "crowd.m4a")
encode_audio(crowd_clean_src, start=0.0, dur=24.0, dst=os.path.join(OUT, "arquibancada.m4a"), loop=True)

print("All audio files processed successfully!")
