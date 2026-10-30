#!/usr/bin/env bash
# The test KWin on another distribution's KWin, in a podman container (OPEN.md item 67): Plasma
# 6.8 on a Fedora 44 desktop that has only 6.7. Headless, as tools/testkwin.sh always is. KWin 6.8's
# virtual backend needs a render node (none: "Found no render device!", no compositing, no window
# ever resized), so the Mesa-driven ones (AMD, Intel) are passed in; NVIDIA's would need the
# host's driver libraries at its version. Paul's desktop: the AMD iGPU, renderD128.
#   tools/box.sh build                   builds the image (tools/box/Containerfile.arch)
#   tools/box.sh run <command...>        runs it in /work/kwin-i3, a copy of this checkout's working tree,
#                                        e.g. tools/box.sh run make tools plugin
#   tools/box.sh shell                   a shell there
# The checkout is mounted read-only and copied, never written: it may be what the live KWin loads
# (AGENTS.md, "Safety"). Builds start fresh in each run (the copy leaves out plugin/build).
#   KI3_BOX_OUT=<dir>                    /work/kwin-i3/tests/live/out (a red's output and log) copied there
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
image=kwin-i3-box-arch

case ${1:-} in
build)
    exec podman build -t "$image" -f "$repo/tools/box/Containerfile.arch" "$repo/tools/box" ;;
run|shell)
    [[ $1 == shell ]] && set -- bash || shift
    [[ $# -gt 0 ]] || { echo "usage: tools/box.sh run <command...>" >&2; exit 2; }
    out=()
    if [[ -n ${KI3_BOX_OUT:-} ]]; then mkdir -p "$KI3_BOX_OUT"; out=(-v "$(cd "$KI3_BOX_OUT" && pwd):/out"); fi
    tty=(); [[ -t 0 ]] && tty=(-it)
    gpu=()
    for d in /sys/class/drm/renderD*; do
        [[ $(cat "$d/device/vendor" 2>/dev/null) == 0x10de ]] || gpu+=(--device "/dev/dri/${d##*/}")
    done
    [[ ${#gpu[@]} -gt 0 ]] || { echo "box: no Mesa render node (AMD, Intel) for KWin 6.8" >&2; exit 1; }
    exec podman run --rm "${tty[@]}" --userns=keep-id --security-opt label=disable --tmpfs /tmp:rw,mode=1777 \
        "${gpu[@]}" -v "$repo:/src:ro" "${out[@]}" -e HOME=/work/.home -e KI3_JOBS="${KI3_JOBS:-4}" \
        "$image" bash -c '
            set -e
            tar -C /src --exclude=./.git --exclude=./plugin/build --exclude=./kcm/build \
                --exclude=./tools/bin --exclude=./tests/live/out -cf - . | (mkdir /work/kwin-i3 && tar -C /work/kwin-i3 -xf -)
            mkdir -p /work/.home && mkdir -m 700 /tmp/xdg-runtime
            export XDG_RUNTIME_DIR=/tmp/xdg-runtime
            cd /work/kwin-i3
            status=0; "$@" || status=$?
            [[ -d /out && -d tests/live/out ]] && cp -a tests/live/out/. /out/
            exit $status' box "$@" ;;
*)
    sed -n '2,12p' "$0" >&2; exit 2 ;;
esac
