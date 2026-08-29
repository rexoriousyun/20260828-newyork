/**
 * Drive the app from a script and report what a rider would see, as text.
 *
 * Built for agents testing the app end to end. Screenshots are no use to them
 * and Playwright mechanics are a distraction from the thing being tested, so
 * this takes a list of steps and returns the visible text after each one, plus
 * the state a rider cannot see but a tester needs: console errors, failed
 * requests, and what the map actually drew.
 *
 *   node scripts/drive.mjs '{"steps":[{"do":"from","text":"Union"},…]}'
 *
 * Steps:
 *   {"do":"from"|"to","text":"…"}       type into a field and take the first hit
 *
 * The form collapses to a one-line summary once a plan lands, so "time",
 * "mode" and "stepFree" only work while it is open — either before both
 * endpoints are set, or after a {"do":"form"} step reopens it. Two testers hit
 * this and had to start a fresh session per time, which is why the step exists.
 *   {"do":"time","at":"08:30"}           set the time
 *   {"do":"mode","value":"arriveBy"|"departAt"}
 *   {"do":"stepFree"}                    toggle step-free only
 *   {"do":"pick","index":0}              choose the nth option
 *   {"do":"expand"}                      open or close the other ways
 *   {"do":"detail"}                      open or close the step-by-step list
 *   {"do":"view","value":"atTime"|"allDay"}
 *   {"do":"explore"}                     switch to Explore a route
 *   {"do":"wait","ms":1000}
 *   {"do":"form"}                        tap the collapsed trip summary back open
 *   {"do":"read"}                        report the screen without changing it
 *   {"do":"shot","path":"/tmp/x.png"}
 */

import { chromium } from "playwright";

const BROWSER = "/opt/pw-browsers/chromium";
const APP = process.env.APP_URL ?? "http://localhost:5173/";

const input = JSON.parse(process.argv[2] ?? '{"steps":[]}');
const steps = input.steps ?? [];

const browser = await chromium.launch({ executablePath: BROWSER });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const errors = [];
const failed = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errors.push(`PAGEERROR ${e.message.slice(0, 200)}`));
page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().slice(0, 120)}`); });

await page.goto(APP, { waitUntil: "networkidle" });

/** Everything a rider can read, in reading order, with blank lines collapsed. */
async function screen() {
  return page.evaluate(() => {
    const text = (sel) => {
      const el = document.querySelector(sel);
      if (el === null) return null;
      return el.innerText.split("\n").map((l) => l.trim()).filter((l) => l !== "").join("\n");
    };
    const map = window.__map;
    const count = (layer) => {
      try { return map.queryRenderedFeatures({ layers: [layer] }).length; } catch { return 0; }
    };
    return {
      topbar: text(".topbar"),
      sheet: text(".sheet"),
      options: document.querySelectorAll(".journey").length,
      mapDrew: map === undefined ? null : {
        ride: count("journey-ride"), unknown: count("journey-unknown"), walk: count("journey-walk"),
        zoom: Number(map.getZoom().toFixed(1)),
      },
    };
  });
}

async function pick(label, value) {
  const field = page.locator(`.field:has(.field-label:text-is("${label}")) input`);
  await field.fill(value);
  await page.waitForTimeout(700);
  const hits = page.locator(".suggestions li");
  if (await hits.count() === 0) return `no suggestions for "${value}"`;
  const first = (await hits.first().innerText()).trim();
  await hits.first().click();
  await page.waitForTimeout(2500);
  return `chose "${first}"`;
}

const log = [];
for (const [i, s] of steps.entries()) {
  let note = "";
  try {
    switch (s.do) {
      case "from": note = await pick("From", s.text); break;
      case "to": note = await pick("To", s.text); break;
      case "time":
        await page.locator('.when-field input[type="time"]').fill(s.at);
        await page.waitForTimeout(2500);
        break;
      case "mode":
        await page.locator(".when-field select").selectOption(s.value);
        await page.waitForTimeout(2500);
        break;
      case "form": await page.locator(".trip-summary").click(); await page.waitForTimeout(400); break;
      case "stepFree": await page.locator(".access-row").click(); await page.waitForTimeout(2500); break;
      case "pick": await page.locator(".journey").nth(s.index ?? 0).click(); await page.waitForTimeout(1800); break;
      case "expand": await page.locator(".grabber").click(); await page.waitForTimeout(900); break;
      case "detail": await page.locator(".detail button.why").click(); await page.waitForTimeout(900); break;
      case "view":
        await page.locator(".view-toggle button").nth(s.value === "allDay" ? 1 : 0).click();
        await page.waitForTimeout(1200);
        break;
      case "explore": await page.locator('.modes button:text-is("Explore a route")').click(); await page.waitForTimeout(2500); break;
      case "wait": await page.waitForTimeout(s.ms ?? 1000); break;
      case "read": break;
      case "shot": await page.screenshot({ path: s.path }); note = `saved ${s.path}`; break;
      default: note = `unknown step "${s.do}"`;
    }
  } catch (e) {
    note = `STEP FAILED: ${String(e).split("\n")[0].slice(0, 200)}`;
  }
  log.push({ step: i, did: s, note, screen: await screen() });
}

console.log(JSON.stringify({ steps: log, consoleErrors: errors, failedRequests: failed }, null, 1));
await browser.close();
