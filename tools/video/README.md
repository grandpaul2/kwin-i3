# Training videos

Silent videos of kwin-i3 at work: a Plasma desktop at 1920x1080 in Breeze Dark, real apps, real
key presses, a caption and the pressed keys on screen. Each video is a short script, recorded
unattended inside the headless test KWin (`tools/testkwin.sh`), so nothing appears on the screens
and no real file, user or host name shows.

```
make build plugin video
tools/video/record tools/video/scripts/01-first-steps.txt   # → videos/01-first-steps/01-first-steps.mp4
```

`videos/` is gitignored: the videos are not kept in the repo.

## Scripts

`tools/video/scripts/NN-name.txt`, one step a line; a line starting with `#` is a comment.

| step | does |
|---|---|
| `say TEXT` | a caption, shown until the next one (`say` alone clears it) |
| `key CHORD [CAPTION]` | presses the chord (`Meta+Shift+Left`), shown as keys, with its caption first |
| `open CHORD [as NAME] [CAPTION]` | as `key`, then waits until kwin-i3 adds the window it opened |
| `run APP [as NAME] [CAPTION]` | starts an application, then waits until kwin-i3 adds its window |
| `type TEXT` | types it, a key every 0.12 s (letters, digits, space, `- . /`) |
| `point NAME\|park [CAPTION]` | moves the pointer at a hand's pace to that window's centre, or back over the panel |
| `wait SECONDS` | holds |
| `pace [SECONDS]` | the hold after each later key, open, run or point (alone: back to 2.4 s) |

`as NAME` names the window the step opened, for later steps. A caption shows long enough to be
read before anything happens (0.8 s and a third of a second a word, at least 1.5 s); each key is
held 2.4 s after, for the viewer. The pointer rests over the panel's empty middle
until a step moves it. Comment the tree at each step: the video is checked against it.

## How it works

- `record` makes a demo home and runs the whole test KWin with it as `HOME` and working directory
  (kglobalaccel's launches, such as Meta+Return, inherit KWin's environment), with one output at
  1920x1080 and the plugins from `plugin/build/bin`.
- `stage.sh`, inside: kwin-i3 at its defaults but a 4 px gap between windows (2 px wider, so the
  frames read on video), then `kactivitymanagerd` (the test bus starts no services, and
  plasmashell draws nothing without it), plasmashell, Breeze Dark with the Milky Way wallpaper
  (Breeze Dark's own is blue, which hides the focused window's blue frame), KRunner; then the
  recording, then `play.py`. A warning or error in kwin-i3's log fails the recording.
- `screencast` asks KWin for a PipeWire stream of the screen (KWin's own screencast protocol, the
  one Spectacle and the desktop portal use; refuses outside the test KWin). GStreamer writes a
  lossless master, a frame per repaint (`master.mkv`), stopped by SIGINT so the file is finished.
- `play.py` sends real keys through one libei connection (as `tools/inject.py`) and writes
  `timeline.tsv`, counted from when the pipeline started playing.
- `compose.py` makes the master 60 fps, holds its last frame to the timeline's end, burns in the
  captions and keys (`overlay.ass`), and encodes H.264 with a silent audio track. It can run again
  on a recorded master to change the look.
