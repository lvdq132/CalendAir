# The Million Dollar Day (9:16 short)

Original faceless short, about 23 seconds long. A live net-worth ticker climbs, flatlines while "playing it safe", rewinds,
crashes by $1,000,000 on the line "will cost you a million", then gets back up. All of it is synced to
a voiceover, with word-by-word captions.

Everything is generated locally: no stock footage, no real person's likeness, no licensed music.

| step | script | output |
| --- | --- | --- |
| Voiceover (Kokoro TTS, `am_michael`) | `python3 vo.py am_michael` | `vo_am_michael.wav` + line timings JSON |
| Frames (Pillow + numpy) | `python3 render.py vo_am_michael.json frames/` | 690 PNG frames @ 30 fps |
| Score + SFX (numpy synth) | `python3 audio.py vo_am_michael.json vo_am_michael.wav mix.wav` | stereo mix |
| Encode | see below | `million_dollar_day.mp4` |

```sh
pip install kokoro-onnx soundfile pillow numpy
# model files (GitHub release of thewh1teagle/kokoro-onnx, model-files-v1.0):
#   kokoro-v1.0.onnx -> kokoro.onnx, voices-v1.0.bin -> voices.bin
# fonts (google/fonts, OFL) into ./fonts: Montserrat[wght].ttf, Inter[opsz,wght].ttf, JetBrainsMono[wght].ttf
ffmpeg -framerate 30 -i frames/f%05d.png -i mix.wav -c:v libx264 -preset slow -crf 22 \
  -maxrate 8M -bufsize 16M -pix_fmt yuv420p -movflags +faststart \
  -af "loudnorm=I=-14:TP=-1.0:LRA=11" -c:a aac -b:a 192k -shortest million_dollar_day.mp4
```

`vo_timing.json` holds the line timings of the rendered take, so `render.py` can run without regenerating the voice.
