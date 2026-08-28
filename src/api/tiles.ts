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
 * Converts a colour token to greyscale, lifted slightly toward the surface.
 *
 * The basemap is the ground, not the subject. A vendor style paints roads orange
 * and parks green, which competes with the one reserved colour that carries
 * meaning — so the whole basemap is desaturated on the way through and the only
 * colour left on screen is data.
 */
function greyToken(token: string): string {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(token);
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(token);

  let r: number, g: number, b: number, a = 1;
  if (hex !== null) {
    let h = hex[1]!;
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
    if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255;
  } else if (rgba !== null) {
    r = Number(rgba[1]);
    g = Number(rgba[2]);
    b = Number(rgba[3]);
    a = rgba[4] === undefined ? 1 : Number(rgba[4]);
  } else {
    const hsl = /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(token);
    if (hsl === null) return token;
    // Vendor styles mix hsl() in freely; lightness alone is enough here, since
    // the result is greyed anyway.
    const l = Number(hsl[3]) / 100;
    r = g = b = l * 255;
    a = hsl[4] === undefined ? 1 : Number(hsl[4]);
  }

  // Rec. 709 luma, then blended 45% toward the light surface so the basemap sits
  // back and route lines read as the figure against it.
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const v = Math.round(luma + (242 - luma) * 0.45);
  return `rgba(${v}, ${v}, ${v}, ${a})`;
}

/**
 * Greys every string inside a subtree.
 *
 * Applied only within `paint` blocks. Paint values can be plain colours or
 * expressions — ["interpolate", ..., "#abc", ...] — so the whole subtree is
 * walked and `greyToken` returns non-colour strings unchanged.
 */
function greyDeep(node: unknown): unknown {
  if (typeof node === "string") return greyToken(node);
  if (Array.isArray(node)) return node.map(greyDeep);
  if (node !== null && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>).map(([k, v]) => [k, greyDeep(v)]),
    );
  }
  return node;
}

/**
 * Walks a parsed style and greys every colour-valued paint property.
 *
 * Only `paint` is descended into: `layout` and top-level strings are layer names,
 * source refs, filters and font stacks, which must survive untouched.
 */
function desaturate(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(desaturate);
  if (node !== null && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>).map(([k, v]) => [
        k,
        k === "paint" ? greyDeep(v) : desaturate(v),
      ]),
    );
  }
  return node;
}

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
    const style = JSON.parse(rewrite(await res.text(), base)) as Record<string, unknown>;
    style["layers"] = (style["layers"] as unknown[]).map(desaturate);

    return reply
      .type("application/json")
      .header("cache-control", "public, max-age=3600")
      .send(JSON.stringify(style));
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
