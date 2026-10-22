.PHONY: build test unit live
build:
	./build.sh
unit:
	node --test tests/unit/*.test.js
live: build
	tests/live/run.sh
test: unit live
