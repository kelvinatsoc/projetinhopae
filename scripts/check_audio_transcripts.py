from faster_whisper import WhisperModel
import os

m = WhisperModel('tiny', device='cpu', compute_type='int8')
files = [
    'scripts/cache/audio_test/spfc_como_eu_te_amo.mp3',
    'scripts/cache/audio_test/spfc_domingo_morumbi.mp3',
    'scripts/cache/audio_test/estadio_grito_gol.mp3',
    'scripts/cache/audio_test/vinheta_gol_amanda.mp3',
    'scripts/cache/audio_test/vinheta_gol_fox.mp3',
    'scripts/cache/audio_test/vinheta_gol_galvao.mp3',
]

for f in files:
    if not os.path.exists(f): continue
    print("=" * 60)
    print("FILE:", os.path.basename(f))
    try:
        segs, _ = m.transcribe(f, language='pt')
        for s in list(segs)[:8]:
            print(f"  [{s.start:5.1f}s -> {s.end:5.1f}s]: {s.text}")
    except Exception as e:
        print("  err:", e)
