#!/usr/bin/env bash
# stock: own
# The keys kwin-i3 didn't get (docs/records/spec-taken-keys.md): a key another action holds is shown on
# kwin-i3's action too, but only the first holder's fires. At load, one notification names the
# taken ones; make take-keys frees them and make restore-keys gives them back.
source "$(dirname "$0")/lib.sh"
kga() { busctl --user call org.kde.kglobalaccel /kglobalaccel org.kde.KGlobalAccel "$@"; }
keys_of() { kga shortcutKeys as 4 "$1" "$2" x "$2"; }
setk() { local c=$1 a=$2; shift 2; kga setForeignShortcutKeys 'asa(ai)' 4 "$c" "$a" x "$a" "$@" >/dev/null; }
notes() { grep -c '^NOTIFY' "$KI3_TMP/notify.out"; }
notes_are() { [[ $(notes) == "$1" ]]; }
: > "$KI3_TMP/notify.out"                  # there before the first poll reads it
"$root/tools/fakenotify.py" > "$KI3_TMP/notify.out" 2>&1 &
poll grep -q READY "$KI3_TMP/notify.out"

# Holders before kwin-i3 loads: KWin's own Quick Tile Left gets its stock Meta+Left back; a
# stand-in app holds Meta+E, plus Meta+Shift+F11 to show a holder keeps its other keys, registered
# as a running app registers (doRegister, then setShortcutKeys with SetPresent: active); and a stand-in whose app isn't
# running (doRegister only: inactive) holds Meta+H, which doesn't block kwin-i3's.
ML=$((0x11000012)) ME=$((0x10000045)) MSF11=$((0x1300003A)) MH=$((0x10000048))
setk kwin "Window Quick Tile Left" 1 4 $ML 0 0 0
kga doRegister as 4 fakeapp Launch "Fake App" "Launch Fake App" >/dev/null
kga setShortcutKeys 'asa(ai)u' 4 fakeapp Launch "Fake App" "Launch Fake App" 2 4 $ME 0 0 0 4 $MSF11 0 0 0 2 >/dev/null
kga doRegister as 4 ghostapp Launch "Ghost App" "Launch Ghost App" >/dev/null
setk ghostapp Launch 1 4 $MH 0 0 0
before_tile=$(keys_of kwin "Window Quick Tile Left") before_fake=$(keys_of fakeapp Launch)
load_kwin_i3
wait_log 'kwin-i3 loaded$'

# 1. One notification, naming exactly the two active holders' keys; the inactive one is logged.
#    (The test KWin's config frees Plasma's stock Meta+D, Peek at Desktop, and Meta+R, Spectacle's
#    region recording, which kwin-i3's Launcher and Resize Mode keys collide with on a stock
#    Plasma, as it frees Meta+arrows: tools/testkwin.sh; redo stage 5.)
check "the check ran"                       wait_log '^.{9}TAKEN checked [0-9]+ keys, 2 taken$'
check "one notification"                    poll notes_are 1
taken=$(grep -E '^.{9}TAKEN [^c]' "$KI3_LOG" | cut -c16- | cut -d: -f1 | sort | tr '\n' ' ')
check "it names Meta+E and Meta+Left: '$taken'" test "$taken" == "Meta+E Meta+Left "
check "the notice says so"                  grep -q "Meta+Left: Quick Tile Window to the Left (KWin)" "$KI3_TMP/notify.out"
# Two parts: the taken keys, and (no plugins here) the two keys that need them (redo stage 5).
check "app, icon, summary (Plasma shows the app name: no prefix)" grep -qE "^NOTIFY 'kwin-i3' 'view-split-left-right' '2 things to fix in this setup'" "$KI3_TMP/notify.out"
check "the taken keys are one part"         grep -q "keys are taken by other shortcuts:" "$KI3_TMP/notify.out"
check "Meta+H's holder is inactive: logged, not reported" wait_log '^.{9}TAKEN-INACTIVE Meta\+H: Launch Ghost App'
check "the stand-in app is active"          test "$(busctl --user call org.kde.kglobalaccel /component/fakeapp org.kde.kglobalaccel.Component isActive)" == "b true"

# 2. The claim itself: every default key pressed, and the ones that don't fire kwin-i3's action
#    are exactly the reported ones (the chords as in 50-keys.sh, from tests/keys.json).
mapfile -t chords < <(node -e '
const K = require(process.argv[1]); const seen = new Set();
for (const [a, keys] of Object.entries(K)) for (let k of keys) {
    if (k === "Meta+:") k = "Meta+Shift+;";
    if (!seen.has(k)) { seen.add(k); console.log(a + "|" + k); } }
for (let n = 1; n <= 10; n++) { const d = String(n % 10);
    console.log("Workspace " + n + "|Meta+" + d); console.log("Move to Workspace " + n + "|Meta+Shift+" + d); }' "$root/tests/keys.json")
fired() { after "$2" | grep -qE "^.{9}ACTION $1\$"; }
dead=() w=$WAIT
for c in "${chords[@]}"; do
    action=${c%%|*} chord=${c#*|}
    m=$(mark); press "$chord"
    WAIT=$w poll fired "$action" "$m" || dead+=("$chord")
    w=2
done
dead_s=$(printf '%s\n' "${dead[@]}" | sort | tr '\n' ' ')
check "the keys that don't fire are the reported ones: '$dead_s'" test "$dead_s" == "$taken"

# 3. make take-keys: both fire kwin-i3's action now; the stand-in keeps its other key.
out=$(cd "$root" && make -s take-keys 2>&1)
check "take-keys took two"                  grep -q 'take-keys: 2 taken' <<<"$out"
m=$(mark); press Meta+Left
check "Meta+Left: kwin-i3's Focus Left"     wait_log '^.{9}ACTION Focus Left$' "$m"
m=$(mark); press Meta+E
check "Meta+E: kwin-i3's Toggle Split"      wait_log '^.{9}ACTION Toggle Split$' "$m"
check "the stand-in keeps Meta+Shift+F11"   test "$(keys_of fakeapp Launch)" == "a(ai) 1 4 $MSF11 0 0 0"
check "the inactive one keeps Meta+H"       test "$(keys_of ghostapp Launch)" == "a(ai) 1 4 $MH 0 0 0"
check "the save exists"                     test -f "$XDG_STATE_HOME/kwin-i3/taken-keys.json"

# 4. make restore-keys: exactly the keys they had, and the save is gone.
(cd "$root" && make -s restore-keys >/dev/null 2>&1)
check "Quick Tile Left has its keys back"   test "$(keys_of kwin "Window Quick Tile Left")" == "$before_tile"
check "the stand-in has its keys back"      test "$(keys_of fakeapp Launch)" == "$before_fake"
check "the save is gone"                    test ! -f "$XDG_STATE_HOME/kwin-i3/taken-keys.json"

# 5. warnTakenKeys off: reloaded, no check and no notification.
kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key warnTakenKeys false
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s kwin-i3 >/dev/null
m=$(mark); load_kwin_i3
check "reloaded"                            wait_log 'kwin-i3 loaded$' "$m"
check "off: not checked"                    wait_log '^.{9}TAKEN not checked' "$m"
sleep 0.5
check "still one notification"              notes_are 1
check "no invariant failures or errors"     clean_log
finish
