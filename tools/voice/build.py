"""Records Range Control's lines (packages/fps-client/src/voice-lines.ts) into one file the game plays from.

    <venv>/python tools/voice/build.py            record, write packages/fps-client/src/audio/assets/controller.{mp3,json}
    <venv>/python tools/voice/build.py --check    record nothing: listen to the file that is there

Every line is said by a Piper voice (see README.md for the voice and its licence), put through what a loudspeaker on
a mast does to a voice (a horn's narrow band, an amplifier driven a little too hard, one echo off the far side of
the range) and laid end to end in one MP3 with a table of where each line starts. Then the MP3 is decoded again and a
speech recogniser is asked what it hears in each line: nobody listens to this build, so that is its test.

The voice does not say a line the same way twice, and now and then it swallows a word. So a line is said again until
the recogniser hears it as written (a take, as with an actor), and a wording it cannot say in six takes fails the build.
"""

import hashlib
import json
import os
import subprocess
import sys

import numpy as np
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
LINES_TS = os.path.join(REPO, 'packages', 'fps-client', 'src', 'voice-lines.ts')
OUT_DIR = os.path.join(REPO, 'packages', 'fps-client', 'src', 'audio', 'assets')
MODELS = os.environ.get('PIPER_MODELS', os.path.join(HERE, 'models'))
VOICE = 'en_US-joe-medium'

RATE = 22050
# The voice is slowed a little: a controller reading from a card, not a narrator.
LENGTH_SCALE = 1.08
# Silence between lines in the file, and how much of it belongs to each line's window on either side (s). An MP3
# decoder may hand its audio back up to 50 ms late; the windows are wide enough that nothing is cut if it does.
GAP = 0.3
LEAD = 0.03
TAIL = 0.09
# Every line is brought to the same loudness before the loudspeaker, so the amplifier's clip is the same for each.
SPEECH_RMS = 0.11
# The loudspeaker: its band (Hz), how hard its horn rings at 1.9 kHz, how far the amplifier is driven, and how loud the echo comes back.
# Each was turned down from a first guess until a speech recogniser heard every line as written.
BAND = (float(os.environ.get('PA_LO', 300)), float(os.environ.get('PA_HI', 4200)))
RING = float(os.environ.get('PA_RING', 0.35))
DRIVE = float(os.environ.get('PA_DRIVE', 1.8))
ECHO = float(os.environ.get('PA_ECHO', 0.12))
BITRATE = '48k'
# How many times a line is said before the build gives up on its wording.
TAKES = 6


def lines():
    """The table as the game has it: {id: {text, spoken}}."""
    script = (
        "import(process.argv[1]).then((m) => console.log(JSON.stringify(Object.fromEntries("
        "m.VOICE_LINE_IDS.map((id) => [id, { text: m.VOICE_LINES[id], spoken: m.voiceSource(id) }])))))"
    )
    out = subprocess.run(['node', '--experimental-strip-types', '--no-warnings', '-e', script, 'file:///' + LINES_TS.replace('\\', '/')],
                         capture_output=True, text=True, check=True, encoding='utf-8')
    return json.loads(out.stdout)


def trimmed(x, floor=0.01):
    """Without the silence a synthesiser leaves at either end."""
    loud = np.flatnonzero(np.abs(x) > floor)
    return x[max(0, loud[0] - 200):loud[-1] + 400] if len(loud) else x


def loudspeaker(x, rng):
    """A voice as the range hears it: horn, amplifier, the echo off the far side, the hiss of the line it came down."""
    voiced = x[np.abs(x) > 0.02]
    x = x * (SPEECH_RMS / max(1e-6, float(np.sqrt(np.mean(voiced * voiced))) if len(voiced) else 1))
    # The horn: little under 350 Hz or over 3.4 kHz, and a peak where a re-entrant horn rings.
    band = signal.butter(3, BAND, 'bandpass', fs=RATE, output='sos')
    y = signal.sosfilt(band, x)
    b, a = signal.iirpeak(1900, 1.6, fs=RATE)
    y = y + RING * signal.lfilter(b, a, y)
    # The amplifier, a little past what it was built for.
    y = np.tanh(y * DRIVE) / np.tanh(DRIVE)
    # One echo, duller and later: the same words come back off the far side of the range.
    tail = int(RATE * 0.26)
    out = np.concatenate([y, np.zeros(tail)])
    delay = int(RATE * 0.118)
    dull = signal.sosfilt(signal.butter(2, 1800, 'lowpass', fs=RATE, output='sos'), y)
    out[delay:delay + len(dull)] += ECHO * dull
    # The line's own noise, there while the key is down.
    hiss = signal.sosfilt(band, rng.standard_normal(len(out))) * 0.004
    env = np.ones(len(out))
    edge = int(RATE * 0.012)
    env[:edge] = np.linspace(0, 1, edge)
    env[-int(RATE * 0.08):] = np.linspace(1, 0, int(RATE * 0.08))
    out = (out + hiss) * env
    # Keying the microphone: a relay's click a moment before the first word.
    click = int(RATE * 0.05)
    key = np.zeros(click)
    n = int(RATE * 0.004)
    key[:n] = rng.standard_normal(n) * np.linspace(1, 0, n) ** 2 * 0.25
    key = signal.sosfilt(band, key)
    return np.concatenate([key, out]) * 0.62


def heard(asr, x):
    """What a speech recogniser makes of `x`."""
    # A little silence either side, and no second guesses: a recogniser given a clip that starts on a word can go round in circles.
    quiet = np.zeros(int(RATE * 0.3))
    x16 = signal.resample_poly(np.concatenate([quiet, x, quiet]), 16000, RATE).astype(np.float32)
    # No line is forty words long: a recogniser that starts repeating itself is stopped there.
    segments, _ = asr.transcribe(x16, beam_size=5, language='en', temperature=0.0, condition_on_previous_text=False, without_timestamps=True, max_new_tokens=60)
    return ' '.join(s.text.strip() for s in segments)


NUMBERS = {'10': 'ten', '5': 'five', '4': 'four', '3': 'three', '2': 'two', '1': 'one', '60': 'sixty', '30': 'thirty'}
# Words that sound the same: which one a recogniser writes down says nothing about how the line was said.
SAME_SOUND = {'diffused': 'defused', 'sights': 'sites'}
# The lines the game cuts in on the second (VOICE_ON_THE_SECOND): judged as they are heard, one a second.
ON_THE_SECOND = ['five', 'four', 'three', 'two', 'one']
# The same numbers out of order: a recogniser that knows how a countdown goes cannot fill one in from the others.
OUT_OF_ORDER = ['three', 'one', 'four', 'two', 'five']


def words(text):
    """A line as its sounds in a row: however a recogniser wrote its numbers, split its words or chose between two that sound alike."""
    text = text.lower().replace('t-', 't minus ').replace('-', ' ')
    bare = ''.join(c if c.isalnum() or c == ' ' else ' ' for c in text).split()
    return ''.join(SAME_SOUND.get(w, w) for w in (NUMBERS.get(w, w) for w in bare))


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(RATE), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype='<f4')


def seal(path):
    """What ties a table of lines to its recording: the file's length and its SHA-256."""
    data = open(path, 'rb').read()
    return {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def check(asr, table, mp3):
    """Listens to the file as shipped: every line's window, cut as the game cuts it."""
    audio = decode(mp3)
    if {k: table.get(k) for k in ('bytes', 'sha256')} != seal(mp3):
        print('BAD the table of lines was not written for this recording')
        return ['the file']

    def window(id):
        a = int(table['lines'][id]['start'] * RATE)
        return audio[a:a + int(table['lines'][id]['seconds'] * RATE)]

    bad = []
    for id, row in table['lines'].items():
        clip = window(id)
        peak = float(np.max(np.abs(clip))) if len(clip) else 0
        # Nothing of a neighbour may be in the window's first and last 20 ms.
        edge = int(RATE * 0.02)
        quiet = max(float(np.max(np.abs(clip[:edge]))), float(np.max(np.abs(clip[-edge:])))) < 0.03
        if id in ON_THE_SECOND:
            # One word alone is not a fair test of a recogniser; the count is judged whole, below.
            print(f"{'ok ' if quiet else 'BAD'} {id:14} {row['seconds']:.2f} s  peak {peak:.2f}")
            ok = True
        else:
            said = heard(asr, clip)
            ok = words(said) == words(row['text'])
            print(f"{'ok ' if ok and quiet else 'BAD'} {id:14} {row['seconds']:.2f} s  peak {peak:.2f}  heard: {said}")
        if not ok or not quiet:
            bad.append(id)
    if all(id in table['lines'] for id in ON_THE_SECOND):
        # The count as the game plays it: each number on its second, cutting off the one before. Then out of order,
        # where each number has to be heard for itself.
        for name, order in (('the count', ON_THE_SECOND), ('out of order', OUT_OF_ORDER)):
            count = np.zeros(RATE * len(order) + RATE)
            for i, id in enumerate(order):
                clip = window(id)[:RATE]
                count[i * RATE:i * RATE + len(clip)] = clip
            said = heard(asr, count)
            ok = words(said) == words(' '.join(table['lines'][id]['text'] for id in order))
            print(f"{'ok ' if ok else 'BAD'} {name:14} heard: {said}")
            if not ok:
                bad.append(name)
    return bad


def main():
    from faster_whisper import WhisperModel

    asr = WhisperModel(os.environ.get('ASR', 'small.en'), device='cpu', compute_type='int8')
    index_path = os.path.join(OUT_DIR, 'controller.json')
    mp3_path = os.path.join(OUT_DIR, 'controller.mp3')
    if '--check' in sys.argv:
        bad = check(asr, json.load(open(index_path, encoding='utf-8')), mp3_path)
        sys.exit(1 if bad else 0)

    from piper import PiperVoice, SynthesisConfig

    voice = PiperVoice.load(os.path.join(MODELS, VOICE + '.onnx'))
    assert voice.config.sample_rate == RATE, voice.config.sample_rate
    rng = np.random.default_rng(16)

    def take(spoken):
        chunks = voice.synthesize(spoken, SynthesisConfig(length_scale=LENGTH_SCALE, noise_scale=0.5, noise_w_scale=0.6))
        dry = trimmed(np.concatenate([c.audio_float_array for c in chunks]).astype(np.float64))
        return loudspeaker(dry, rng)

    def record(id, row):
        """A line said until it is said clearly: the voice never says a line the same way twice, and now and then it swallows a word."""
        if id in ON_THE_SECOND:
            return take(row['spoken'])
        for n in range(1, TAKES + 1):
            wet = take(row['spoken'])
            said = heard(asr, wet)
            if words(said) == words(row['text']):
                print(f'   {id:14} take {n}')
                return wet
            print(f'   {id:14} take {n} heard: {said}')
        return None

    table = {'voice': VOICE, 'sampleRate': RATE, 'lines': {}}
    parts = [np.zeros(int(RATE * GAP))]
    at = len(parts[0])
    unclear = []
    for id, row in lines().items():
        wet = record(id, row)
        if wet is None:
            unclear.append(id)
            continue
        table['lines'][id] = {'text': row['text'], 'spoken': row['spoken'], 'start': round(at / RATE - LEAD, 4), 'seconds': round(len(wet) / RATE + LEAD + TAIL, 4)}
        parts += [wet, np.zeros(int(RATE * GAP))]
        at += len(wet) + int(RATE * GAP)
    if unclear:
        sys.exit(f"not said clearly in {TAKES} takes: {', '.join(unclear)}. Say them another way (VOICE_LINES) or spell them for the voice (VOICE_SPOKEN).")
    sprite = np.concatenate(parts)
    os.makedirs(OUT_DIR, exist_ok=True)
    # Recorded beside the files the game has, and put in their place only once it has been heard as written: a
    # recording that fails leaves the last good one where it was.
    mp3 = os.path.join(OUT_DIR, 'controller.new.mp3')
    pcm = (np.clip(sprite, -1, 1) * 32767).astype('<i2').tobytes()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(RATE), '-ac', '1', '-i', '-', '-codec:a', 'libmp3lame', '-b:a', BITRATE,
                    '-map_metadata', '-1', '-fflags', '+bitexact', mp3], input=pcm, check=True)
    table['seconds'] = round(len(sprite) / RATE, 3)
    table.update(seal(mp3))
    print(f"{len(table['lines'])} lines, {table['seconds']} s, {os.path.getsize(mp3) / 1024:.0f} KB")
    bad = check(asr, table, mp3)
    if bad:
        os.remove(mp3)
        print('not heard as written:', ', '.join(bad))
        sys.exit(1)
    os.replace(mp3, mp3_path)
    with open(index_path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(table, f, indent=1)
        f.write('\n')


if __name__ == '__main__':
    main()
