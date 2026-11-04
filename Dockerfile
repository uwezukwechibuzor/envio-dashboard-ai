# Multi-stage build for the envio-data-mcp HTTP server.
# Target: metrics API + MCP server on Railway/Fly.io
#
# Build:  docker build -t envio-mcp .
# Run:    docker run -e ENVIO_API_TOKEN=... -p 3001:3001 envio-mcp

# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:26-alpine AS builder
WORKDIR /build

# pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies first (layer cache)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/core/package.json             packages/core/
COPY packages/hypersync/package.json        packages/hypersync/
COPY packages/metrics/package.json          packages/metrics/
COPY packages/mcp-server/package.json       packages/mcp-server/

RUN pnpm install --frozen-lockfile

# Copy source and build
COPY tsconfig.base.json tsconfig.json ./
COPY packages/ packages/

RUN pnpm -r --filter './packages/*' build

# ── Stage 2: runner ───────────────────────────────────────────────────────────
FROM node:26-alpine AS runner
WORKDIR /app

# Non-root user
RUN addgroup -S envio && adduser -S envio -G envio

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy built artefacts and production deps only
COPY --from=builder /build/pnpm-workspace.yaml .
COPY --from=builder /build/pnpm-lock.yaml .
COPY --from=builder /build/package.json .
COPY --from=builder /build/packages/core/package.json          packages/core/
COPY --from=builder /build/packages/core/dist                  packages/core/dist/
COPY --from=builder /build/packages/hypersync/package.json     packages/hypersync/
COPY --from=builder /build/packages/hypersync/dist             packages/hypersync/dist/
COPY --from=builder /build/packages/metrics/package.json       packages/metrics/
COPY --from=builder /build/packages/metrics/dist               packages/metrics/dist/
COPY --from=builder /build/packages/mcp-server/package.json    packages/mcp-server/
COPY --from=builder /build/packages/mcp-server/dist            packages/mcp-server/dist/

RUN pnpm install --frozen-lockfile --prod

USER envio

EXPOSE 3001

ENV MCP_PORT=3001
ENV NODE_ENV=production

CMD ["node", "packages/mcp-server/dist/bin/envio-data-mcp.js", "--http"]
