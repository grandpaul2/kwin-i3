#!/usr/bin/env bash
# The harness itself: kwin-i3 loads and logs, and the test client's awkward kinds appear as such.
source "$(dirname "$0")/lib.sh"

load_kwin_i3
check "kwin-i3 loads and logs" wait_log '^.{9}kwin-i3 loaded$'

client --title plain
client --title fixed --fixed
client --title dialoger --dialog
client --title slow --map-delay 1.5
client --title before --retitle 1:after
sleep 3.5

info=$(kjs 'workspace.windowList().forEach(function (w) {
    log(w.caption + "|normal=" + w.normalWindow + "|resizeable=" + w.resizeable +
        "|transient=" + w.transient + "|modal=" + w.modal); });')
has() { grep -qF -- "$1" <<<"$info"; }
check "plain window: normal, resizeable"    has "plain|normal=true|resizeable=true|transient=false"
check "--fixed: not resizeable"             has "fixed|normal=true|resizeable=false"
# On Wayland a dialog is a normal window; only transient/modal mark it (2026-10-21).
check "--dialog: modal transient dialog"    has "dialoger dialog|normal=true|resizeable=true|transient=true|modal=true"
check "--map-delay: appears late"           has "slow|normal=true"
check "--retitle: new title"                has "after|normal=true"
finish
