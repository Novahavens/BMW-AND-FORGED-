#!/usr/bin/env python3
"""Voice-over for the tutorial via OpenRouter's openai/gpt-audio (speech output).

  python3 tools/voice.py s01 [s02 ...]      # writes assets/voice/<id>.wav and updates assets/voice/meta.json
  python3 tools/voice.py --all

The text comes from assets/voice/src/<id>.txt. Auth is injected by the sandbox proxy (no key in this file).
The model is asked to READ the text, not answer it; the transcript it returns is checked against the script.
Word timing: gpt-audio gives no timestamps, so sentence starts are aligned to the silences in the audio and
words inside a sentence are spread by character count. Good to about a quarter of a second, which is enough
to land a cursor click on its word.
"""
import base64, json, os, re, subprocess, sys, wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE = os.environ.get("VOICE", "coral")
MODEL = os.environ.get("MODEL", "openai/gpt-audio")
DIRECTION = (
    "You are the narrator of a short product tutorial video. Read the text the user gives you, word for word, "
    "and add nothing. Voice: a warm, relaxed woman with a natural southern British English accent, mid-thirties, "
    "talking to a friend she is showing something to. Conversational, not announcer-like: vary your pitch, let "
    "sentences breathe with short natural pauses, smile slightly on the friendly lines, and do not rush. "
    "Say 'M two' as the letter M then 'two', and spell out any run of separate capital letters, such as 'F F three', "
    "'P D F', 'G L B' or 'S T L', letter by letter. "
    "Never sound like a text-to-speech system."
)

def synth(text):
    body = {
        "model": MODEL, "stream": True, "modalities": ["text", "audio"],
        "audio": {"voice": VOICE, "format": "pcm16"},
        "messages": [{"role": "system", "content": DIRECTION},
                     {"role": "user", "content": "Read this aloud exactly as written:\n\n" + text}],
    }
    p = subprocess.run(["curl", "-sS", "-N", "https://openrouter.ai/api/v1/chat/completions",
                        "-H", "Content-Type: application/json", "-d", json.dumps(body)],
                       capture_output=True, text=True, timeout=300)
    pcm, transcript, err = bytearray(), "", None
    for line in p.stdout.splitlines():
        if not line.startswith("data:"): continue
        d = line[5:].strip()
        if d == "[DONE]": break
        try: j = json.loads(d)
        except Exception: continue
        if "error" in j: err = j["error"]
        for ch in j.get("choices", []):
            a = (ch.get("delta") or {}).get("audio") or {}
            if a.get("data"): pcm += base64.b64decode(a["data"])
            if a.get("transcript"): transcript += a["transcript"]
    if not pcm: raise SystemExit(f"no audio: {err or p.stdout[:400] or p.stderr[:400]}")
    return bytes(pcm), transcript

def norm(t):
    return re.sub(r"[^a-z0-9 ]", "", t.lower().replace("-", " ")).split()

def write_wav(path, pcm, rate=24000):
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(pcm)

def silences(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", path, "-af", "silencedetect=noise=-38dB:d=0.18", "-f", "null", "-"],
                       capture_output=True, text=True)
    st = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)]
    en = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    return list(zip(st, en))

def words_for(text, dur, sil):
    """Spread words by character count, snapping each sentence start to the silence that precedes it."""
    sentences = re.findall(r"[^.?!]+[.?!]?", text)
    sentences = [s.strip() for s in sentences if s.strip()]
    chars = [len(s) for s in sentences]
    total = sum(chars) or 1
    gaps = [e for (s, e) in sil if 0.15 < s < dur - 0.1]  # the end of each inner pause = a sentence start
    starts, acc = [], 0
    for i, c in enumerate(chars):
        starts.append(dur * acc / total); acc += c
    # snap sentence i>0 to the nearest detected pause end within 0.7 s
    used = set()
    for i in range(1, len(starts)):
        best = min((g for g in gaps if g not in used), key=lambda g: abs(g - starts[i]), default=None)
        if best is not None and abs(best - starts[i]) < 0.7:
            starts[i] = best; used.add(best)
    ends = starts[1:] + [dur]
    out = []
    for s, a, b in zip(sentences, starts, ends):
        ws = s.split(); cl = [len(w) + 1 for w in ws]; tc = sum(cl); t = a
        span = max(0.2, (b - a) - 0.12)
        for w, c in zip(ws, cl):
            d = span * c / tc; out.append({"text": w, "start": round(t, 3), "end": round(t + d, 3)}); t += d
    return out

def main(ids):
    meta_path = os.path.join(ROOT, "assets/voice/meta.json")
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    for sid in ids:
        text = open(os.path.join(ROOT, f"assets/voice/src/{sid}.txt")).read().strip()
        for attempt in range(1, 6):  # the model sometimes ad-libs ("Sure, here it is"): retry until it reads the script exactly
            pcm, tr = synth(text)
            if norm(tr) == norm(text): break
            print(f"  {sid}: attempt {attempt} did not match the script ({tr.strip()[:50]!r}), retrying")
        else:
            raise SystemExit(f"{sid}: transcript never matched the script")
        raw = os.path.join(ROOT, f"assets/voice/{sid}.raw.wav"); out = os.path.join(ROOT, f"assets/voice/{sid}.wav")
        write_wav(raw, pcm)
        # trim leading/trailing silence, then a gentle level match
        subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", raw, "-af",
                        "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,"
                        "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,"
                        "loudnorm=I=-16:TP=-1.5:LRA=9", "-ar", "44100", out], check=True)
        os.remove(raw)
        dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).decode())
        meta[sid] = {"duration": round(dur, 3), "words": words_for(text, dur, silences(out)), "transcript": tr.strip()}
        json.dump(meta, open(meta_path, "w"), indent=1)
        print(f"{sid}: {dur:.1f}s, {len(text.split())} words ({len(text.split())/dur:.2f}/s)\n  said: {tr.strip()[:200]}")

if __name__ == "__main__":
    a = sys.argv[1:]
    if a == ["--all"]:
        a = sorted(f[:-4] for f in os.listdir(os.path.join(ROOT, "assets/voice/src")) if f.endswith(".txt"))
    main(a)
