.PHONY: build test unit live mutate mutate-live tools fuzz fuzz-shrink plugin plugin-install take-keys restore-keys
# The plugins are optional (README, "Optional: the plugins"): the live tests and the fuzzer build
# them when kwin-devel and kdecoration-devel are installed (their CMake configs); without them,
# tests/live/run.sh skips the scenarios that need the plugins and says so.
PLUGIN_IF := $(if $(and $(wildcard /usr/lib*/cmake/KWin/KWinConfig.cmake /usr/lib/*/cmake/KWin/KWinConfig.cmake),$(wildcard /usr/lib*/cmake/KDecoration3/KDecoration3Config.cmake /usr/lib/*/cmake/KDecoration3/KDecoration3Config.cmake)),plugin)
build:
	./build.sh
unit:
	node --test tests/unit/*.test.js
live: build tools $(PLUGIN_IF)
	tests/live/run.sh
test: unit live
mutate:
	python3 tests/unit/mutate.py
fuzz: build tools $(PLUGIN_IF)
	python3 tests/fuzz/run.py --minutes $(or $(FUZZ_MINUTES),20) --jobs $(or $(FUZZ_JOBS),6) $(if $(FUZZ_SKIP),--skip $(FUZZ_SKIP))
# Shrink the new failures a campaign saved (FUZZ_SEEDS=214,215 for particular ones).
fuzz-shrink: build tools $(PLUGIN_IF)
	python3 tests/fuzz/run.py --reshrink $(or $(FUZZ_SEEDS),all)
mutate-live:
	python3 tests/live/mutate.py

tools: tools/bin/ei-send
tools/bin/ei-send: tools/ei-send.c
	mkdir -p tools/bin && gcc -O2 -Wall -Wextra -o $@ $< $$(pkg-config --cflags --libs libei-1.0)

# The three plugins (plugin/), against the installed kwin-devel and kdecoration-devel.
plugin:
	cmake -S plugin -B plugin/build -DCMAKE_BUILD_TYPE=RelWithDebInfo >/dev/null
	cmake --build plugin/build -j8
plugin-install: plugin
	tools/plugin-install.sh
# Free kwin-i3's keys that other shortcuts hold, and put them back (docs/spec-taken-keys.md).
take-keys:
	python3 -I tools/take-keys.py take
restore-keys:
	python3 -I tools/take-keys.py restore
