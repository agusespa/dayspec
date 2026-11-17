#!/bin/sh
# Starts the production server for Playwright.
# Expects the frontend to be built already (web/build), as CI does.
set -e
cd "$(dirname "$0")/.."

if [ ! -f web/build/index.html ]; then
    echo "web/build is missing: run 'npm --prefix web run build' first" >&2
    exit 1
fi
find internal/ui/dist -mindepth 1 ! -name .gitkeep -exec rm -rf {} +
cp -R web/build/. internal/ui/dist/

mkdir -p test-results
go build -o test-results/dayspec ./cmd/dayspec
ROUTINE_PATH="$(mktemp -d)/routine.json" PORT="${PORT:-8182}" exec ./test-results/dayspec
