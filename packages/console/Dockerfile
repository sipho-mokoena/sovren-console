# syntax=docker/dockerfile:1
#
# The console, as a container.
#
# Build from the REPOSITORY ROOT, not from this directory -- the console is one
# package of a pnpm workspace, and it cannot build without its siblings:
#
#   docker build -f packages/console/Dockerfile -t sovren-console .
#
# The sibling `packages/docs/Dockerfile` is built the same way and for the same
# reason. What differs here is the install, and the reason is worth recording:
# this image installs a FILTERED dependency set rather than the whole workspace.
#
#   pnpm install --frozen-lockfile --filter "@sovren/console..."
#
# pnpm keeps ONE virtual store for a monorepo, so a full install drags Next,
# fumadocs and their trees into an image that serves none of them -- the docs
# image is ~1.6 GB for exactly that reason. The console's own closure is a
# little under 500 MB. Neither number is the dependency count; both are the
# store.
#
# `...` is not decoration. It means "and everything this depends on", which pulls
# in the two workspace siblings the console actually imports -- @sovren/client
# and @sovren/fakes. Without it the build fails on a missing workspace link,
# not on a missing npm package, which is a confusing way to find out.

FROM node:24-alpine AS build

WORKDIR /srv

# The pnpm version is pinned by the root package.json `packageManager` field.
# git is here because the root `prepare` script (`vp config`) shells out to it.
RUN apk add --no-cache git
RUN npm install --global pnpm@12.6.0

COPY . .
RUN pnpm install --frozen-lockfile --filter "@sovren/console..."
RUN pnpm --filter @sovren/console run build

FROM node:24-alpine AS run

WORKDIR /srv

ENV NODE_ENV=production

# pnpm links dependencies through the root store, so the root `node_modules` has
# to travel with each package's own. The store is the whole workspace's, and it
# is the bulk of this image.
COPY --from=build /srv/node_modules /srv/node_modules
COPY --from=build /srv/packages/console /srv/packages/console
COPY --from=build /srv/packages/client /srv/packages/client
COPY --from=build /srv/packages/fakes /srv/packages/fakes

WORKDIR /srv/packages/console

# No EXPOSE. The port this container listens on is SOVREN_CONSOLE_PORT, read
# from config/ports.env, and EXPOSE cannot read an environment variable -- so
# writing one here would put a second copy of a number in the repository, and
# the second copy is the one that goes stale. Publishing is declared in
# docker-compose.yml, which interpolates the same variable. EXPOSE is
# documentation the daemon does not act on, and compose already documents it.

# `vite preview` is the production server for this build: the console is a
# TanStack Start app in SPA mode, so the build is a client bundle plus the
# service worker, and there is no control plane to talk to.
#
# The port comes from the environment and is required. `strictPort` is set so a
# collision is a crash with a clear message rather than a silent move to 4142,
# which is the failure mode where the container is healthy and the registry is
# wrong. `/` answers 307 to the first screen, which wget follows.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${SOVREN_CONSOLE_PORT}/" || exit 1

CMD ["/bin/sh", "-c", "exec ./node_modules/.bin/vite preview --host 0.0.0.0 --strictPort --port ${SOVREN_CONSOLE_PORT}"]
