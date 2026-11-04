#!/usr/bin/env bash
# needs: kcm
# stock: own
# timing: alone
# kwin-i3's own settings page, driven as a person would: injected
# clicks and keys on kcmshell6 in the test KWin. No plugins are loaded, so what Apply does here it
# does without them. Controls are found by their accessible names (tools/a11y.py, on the test's own
# accessibility bus) and clicked at their on-screen box, so a relayout doesn't move the clicks
#; the pixel checks look at the header and the Keys rows, at
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
# registered as a running app registers (as 35-shared-keys.sh).
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

# 2. Keys: its tab.
click_named kwin-i3 "Keys"
sleep 0.5
shot keys
# A shifted symbol is named by its keys beside its button:
# Move right's Meta+: gets "Meta+Shift+;", Focus right's Meta+; nothing.
inked() {   # inked <shot> <x1> <y1> <x2> <y2>: pixels clearly not the white background
    python3 -I -c 'import sys; from PIL import Image
a = sys.argv; img = Image.open(a[1]).convert("RGB")
print(sum(1 for x in range(int(a[2]), int(a[4])) for y in range(int(a[3]), int(a[5])) if sum(img.getpixel((x, y))) < 600))' "$KI3_TMP/$1.png" "$2" "$3" "$4" "$5"
}
# beside_key <slot's name> <shot>: ink in the band right of a key's button, on its row: the
# row found (and scrolled into view) by its name, the band where the name beside it would be.
beside_key() {
    local xy cx cy; xy=$($A11Y box kcmshell6 Keys "$1") || { echo -1; return; }
    read -r cx cy <<<"$xy"; sleep 0.3; shot "$2"
    inked "$2" 705 $((wy + cy - 8)) 775 $((wy + cy + 9))
}
check "Meta+: is named Meta+Shift+; beside it" test "$(beside_key "Move window right, key 2: Meta+:" keys-move)" -gt 30
check "Meta+; has no name beside it"        test "$(beside_key "Focus right, key 2: Meta+;" keys-focus)" -eq 0
# Focus left's second key (Meta+J) becomes Meta+Alt+J, free; Focus up's second (Meta+L) becomes
# Meta+Alt+E, which the stand-in also holds: set all the same, with no note, and the stand-in keeps
# it (which of the two runs is the key override's, Plasma Settings; nothing is taken).
click_named Keys "Focus left, key 2: Meta+J"; press Meta+Alt+J; sleep 0.5
click_named Keys "Focus up, key 2: Meta+L"; press Meta+Alt+E; sleep 0.5
shot keys-set
NEUTRAL=246,116,0                           # Breeze's neutral text (a note under a row)
check "no note under Focus up"              test "$(count_near keys-set 8 252 600 272 $NEUTRAL)" -eq 0
check "before Apply, Meta+J is still Focus Left's" test "$(keys_of kwin "kwin-i3 Focus Left (J)")" == "a(ai) 1 4 $((0x1000004A)) 0 0 0"
click_named - Apply
check "Apply: Focus Left (J) is Meta+Alt+J"  poll test "$(keys_of kwin "kwin-i3 Focus Left (J)")" == "a(ai) 1 4 $MAJ 0 0 0"
check "Apply: Focus Up (L) is Meta+Alt+E"    test "$(keys_of kwin "kwin-i3 Focus Up (L)")" == "a(ai) 1 4 $MAE 0 0 0"
check "the stand-in keeps all its keys"     test "$(keys_of fakeapp Launch)" == "$before_fake"
check "nothing is recorded"                 test ! -f "$XDG_STATE_HOME/kwin-i3/taken-keys.json"
m=$(mark); press Meta+Alt+J
check "Meta+Alt+J: Focus Left"              wait_log '^.{9}ACTION Focus Left$' "$m"
m=$(mark); press Meta+J
check "Meta+J: nothing now"                 not_logged '^.{9}ACTION Focus Left$' "$m"
# No plugins here, so no key override: the shared key runs the stand-in's shortcut (35 drives
# the override).
m=$(mark); press Meta+Alt+E
check "Meta+Alt+E: the stand-in's, not Focus Up" not_logged '^.{9}ACTION Focus Up$' "$m"

# 3. A gap typed on the Gaps tab; on the Tiling tab, from the resize step Tab reaches its help,
#    the floating step (a row of its own), the pointer box and its help, and the focus choice,
#    where Down picks the next one.
#    One Apply: both in kwinrc, one reload, and the gap on screen with no plugin loaded. Each
#    control's help button is the next Tab stop after it, as on Plasma's own pages.
click_named kwin-i3 "Gaps"; sleep 0.5
click_named kwin-i3 "Gap between windows"; press Ctrl+A; press 8
click_named kwin-i3 "Tiling"; sleep 0.5
shot main
click_named kwin-i3 "Resize step"; press Tab
check "Tab from the resize step reaches its help" test "$($A11Y focused kcmshell6)" == "More about the key step"
press Tab
check "then the floating step"              test "$($A11Y focused kcmshell6)" == "How far a key moves or resizes a floating window"
press Tab
check "then the pointer box"                test "$($A11Y focused kcmshell6)" == "Move the pointer with focus to another screen"
press Tab; press Tab
# A combo box is named by its current choice.
check "then the focus choice" test "$($A11Y focused kcmshell6)" == "Next screen, then wrap"
press Down
shot main-set
m=$(mark); click_named - Apply
check "kwinrc: gapsInner=8"                 poll conf_is gapsInner 8
check "kwinrc: focusWrapping=no"            conf_is focusWrapping no
check "kwin-i3 re-read both"                wait_log '^.{9}SETTINGS .*focusWrapping.*gapsInner|^.{9}SETTINGS .*gapsInner.*focusWrapping' "$m"
check "the gap is on screen"                wait_geom kwin-i3 "9,9 1262x702"   # title bars: 1 px for the outline (no plugin here)
sleep 1
check "one reload for one Apply"            test "$(after "$m" | grep -c '^.\{9\}SETTINGS ')" == 1

# 4. Defaults resets the tab shown: on Tiling, its entries leave kwinrc (absent = default), the
#    gap and the keys untouched; on Gaps, the gap goes; on Keys, the keys are the defaults again.
#    The window is 8 px in now, so are its buttons. debugLog is on no tab: Defaults leaves it.
shot before-defaults
click_named - Defaults; click_named - Apply
check "Tiling: focusWrapping gone"          poll conf_is focusWrapping ""
check "  gapsInner untouched"               conf_is gapsInner 8
check "  the keys untouched"                test "$(keys_of kwin "kwin-i3 Focus Left (J)")" == "a(ai) 1 4 $MAJ 0 0 0"
check "  debugLog untouched"                conf_is debugLog true
click_named kwin-i3 "Gaps"; sleep 0.5
click_named - Defaults; click_named - Apply
check "Gaps: gapsInner gone from kwinrc"    poll conf_is gapsInner ""
click_named kwin-i3 "Keys"; sleep 0.5
click_named - Defaults; click_named - Apply
check "Keys: Focus Left (J) is Meta+J again"      poll test "$(keys_of kwin "kwin-i3 Focus Left (J)")" == "a(ai) 1 4 $((0x1000004A)) 0 0 0"
check "Focus Up (L) is Meta+L again"        test "$(keys_of kwin "kwin-i3 Focus Up (L)")" == "a(ai) 1 4 $((0x1000004C)) 0 0 0"
check "the default gap (2, none more at the edge)" wait_geom kwin-i3 "3,3 1274x714"
check "no invariant failures or errors"     clean_log
finish
