# syntax=docker/dockerfile:1
#
# The documentation site, as a container.
#
# Build from the REPOSITORY ROOT, not from this directory -- the site's content
# is the repository's own markdown, so the build needs `docs/`, `content/` and
# `config/ports.env` to be present:
#
#   docker build -f packages/docs/Dockerfile -t sovren-docs .
#
# `make up` reads the same environment file docker compose reads, so the port
# this container listens on is `SOVREN_DOCS_PORT` from `config/ports.env`.

FROM node:24-alpine AS build

WORKDIR /srv

# The pnpm version is pinned by the root package.json `packageManager` field.
# git is here because the root `prepare` script (`vp config`) shells out to it.
RUN apk add --no-cache git
RUN npm install --global pnpm@12.6.0

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @sovren/docs run build

FROM node:24-alpine AS run

WORKDIR /srv

ENV NODE_ENV=production
# `next start` reads PORT. The compose file is expected to set this from
# SOVREN_DOCS_PORT, and 4142 is the registry's value as a last resort.
ENV PORT=4142
ENV HOSTNAME=0.0.0.0

# pnpm links dependencies through the root store, so the root `node_modules`
# has to travel with the package's own. That store is the whole workspace's --
# roughly 1.6 GB -- because pnpm keeps one virtual store for the monorepo. A
# filtered production install of just this package would be far smaller, and is
# the obvious thing to do if the image ever needs to be.
COPY --from=build /srv/node_modules /srv/node_modules
COPY --from=build /srv/packages/docs /srv/packages/docs
COPY --from=build /srv/docs /srv/docs
COPY --from=build /srv/content /srv/content
COPY --from=build /srv/config /srv/config

WORKDIR /srv/packages/docs

EXPOSE 4142

HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/" || exit 1

CMD ["./node_modules/.bin/next", "start"]
