# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.14.1-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c
ARG POSTGRES_IMAGE=postgres:18.6-bookworm@sha256:1c59e2c3c818eaa0f0628f695b36e7c9e362d6b219b36a54a32df645cbd7e1af
FROM ${NODE_IMAGE} AS build

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
WORKDIR /srv/bros

RUN npm install --global pnpm@11.19.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/admin/package.json apps/admin/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/browser/package.json packages/browser/package.json
COPY packages/backup/package.json packages/backup/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/image/package.json packages/image/package.json
COPY packages/importer/package.json packages/importer/package.json
COPY packages/queue/package.json packages/queue/package.json
COPY packages/storage/package.json packages/storage/package.json

COPY apps apps
COPY packages packages
COPY scripts scripts
COPY tests tests
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM build AS api
RUN mkdir -p /srv/bros/profiles && chown node:node /srv/bros/profiles && chmod 700 /srv/bros/profiles
USER node
CMD ["node", "apps/api/dist/main.js"]

FROM build AS worker
USER root
RUN mkdir -p /srv/bros/profiles && chown node:node /srv/bros/profiles && chmod 700 /srv/bros/profiles
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN pnpm --filter @bros/browser exec playwright install --with-deps chromium \
  && chmod -R a+rX /ms-playwright
USER node
CMD ["node", "apps/worker/dist/main.js"]

FROM ${POSTGRES_IMAGE} AS backup
COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=build /srv/bros /srv/bros
WORKDIR /srv/bros
RUN mkdir -p /var/lib/bros-backup /var/lib/bros-backup-alert \
  && chown 1000:1000 /var/lib/bros-backup /var/lib/bros-backup-alert \
  && chmod 700 /var/lib/bros-backup /var/lib/bros-backup-alert
USER 1000:1000
ENTRYPOINT []
CMD ["node", "scripts/run-database-backup-scheduler.mjs"]

FROM caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d AS edge
COPY ops/Caddyfile /etc/caddy/Caddyfile
COPY --chmod=755 ops/edge-entrypoint.sh /usr/local/bin/bros-edge
COPY --from=build /srv/bros/apps/admin/dist /srv/bros-admin
RUN chown -R 1000:1000 /data /config && chmod 700 /data /config
USER 1000:1000
ENTRYPOINT ["/usr/local/bin/bros-edge"]
