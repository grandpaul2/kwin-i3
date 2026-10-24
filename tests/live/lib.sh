# Helpers for live scenarios. Sourced inside tools/testkwin.sh (headless KWin, private bus).
# Every wait polls for the event it needs; no helper sleeps a fixed time and hopes
# (test review 2026-10-22, faults 1-4).
#
#   kjs '<js>'            run a throwaway KWin script that has log(); prints what it logged.
#                         Fails loudly (stderr, status 1) on a script error or a timeout.
#   load_kwin_i3          load package/contents/code/main.js as the script "kwin-i3"
#   client <args>         start tools/testclient.py (see its --help) and wait for its window
#   kclose <caption>      close that window and wait until it is gone
#   key "<action>"        press a kwin-i3 shortcut ("Split V", ...) and wait for it to run
#   mark                  the log's current length, for the [mark] arguments below
#   wait_log <regex> [mark]           a log line matching regex (after mark)
#   tree <n> [mark]                   workspace n's last logged tree (after mark)
#   wait_tree <n> <want> [mark]       wait for workspace n's tree to be <want>
#   geom <caption>                    "x,y wxh" of that window's frame
#   wait_geom <caption> <want>        wait for that frame (geom_is is the same)
#   clean_log             no INVARIANT/ERROR/WARN line logged (prints the first one if there is)
#   check <msg> <cmd...>  run cmd, record ok/FAIL; finish prints the tally and sets the status
#   KI3_FAILFAST=1        stop at the first FAIL (the mutation battery uses this)
here_live=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(cd "$here_live/../.." && pwd)
passed=0; failed=0
WAIT=${KI3_WAIT:-5}                     # seconds any one wait may take

# Before the sink's first line there is no log: 0. The braces silence the redirect's own error,
# which a 2>/dev/null after it comes too late for (it printed after the tally: testkwin.sh's
# stderr filter holds it until the end).
mark() { { wc -l < "$KI3_LOG"; } 2>/dev/null || echo 0; }
after() { tail -n +"$((${1:-0} + 1))" "$KI3_LOG" 2>/dev/null; }

# poll <cmd...>: retry cmd every 0.05 s for up to $WAIT seconds.
poll() {
    local end=$((SECONDS + WAIT))
    while :; do
        "$@" && return 0
        (( SECONDS >= end )) && return 1
        sleep 0.05
    done
}

kjs() {
    # A unique id per call without shell state: kjs runs in subshells ($(kjs ...)), where a
    # counter never advances (review fault 1).
    local n="kjs-$(date +%s%N)-$RANDOM" before f
    f=$KI3_TMP/$n.js
    {
        echo 'function log(s) { callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", "kjs: " + s); }'
        echo "try {"
        echo "$1"
        echo "} catch (e) { log(\"ERROR \" + e); }"
        echo "log(\"$n-END\");"
    } > "$f"
    before=$(mark)
    busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting loadScript ss "$f" "$n" >/dev/null
    busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting start
    local end=$((SECONDS + WAIT)) done=""
    while (( SECONDS < end )); do
        after "$before" | grep -qF "kjs: $n-END" && { done=1; break; }
        sleep 0.02
    done
    busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s "$n" >/dev/null
    local out; out=$(after "$before" | grep '^.\{9\}kjs: ' | grep -vF "$n-END" | cut -c15-)
    if [[ -z $done ]]; then echo "kjs: no answer in ${WAIT}s (a syntax error?): $1" >&2; return 1; fi
    if grep -q '^ERROR ' <<<"$out"; then echo "kjs: $(grep '^ERROR ' <<<"$out" | head -1)" >&2; return 1; fi
    [[ -n $out ]] && printf '%s\n' "$out"
    return 0
}

load_kwin_i3() {
    busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting loadScript ss \
        "$root/package/contents/code/main.js" kwin-i3 >/dev/null
    busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting start
    # Stock mode: free kwin-i3's keys as the README does, once per scenario (a reload's second
    # run would take nothing).
    if [[ ${KI3_STOCK:-} == 1 && ! -e $KI3_TMP/took-keys ]]; then
        wait_log 'kwin-i3 loaded$' && (cd "$root" && make -s take-keys >&2) && touch "$KI3_TMP/took-keys"
    fi
}

_has_window() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(1); });" | grep -q 1; }
_no_window() { ! _has_window "$1"; }

client() {
    local title="" a=("$@") i
    for ((i = 0; i < ${#a[@]}; i++)); do [[ ${a[i]} == --title ]] && title=${a[i+1]}; done
    "$root/tools/testclient.py" "$@" >/dev/null 2>&1 &
    if [[ -n $title ]] && ! poll _has_window "$title"; then
        echo "    client: no window \"$title\" after ${WAIT}s" >&2
    fi
    return 0
}

kclose() {
    kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") w.closeWindow(); });" >/dev/null
    poll _no_window "$1" || echo "    kclose: \"$1\" still open after ${WAIT}s" >&2
}

_logged_since() { after "$2" | grep -qE "$1"; }
wait_log() { poll _logged_since "$1" "${2:-0}"; }

key() {
    local m; m=$(mark)
    busctl --user call org.kde.kglobalaccel /component/kwin org.kde.kglobalaccel.Component invokeShortcut s "kwin-i3 $1"
    wait_log "^.{9}ACTION $1\$" "$m" || echo "    key: \"$1\" did not run within ${WAIT}s" >&2
}

tree() { after "${2:-0}" | grep -E "^.{9}TREE $1 " | tail -1 | cut -d' ' -f4-; }
_tree_is() { [[ "$(tree "$1" "$3")" == "$2" ]]; }
wait_tree() {
    poll _tree_is "$1" "$2" "${3:-0}" && return 0
    echo "    workspace $1 is: $(tree "$1" "${3:-0}")   wanted: $2"; return 1
}

geom() {
    kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { var g = w.frameGeometry; log(Math.round(g.x) + \",\" + Math.round(g.y) + \" \" + Math.round(g.width) + \"x\" + Math.round(g.height)); } });"
}
_geom_is() { [[ "$(geom "$1")" == "$2" ]]; }
wait_geom() {
    poll _geom_is "$1" "$2" && return 0
    echo "    $1 is at $(geom "$1"), wanted $2"; return 1
}
geom_is() { wait_geom "$@"; }

clean_log() {
    local bad; bad=$(grep -E '^.{9}(INVARIANT|ERROR|WARN)' "$KI3_LOG" | head -1)
    [[ -z $bad ]] && return 0
    echo "    log: ${bad:9}"; return 1
}

ok()   { passed=$((passed + 1)); echo "  ok   $*"; }
fail() {
    failed=$((failed + 1)); echo "  FAIL $*"
    if [[ -n ${KI3_FAILFAST:-} ]]; then finish; exit 1; fi
}
check() { local msg=$1; shift; if "$@"; then ok "$msg"; else fail "$msg"; fi; }
finish() {
    echo "  $passed passed, $failed failed"
    (( passed + failed > 0 )) || { echo "  FAIL no checks ran"; return 1; }
    [[ $failed -eq 0 ]]
}

# Real input (tools/inject.py; see docs/input-tests-design.md and its review).
#   press "Meta+Shift+V"            one chord: modifiers down, key down/up, modifiers up
#   drag "Meta" left|right X1 Y1 X2 Y2   button drag with modifiers held, 4 steps
#   point X Y                       move the pointer
declare -A EVDEV=(
    [Meta]=125 [Shift]=42 [Ctrl]=29 [Alt]=56
    [Left]=105 [Right]=106 [Up]=103 [Down]=108 [Space]=57 [";"]=39 [":"]=39
    [Q]=16 [W]=17 [E]=18 [R]=19 [T]=20 [Y]=21 [U]=22 [I]=23 [O]=24 [P]=25
    [A]=30 [S]=31 [D]=32 [F]=33 [G]=34 [H]=35 [J]=36 [K]=37 [L]=38
    [Z]=44 [X]=45 [C]=46 [V]=47 [B]=48 [N]=49 [M]=50
    [1]=2 [2]=3 [3]=4 [4]=5 [5]=6 [6]=7 [7]=8 [8]=9 [9]=10 [0]=11
)
INJECT="$root/tools/inject.py"
press() {
    local -a parts mods cmds; local k
    IFS=+ read -ra parts <<<"$1"
    local key=${parts[-1]}
    unset 'parts[-1]'
    mods=("${parts[@]}")
    [[ $key == ":" ]] && mods+=(Shift)           # ':' is Shift+; on a US keyboard
    for k in "${mods[@]}"; do cmds+=("key ${EVDEV[$k]} down"); done
    cmds+=("key ${EVDEV[$key]} down" "key ${EVDEV[$key]} up")
    for ((k = ${#mods[@]} - 1; k >= 0; k--)); do cmds+=("key ${EVDEV[${mods[k]}]} up"); done
    "$INJECT" "${cmds[@]}"
}
point() { "$INJECT" "abs $1 $2" "wait 30"; }
drag() {   # drag <mods> <button> x1 y1 x2 y2
    local -a mods cmds; local k s
    IFS=+ read -ra mods <<<"$1"
    local b=$2 x1=$3 y1=$4 x2=$5 y2=$6
    cmds+=("abs $x1 $y1" "wait 30")
    for k in "${mods[@]}"; do cmds+=("key ${EVDEV[$k]} down"); done
    cmds+=("btn $b down")
    for s in 1 2 3 4; do cmds+=("abs $((x1 + (x2 - x1) * s / 4)) $((y1 + (y2 - y1) * s / 4))" "wait 0"); done
    cmds+=("btn $b up")
    for ((k = ${#mods[@]} - 1; k >= 0; k--)); do cmds+=("key ${EVDEV[${mods[k]}]} up"); done
    "$INJECT" "${cmds[@]}"
}
