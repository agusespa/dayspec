#!/bin/sh
# Starts one production server per Playwright worker, each with its own routine file.
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

BASE_PORT="${BASE_PORT:-8182}"
WORKERS="${WORKERS:-1}"
trap 'kill 0' INT TERM EXIT
i=0
while [ "$i" -lt "$WORKERS" ]; do
    ROUTINE_PATH="$(mktemp -d)/routine.json" PORT=$((BASE_PORT + i)) ./test-results/dayspec &
    i=$((i + 1))
done
wait
