# Reliable Transit — one image serving the app, the API and the tile proxy.
#
# The data is built *before* this runs, not inside it:
#
#     npm run data      # ingest + precompute + benchmark
#     fly deploy
#
# Ingesting during the build would make every deploy pull a fresh TTC feed, so
# the schedule underneath a rider session could change between deploys and the
# benchmark would need rebuilding to match. For testing, deterministic beats
# self-contained: the image ships exactly the data the app was verified against.
#
# Runtime data is ~113 MB — transit.db, gtfs.zip and the precomputed connection
# cache. `stop_times.txt` is 207 MB and is deliberately *not* copied: it exists
# only to build `connections.bin`, and shipping it would triple the data to
# preserve a fallback path that should never run in production.

# ---- production dependencies -------------------------------------------------
# Kept in its own stage, and never touched again.
#
# The obvious shape — install everything, build, then `npm ci --omit=dev` in
# place — was 327 MB, because `prisma generate` has to run *after* the install
# and `npx prisma` then reinstalls the CLI, which drags in TypeScript, Babel,
# effect and the engine downloader. None of that runs in production. The
# generated client is copied from the build stage instead.
FROM node:22-slim AS deps
WORKDIR /app
ENV NPM_CONFIG_AUDIT=false NPM_CONFIG_FUND=false
COPY package*.json ./
# `--omit=optional` matters as much as `--omit=dev` here. `@prisma/client`
# declares the `prisma` CLI as an *optional peer*, which npm installs by
# default, so the prod tree carried the CLI plus TypeScript, Babel and effect —
# 175 MB to run a query engine that ships inside the client itself.
RUN npm ci --omit=dev --omit=optional

# ---- build -------------------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Playwright is a devDependency used only by the screenshot and driver scripts.
# Its postinstall downloads ~500 MB of browsers the image has no use for.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV NPM_CONFIG_AUDIT=false NPM_CONFIG_FUND=false

COPY package*.json ./
RUN npm ci
COPY web/package*.json ./web/
RUN npm ci --prefix web

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig*.json ./
COPY src ./src
COPY web ./web
RUN npm run build

# ---- runtime -----------------------------------------------------------------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps  /app/node_modules ./node_modules
# The generated Prisma client, and only that — not the CLI that generated it.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist
COPY package.json ./
COPY prisma ./prisma

# Named one by one rather than `COPY data ./data`, so adding a large
# intermediate to that directory can never silently enter the image.
COPY data/transit.db        ./data/transit.db
COPY data/connections.bin   ./data/connections.bin
COPY data/benchmark.json    ./data/benchmark.json
COPY data/raw/gtfs.zip      ./data/raw/gtfs.zip

# SQLite is read-only here: nothing in the API writes, which is why no volume is
# mounted and why the machine is disposable.
ENV DATABASE_URL="file:/app/data/transit.db"
ENV PORT=8080
EXPOSE 8080

# The process listens immediately and reports unhealthy until the journey graph
# and the scoring caches are warm. That is deliberate: the platform waits so a
# rider does not. See D-36.
CMD ["node", "dist/api/server.js"]
