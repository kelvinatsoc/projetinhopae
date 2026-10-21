from faster_whisper import WhisperModel
import subprocess

m = WhisperModel('tiny', device='cpu', compute_type='int8')
segs, _ = m.transcribe('scripts/cache/audio_test/nilson_grito_gol.mp3', language='pt')
for s in list(segs)[:15]:
    print(f"[{s.start:5.1f}s -> {s.end:5.1f}s]: {s.text}")
