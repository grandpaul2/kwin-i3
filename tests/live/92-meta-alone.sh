#!/usr/bin/env bash
# needs: plugin
# Probe (key override, Meta alone): a stand-in for Plasma's "Meta opens the launcher", a shortcut
# on Meta alone that logs PROBE-META. With the override taking Meta+Left, does releasing Meta
# fire it? Normal order (Left up before Meta up) and reverse (Meta up first).
source "$(dirname "$0")/lib.sh"
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting loadScript ss "$root/package/contents/code/main.js" kwin-i3 >/dev/null
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting start
wait_log 'kwin-i3 loaded$'
cat > "$KI3_TMP/meta.js" <<'JS'
registerShortcut("Probe Meta Alone", "probe: meta alone", "Meta", function () {
    callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", "PROBE-META");
});
JS
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting loadScript ss "$KI3_TMP/meta.js" probe-meta >/dev/null
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting start
sleep 0.5
metas() { grep -c 'PROBE-META' "$KI3_LOG"; }
M=${EVDEV[Meta]} L=${EVDEV[Left]}
"$INJECT" "key $M down" "wait 30" "key $M up"; sleep 0.5
echo "    control, Meta alone: $(metas) fired"
check "the stand-in fires on Meta alone"   [ "$(metas)" -ge 1 ]
"$(dirname "$0")/keylog.py" a "$KI3_TMP/keys" >/dev/null 2>&1 & poll _has_window a
"$(dirname "$0")/keylog.py" b "$KI3_TMP/keys" >/dev/null 2>&1 & poll _has_window b
check "a | b"                              wait_tree 1 "H[a b*]"
n=$(metas); "$INJECT" "key $M down" "wait 30" "key $L down" "wait 30" "key $L up" "wait 30" "key $M up"; sleep 0.5
echo "    Meta+Left, Left up first: tree $(tree 1), stand-in fired $(( $(metas) - n ))"
check "normal order: Meta alone didn't fire" [ "$(metas)" == "$n" ]
n=$(metas); "$INJECT" "key $M down" "wait 30" "key $L down" "wait 30" "key $M up" "wait 30" "key $L up"; sleep 0.5
echo "    Meta+Left, Meta up first: tree $(tree 1), stand-in fired $(( $(metas) - n ))"
check "reverse order: Meta alone didn't fire" [ "$(metas)" == "$n" ]
echo "    keys the windows received:"; sed "s/^/      /" "$KI3_TMP/keys" 2>/dev/null
check "no window received Left" eval '! grep -q "Left" "$KI3_TMP/keys"'
finish
