/**
 * Parse every mermaid block in docs/ with mermaid's own parser.
 *
 * GitHub renders a broken diagram as **nothing at all** — no error, no fallback,
 * just a gap where the flow was. One shipped that way before anyone noticed, so
 * diagrams are checked rather than assumed.
 *
 *   node scripts/check-diagrams.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";

// Mermaid installs a DOMPurify hook at import time and throws without a DOM, so
// the window has to exist *before* the import. Hence the dynamic import below.
const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
// `navigator` is a getter-only global on Node 22, so it is left alone; mermaid
// only needs it to exist, and Node already provides one.
const mermaid = (await import("mermaid")).default;

function walk(dir) {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".md") ? [p] : [];
  });
}

mermaid.initialize({ startOnLoad: false });
let blocks = 0;
const failures = [];

for (const file of walk("docs")) {
  const text = readFileSync(file, "utf8");
  const re = /```mermaid\n([\s\S]*?)```/g;
  let m, n = 0;
  while ((m = re.exec(text)) !== null) {
    n++; blocks++;
    try {
      await mermaid.parse(m[1]);
    } catch (err) {
      failures.push(`${file} (block ${n}): ${String(err.message ?? err).split("\n")[0]}`);
    }
  }
}

console.log(`checked ${blocks} mermaid blocks`);
if (failures.length > 0) {
  for (const f of failures) console.error("  FAIL " + f);
  process.exitCode = 1;
} else {
  console.log("  all parse");
}
