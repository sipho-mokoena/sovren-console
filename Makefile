# sovren — the whole prototype, from one entry point.
#
# Every target reads its ports from config/ports.env. No port number is
# written in this file, in docker-compose.yml, or in the documentation.

include config/ports.env
export

CONSOLE := packages/console
DOCS := packages/docs
CLIENT := packages/client
FAKES := packages/fakes
CONTRACT := openapi/sovren.json
COMPOSE := docker compose --env-file config/ports.env

.DEFAULT_GOAL := help

## help: list the targets
.PHONY: help
help:
	@grep -hE '^## ' $(MAKEFILE_LIST) | sed 's/^## /  /' | column -t -s ':'

## install: install every workspace package
.PHONY: install
install:
	@echo "installing workspace"
	@vp install

## generate: regenerate the client from the contract document
.PHONY: generate
generate:
	@echo "generating client from $(CONTRACT)"
	@cd $(CLIENT) && pnpm run generate

## generate-check: fail if the committed document differs from a regenerated one
.PHONY: generate-check
generate-check:
	@cd $(CLIENT) && pnpm run generate
	@if [ -z "$$(git ls-files -- $(CLIENT)/src/generated)" ]; then \
		echo ""; \
		echo "  generated output is not tracked by git, so this check cannot compare anything."; \
		echo "  the pin only works against a committed tree -- commit it, then run 'make check' again."; \
		exit 1; \
	fi
	@if [ -n "$$(git status --porcelain -- $(CLIENT)/src/generated)" ]; then \
		echo ""; \
		echo "  generated client is stale -- run 'make generate' and commit the result"; \
		git status --short -- $(CLIENT)/src/generated; \
		exit 1; \
	fi

## dev: run the console and the documentation site, side by side
.PHONY: dev
dev:
	@echo "console   http://localhost:$(SOVREN_CONSOLE_PORT)"
	@echo "docs      http://localhost:$(SOVREN_DOCS_PORT)"
	@echo "mocks     on; press 'd' in any list to cycle error sentinels"
	@cd $(CONSOLE) && concurrently -n console,docs -c green,magenta -p "[sovren]" \
		"pnpm run dev --port $(SOVREN_CONSOLE_PORT)" \
		"pnpm --dir ../$(DOCS) run dev --port $(SOVREN_DOCS_PORT)"

## test: run every test in the workspace
.PHONY: test
test:
	@vp test

## typecheck: type-check every package
.PHONY: typecheck
typecheck:
	@vp check --no-fmt --no-lint

## lint: lint and format-check every package
.PHONY: lint
lint:
	@vp check

## check: the full verification sweep -- generate, format, lint, types, tests
.PHONY: check
check: lint typecheck test generate-check
	@echo ""
	@echo "  all green"

## up: start the stack in containers
.PHONY: up
up: generate
	@$(COMPOSE) up -d --wait
	@echo ""
	@echo "  console   http://localhost:$(SOVREN_CONSOLE_PORT)"
	@echo "  docs      http://localhost:$(SOVREN_DOCS_PORT)"
	@echo "  postgres  localhost:$(SOVREN_POSTGRES_PORT)"

## down: stop the stack
.PHONY: down
down:
	@$(COMPOSE) down

## down-hard: stop the stack and discard the database volume
.PHONY: down-hard
down-hard:
	@$(COMPOSE) down -v

## logs: follow every service's logs
.PHONY: logs
logs:
	@$(COMPOSE) logs -f --tail 40

## ps: show the stack and the port each service is on
.PHONY: ps
ps:
	@$(COMPOSE) ps

## clean: remove build output and node_modules
.PHONY: clean
clean:
	@rm -rf */node_modules */*/node_modules
	@rm -rf .vp-cache */dist */*/dist
	@echo "  cleaned"
