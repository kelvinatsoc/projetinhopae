import os
import subprocess
import shutil

ROOT = r"C:\Users\kelvi\OneDrive\Área de Trabalho\Claude\projetinhopae"
CACHE = os.path.join(ROOT, "scripts", "cache")
TEST = os.path.join(CACHE, "audio_test")
INST = os.path.join(CACHE, "myinstants")
OUT = os.path.join(ROOT, "public", "media", "audio", "br")
os.makedirs(OUT, exist_ok=True)

def encode(src, start, dur, dst, loop=True, gain_db=2):
    vol = f",volume={gain_db}dB" if gain_db else ""
    fade = ",afade=t=in:d=0.3,afade=t=out:st={0}:d=0.3".format(max(0, dur - 0.3)) if loop else ",afade=t=in:d=0.04,afade=t=out:st={0}:d=0.5".format(max(0, dur - 0.5))
    af = f"highpass=f=70,loudnorm=I=-15:TP=-1.5:LRA=10{vol}{fade}"
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-ss", str(start), "-t", str(dur),
        "-i", src,
        "-vn", "-ac", "2", "-ar", "44100",
        "-af", af,
        "-c:a", "aac", "-b:a", "96k",
        "-movflags", "+faststart",
        dst
    ]
    subprocess.run(cmd, check=True)
    size = os.path.getsize(dst)
    print(f"Encoded {os.path.basename(dst)}: {size/1024:.1f} KB")

# 1. spfc-canto.m4a - 'Como eu te amo Tricolor' (Independente)
encode(os.path.join(TEST, "spfc_como_eu_te_amo.mp3"), start=2.0, dur=28.0, dst=os.path.join(OUT, "spfc-canto.m4a"), loop=True, gain_db=3)

# 2. spfc-canto2.m4a - 'Domingo eu vou lá no Morumbi' (Independente)
encode(os.path.join(TEST, "spfc_domingo_morumbi.mp3"), start=1.0, dur=28.0, dst=os.path.join(OUT, "spfc-canto2.m4a"), loop=True, gain_db=3)

# 3. spfc-canto3.m4a - 'Sou Sou Tricolor' (Independente)
encode(os.path.join(TEST, "spfc_sou_tricolor.mp3"), start=4.0, dur=28.0, dst=os.path.join(OUT, "spfc-canto3.m4a"), loop=True, gain_db=3)

# 4. gol-jogo.m4a - Punchy videogame 'GOL!' shout
encode(os.path.join(INST, "gol-cutmp3.mp3"), start=0.0, dur=7.0, dst=os.path.join(OUT, "gol-jogo.m4a"), loop=False, gain_db=4)

# 5. gol-estadio.m4a - Stadium explosion
encode(os.path.join(TEST, "estadio_grito_gol.mp3"), start=3.8, dur=8.0, dst=os.path.join(OUT, "gol-estadio.m4a"), loop=False, gain_db=3)

# 6. arquibancada.m4a - Pure stadium atmosphere WITHOUT people talking!
# Take the musical batucada/crowd bed from spfc_sou_tricolor with bandpass to remove any distinct voice
cmd_bed = [
    "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
    "-ss", "8.0", "-t", "24.0",
    "-i", os.path.join(TEST, "spfc_sou_tricolor.mp3"),
    "-vn", "-ac", "2", "-ar", "44100",
    "-af", "bandpass=f=550:width_type=h:w=700,loudnorm=I=-20:TP=-2:LRA=10,afade=t=in:d=0.5,afade=t=out:st=23.5:d=0.5",
    "-c:a", "aac", "-b:a", "64k",
    "-movflags", "+faststart",
    os.path.join(OUT, "arquibancada.m4a")
]
subprocess.run(cmd_bed, check=True)
print(f"Encoded arquibancada.m4a: {os.path.getsize(os.path.join(OUT, 'arquibancada.m4a'))/1024:.1f} KB")

# Also update root public/media/audio/crowd.m4a so fallback has ZERO voices:
shutil.copy2(os.path.join(OUT, "arquibancada.m4a"), os.path.join(ROOT, "public", "media", "audio", "crowd.m4a"))
print("Updated public/media/audio/crowd.m4a successfully!")
