/**
 * Screenshot the app in the states that matter: results list, peeked answer,
 * step-by-step, and a downtown street zoom. The wide view flatters everything,
 * so the street zoom is not optional.
 *
 *   node scripts/shot.mjs      (needs the API on :3000 and vite on :5173)
 */
import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

async function run(name, fromText, toText, opts = {}) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await p.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  const pick = async (label, text) => {
    await p.locator(`.field:has(.field-label:text-is("${label}")) input`).fill(text);
    await p.waitForTimeout(700);
    await p.locator(".suggestions li").first().click();
  };
  await pick("From", fromText);
  await pick("To", toText);
  await p.waitForTimeout(3500);
  await p.screenshot({ path: `/tmp/${name}-list.png` });

  // pick the first option -> sheet peeks, map takes over
  await p.locator(".journey").first().click();
  await p.waitForTimeout(1800);
  await p.evaluate(() => new Promise((r) => { const t = setTimeout(r, 6000); window.__map.once("idle", () => { clearTimeout(t); r(); }); }));
  await p.waitForTimeout(400);
  await p.screenshot({ path: `/tmp/${name}-peek.png` });

  // open the step-by-step detail
  const steps = p.locator('.detail button.why');
  if (await steps.count()) { await steps.click(); await p.waitForTimeout(1600); await p.evaluate(() => { const s = document.querySelector(".sheet"); s.scrollTop = s.scrollHeight; }); await p.waitForTimeout(400); await p.screenshot({ path: `/tmp/${name}-steps.png` }); await steps.click(); await p.waitForTimeout(300); }

  if (opts.zoom) {
    await p.evaluate((z) => window.__map.easeTo({ center: z.center, zoom: z.zoom, duration: 0 }), opts.zoom);
    await p.evaluate(() => new Promise((r) => { const t = setTimeout(r, 6000); window.__map.once("idle", () => { clearTimeout(t); r(); }); }));
    await p.waitForTimeout(500);
    await p.screenshot({ path: `/tmp/${name}-zoom.png` });
  }
  const info = await p.evaluate(() => ({
    zoom: +window.__map.getZoom().toFixed(2),
    ride: window.__map.queryRenderedFeatures({ layers: ["journey-ride"] }).length,
    walk: window.__map.queryRenderedFeatures({ layers: ["journey-walk"] }).length,
  }));
  console.log(name, JSON.stringify(info));
  await p.close();
}

await run("long", "Jane St at Eglinton", "Union Station", {
  zoom: { center: [-79.383, 43.650], zoom: 14.5 },
});
await run("dt", "Spadina Ave At Queen", "Sherbourne Station", {
  zoom: { center: [-79.383, 43.653], zoom: 14.5 },
});
await b.close();
