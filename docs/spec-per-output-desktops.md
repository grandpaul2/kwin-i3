# Spec: report per-monitor desktops being off (OPEN.md item 4 (b))

Draft 2026-10-24, waiting on Paul's go. The design was agreed earlier the same day: **report,
never set**. It's Plasma's setting; a value set by a script lasts only to the next reconfigure,
which kwin-i3 itself triggers; and kwin-i3 gives back what it borrows. The notice goes in the
one load-time notification that (c) built (`docs/spec-taken-keys.md`).

## What breaks with it off (checked 2026-10-24, not assumed)

Plasma's setting is "Switch desktops independently for each screen" (System Settings > Virtual
Desktops; `kwinrc [Windows] PerOutputVirtualDesktops`). It's off by default, and `setup.sh` turns
it on for Paul. With it off, `VirtualDesktopManager::setCurrent` switches **every** output to the
new desktop (`virtualdesktops.cpp:577`).

Run with it off (a temporary `testkwin.sh` switch, two outputs), the scenarios failed from the
first window: 10-tiling ("one window fills the screen"), 30-more 16 of 32, 40-monitors 16 of 47,
42-replug-home 5 of 10, 49-ws-outputs 9 of 31, 51-input from its first check, 34 its two
second-monitor checks. The cause is the first thing kwin-i3 does: login numbering shows
workspace 2 on the second monitor, which switches both monitors to 2. From then on, kwin-i3's
"a workspace lives on one monitor" and the screens disagree, and windows tile on the wrong one.
So with two or more monitors kwin-i3 is **broken**, not just less like i3. With one monitor the
setting changes nothing (41, 43 and 50, which don't depend on the second monitor's desktop,
passed).

## The change

1. **`checkPerOutput()`** (`src/kwin.js`): with `workspace.screens.length >= 2` and
   `options.perOutputVirtualDesktops` false, a part for the load-time report: "Plasma's
   per-screen desktops are off" / "With more than one monitor, kwin-i3 needs System Settings >
   Virtual Desktops > "Switch desktops independently for each screen" on: with it off, a
   desktop switch changes every monitor, and windows tile on the wrong one." Logged as
   `PEROUTPUT off, N screens`; `PEROUTPUT ok` otherwise.
2. When:
   - **at load**, beside `checkTakenKeys`, in the same notification;
   - **later, once per load**: when a second monitor arrives (`screensChanged`) or the setting is
     turned off (`options.perOutputVirtualDesktopsChanged`), and the condition becomes true.
     That's its own notification, since the load one has gone, and only the first time.
   Turning it on needs nothing from kwin-i3: KWin applies it at once (`setPerOutputVirtualDesktops`).
   Whether kwin-i3 then needs a reload to put the monitors right is checked in the test, and if
   it does, the notice says so.
3. **No setting to silence it.** Unlike a key given away on purpose, there's no reason to want
   this off with two monitors, and the notice comes only when the condition holds.
4. **The report's wording with two parts**: summary "kwin-i3: 2 things to fix in this setup",
   each part's title and lines in turn (already in `reportClose`).
5. **README**, install step 2: the setting by its Plasma name, required with 2+ monitors, and
   kwin-i3 says so if it's off.

## Paul's desktop

It's on (`setup.sh`), so no notice. The live check after the reload, read-only: `kreadconfig6`
shows it on, and no kwin-i3 notification arrives.

## Tests

- **`testkwin.sh`: `KI3_PEROUTPUT=true|false`** (default true, as now), and `# peroutput: false`
  in a scenario for `run.sh`, as `# desktops: N`. A second piece of the stock mode.
- **New live scenario `36-per-output-off.sh`**, `# peroutput: false`, with `fakenotify.py`:
  1. at load (two outputs): one notification, with the per-output part, and `PEROUTPUT off,
     2 screens` logged;
  2. the setting turned on (`kwriteconfig6`, then KWin's reconfigure): no new notification; then
     whether workspace 2 is on the second monitor with no reload, which decides the notice's
     wording (point 2);
  3. turned off again: one more notification (the "later" one); off and on and off a second time:
     no third (once per load).
- **One monitor**: the same scenario's last step unplugs an output (as 41 does), reloads
  kwin-i3, and checks `PEROUTPUT ok` and no notification.
- **Watched red**: the check never reporting (step 1 fails), and the "once per load" guard
  removed (step 3 fails).
- 35-taken-keys keeps testing the taken-keys part; a combined run (a taken key and the setting off)
  checks the two-part summary: one notification, "2 things to fix in this setup".
