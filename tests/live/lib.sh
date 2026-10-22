# Helpers for live scenarios. Sourced inside tools/testkwin.sh (headless KWin, private bus).
#   kjs '<js>'        run a throwaway KWin script; it has log(); prints the lines it logged
#   load_kwin_i3      load package/contents/code/main.js as the script "kwin-i3"
#   client <args>     start tools/testclient.py in the background (see its --help)
#   wait_log <regex>  wait up to 5 s for a log line matching regex
#   ok/fail <msg>     record a result; finish prints the tally and sets the exit status
here_live=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(cd "$here_live/../.." && pwd)
passed=0; failed=0

_kjs_n=0
kjs() {
    _kjs_n=$((_kjs_n + 1))
    local f=$KI3_TMP/kjs$_kjs_n.js mark="KJS$_kjs_n-END"
    {
        echo 'function log(s) { callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", "kjs: " + s); }'
        echo "$1"
        echo "log(\"$mark\");"
    } > "$f"
    local before; before=$(wc -l < "$KI3_LOG" 2>/dev/null || echo 0)
    busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting loadScript ss "$f" "kjs$_kjs_n" >/dev/null
    busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting start
    for _ in $(seq 50); do grep -q "$mark" "$KI3_LOG" 2>/dev/null && break; sleep 0.1; done
    busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s "kjs$_kjs_n" >/dev/null
    tail -n +"$((before + 1))" "$KI3_LOG" | grep '^.\{9\}kjs: ' | grep -v "$mark" | cut -c15-
}

load_kwin_i3() {
    busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting loadScript ss \
        "$root/package/contents/code/main.js" kwin-i3 >/dev/null
    busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting start
}

client() { "$root/tools/testclient.py" "$@" >/dev/null 2>&1 & }

wait_log() {
    for _ in $(seq 50); do grep -qE "$1" "$KI3_LOG" 2>/dev/null && return 0; sleep 0.1; done
    return 1
}

ok()   { passed=$((passed + 1)); echo "  ok   $*"; }
fail() { failed=$((failed + 1)); echo "  FAIL $*"; }
check() { local msg=$1; shift; if "$@"; then ok "$msg"; else fail "$msg"; fi; }
finish() { echo "  $passed passed, $failed failed"; [[ $failed -eq 0 ]]; }
