"""Batch Kokoro TTS: loads the model once and writes one 24 kHz mono wav per line.
Usage: python tools/kokoro_tts.py jobs.json
jobs.json = {"voice": "am_michael", "lang": "a", "speed": 0.95, "items": [{"text": "...", "out": "path.wav"}]}
Needs: pip install kokoro soundfile numpy (+ espeak-ng installed on the system)."""
import json
import sys
import wave

import numpy as np
from kokoro import KPipeline

jobs = json.load(open(sys.argv[1]))
pipe = KPipeline(lang_code=jobs.get("lang", "a"))
for it in jobs["items"]:
    chunks = []
    for _, _, audio in pipe(it["text"], voice=jobs["voice"], speed=jobs.get("speed", 1.0)):
        a = audio.detach().cpu().numpy() if hasattr(audio, "detach") else np.asarray(audio)
        chunks.append(a.astype(np.float32))
    data = np.concatenate(chunks) if chunks else np.zeros(2400, dtype=np.float32)
    pcm = (np.clip(data, -1, 1) * 32767).astype(np.int16)
    with wave.open(it["out"], "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(24000)
        w.writeframes(pcm.tobytes())
print(f"kokoro: wrote {len(jobs['items'])} lines")
