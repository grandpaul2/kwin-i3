#!/usr/bin/env python3
"""Compose a recorded master into the finished video (tools/video/record runs it).

  compose.py MASTER.mkv TIMELINE.tsv OUT.mp4

The master is variable-rate (KWin sends a frame per repaint); fps=60 makes it constant. The
timeline (play.py) becomes an ASS subtitle file burned in: the caption bottom-centre, the pressed
keys bottom-right. A silent audio track, as players expect one. Recording and composing are
separate, so the look changes without recording again.
"""
import os, subprocess, sys

KEY_BEFORE, KEY_AFTER = 0.1, 2.4      # a key shows from just before its press until after it
FONT, KEYFONT = "Noto Sans", "Noto Sans Mono"


def ts(sec):
    sec = max(sec, 0)
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    return "%d:%02d:%05.2f" % (h, m, s)


def esc(text):
    return text.replace("\\", "\\\\").replace("{", "(").replace("}", ")")


def duration(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                       capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def subtitles(rows, end, w, h):
    captions = [(t, x) for t, k, x in rows if k == "caption"]
    keys = [(t, x) for t, k, x in rows if k == "key"]
    margin = h // 9                   # clear of the panel
    lines = [
        "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {w}", f"PlayResY: {h}",
        "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, "
        "Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Caption,{FONT},{h // 23},&H00FFFFFF,&H00FFFFFF,&H40201C1A,&H40201C1A,0,0,0,0,100,100,0,0,3,{h // 70},0,2,60,60,{margin},1",
        f"Style: Keys,{KEYFONT},{h // 27},&H00FFFFFF,&H00FFFFFF,&H20E9AE3D,&H20E9AE3D,1,0,0,0,100,100,0,0,3,{h // 80},0,3,60,{w // 30},{margin},1",
        "", "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    for i, (t, text) in enumerate(captions):
        stop = captions[i + 1][0] if i + 1 < len(captions) else end
        if text:
            lines.append(f"Dialogue: 0,{ts(t)},{ts(stop)},Caption,,0,0,0,,{esc(text)}")
    for i, (t, chord) in enumerate(keys):
        stop = min(t + KEY_AFTER, keys[i + 1][0] - KEY_BEFORE if i + 1 < len(keys) else end)
        label = " + ".join("Enter" if k == "Return" else k for k in chord.split("+"))   # as keyboards say
        lines.append(f"Dialogue: 1,{ts(t - KEY_BEFORE)},{ts(stop)},Keys,,0,0,0,,{esc(label)}")
    return "\n".join(lines) + "\n"


def main():
    master, timeline, out = sys.argv[1:4]
    rows = []
    for line in open(timeline):
        ms, kind, text = line.rstrip("\n").split("\t", 2)
        rows.append((int(ms) / 1000, kind, text))
    # KWin sends no frame while nothing moves, so the master stops at the last change: the last
    # frame is held until the timeline's end (play.py's closing hold).
    shot = duration(master)
    end = max([t for t, k, _ in rows if k == "end"] + [shot])
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height",
                        "-of", "csv=p=0", master], capture_output=True, text=True, check=True)
    w, h = map(int, r.stdout.strip().split(","))
    outdir = os.path.dirname(os.path.abspath(out))
    with open(os.path.join(outdir, "overlay.ass"), "w") as f:
        f.write(subtitles(rows, end, w, h))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.abspath(master),
                    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
                    "-vf", f"fps=60,tpad=stop_mode=clone:stop_duration={end - shot:.3f},format=yuv420p,ass=overlay.ass",
                    "-c:v", "libx264", "-crf", "18", "-preset", "medium",
                    "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart",
                    os.path.abspath(out)], cwd=outdir, check=True)


main()
