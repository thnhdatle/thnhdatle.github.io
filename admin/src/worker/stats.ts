import { Hono, type Context } from "hono";
import type { AppEnv } from "./env";

// Dimensions the dashboard can group or filter by. Each maps to a SQL
// expression over the `pageviews` table, aliased as `p`.
const DIMENSIONS: Record<string, string> = {
  path: "p.path",
  title: "p.title",
  ref_host: "coalesce(p.ref_host, '(direct)')",
  referrer: "coalesce(p.referrer, '(direct)')",
  utm_source: "coalesce(p.utm_source, '(none)')",
  utm_medium: "coalesce(p.utm_medium, '(none)')",
  utm_campaign: "coalesce(p.utm_campaign, '(none)')",
  country: "coalesce(p.country, '??')",
  region: "coalesce(p.country, '??') || ' / ' || coalesce(p.region, '?')",
  city: "coalesce(p.country, '??') || ' / ' || coalesce(p.city, '?')",
  timezone: "coalesce(p.timezone, '?')",
  as_org: "coalesce(p.as_org, '?')",
  browser: "coalesce(p.browser, '?')",
  browser_version: "coalesce(p.browser, '?') || ' ' || coalesce(p.browser_version, '')",
  os: "coalesce(p.os, '?')",
  os_version: "coalesce(p.os, '?') || ' ' || coalesce(p.os_version, '')",
  device: "p.device",
  screen: "coalesce(p.screen, '?')",
  language: "coalesce(p.language, '?')",
};

const DAY = 24 * 60 * 60 * 1000;

interface Query {
  from: number;
  to: number;
  offset: number; // viewer's UTC offset in ms, for day/hour buckets
  where: string;
  params: unknown[];
}

const int = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

// Reads ?from=&to=&tz=&f.<dimension>=<value> into a WHERE clause over `p`.
export function parseQuery(c: Context<AppEnv>): Query {
  const now = Date.now();
  const to = int(c.req.query("to"), now);
  const from = int(c.req.query("from"), to - 7 * DAY);
  const offset = int(c.req.query("tz"), 0) * 60 * 1000;
  const clauses = ["p.ts >= ?", "p.ts < ?"];
  const params: unknown[] = [from, to];
  for (const [key, value] of Object.entries(c.req.queries())) {
    const dim = key.startsWith("f.") ? DIMENSIONS[key.slice(2)] : undefined;
    if (!dim || !value?.length) continue;
    clauses.push(`${dim} = ?`);
    params.push(value[0]);
  }
  return { from, to, offset, where: clauses.join(" AND "), params };
}

// Same filters, shifted to the period right before [from, to).
const previous = (q: Query): Query => {
  const span = q.to - q.from;
  return { ...q, from: q.from - span, to: q.from, params: [q.from - span, q.from, ...q.params.slice(2)] };
};

async function totals(db: D1Database, q: Query) {
  const [views, sessions, events] = await db.batch([
    db
      .prepare(
        `SELECT count(*) AS pageviews, count(DISTINCT p.visitor_id) AS visitors,
                coalesce(avg(nullif(p.duration_ms, 0)), 0) AS avg_duration,
                coalesce(avg(p.scroll_pct), 0) AS avg_scroll
         FROM pageviews p WHERE ${q.where}`,
      )
      .bind(...q.params),
    db
      .prepare(
        `SELECT count(*) AS sessions, coalesce(avg(n = 1), 0) AS bounce_rate,
                coalesce(avg(dur), 0) AS avg_session, coalesce(avg(n), 0) AS pages_per_session
         FROM (SELECT p.session_id, count(*) AS n, sum(p.duration_ms) AS dur
               FROM pageviews p WHERE ${q.where} GROUP BY p.session_id)`,
      )
      .bind(...q.params),
    db
      .prepare(
        `SELECT e.type, count(*) AS n FROM events e JOIN pageviews p ON p.id = e.pageview_id
         WHERE ${q.where} GROUP BY e.type`,
      )
      .bind(...q.params),
  ]);
  const byType = Object.fromEntries(
    (events.results as { type: string; n: number }[]).map((r) => [r.type, r.n]),
  );
  return {
    ...(views.results[0] as Record<string, number>),
    ...(sessions.results[0] as Record<string, number>),
    events: byType,
  };
}

export const stats = new Hono<AppEnv>();

stats.get("/overview", async (c) => {
  const q = parseQuery(c);
  const [current, before] = await Promise.all([totals(c.env.DB, q), totals(c.env.DB, previous(q))]);
  return c.json({ current, previous: before });
});

stats.get("/timeseries", async (c) => {
  const q = parseQuery(c);
  const size = c.req.query("interval") === "hour" ? DAY / 24 : DAY;
  const { results } = await c.env.DB.prepare(
    `SELECT CAST((p.ts + ?) / ? AS INTEGER) AS bucket, count(*) AS pageviews, count(DISTINCT p.visitor_id) AS visitors,
            count(DISTINCT p.session_id) AS sessions, coalesce(avg(nullif(p.duration_ms, 0)), 0) AS avg_duration
     FROM pageviews p WHERE ${q.where} GROUP BY bucket ORDER BY bucket`,
  )
    .bind(q.offset, size, ...q.params)
    .all<{ bucket: number }>();
  return c.json({
    interval: size,
    rows: results.map((r) => ({ ...r, start: r.bucket * size - q.offset })),
  });
});

stats.get("/breakdown", async (c) => {
  const q = parseQuery(c);
  const dim = c.req.query("dim") ?? "path";
  const limit = Math.min(int(c.req.query("limit"), 20), 500);

  // Entry and exit pages: the first/last page view of each session.
  if (dim === "entry" || dim === "exit") {
    const order = dim === "entry" ? "ASC" : "DESC";
    const { results } = await c.env.DB.prepare(
      `SELECT path AS key, count(*) AS sessions, avg(n = 1) AS bounce_rate FROM (
         SELECT p.path, row_number() OVER (PARTITION BY p.session_id ORDER BY p.ts ${order}) AS rn,
                count(*) OVER (PARTITION BY p.session_id) AS n
         FROM pageviews p WHERE ${q.where})
       WHERE rn = 1 GROUP BY path ORDER BY sessions DESC LIMIT ?`,
    )
      .bind(...q.params, limit)
      .all();
    return c.json({ dim, rows: results });
  }

  const expr = DIMENSIONS[dim];
  if (!expr) return c.json({ error: `unknown dimension ${dim}` }, 400);
  const { results } = await c.env.DB.prepare(
    `SELECT ${expr} AS key, max(p.title) AS title, count(*) AS pageviews,
            count(DISTINCT p.visitor_id) AS visitors, count(DISTINCT p.session_id) AS sessions,
            coalesce(avg(nullif(p.duration_ms, 0)), 0) AS avg_duration,
            coalesce(sum(p.duration_ms), 0) AS total_duration,
            coalesce(avg(p.scroll_pct), 0) AS avg_scroll
     FROM pageviews p WHERE ${q.where} GROUP BY key ORDER BY pageviews DESC LIMIT ?`,
  )
    .bind(...q.params, limit)
    .all();
  return c.json({ dim, rows: results });
});

stats.get("/events", async (c) => {
  const q = parseQuery(c);
  const type = c.req.query("type");
  const limit = Math.min(int(c.req.query("limit"), 50), 500);
  const { results } = await c.env.DB.prepare(
    `SELECT e.type, e.label, e.target, count(*) AS count, count(DISTINCT p.session_id) AS sessions,
            count(DISTINCT e.path) AS pages, max(e.ts) AS last_ts
     FROM events e JOIN pageviews p ON p.id = e.pageview_id
     WHERE ${q.where} ${type ? "AND e.type = ?" : ""}
     GROUP BY e.type, e.label, e.target ORDER BY count DESC LIMIT ?`,
  )
    .bind(...q.params, ...(type ? [type] : []), limit)
    .all();
  return c.json({ rows: results });
});

// Histograms of active time and scroll depth per page view.
stats.get("/distribution", async (c) => {
  const q = parseQuery(c);
  const [duration, scroll] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT CASE
         WHEN p.duration_ms < 10000 THEN 0 WHEN p.duration_ms < 30000 THEN 1
         WHEN p.duration_ms < 60000 THEN 2 WHEN p.duration_ms < 180000 THEN 3
         WHEN p.duration_ms < 600000 THEN 4 ELSE 5 END AS bucket, count(*) AS n
       FROM pageviews p WHERE ${q.where} GROUP BY bucket`,
    ).bind(...q.params),
    c.env.DB.prepare(
      `SELECT min(p.scroll_pct / 25, 4) AS bucket, count(*) AS n
       FROM pageviews p WHERE ${q.where} GROUP BY bucket`,
    ).bind(...q.params),
  ]);
  const fill = (rows: unknown[], size: number) => {
    const out = Array<number>(size).fill(0);
    for (const r of rows as { bucket: number; n: number }[]) out[r.bucket] = r.n;
    return out;
  };
  return c.json({ duration: fill(duration.results, 6), scroll: fill(scroll.results, 5) });
});

stats.get("/realtime", async (c) => {
  const now = Date.now();
  const db = c.env.DB;
  const [active, perMinute, feed] = await db.batch([
    db
      .prepare(
        `SELECT p.id, p.session_id, p.path, p.title, p.ts, p.last_seen, p.duration_ms, p.scroll_pct,
                p.country, p.city, p.device, p.browser, p.os, p.ref_host
         FROM pageviews p
         WHERE p.last_seen > ? AND p.visible = 1
           -- the reader has not moved on to another page in the same session
           AND NOT EXISTS (SELECT 1 FROM pageviews n WHERE n.session_id = p.session_id AND n.ts > p.ts)
         ORDER BY p.last_seen DESC LIMIT 200`,
      )
      .bind(now - 75_000),
    db
      .prepare(
        `SELECT CAST((p.ts - ?) / 60000 AS INTEGER) AS minute, count(*) AS pageviews
         FROM pageviews p WHERE p.ts > ? GROUP BY minute ORDER BY minute`,
      )
      .bind(now - 30 * 60_000, now - 30 * 60_000),
    db
      .prepare(
        `SELECT * FROM (
           SELECT 'pageview' AS type, p.ts, p.path, p.title AS label, p.ref_host AS target,
                  p.session_id, p.country, p.city, p.device
           FROM pageviews p WHERE p.ts > ?
           UNION ALL
           SELECT e.type, e.ts, e.path, e.label, e.target, p.session_id, p.country, p.city, p.device
           FROM events e JOIN pageviews p ON p.id = e.pageview_id WHERE e.ts > ?)
         ORDER BY ts DESC LIMIT 100`,
      )
      .bind(now - 30 * 60_000, now - 30 * 60_000),
  ]);
  return c.json({
    now,
    active: active.results,
    visitors: new Set((active.results as { session_id: string }[]).map((r) => r.session_id)).size,
    perMinute: perMinute.results,
    feed: feed.results,
  });
});

export const sessions = new Hono<AppEnv>();

sessions.get("/", async (c) => {
  const q = parseQuery(c);
  const limit = Math.min(int(c.req.query("limit"), 50), 200);
  const offset = Math.max(int(c.req.query("offset"), 0), 0);
  const { results } = await c.env.DB.prepare(
    `SELECT s.*,
       (SELECT path FROM pageviews x WHERE x.session_id = s.session_id ORDER BY x.ts LIMIT 1) AS entry,
       (SELECT count(*) FROM events e JOIN pageviews x ON x.id = e.pageview_id
          WHERE x.session_id = s.session_id) AS events
     FROM (
       SELECT p.session_id, p.visitor_id, min(p.ts) AS start, max(p.last_seen) AS end, count(*) AS pages,
              sum(p.duration_ms) AS duration, max(p.country) AS country, max(p.city) AS city,
              max(p.device) AS device, max(p.browser) AS browser, max(p.os) AS os,
              max(p.ref_host) AS ref_host, max(p.utm_source) AS utm_source
       FROM pageviews p WHERE ${q.where} GROUP BY p.session_id
       ORDER BY start DESC LIMIT ? OFFSET ?) s
     ORDER BY s.start DESC`,
  )
    .bind(...q.params, limit, offset)
    .all();
  return c.json({ rows: results });
});

sessions.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const [pages, events] = await db.batch([
    db.prepare("SELECT * FROM pageviews WHERE session_id = ? ORDER BY ts").bind(id),
    db
      .prepare(
        `SELECT e.* FROM events e JOIN pageviews p ON p.id = e.pageview_id
         WHERE p.session_id = ? ORDER BY e.ts`,
      )
      .bind(id),
  ]);
  if (!pages.results.length) return c.json({ error: "not found" }, 404);
  const visitor = (pages.results[0] as { visitor_id: string }).visitor_id;
  // Other sessions of the same visitor (the visitor id only lives for one UTC day).
  const other = await db
    .prepare(
      `SELECT session_id, min(ts) AS start, count(*) AS pages FROM pageviews
       WHERE visitor_id = ? AND session_id != ? GROUP BY session_id ORDER BY start`,
    )
    .bind(visitor, id)
    .all();
  return c.json({ pageviews: pages.results, events: events.results, otherSessions: other.results });
});

export async function purgeOld(db: D1Database, retentionDays: number, now = Date.now()) {
  const cutoff = now - retentionDays * DAY;
  const today = new Date(now).toISOString().slice(0, 10);
  await db.batch([
    db.prepare("DELETE FROM events WHERE ts < ?").bind(cutoff),
    db.prepare("DELETE FROM pageviews WHERE ts < ?").bind(cutoff),
    db.prepare("DELETE FROM salts WHERE day < ?").bind(today),
  ]);
}
