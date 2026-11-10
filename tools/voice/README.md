# Range Control's voice

`build.py` records every line in `packages/fps-client/src/voice-lines.ts` into one file the game plays from:

- `packages/fps-client/src/audio/assets/controller.mp3`: every line end to end, mono, 22.05 kHz, 48 kbit/s.
- `packages/fps-client/src/audio/assets/controller.json`: where each line starts and how long it is, the text it was recorded from, and the length and SHA-256 of the MP3 it was written for.

Run it after changing a line. `packages/fps-client/test/range-control.test.ts` fails while the recording and the table of lines disagree, or the table is not the one written for that MP3. Commit the two files together.

## The voice

[Piper](https://github.com/OHF-Voice/piper1-gpl) with the voice `en_US-joe-medium`, run on this PC: nothing is sent anywhere and nothing is paid for. The voice's dataset is CC0 (its model card: <https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/joe/medium/MODEL_CARD>), so the recording can ship with the game. Piper itself only runs here, at build time; none of it is in the game.

Chosen by audition against `john`, `bryce` and `norman` (all free to ship): the lowest of them (about 112 Hz), and the one a speech recogniser understood best through a loudspeaker. `ryan` is not free for this use (CC BY-NC-SA), and several others say nothing clear about their licence, so they were left out.

## Setting up

```
uv venv .venv --python 3.12
uv pip install --python .venv piper-tts faster-whisper numpy scipy soundfile
.venv/Scripts/python -m piper.download_voices en_US-joe-medium --data-dir tools/voice/models
```

`ffmpeg` and `node` (22 or later) have to be on the PATH. The venv can live anywhere; the models are looked for in `tools/voice/models`, or wherever `PIPER_MODELS` points. Neither is committed.

## Recording

```
.venv/Scripts/python tools/voice/build.py           record, then check
.venv/Scripts/python tools/voice/build.py --check   only check the file that is there
```

Each line goes through what a loudspeaker on a mast does to a voice: a horn's narrow band, an amplifier driven a little too hard, one echo off the far side of the range, the hiss of the line and the click of the microphone's key.

## How it is checked

Nobody listens to this build, so a speech recogniser does (`faster-whisper`, `small.en`): the finished MP3 is decoded again, cut the way the game cuts it, and every line has to be heard as it is written. The last five seconds (`five` to `one`) are judged as the game plays them, one a second, because one word alone is not a fair test of a recogniser; and once more out of order ("three, one, four, two, five"), where a recogniser that knows how a countdown goes cannot fill a number in from its neighbours.

A recording is written beside the files the game has and put in their place only when every line passes, so a failed build leaves the last good recording where it was.

Two things follow from that:

- **Takes.** The voice does not say a line the same way twice, and now and then it swallows a word. A line is said again until it is heard as written, up to six times; the build prints which take it kept.
- **Wording.** A line it cannot say clearly in six takes fails the build. Then either say it another way (`VOICE_LINES`; this is why Range Control says "Supply drop incoming" and "Defenders, keep them off the sites"), or spell it for the voice and leave the caption alone (`VOICE_SPOKEN`; "Out posts").

Words that sound the same count as the same (`SAME_SOUND` in `build.py`: "defused" and "diffused"). The loudspeaker's settings can be tried from the environment before changing them in the file: `PA_LO`, `PA_HI`, `PA_RING`, `PA_DRIVE`, `PA_ECHO`.

A recogniser hearing the words is not the same as the voice sounding right. That part has been measured (level, length, pitch) and not heard.
