/**
 * Basemap tile proxy.
 *
 * The client never talks to the tile host directly. Everything — style, sprites,
 * fonts, vector and raster tiles — is fetched server-side and passed through.
 *
 * Worth doing regardless of environment: it keeps any future keyed tile provider
 * out of the client, gives one place to add caching, and means swapping basemap
 * vendors touches one file rather than the app. It is also what makes the map
 * work where a browser has no direct egress.
 */

import type { FastifyInstance } from "fastify";

const UPSTREAM = "https://tiles.openfreemap.org";
const STYLE_PATH = "/styles/liberty";

/**
 * Rewrites upstream absolute URLs so every asset is fetched back through us.
 *
 * The result must stay absolute: MapLibre rejects a relative `sprite` outright.
 * The origin is taken from the request rather than configured, so the same
 * server works behind a dev proxy and in production without a setting.
 */
function rewrite(json: string, base: string): string {
  return json.replaceAll(UPSTREAM, `${base}/u`);
}

function originOf(req: { protocol: string; headers: Record<string, unknown> }): string {
  const forwarded = req.headers["x-forwarded-host"];
  const host = (typeof forwarded === "string" ? forwarded : undefined) ?? String(req.headers["host"] ?? "");
  const proto = (typeof req.headers["x-forwarded-proto"] === "string"
    ? (req.headers["x-forwarded-proto"] as string)
    : req.protocol);
  return `${proto}://${host}`;
}

export function registerTiles(app: FastifyInstance, mountedAt = "/tiles"): void {
  app.get(`${mountedAt}/style`, async (req, reply) => {
    const res = await fetch(`${UPSTREAM}${STYLE_PATH}`);
    if (!res.ok) return reply.code(502).send({ error: `upstream ${res.status}` });
    const base = `${originOf(req)}${mountedAt}`;
    return reply
      .type("application/json")
      .header("cache-control", "public, max-age=3600")
      .send(rewrite(await res.text(), base));
  });

  app.get(`${mountedAt}/u/*`, async (req, reply) => {
    const path = (req.params as { "*": string })["*"];
    const res = await fetch(`${UPSTREAM}/${path}`);
    if (!res.ok) return reply.code(res.status).send();

    const type = res.headers.get("content-type") ?? "application/octet-stream";

    // TileJSON and other JSON documents carry more absolute upstream URLs, so
    // they need the same rewrite or the client escapes the proxy on the next hop.
    if (type.includes("json")) {
      return reply
        .type(type)
        .header("cache-control", "public, max-age=3600")
        .send(rewrite(await res.text(), `${originOf(req)}${mountedAt}`));
    }

    // Deliberately not forwarding content-encoding: fetch() has already
    // decompressed the body, so echoing the upstream header makes the browser
    // try to gunzip plain bytes and fail with ERR_CONTENT_DECODING_FAILED.
    return reply
      .type(type)
      .header("cache-control", "public, max-age=86400")
      .send(Buffer.from(await res.arrayBuffer()));
  });
}
