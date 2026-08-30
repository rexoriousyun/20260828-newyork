# Deploying

**Fly.io, `yyz` (Toronto).** Why that platform and that region is in `E-D25` and the notes
below; the short version is that every basemap tile is proxied through this API, so region
latency is felt on every pan of the map, and "the map feels slow" is exactly the noise that
would contaminate `Q-A`.

---

## Once

```bash
fly launch --no-deploy --copy-config   # reads fly.toml as it stands
```

## Every deploy

```bash
npm run data     # ingest -> precompute -> benchmark. Needs network; takes a while.
npm run build    # optional locally — the image builds it too
fly deploy
```

`npm run data` is three steps and the order matters:

| step | produces | why |
|---|---|---|
| `ingest` | `transit.db`, `data/raw/gtfs.zip`, `data/raw/stop_times.txt` | the feed |
| `precompute` | `data/connections.bin` (24 MB) | 74% of the cold start, done once |
| `benchmark` | `data/benchmark.json` | the reference class trips are ranked against (D-28) |

**The data is built before the image, not inside it.** Ingesting during the build would pull
a fresh TTC feed on every deploy, so the schedule underneath a rider session could change
between deploys and the benchmark would no longer match the data it was drawn from. For
testing, deterministic beats self-contained: the image ships exactly the data the app was
verified against.

## What the image contains

| | size | note |
|---|---|---|
| `node_modules` | 154 MB | production only |
| `data/` | 113 MB | `transit.db` 55, `gtfs.zip` 36, `connections.bin` 24 |
| `web/dist` | 1.3 MB | 315 KB gzipped over the wire |
| `dist/` | 364 KB | compiled server |

**`stop_times.txt` is deliberately absent.** It is 207 MB and exists only to build
`connections.bin`; shipping it would triple the data to preserve a fallback path that should
never run in production. `.dockerignore` excludes it from the build context too, so it is not
uploaded on every deploy.

Two npm flags carry more weight than they look:

- **`--omit=optional`** alongside `--omit=dev`. `@prisma/client` declares the `prisma` CLI as
  an *optional peer*, which npm installs by default — the production tree carried the CLI
  plus TypeScript, Babel and `effect`, 175 MB to run a query engine that ships inside the
  client itself.
- **`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`**. Playwright is a devDependency used only by the
  screenshot and driver scripts, and its postinstall fetches ~500 MB of browsers.

## Boot, and why the health check matters

The process listens immediately and returns **503 from `/api/health` until it is warm** —
the journey graph, the pooled-severity caches and the route ranking, about 3 s. Fly's health
check holds traffic off a machine until it passes.

That is the whole point. Before `D-36` the graph built lazily, so the **first rider to plan a
trip after a deploy waited 12.3 s**. Now the platform waits and the rider does not.

`min_machines_running = 1` and `auto_stop_machines = false` for the same reason: a machine
that has scaled to zero makes someone pay the warm-up.

## Verified, and how

Built and run locally as a container:

| | |
|---|---|
| container start → healthy | **3.1 s** |
| first `/api/plan` | **102 ms**, 13,590 B on the wire |
| `/api/routes/ranking` | 7 ms |
| `/api/stops/search` | 19 ms |
| first paint, slow 4G | **2.1 s** (7.1 s before compression) |

## No secrets

Everything is public Toronto Open Data and the TTC GTFS feed. `DATABASE_URL` points at a
read-only SQLite file inside the image. Nothing writes at runtime, which is why there is no
volume and why the machine is disposable.

## What would change for real traffic

Nothing here is sized for more than a rider study.

- **SQLite in the image** means a data update is a deploy. That is correct while the feed is
  monthly and wrong the moment anything writes. `D-09` names Postgres as the migration.
- **One machine.** Since nothing writes and the data is baked in, scaling out is adding
  machines — but each one costs 441 MB and a 3 s warm-up.
- **The tile proxy is unmetered.** Fine for a handful of sessions; it is the first thing that
  would need a cache in front of it.
