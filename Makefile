.PHONY: build test unit live live-stock mutate mutate-live tools fuzz fuzz-shrink plugin plugin-install kcm kcm-install widget-install take-keys restore-keys
# The plugins are optional (README, "Optional: the plugins"): the live tests and the fuzzer build
# them when kwin-devel is installed (its CMake config); without it,
# tests/live/run.sh skips the scenarios that need the plugins and says so.
PLUGIN_IF := $(if $(wildcard /usr/lib*/cmake/KWin/KWinConfig.cmake /usr/lib/*/cmake/KWin/KWinConfig.cmake),plugin)
build:
	./build.sh
unit:
	node --test tests/unit/*.test.js
# The settings page likewise, when kf6-kcmutils-devel is installed.
KCM_IF := $(if $(wildcard /usr/lib*/cmake/KF6KCMUtils/KF6KCMUtilsConfig.cmake /usr/lib/*/cmake/KF6KCMUtils/KF6KCMUtilsConfig.cmake),kcm)
live: build tools $(PLUGIN_IF) $(KCM_IF)
	tests/live/run.sh
# Plasma's stock settings, as a stranger's install has them.
live-stock: build tools $(PLUGIN_IF) $(KCM_IF)
	KI3_STOCK=1 tests/live/run.sh
test: unit live
mutate:
	python3 tests/unit/mutate.py
# Held during the Stage (LATER.md item 36); then in runs of 5 minutes or less.
fuzz: build tools $(PLUGIN_IF)
	python3 tests/fuzz/run.py --minutes $(or $(FUZZ_MINUTES),5) --jobs $(or $(FUZZ_JOBS),6) $(if $(FUZZ_SKIP),--skip $(FUZZ_SKIP))
# Shrink the new failures a campaign saved (FUZZ_SEEDS=214,215 for particular ones).
fuzz-shrink: build tools $(PLUGIN_IF)
	python3 tests/fuzz/run.py --reshrink $(or $(FUZZ_SEEDS),all)
mutate-live:
	python3 tests/live/mutate.py

tools: tools/bin/ei-send
tools/bin/ei-send: tools/ei-send.c
	mkdir -p tools/bin && gcc -O2 -Wall -Wextra -o $@ $< $$(pkg-config --cflags --libs libei-1.0)

# The two plugins (plugin/), against the installed kwin-devel.
plugin:
	cmake -S plugin -B plugin/build -DCMAKE_BUILD_TYPE=RelWithDebInfo >/dev/null
	cmake --build plugin/build -j8
plugin-install: plugin
	tools/plugin-install.sh
# kwin-i3's System Settings page (kcm/), against kf6-kcmutils-devel.
kcm:
	cmake -S kcm -B kcm/build -DCMAKE_BUILD_TYPE=RelWithDebInfo >/dev/null
	cmake --build kcm/build -j8
kcm-install: kcm
	tools/kcm-install.sh
# The workspace widget (widget/): QML only, nothing to build.
widget-install:
	kpackagetool6 -t Plasma/Applet -u widget >/dev/null 2>&1 || kpackagetool6 -t Plasma/Applet -i widget
# Free kwin-i3's keys that other shortcuts hold, and put them back.
take-keys:
	python3 -I tools/take-keys.py take
restore-keys:
	python3 -I tools/take-keys.py restore
