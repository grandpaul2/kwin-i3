#!/usr/bin/env bash
# needs: kcm
# stock: own
# timing: alone
# kwin-i3's own settings page (docs/spec-settings-page.md), driven as a person would: injected
# clicks and keys on kcmshell6 in the test KWin. No plugins are loaded, so what Apply does here it
# does without them. Controls are found by their accessible names (tools/a11y.py, on the test's own
# accessibility bus) and clicked at their on-screen box, so a relayout doesn't move the clicks
# (docs/spec-settings-cleanup.md); the pixel checks look at the header and the Keys rows, at
# 1280x720 with the window filling Virtual-0. KI3_SHOTS=<dir> keeps every screenshot.
# Alone, after the batch: it clicks after the page's slide animations, and in the batch (~30 test
# KWins at once) kcmshell6 took longer than 5 s to show its window (2026-10-24).
source "$(dirname "$0")/lib.sh"
kga() { busctl --user call org.kde.kglobalaccel /kglobalaccel org.kde.KGlobalAccel "$@"; }
keys_of() { kga shortcutKeys as 4 "$1" "$2" x "$2"; }
# An action's keys as a sorted list of first keys: kglobalaccel's order isn't stable.
key_set() { keys_of "$1" "$2" | tr ' ' '\n' | sed -n '4~5p' | sort -n | tr '\n' ' '; }
conf() { kreadconfig6 --file kwinrc --group Script-kwin-i3 --key "$1"; }
conf_is() { [[ $(conf "$1") == "$2" ]]; }
n_shot=0
shot() {
    python3 "$root/tools/shot.py" capture Virtual-0 "$KI3_TMP/$1.png"
    [[ -n ${KI3_SHOTS:-} ]] && cp "$KI3_TMP/$1.png" "$KI3_SHOTS/$((++n_shot))-$1.png"
    return 0
}
looks() { shot "$1" && python3 "$root/tools/shot.py" same "$KI3_TMP/$1.png" "$2" "$3" "$4" "${5:-24}"; }
not_looks() { shot "$1" && ! python3 "$root/tools/shot.py" same "$KI3_TMP/$1.png" "$2" "$3" "$4" "${5:-24}" >/dev/null; }
not_logged() { ! WAIT=1 wait_log "$@"; }
# How many pixels of a box are near a colour: text, found without reading it.
count_near() {   # count_near <shot> <x1> <y1> <x2> <y2> <r,g,b>
    python3 -I -c 'import sys; from PIL import Image
a = sys.argv; img = Image.open(a[1]).convert("RGB"); w = tuple(map(int, a[6].split(",")))
print(sum(1 for x in range(int(a[2]), int(a[4])) for y in range(int(a[3]), int(a[5]))
          if all(abs(c - d) <= 40 for c, d in zip(img.getpixel((x, y)), w))))' "$KI3_TMP/$1.png" "$2" "$3" "$4" "$5" "$6"
}
click() { "$INJECT" "abs $1 $2" "wait 50" "btn left down" "wait 30" "btn left up" "abs 640 700" "wait 100"; }
# click_named <page> <name>: the control a screen reader calls <name> on the page titled <page>
# ("-": anywhere, as the shell's Apply), scrolled into view and clicked.
click_named() {
    local xy cx cy; xy=$($A11Y box kcmshell6 "$1" "$2") || return 1
    read -r cx cy <<<"$xy"
    click $((wx + cx)) $((wy + cy))
}

# A stand-in app holds Meta+Alt+E and Meta+Alt+F, and Meta+Shift+F11 to show a holder keeps its other keys,
# registered as a running app registers (as 35-taken-keys.sh).
MAE=$((0x18000045)) MAF=$((0x18000046)) MAJ=$((0x1800004A)) MSF11=$((0x1300003A))
kga doRegister as 4 fakeapp Launch "Fake App" "Launch Fake App" >/dev/null
kga setShortcutKeys 'asa(ai)u' 4 fakeapp Launch "Fake App" "Launch Fake App" 3 4 $MAE 0 0 0 4 $MSF11 0 0 0 4 $MAF 0 0 0 2 >/dev/null
before_fake=$(keys_of fakeapp Launch)

# kwin-i3 is installed where KWin Scripts finds it (tools/testkwin.sh), turned off; the page.
check "an accessibility bus of the test's own" a11y_start
QT_PLUGIN_PATH=$root/kcm/build/bin QT_QPA_PLATFORM=wayland kcmshell6 kcm_kwin_i3 >"$KI3_TMP/kcm.log" 2>&1 &
opens() { WAIT=30 poll _has_window kwin-i3; }   # a prefix assignment inside check would be run as a command
check "the page opens"                      opens
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "kwin-i3") w.setMaximize(true, true); });' >/dev/null
check "maximized"                           wait_geom kwin-i3 "0,0 1280x720"
# The client area's top-left, which turns a control's window coordinates into a click.
read -r wx wy <<<"$(kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "kwin-i3") { var c = w.clientGeometry; log(Math.round(c.x) + " " + Math.round(c.y)); } });')"

# 1. Off: the warning, and its Turn On loads kwin-i3 the way KWin Scripts' checkbox does.
WARN=240,216,196                            # Breeze's warning background, light theme
check "the 'turned off' warning shows"      poll looks off 600 94 $WARN
click_named kwin-i3 "Turn On"
check "Turn On: kwin-i3 loads"              wait_log 'kwin-i3 loaded$'
check "enabled in kwinrc"                   test "$(kreadconfig6 --file kwinrc --group Plugins --key kwin-i3Enabled)" == true
check "the warning goes"                    poll not_looks on 600 94 $WARN
check "kwin-i3 tiles the page"              wait_geom kwin-i3 "0,0 1280x720"

# 2. Keys: the sub-page, from its button.
click_named kwin-i3 "Configure Keys…"
sleep 0.5                                   # the sub-page slides in
shot keys
# A shifted symbol is named by its keys beside its button (docs/spec-keys-shifted-labels.md):
# Move right's Meta+: gets "Meta+Shift+;", Focus right's Meta+; nothing.
inked() {   # inked <shot> <x1> <y1> <x2> <y2>: pixels clearly not the white background
    python3 -I -c 'import sys; from PIL import Image
a = sys.argv; img = Image.open(a[1]).convert("RGB")
print(sum(1 for x in range(int(a[2]), int(a[4])) for y in range(int(a[3]), int(a[5])) if sum(img.getpixel((x, y))) < 600))' "$KI3_TMP/$1.png" "$2" "$3" "$4" "$5"
}
check "Meta+: is named Meta+Shift+; beside it" test "$(inked keys 705 545 775 562)" -gt 30
check "Meta+; has no name beside it"        test "$(inked keys 705 271 775 288)" -eq 0
# Focus left's second key (Meta+J) becomes Meta+Alt+J, free; Focus up's second (Meta+L) becomes
# Meta+Alt+E, which the stand-in holds: its row says so, and nothing changes before Apply.
click_named Keys "Focus left, key 2: Meta+J"; press Meta+Alt+J; sleep 0.5
click_named Keys "Focus up, key 2: Meta+L"; press Meta+Alt+E; sleep 0.5
shot keys-set
NEUTRAL=246,116,0                           # Breeze's neutral text (the clash note)
check "the clash note under Focus up"       test "$(count_near keys-set 8 252 600 272 $NEUTRAL)" -gt 100
check "and none under Focus left"           test "$(count_near keys-set 8 150 600 168 $NEUTRAL)" -eq 0
check "before Apply, the stand-in keeps its key" test "$(keys_of fakeapp Launch)" == "$before_fake"
check "before Apply, Meta+J is still Focus Left's" test "$(keys_of kwin "kwin-i3 Focus Left (J)")" == "a(ai) 1 4 $((0x1000004A)) 0 0 0"
click_named - Apply
check "Apply: Focus Left (J) is Meta+Alt+J"  poll test "$(keys_of kwin "kwin-i3 Focus Left (J)")" == "a(ai) 1 4 $MAJ 0 0 0"
check "Apply: Focus Up (L) is Meta+Alt+E"    test "$(keys_of kwin "kwin-i3 Focus Up (L)")" == "a(ai) 1 4 $MAE 0 0 0"
check "the stand-in lost only Meta+Alt+E"    test "$(key_set fakeapp Launch)" == "$(printf '%s\n' $MAF $MSF11 | sort -n | tr '\n' ' ')"
check "what it took is recorded"            test -f "$XDG_STATE_HOME/kwin-i3/taken-keys.json"
m=$(mark); press Meta+Alt+J
check "Meta+Alt+J: Focus Left"              wait_log '^.{9}ACTION Focus Left$' "$m"
m=$(mark); press Meta+Alt+E
check "Meta+Alt+E: Focus Up"                wait_log '^.{9}ACTION Focus Up$' "$m"
m=$(mark); press Meta+J
check "Meta+J: nothing now"                 not_logged '^.{9}ACTION Focus Left$' "$m"
(cd "$root" && make -s restore-keys >/dev/null 2>&1)
check "make restore-keys gives it back"     test "$(keys_of fakeapp Launch)" == "$before_fake"
# A take that can't be recorded isn't made, and kwin-i3's action doesn't get the key either (both
# would hold it, and the stand-in's fires): Focus down's Meta+K to Meta+Alt+F, the record's
# directory read-only.
chmod 500 "$XDG_STATE_HOME/kwin-i3"
click_named Keys "Focus down, key 2: Meta+K"; press Meta+Alt+F; sleep 0.5
click_named - Apply; sleep 1
ERROR=218,68,83                             # Breeze's negative (error) colour
shot keys-failed
chmod 700 "$XDG_STATE_HOME/kwin-i3"
check "unrecorded: the stand-in keeps Meta+Alt+F" test "$(keys_of fakeapp Launch)" == "$before_fake"
check "and Focus Down (K) keeps Meta+K"     test "$(keys_of kwin "kwin-i3 Focus Down (K)")" == "a(ai) 1 4 $((0x1000004B)) 0 0 0"
check "the page says so"                    test "$(count_near keys-failed 0 76 1280 116 $ERROR)" -gt 200

# 3. Back on the main page: a gap typed, and from the floating step Tab reaches the focus choice,
#    where Down picks the next one. One Apply: both in kwinrc, one reload, and the gap on screen
#    with no plugin loaded. Each control's help button is the next Tab stop after it, as on
#    Plasma's own pages.
click_named - "Navigate Back"; sleep 0.5
shot main
click_named kwin-i3 "Gap between windows"; press Ctrl+A; press 8
click_named kwin-i3 "Resize step"; press Tab
check "Tab from the resize step reaches its help" test "$($A11Y focused kcmshell6)" == "More about the resize step"
press Tab
check "then the floating step"              test "$($A11Y focused kcmshell6)" == "How far a key moves or resizes a floating window"
press Tab; press Tab
# A combo box is named by its current choice.
check "then the focus choice" test "$($A11Y focused kcmshell6)" == "Next screen, then wrap"
press Down
shot main-set
m=$(mark); click_named - Apply
check "kwinrc: gapsInner=8"                 poll conf_is gapsInner 8
check "kwinrc: focusWrapping=no"            conf_is focusWrapping no
check "kwin-i3 re-read both"                wait_log '^.{9}SETTINGS .*focusWrapping.*gapsInner|^.{9}SETTINGS .*gapsInner.*focusWrapping' "$m"
check "the gap is on screen"                wait_geom kwin-i3 "8,8 1264x704"
sleep 1
check "one reload for one Apply"            test "$(after "$m" | grep -c '^.\{9\}SETTINGS ')" == 1

# 4. Defaults, Apply: the page's entries leave kwinrc (absent = default), the keys are the
#    defaults again, and the gap goes. The window is 8 px in now, so are its buttons. Last:
#    this also clears the test KWin's debugLog, and with it kwin-i3's log.
shot before-defaults
click_named - Defaults; click_named - Apply
check "gapsInner gone from kwinrc"          poll conf_is gapsInner ""
check "focusWrapping gone"                  conf_is focusWrapping ""
check "Focus Left (J) is Meta+J again"      poll test "$(keys_of kwin "kwin-i3 Focus Left (J)")" == "a(ai) 1 4 $((0x1000004A)) 0 0 0"
check "Focus Up (L) is Meta+L again"        test "$(keys_of kwin "kwin-i3 Focus Up (L)")" == "a(ai) 1 4 $((0x1000004C)) 0 0 0"
check "the default gap (4, 2 more at the edge)" wait_geom kwin-i3 "6,6 1268x708"
check "no invariant failures or errors"     clean_log
finish
