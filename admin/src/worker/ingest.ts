import type { Context } from "hono";
import UAParser from "ua-parser-js";
import { list, type AppEnv, type Env } from "./env";

// Shape sent by src/tracker. Keys are short to keep beacons small.
export interface Beacon {
  t: string; // pageview | ping | leave | click | outbound | download | copy
  pv: string; // page view id
  u?: string; // path + query
  ti?: string; // document title
  r?: string; // document.referrer
  sw?: number;
  sh?: number;
  l?: string; // navigator.language
  d?: number; // active ms so far
  sc?: number; // max scroll %
  lb?: string; // label of the clicked element
  tg?: string; // href or selector of the clicked element
}

const EVENT_TYPES = new Set(["click", "outbound", "download", "copy"]);
const PV_ID = /^[A-Za-z0-9_-]{8,40}$/;
const SESSION_GAP_MS = 30 * 60 * 1000;
// Beacons may only touch page views younger than this.
const PV_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const MAX_BODY = 32 * 1024;
const MAX_BEACONS = 50;

const BOT_UA =
  /bot|crawl|spider|slurp|archiver|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|slack|headless|lighthouse|pagespeed|pingdom|uptime|monitor|curl|wget|python|java\/|go-http|okhttp|axios|node-fetch|undici|phantom|selenium|puppeteer|playwright/i;

export const isBot = (ua: string) => !ua || BOT_UA.test(ua);

const clip = (value: unknown, max: number) =>
  typeof value === "string" && value.length ? value.slice(0, max) : null;

const clamp = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min;

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

let saltCache: { day: string; salt: string } | undefined;

async function dailySalt(db: D1Database, day: string) {
  if (saltCache?.day === day) return saltCache.salt;
  const fresh = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const [, row] = await db.batch<{ salt: string }>([
    db.prepare("INSERT OR IGNORE INTO salts (day, salt) VALUES (?, ?)").bind(day, fresh),
    db.prepare("SELECT salt FROM salts WHERE day = ?").bind(day),
  ]);
  saltCache = { day, salt: row.results[0].salt };
  return saltCache.salt;
}

export async function visitorId(db: D1Database, ip: string, ua: string, now: number) {
  const day = new Date(now).toISOString().slice(0, 10);
  const salt = await dailySalt(db, day);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${ip}|${ua}`));
  return hex(digest).slice(0, 20);
}

const deviceOf = (type: string | undefined) => {
  if (!type) return "desktop";
  if (type === "mobile" || type === "tablet") return type;
  return "other";
};

function parseReferrer(raw: string | undefined, siteHost: string) {
  if (!raw) return { referrer: null, refHost: null };
  try {
    const url = new URL(raw);
    if (url.host === siteHost) return { referrer: null, refHost: null };
    return {
      referrer: (url.origin + url.pathname).slice(0, 500),
      refHost: url.hostname.replace(/^www\./, ""),
    };
  } catch {
    return { referrer: null, refHost: null };
  }
}

async function insertPageview(env: Env, req: Request, origin: string, b: Beacon, now: number) {
  const ua = req.headers.get("User-Agent") ?? "";
  const ip = req.headers.get("CF-Connecting-IP") ?? "";
  const cf = (req as Request & { cf?: IncomingRequestCfProperties }).cf;
  const page = new URL(b.u ?? "/", origin);
  const { referrer, refHost } = parseReferrer(b.r, page.host);
  const parsed = new UAParser(ua).getResult();
  const visitor = await visitorId(env.DB, ip, ua, now);

  const recent = await env.DB.prepare(
    "SELECT session_id FROM pageviews WHERE visitor_id = ? AND last_seen > ? ORDER BY last_seen DESC LIMIT 1",
  )
    .bind(visitor, now - SESSION_GAP_MS)
    .first<{ session_id: string }>();
  const session = recent?.session_id ?? crypto.randomUUID();
  const q = page.searchParams;

  return env.DB.prepare(
    `INSERT OR IGNORE INTO pageviews (
      id, session_id, visitor_id, ts, last_seen, path, title, referrer, ref_host,
      utm_source, utm_medium, utm_campaign, country, region, city, latitude, longitude,
      timezone, as_org, browser, browser_version, os, os_version, device, screen, language
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    b.pv,
    session,
    visitor,
    now,
    now,
    page.pathname.slice(0, 300),
    clip(b.ti, 300),
    referrer,
    refHost,
    clip(q.get("utm_source") ?? q.get("ref"), 100),
    clip(q.get("utm_medium"), 100),
    clip(q.get("utm_campaign"), 100),
    cf?.country ?? null,
    cf?.region ?? null,
    cf?.city ?? null,
    cf?.latitude ? Number(cf.latitude) : null,
    cf?.longitude ? Number(cf.longitude) : null,
    cf?.timezone ?? null,
    cf?.asOrganization ?? null,
    parsed.browser.name ?? null,
    parsed.browser.major ?? null,
    parsed.os.name ?? null,
    parsed.os.version ?? null,
    deviceOf(parsed.device.type),
    b.sw && b.sh ? `${clamp(b.sw, 0, 20000)}x${clamp(b.sh, 0, 20000)}` : null,
    clip(b.l, 20),
  );
}

export async function ingest(c: Context<AppEnv>) {
  const origin = c.req.header("Origin") ?? "";
  if (!list(c.env.SITE_ORIGINS).includes(origin)) return c.body(null, 403);

  const headers = { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
  const text = await c.req.text();
  if (text.length > MAX_BODY) return c.body(null, 413, headers);
  if (isBot(c.req.header("User-Agent") ?? "")) return c.body(null, 204, headers);

  let beacons: Beacon[];
  try {
    const parsed = JSON.parse(text);
    beacons = (Array.isArray(parsed) ? parsed : [parsed]).slice(0, MAX_BEACONS);
  } catch {
    return c.body(null, 400, headers);
  }
  beacons = beacons.filter((b) => b && typeof b.t === "string" && typeof b.pv === "string" && PV_ID.test(b.pv));

  const now = Date.now();
  const db = c.env.DB;
  const statements: D1PreparedStatement[] = [];

  // Page views first, so beacons later in the same batch can refer to them.
  for (const b of beacons) {
    if (b.t === "pageview") statements.push(await insertPageview(c.env, c.req.raw, origin, b, now));
  }
  for (const b of beacons) {
    if (b.t === "ping" || b.t === "leave") {
      statements.push(
        db
          .prepare(
            `UPDATE pageviews SET duration_ms = max(duration_ms, ?), scroll_pct = max(scroll_pct, ?), last_seen = ?,
                    visible = ?
             WHERE id = ? AND ts > ?`,
          )
          .bind(
            clamp(b.d, 0, PV_MAX_AGE_MS),
            clamp(b.sc, 0, 100),
            now,
            b.t === "ping" ? 1 : 0,
            b.pv,
            now - PV_MAX_AGE_MS,
          ),
      );
    } else if (EVENT_TYPES.has(b.t)) {
      statements.push(
        db
          .prepare(
            `INSERT INTO events (pageview_id, ts, type, path, label, target)
             SELECT id, ?, ?, path, ?, ? FROM pageviews WHERE id = ? AND ts > ?`,
          )
          .bind(now, b.t, clip(b.lb, 200), clip(b.tg, 500), b.pv, now - PV_MAX_AGE_MS),
      );
    }
  }

  if (statements.length) await db.batch(statements);
  return c.body(null, 204, headers);
}
