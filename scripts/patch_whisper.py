import os
p = os.path.join(os.environ['LOCALAPPDATA'], 'Python', 'pythoncore-3.14-64', 'Lib', 'site-packages', 'faster_whisper', 'audio.py')
s = open(p, encoding='utf-8').read()
target = 'metadata_errors="ignore"'
if target in s:
    s2 = s.replace(target, '')
    open(p, 'w', encoding='utf-8').write(s2)
    print("faster_whisper patched!")
else:
    print("already patched or target not found")
