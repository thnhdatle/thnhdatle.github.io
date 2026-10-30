import { Hono } from "hono";
import { callback, cmsAuth, login, logout, requireSession } from "./auth";
import { content } from "./content";
import type { AppEnv, Env } from "./env";
import { ingest } from "./ingest";
import { purgeOld, sessions, stats } from "./stats";

const app = new Hono<AppEnv>();
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

// Public: analytics beacons from the site.
app.post("/e", ingest);
app.options("/e", (c) => c.body(null, 204));

// Dashboard sign-in and the Sveltia CMS OAuth endpoint.
app.get("/login", login);
app.get("/callback", callback);
app.get("/logout", logout);
app.get("/auth", cmsAuth);

// Everything under /api needs a dashboard session.
const api = new Hono<AppEnv>();
api.use("*", requireSession);
api.get("/me", (c) => {
  const { login, avatar } = c.get("session");
  return c.json({ login, avatar, siteUrl: c.env.SITE_URL, repo: c.env.GITHUB_REPO });
});
api.route("/stats", stats);
api.route("/sessions", sessions);
api.route("/content", content);
app.route("/api", api);

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(purgeOld(env.DB, Number(env.RETENTION_DAYS) || 400));
  },
} satisfies ExportedHandler<Env>;
