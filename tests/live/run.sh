#!/usr/bin/env bash
# Run every live scenario, each in its own fresh headless KWin.
set -u
cd "$(dirname "$0")"
status=0
for t in [0-9][0-9]-*.sh; do
    echo "$t"
    timeout 100 ../../tools/testkwin.sh "./$t" 2> >(grep -vE 'Gdk-Message|Gtk-WARNING' >&2) || status=1
done
exit $status
