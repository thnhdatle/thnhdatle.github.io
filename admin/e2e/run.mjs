// End-to-end check: real browsers browse a locally built site with the
// tracker, then the dashboard is opened and its numbers are checked.
//
// Needs, already running:
//   - the worker:  npx wrangler dev --local-protocol https --port 8787
//     with .dev.vars allowing http://localhost:4000 and DEV_AUTH_LOGIN set
//   - the site:    a Jekyll build with site_analytics.endpoint=https://localhost:8787
//                  served at http://localhost:4000/
import { chromium, devices } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

const SITE = process.env.SITE ?? "http://localhost:4000";
const ADMIN = process.env.ADMIN ?? "https://localhost:8787";
const OUT = new URL("./.out/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const browser = await chromium.launch();

// Playwright marks pages as automated; the tracker skips those, so unmark.
async function visitorContext(options) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, ...options });
  await ctx.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
  return ctx;
}

const beacons = [];
const watch = (page) =>
  page.on("request", (r) => r.url().startsWith(`${ADMIN}/e`) && beacons.push(r.postData()));

// Visitor 1: desktop, arrives from Google with a utm tag, reads, downloads, leaves.
{
  const ctx = await visitorContext({ userAgent: DESKTOP_UA, viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  watch(page);
  await page.goto(`${SITE}/?utm_source=e2e`, { referer: "https://www.google.com/" });
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(1500);
  await page.click('a.nav-link[href$="/blog/"]');
  await page.waitForLoadState("load");
  await page.mouse.move(200, 200);
  await page.click("article a, .post-title a, h3 a", { timeout: 5000 }).catch(() => page.goto(`${SITE}/blog/`));
  await page.waitForLoadState("load");
  await page.mouse.wheel(0, 20000);
  await page.waitForTimeout(2500);
  await page.goto(`${SITE}/cv/`);
  const pdf = page.locator('a[href$=".pdf"]').first();
  if (await pdf.count()) {
    await pdf.evaluate((a) => a.setAttribute("target", "_blank"));
    await pdf.click();
  }
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const a = document.createElement("a");
    a.href = "https://github.com/thnhdatle";
    a.textContent = "GitHub profile";
    a.target = "_blank";
    document.body.append(a);
    a.click();
  });
  await page.waitForTimeout(500);
  await page.close({ runBeforeUnload: true });
  await ctx.close();
}

// Visitor 2: phone, opens a page directly and stays on it (shows up in realtime).
const phone = await visitorContext({ ...devices["iPhone 13"] });
const phonePage = await phone.newPage();
watch(phonePage);
await phonePage.goto(`${SITE}/publications/`);
await phonePage.waitForTimeout(1500);

// Dashboard.
const admin = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } });
const dash = await admin.newPage();
const consoleErrors = [];
dash.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
await dash.goto(`${ADMIN}/login?return=/`);
await dash.waitForSelector("text=Lượt xem trang");

const api = async (path) => (await dash.request.get(`${ADMIN}${path}`)).json();
const now = Date.now();
const overview = await api(`/api/stats/overview?from=${now - 3600_000}&to=${now + 60_000}`);
console.log("overview", overview.current);
assert.ok(overview.current.pageviews >= 4, "page views recorded");
assert.equal(overview.current.visitors, 2, "two visitors");
assert.ok(overview.current.avg_duration > 0, "reading time recorded");
assert.ok(overview.current.avg_scroll > 0, "scroll depth recorded");
assert.ok((overview.current.events.download ?? 0) >= 1, "CV download recorded");
assert.ok((overview.current.events.outbound ?? 0) >= 1, "outbound click recorded");

const refs = await api(`/api/stats/breakdown?dim=ref_host&from=${now - 3600_000}&to=${now + 60_000}`);
assert.ok(refs.rows.some((r) => r.key === "google.com"), "google referrer");
const devicesRows = await api(`/api/stats/breakdown?dim=device&from=${now - 3600_000}&to=${now + 60_000}`);
assert.deepEqual(devicesRows.rows.map((r) => r.key).sort(), ["desktop", "mobile"]);
const realtime = await api("/api/stats/realtime");
assert.ok(realtime.active.some((a) => a.path.endsWith("/publications/")), "phone visitor is live");

await dash.waitForTimeout(800);
await dash.screenshot({ path: `${OUT}overview.png`, fullPage: true });
await dash.click("text=Thời gian thực");
await dash.waitForSelector("text=Ai đang xem trang nào");
await dash.waitForTimeout(500);
await dash.screenshot({ path: `${OUT}realtime.png`, fullPage: true });
await dash.click("text=Phiên truy cập");
await dash.waitForSelector("tbody tr");
await dash.click("tbody tr >> nth=0");
await dash.waitForSelector("text=Chi tiết phiên");
await dash.waitForTimeout(500);
await dash.screenshot({ path: `${OUT}session.png` });
await dash.keyboard.press("Escape");
await dash.goto(`${ADMIN}/content`);
await dash.waitForTimeout(4000);
await dash.screenshot({ path: `${OUT}content.png` });

// Dark mode render of the overview.
await dash.emulateMedia({ colorScheme: "dark" });
await dash.goto(`${ADMIN}/`);
await dash.waitForSelector("text=Lượt xem trang");
await dash.waitForTimeout(800);
await dash.screenshot({ path: `${OUT}overview-dark.png`, fullPage: true });

console.log("beacons sent:", beacons.length);
console.log("dashboard console errors:", consoleErrors);
await browser.close();
console.log("e2e OK, screenshots in", OUT);
