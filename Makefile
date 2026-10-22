.PHONY: build test unit live mutate mutate-live tools
build:
	./build.sh
unit:
	node --test tests/unit/*.test.js
live: build tools
	tests/live/run.sh
test: unit live
mutate:
	python3 tests/unit/mutate.py
mutate-live:
	python3 tests/live/mutate.py

tools: tools/bin/ei-send
tools/bin/ei-send: tools/ei-send.c
	mkdir -p tools/bin && gcc -O2 -Wall -Wextra -o $@ $< $$(pkg-config --cflags --libs libei-1.0)
