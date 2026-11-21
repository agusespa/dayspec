.PHONY: hooks verify dev run web build test check-routine lint e2e docker

IMAGE ?= ghcr.io/agusespa/dayspec:latest
PLATFORMS ?= linux/amd64,linux/arm64

hooks:
	git config core.hooksPath scripts

verify:
	./scripts/verify.sh

# The Vite dev server on :5173; run `make run` separately for the template API on :8080.
dev:
	npm --prefix web run dev -- --port 5173

# Build the frontend and run the production server on :8080.
run: web
	go run ./cmd/dayspec

# Build the frontend and copy it where the Go binary embeds it from.
web:
	npm --prefix web ci
	npm --prefix web run build
	find internal/ui/dist -mindepth 1 ! -name .gitkeep -exec rm -rf {} +
	cp -R web/build/. internal/ui/dist/

build: web
	CGO_ENABLED=0 go build -o bin/dayspec ./cmd/dayspec

test:
	go test -v -race ./...
	npm --prefix web test

# Validate routine.default.json (schema, references, repeated text) and run the acceptance checks.
check-routine:
	npm --prefix web run check:routine

lint:
	golangci-lint run ./...

# test:e2e builds the frontend first, so this skips the full build target.
e2e:
	npm ci
	npm --prefix web ci
	npx playwright install chromium
	npm run test:e2e

docker:
	docker buildx build --platform $(PLATFORMS) -t $(IMAGE) .
