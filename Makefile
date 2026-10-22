.PHONY: build test unit live mutate mutate-live tools fuzz plugin plugin-install
build:
	./build.sh
unit:
	node --test tests/unit/*.test.js
live: build tools plugin
	tests/live/run.sh
test: unit live
mutate:
	python3 tests/unit/mutate.py
fuzz: build tools
	python3 tests/fuzz/run.py --minutes $(or $(FUZZ_MINUTES),20) --jobs $(or $(FUZZ_JOBS),4) $(if $(FUZZ_SKIP),--skip $(FUZZ_SKIP))
mutate-live:
	python3 tests/live/mutate.py

tools: tools/bin/ei-send
tools/bin/ei-send: tools/ei-send.c
	mkdir -p tools/bin && gcc -O2 -Wall -Wextra -o $@ $< $$(pkg-config --cflags --libs libei-1.0)

# The KWin plugin (plugin/, docs/mouse-plugin-design.md), against the installed kwin-devel.
plugin:
	cmake -S plugin -B plugin/build -DCMAKE_BUILD_TYPE=RelWithDebInfo >/dev/null
	cmake --build plugin/build -j8
plugin-install: plugin
	tools/plugin-install.sh
