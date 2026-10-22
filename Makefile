.PHONY: build test unit live mutate mutate-live
build:
	./build.sh
unit:
	node --test tests/unit/*.test.js
live: build
	tests/live/run.sh
test: unit live
mutate:
	python3 tests/unit/mutate.py
mutate-live:
	python3 tests/live/mutate.py
