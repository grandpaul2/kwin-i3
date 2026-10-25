# Spec: Plasma's notifications in place of dunst (OPEN.md item 11)

Paul's go 2026-10-25; the dotfiles side done the same day. The live switch (8-10) waits for its own go. The change is all in `~/.dotfiles`; kwin-i3's code is untouched.
It lives here because item 11 does.

## Why

dunst was chosen on 2026-10-21 because the panel had gone, and Plasma's popups are drawn by the
tray's Notifications widget (`Globals.qml`), so they went with it. The panel is back for good
(2026-10-24) with the tray, so that reason is gone. What is left is a second, hand-styled
notification system beside the stock one. That runs against the plan ("Plasma doing the rest",
`docs/plan.md`, Scope, which names notifications) and against running the defaults a new user
gets while the DE/WM seam is built (so item 4's README pass sees what a stranger sees).

What it brings that dunst doesn't have here: history under the tray's bell; Do Not Disturb, with a
key (`plasmashell` → "Toggle do not disturb", unbound) and automatic while screen sharing or
mirrored (`inhibitNotificationsWhenScreenSharing` / `…WhenScreensMirrored` in
libnotificationmanager 6.7.5); per-app settings in System Settings; job progress (file copies,
downloads); inline reply and actions.

kwin-i3 is unaffected: Plasma's popups aren't normal windows, so `src/rules.js:29` ignores them.
Its load notification (`src/kwin.js`, `Notify` through `callDBus`) goes to whichever server owns
the name.

## The state now (read 2026-10-25)

- `org.freedesktop.Notifications` is owned by dunst (pid 3378011, `dunst.service`, static,
  started by D-Bus activation).
- **Three activation files claim the name:** Fedora's `org.kde.plasma.Notifications.service`
  (`plasma_waitforname`), dunst's own `org.knopwob.dunst.service` (`/usr/bin/dunst`), and the
  per-user one from dotfiles, which wins and points at dunst. With the per-user file gone, the
  broker would choose between the two system files arbitrarily (in 2026-10-21's trap it chose
  Plasma's). So **dunst is removed, not left installed and unused**.
- The tray holds the Notifications widget (`plasma-org.kde.plasma.desktop-appletsrc`, applet 15
  inside the system tray).

## The change

In `~/.dotfiles`:

1. **Delete** `dunst/` (both `dunstrc` and the per-user `org.freedesktop.Notifications.service`)
   and `plasma/.local/share/applications/net.local.dunst-history.desktop`.
2. **`setup.sh`**: drop the two dunst `link` lines and the history entry's `link`. Drop
   `net.local.dunst-history.desktop=Meta+N` from the launch shortcuts and from the keep-list.
   Add a cleanup that removes the old links where they still exist (a dangling
   `~/.local/share/dbus-1/services/org.freedesktop.Notifications.service` would point activation
   at a missing file).
3. **`packages/fedora.txt`**: drop `dunst`.
4. **`scripts/Documents/health-check.sh`**: replace its three dunst `check_link` lines with one
   check that the name's owner is plasmashell (`GetNameOwner` → `GetConnectionUnixProcessID` →
   `/proc/<pid>/comm`), so a dunst coming back gets reported.
5. **`localbin/.local/bin/audio-toggle`**: Plasma ignores `x-dunst-stack-tag`. Replace a popup
   with the standard route: keep the id from `notify-send --print-id` in
   `$XDG_RUNTIME_DIR/audio-toggle.id`, and pass it back with `--replace-id`. Fix the header
   comment ("dunst's" → the notification).
6. **Meta+N** goes to the tray's Notifications widget, so it opens the popup with history. A
   widget's key is `[Shortcuts] global` in its config group, which libplasma reads when the
   widget loads (`applet.cpp:144`, 6.7.5), and the tray's children take keys (its `main.qml`
   instantiates them "for correct working of shortcuts"). `setup.sh` finds the bell through
   plasmashell's scripting (the tray's `Applets` subgroups, by plugin; applet 15 here, probed
   read-only) and writes the key if none is set; it takes effect at the next plasmashell start.
   Meta+N is otherwise held only by dunst's launcher, which goes. `setup.sh`'s one-time prune
   skips `plasmashell|activate widget *`: widget keys are set on purpose, and ids differ per install.
7. **Docs**: README's tree (`dunst/` line), the "Plasma" table (the panel row's "still dunst"
   clause; the dunst row is rewritten as "Notifications are Plasma's", with the trap kept in one
   sentence: dunst's own package claims the same name, hence removed); the Meta+F12 row ("dunst
   says only…"); `hotkeys` (Meta+n); `.claude/commands/health.md` (the "dunst" mention). In
   dotfiles' Claude memory `feedback_no_dunst_popups.md`: the popups are Plasma's now.

In this repo: OPEN.md item 11's dunst line becomes done.

## The live switch (Paul's desktop; his go needed for this step on its own)

8. `sudo dnf remove dunst`. That stops nothing that is running, but removes its activation file
   and the unit file.
9. Run `setup.sh`, then stop the running dunst (`kill 3378011`, or whatever pid then owns the name).
   The name is now free.
10. `systemctl --user restart plasma-plasmashell`, so its notification server takes the name: it
    registers when its model starts, and whether it claims a name freed later is unchecked, so a
    restart is the sure route (2026-10-21's HANDOFF: it took the name only on a restart).
    **The panel blinks once.** No windows move: kwin-i3 doesn't tile the panel.

## Checks

- The name's owner is plasmashell (step 4's check, run by hand).
- `timeout 3 notify-send test` returns at once and a popup shows above the tray. A hang means
  `plasma_waitforname` is waiting: the widget isn't up.
- `audio-toggle` with the headphones off, pressed twice: one popup, replaced, not two.
- Meta+N opens the widget's popup.
- After a kwin-i3 reload, its load notification appears (only if it has something to report; a
  clean setup reports nothing, so this is checked on a test KWin with a taken key instead).
- `health-check.sh` is green, and red when dunst runs by hand (`dunst &`, then killed).

## Out of scope

Plasma's popup style, size and position: lived with first and tuned later in System Settings, if
at all. Notification sounds and per-app rules: defaults.
