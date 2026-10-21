#!/usr/bin/env node
/**
 * Full-page screenshots of every built page at 320, 768, 1280 and 1920 px,
 * plus a horizontal-overflow check. Requires a running server (npm run preview).
 *
 * Usage: node scripts/screenshots.mjs [baseUrl]   (default http://localhost:4321)
 * Output: docs/screenshots/<page>-<width>.png
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const base = (process.argv[2] ?? "http://localhost:4321").replace(/\/$/, "");
const out = new URL("../docs/screenshots/", import.meta.url);
mkdirSync(out, { recursive: true });

const pages = [
  ["hub", "/"],
  ["project", "/l-and-t-sector-86-gurgaon/"],
  ["m3m", "/m3m-brabus-sector-58-gurgaon/"],
  ["prestige", "/prestige-sector-92-gurgaon/"],
  ["franck-muller", "/m3m-franck-muller-sector-43-gurgaon/"],
  ["thank-you", "/l-and-t-sector-86-gurgaon/thank-you/"],
  ["disclaimer", "/disclaimer/"],
  ["privacy-policy", "/privacy-policy/"],
  ["terms", "/terms/"],
  ["404", "/404/"],
];
const widths = [320, 768, 1280, 1920];

const browser = await chromium.launch();
const problems = [];
for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  for (const [name, path] of pages) {
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    if (overflow > 0) problems.push(`${name} @ ${width}px overflows by ${overflow}px`);
    await page.screenshot({
      path: fileURLToPath(new URL(`${name}-${width}.png`, out)),
      fullPage: true,
    });
  }
  await page.close();
}
await browser.close();

console.log(`Saved ${pages.length * widths.length} screenshots to docs/screenshots/`);
if (problems.length) {
  console.error("Horizontal overflow:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log("No horizontal scroll at any width.");
