#!/usr/bin/env bash
# Every language's formatter and linter, over the tracked files (docs/testing.md, "Formatting and
# lint").
#   tools/lint.sh check [LANG...]    make lint: change nothing, exit 1 on any finding
#   tools/lint.sh format [LANG...]   make format: every formatter rewrites its files
# LANG is cpp, qml, js, py or sh; none means all. A tool that is missing, or at a version other
# than the one below, is skipped with a line: another version formats or warns differently, and a
# machine must not go red with nothing to fix. The JS tools come from node_modules
# (make lint-tools, the versions in package-lock.json); this script never fetches anything.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

# The versions the tree is formatted and checked with (major.minor; clang-format's major).
CLANG_FORMAT=22
QMLFORMAT=6.11
QMLLINT=6.11
RUFF=0.17
SHFMT=3.7
SHELLCHECK=0.11

mode=${1:-check}
[[ $mode == check || $mode == format ]] || {
    echo "usage: $0 check|format [cpp qml js py sh]" >&2
    exit 2
}
shift || true
langs=("$@")
[[ ${#langs[@]} -gt 0 ]] || langs=(cpp qml js py sh)

failed=()
skip() { echo "lint: skipped $1 ($2)"; }
run() { # run NAME CMD...: a finding is a non-zero exit
    local name=$1
    shift
    "$@" || failed+=("$name")
}

# The first of the names that is installed.
which_of() {
    local c
    for c in "$@"; do
        command -v "$c" && return 0
        [[ -x $c ]] && {
            echo "$c"
            return 0
        }
    done
    return 1
}
# A version as major.minor from a tool's version text.
minor() { grep -oE '[0-9]+\.[0-9]+' | head -1; }
# A package's version from whichever package manager has it.
pkg_version() {
    rpm -q --qf '%{VERSION}' "$1" 2>/dev/null ||
        dpkg-query -W -f '${Version}' "$1" 2>/dev/null ||
        pacman -Q "$1" 2>/dev/null | cut -d' ' -f2
}
# usable NAME WANT HAVE: whether a tool at version HAVE may run, saying why not.
usable() {
    [[ -n $3 ]] || {
        skip "$1" "version unknown, want $2"
        return 1
    }
    [[ $3 == "$2" ]] || {
        skip "$1" "version $3, want $2"
        return 1
    }
}

# Tracked files by extension, and the extensionless scripts by their #! line.
by_shebang() {
    local f
    git ls-files | grep -vE '\.[^/]+$' | while read -r f; do
        head -1 "$f" 2>/dev/null | grep -qE "^#!.*($1)" && echo "$f"
    done
}
files() {
    case $1 in
    cpp) git ls-files '*.cpp' '*.h' '*.c' ;;
    qml) git ls-files '*.qml' ;;
    js) git ls-files '*.js' '*.mjs' '*.json' | grep -vxE 'package/contents/code/main\.js|package-lock\.json' ;;
    py) {
        git ls-files '*.py'
        by_shebang python
    } ;;
    sh) {
        git ls-files '*.sh' '*.bashrc'
        by_shebang 'bash|/sh'
    } ;;
    esac
}

lang_cpp() {
    local cf v
    cf=$(which_of clang-format) || {
        skip clang-format "not installed"
        return
    }
    v=$("$cf" --version | grep -oE 'version [0-9]+' | grep -oE '[0-9]+')
    usable clang-format "$CLANG_FORMAT" "$v" || return
    if [[ $mode == format ]]; then
        "$cf" -i "${list[@]}"
    else
        run clang-format "$cf" --dry-run -Werror "${list[@]}"
    fi
}

lang_qml() {
    local qf ql v f
    if qf=$(which_of qmlformat-qt6 /usr/lib64/qt6/bin/qmlformat /usr/lib/qt6/bin/qmlformat qmlformat); then
        v=$("$qf" --version | minor)
        if usable qmlformat "$QMLFORMAT" "$v"; then
            if [[ $mode == format ]]; then
                "$qf" -i "${list[@]}"
            else
                for f in "${list[@]}"; do
                    "$qf" "$f" | diff -u --label "$f" --label "$f (qmlformat)" "$f" - || failed+=("qmlformat $f")
                done
            fi
        fi
    else
        skip qmlformat "not installed"
    fi
    [[ $mode == check ]] || return
    if ql=$(which_of qmllint-qt6 /usr/lib64/qt6/bin/qmllint /usr/lib/qt6/bin/qmllint qmllint); then
        v=$("$ql" --version | minor)
        usable qmllint "$QMLLINT" "$v" && run qmllint "$ql" --max-warnings 0 "${list[@]}"
    else
        skip qmllint "not installed"
    fi
}

lang_js() {
    [[ -x node_modules/.bin/prettier && -x node_modules/.bin/eslint ]] ||
        {
            skip "prettier, eslint" "no node_modules: make lint-tools"
            return
        }
    if [[ $mode == format ]]; then
        node_modules/.bin/prettier --log-level warn --write "${list[@]}"
    else
        run prettier node_modules/.bin/prettier --log-level warn --check "${list[@]}"
        run eslint node_modules/.bin/eslint --max-warnings 0 .
    fi
}

lang_py() {
    local r v
    r=$(which_of ruff) || {
        skip ruff "not installed"
        return
    }
    v=$("$r" --version | minor)
    usable ruff "$RUFF" "$v" || return
    if [[ $mode == format ]]; then
        "$r" format -q "${list[@]}"
    else
        run "ruff format" "$r" format -q --check "${list[@]}"
        run "ruff check" "$r" check -q "${list[@]}"
    fi
}

lang_sh() {
    local s v
    if s=$(which_of shfmt); then
        v=$({
            "$s" --version 2>/dev/null
            pkg_version shfmt
        } | minor)
        if usable shfmt "$SHFMT" "$v"; then
            if [[ $mode == format ]]; then
                "$s" -i 4 -w "${list[@]}"
            else
                run shfmt "$s" -i 4 -d "${list[@]}"
            fi
        fi
    else
        skip shfmt "not installed"
    fi
    [[ $mode == check ]] || return
    if s=$(which_of shellcheck); then
        v=$("$s" --version | sed -n 's/^version: //p' | minor)
        usable shellcheck "$SHELLCHECK" "$v" && run shellcheck "$s" -f gcc "${list[@]}"
    else
        skip shellcheck "not installed"
    fi
}

for lang in "${langs[@]}"; do
    case $lang in
    cpp | qml | js | py | sh) ;;
    *)
        echo "$0: no language $lang" >&2
        exit 2
        ;;
    esac
    mapfile -t list < <(files "$lang")
    [[ ${#list[@]} -gt 0 ]] && "lang_$lang"
done

if [[ ${#failed[@]} -gt 0 ]]; then
    echo "lint: findings from ${failed[*]} (make format rewrites the formatting)" >&2
    exit 1
fi
