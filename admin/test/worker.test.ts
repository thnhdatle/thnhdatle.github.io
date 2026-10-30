import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { openSession, safeReturn, sealSession } from "../src/worker/auth";
import { purgeOld } from "../src/worker/stats";

const SITE = "https://site.test";
const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const beacon = (body: unknown, opts: { ua?: string; ip?: string; origin?: string } = {}) =>
  exports.default.fetch("https://admin.test/e", {
    method: "POST",
    headers: {
      Origin: opts.origin ?? SITE,
      "User-Agent": opts.ua ?? CHROME,
      "CF-Connecting-IP": opts.ip ?? "203.0.113.7",
      "Content-Type": "text/plain;charset=UTF-8",
    },
    body: JSON.stringify(body),
  });

let cookie = "";
const api = (path: string) => exports.default.fetch(`http://localhost${path}`, { headers: { Cookie: cookie } });

beforeAll(async () => {
  const res = await exports.default.fetch("http://localhost/login", { redirect: "manual" });
  cookie = (res.headers.get("Set-Cookie") ?? "").split(";")[0];
});

describe("ingest", () => {
  it("rejects beacons from origins that aren't the site", async () => {
    const res = await beacon({ t: "pageview", pv: "aaaaaaaaaaaa", u: "/" }, { origin: "https://evil.test" });
    expect(res.status).toBe(403);
  });

  it("drops bots without storing anything", async () => {
    const res = await beacon({ t: "pageview", pv: "botbotbotbot", u: "/" }, { ua: "Googlebot/2.1" });
    expect(res.status).toBe(204);
    const row = await env.DB.prepare("SELECT count(*) AS n FROM pageviews WHERE id = 'botbotbotbot'").first();
    expect(row?.n).toBe(0);
  });

  it("records a page view with referrer, utm, device and browser", async () => {
    const res = await beacon({
      t: "pageview",
      pv: "pv-first-0001",
      u: "/thnhdatle/blog/x/?utm_source=newsletter&utm_campaign=oct",
      ti: "Post X",
      r: "https://www.google.com/search?q=secret",
      sw: 390,
      sh: 844,
      l: "vi-VN",
    }, { ua: IPHONE });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(SITE);

    const row = await env.DB.prepare("SELECT * FROM pageviews WHERE id = 'pv-first-0001'").first();
    expect(row).toMatchObject({
      path: "/thnhdatle/blog/x/",
      title: "Post X",
      referrer: "https://www.google.com/search",
      ref_host: "google.com",
      utm_source: "newsletter",
      utm_campaign: "oct",
      device: "mobile",
      os: "iOS",
      browser: "Mobile Safari",
      screen: "390x844",
      language: "vi-VN",
    });
  });

  it("joins page views from the same visitor into one session and ignores internal referrers", async () => {
    await beacon({ t: "pageview", pv: "pv-sess-0001", u: "/a/" }, { ip: "198.51.100.1" });
    await beacon({ t: "pageview", pv: "pv-sess-0002", u: "/b/", r: `${SITE}/a/` }, { ip: "198.51.100.1" });
    await beacon({ t: "pageview", pv: "pv-sess-0003", u: "/a/" }, { ip: "198.51.100.2" });
    const { results } = await env.DB.prepare(
      "SELECT id, session_id, visitor_id, ref_host FROM pageviews WHERE id LIKE 'pv-sess-%' ORDER BY id",
    ).all<{ session_id: string; visitor_id: string; ref_host: string | null }>();
    expect(results[0].session_id).toBe(results[1].session_id);
    expect(results[0].visitor_id).toBe(results[1].visitor_id);
    expect(results[2].session_id).not.toBe(results[0].session_id);
    expect(results[1].ref_host).toBeNull();
  });

  it("keeps the longest duration and deepest scroll, and stores events in a batch", async () => {
    await beacon({ t: "pageview", pv: "pv-time-0001", u: "/cv/" });
    await beacon([
      { t: "download", pv: "pv-time-0001", lb: "PDF", tg: `${SITE}/assets/pdf/cv.pdf` },
      { t: "ping", pv: "pv-time-0001", d: 45_000, sc: 60 },
    ]);
    await beacon({ t: "leave", pv: "pv-time-0001", d: 30_000, sc: 40 }); // late, smaller values
    await beacon({ t: "click", pv: "unknown-pv-01", lb: "x" }); // no such page view

    const row = await env.DB.prepare("SELECT duration_ms, scroll_pct FROM pageviews WHERE id = 'pv-time-0001'").first();
    expect(row).toEqual({ duration_ms: 45_000, scroll_pct: 60 });
    const { results } = await env.DB.prepare("SELECT type, path, label FROM events ORDER BY id").all();
    expect(results).toEqual([{ type: "download", path: "/cv/", label: "PDF" }]);
  });
});

describe("dashboard api", () => {
  it("requires a session", async () => {
    const res = await exports.default.fetch("http://localhost/api/me");
    expect(res.status).toBe(401);
  });

  it("returns overview, breakdowns and sessions", async () => {
    const me = await api("/api/me");
    expect(await me.json()).toMatchObject({ login: "tester" });

    const overview = (await (await api("/api/stats/overview")).json()) as { current: Record<string, unknown> };
    expect(overview.current).toMatchObject({ pageviews: 5, visitors: 4, sessions: 4 });
    expect(overview.current.events).toEqual({ download: 1 });

    const pages = (await (await api("/api/stats/breakdown?dim=path")).json()) as { rows: { key: string }[] };
    expect(pages.rows[0]).toMatchObject({ key: "/a/", pageviews: 2 });

    const refs = (await (await api("/api/stats/breakdown?dim=ref_host")).json()) as { rows: { key: string }[] };
    expect(refs.rows.map((r) => r.key).sort()).toEqual(["(direct)", "google.com"]);

    const filtered = (await (await api("/api/stats/overview?f.device=mobile")).json()) as {
      current: { pageviews: number };
    };
    expect(filtered.current.pageviews).toBe(1);

    const entry = (await (await api("/api/stats/breakdown?dim=entry")).json()) as { rows: { key: string }[] };
    expect(entry.rows.find((r) => r.key === "/a/")).toMatchObject({ sessions: 2 });

    const sessions = (await (await api("/api/sessions")).json()) as { rows: { session_id: string; pages: number }[] };
    const twoPage = sessions.rows.find((s) => s.pages === 2)!;
    const detail = (await (await api(`/api/sessions/${twoPage.session_id}`)).json()) as { pageviews: unknown[] };
    expect(detail.pageviews).toHaveLength(2);

    const rt = (await (await api("/api/stats/realtime")).json()) as { visitors: number };
    // pv-time-0001 sent a leave beacon and pv-sess-0001 was followed by another page.
    expect(rt.visitors).toBe(3);

    const ts = (await (await api(`/api/stats/timeseries?interval=hour&tz=540`)).json()) as {
      rows: { pageviews: number; start: number }[];
    };
    expect(ts.rows.reduce((n, r) => n + r.pageviews, 0)).toBe(5);
    expect(new Date(ts.rows[0].start + 540 * 60_000).getUTCMinutes()).toBe(0);
  });

  it("rejects unknown dimensions instead of interpolating them", async () => {
    const res = await api("/api/stats/breakdown?dim=path;DROP TABLE pageviews");
    expect(res.status).toBe(400);
  });

  it("serves a CMS config that points at the site repo", async () => {
    const config = (await (await api("/api/content/cms-config")).json()) as {
      backend: { repo: string; base_url: string };
      collections: { name: string }[];
    };
    expect(config.backend).toMatchObject({ repo: "thnhdatle/thnhdatle", base_url: "http://localhost" });
    expect(config.collections.map((c) => c.name)).toContain("posts");
  });
});

describe("sessions and auth", () => {
  it("round-trips an encrypted session and rejects tampering or expiry", async () => {
    const sealed = await sealSession({ login: "a", avatar: "", token: "t", exp: Date.now() + 1000 }, "k");
    expect(await openSession(sealed, "k")).toMatchObject({ login: "a", token: "t" });
    expect(await openSession(sealed, "other")).toBeNull();
    expect(await openSession(sealed.slice(0, -2) + "AA", "k")).toBeNull();
    const old = await sealSession({ login: "a", avatar: "", token: "t", exp: Date.now() - 1 }, "k");
    expect(await openSession(old, "k")).toBeNull();
  });

  it("hands the CMS popup a token only with a session", async () => {
    const anon = await (await exports.default.fetch("http://localhost/auth?provider=github")).text();
    expect(anon).toContain("authorization:github:error");
    const signedIn = await (await api("/auth?provider=github")).text();
    expect(signedIn).toContain("authorization:github:success");
  });

  it("only redirects back to same-origin paths after login", () => {
    expect(safeReturn("/sessions?range=30d")).toBe("/sessions?range=30d");
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "", undefined]) {
      expect(safeReturn(bad)).toBe("/");
    }
  });

  it("does not allow the dev login away from localhost", async () => {
    const res = await exports.default.fetch("https://admin.test/login", { redirect: "manual" });
    expect(res.headers.get("Location")).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize/);
  });
});

describe("retention", () => {
  it("deletes page views, events and salts past the cutoff", async () => {
    const future = Date.now() + 500 * 24 * 60 * 60 * 1000;
    await purgeOld(env.DB, 400, future);
    const row = await env.DB.prepare("SELECT (SELECT count(*) FROM pageviews) + (SELECT count(*) FROM events) AS n").first();
    expect(row?.n).toBe(0);
  });
});
