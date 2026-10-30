import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { list, type AppEnv, type Env, type Session } from "./env";

const SESSION_COOKIE = "sa_session";
const STATE_COOKIE = "sa_oauth";
const SESSION_TTL_S = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromB64url = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));

async function sessionKey(secret: string) {
  const raw = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

// The session (including the GitHub token) lives in an encrypted cookie, so
// the worker needs no session store.
export async function sealSession(session: Session, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await sessionKey(secret),
    encoder.encode(JSON.stringify(session)),
  );
  const out = new Uint8Array(12 + data.byteLength);
  out.set(iv);
  out.set(new Uint8Array(data), 12);
  return b64url(out);
}

export async function openSession(value: string | undefined, secret: string): Promise<Session | null> {
  if (!value || !secret) return null;
  try {
    const bytes = fromB64url(value);
    const data = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12) },
      await sessionKey(secret),
      bytes.slice(12),
    );
    const session = JSON.parse(new TextDecoder().decode(data)) as Session;
    return session.exp > Date.now() ? session : null;
  } catch {
    return null;
  }
}

const isLocal = (url: string) => ["localhost", "127.0.0.1"].includes(new URL(url).hostname);

const isAdmin = (env: Env, login: string) =>
  list(env.ADMIN_LOGINS).some((allowed) => allowed.toLowerCase() === login.toLowerCase());

// Only same-origin paths. Browsers read "\" as "/", so "/\evil.com" would be
// protocol-relative too.
export const safeReturn = (value: string | undefined) =>
  value && /^\/(?![/\\])/.test(value) && !value.includes("\\") ? value : "/";

async function startSession(c: Context<AppEnv>, session: Omit<Session, "exp">) {
  const value = await sealSession({ ...session, exp: Date.now() + SESSION_TTL_S * 1000 }, c.env.SESSION_SECRET);
  setCookie(c, SESSION_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_S,
  });
}

export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await openSession(getCookie(c, SESSION_COOKIE), c.env.SESSION_SECRET);
  if (!session) return c.json({ error: "unauthorized" }, 401);
  c.set("session", session);
  await next();
};

export async function login(c: Context<AppEnv>) {
  const returnTo = safeReturn(c.req.query("return"));

  if (c.env.DEV_AUTH_LOGIN && isLocal(c.req.url)) {
    await startSession(c, { login: c.env.DEV_AUTH_LOGIN, avatar: "", token: c.env.DEV_GITHUB_TOKEN ?? "" });
    return c.redirect(returnTo);
  }

  const state = crypto.randomUUID().replaceAll("-", "");
  setCookie(c, STATE_COOKIE, `${state}.${encodeURIComponent(returnTo)}`, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 600,
  });
  const params = new URLSearchParams({
    client_id: c.env.GITHUB_CLIENT_ID,
    redirect_uri: new URL("/callback", c.req.url).toString(),
    // `repo` lets the CMS commit to the (private) site repo and lets the
    // dashboard read deploy status.
    scope: "repo",
    state,
    allow_signup: "false",
  });
  return c.redirect(`https://github.com/login/oauth/authorize?${params}`);
}

const errorPage = (c: Context<AppEnv>, message: string, status: 400 | 403 | 502) =>
  c.html(
    `<!doctype html><meta charset="utf-8"><title>Đăng nhập thất bại</title>
     <body style="font-family:system-ui;padding:2rem"><p>${message}</p><p><a href="/logout">Thử lại</a></p></body>`,
    status,
  );

export async function callback(c: Context<AppEnv>) {
  const [state, returnTo] = (getCookie(c, STATE_COOKIE) ?? "").split(".");
  deleteCookie(c, STATE_COOKIE, { path: "/", secure: true });
  const code = c.req.query("code");
  if (!code || !state || c.req.query("state") !== state) {
    return errorPage(c, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.", 400);
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const { access_token: token } = (await tokenRes.json()) as { access_token?: string };
  if (!token) return errorPage(c, "GitHub không trả về access token.", 502);

  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "site-admin", Accept: "application/vnd.github+json" },
  });
  const user = (await userRes.json()) as { login?: string; avatar_url?: string };
  if (!user.login || !isAdmin(c.env, user.login)) {
    return errorPage(c, `Tài khoản GitHub "${user.login ?? "?"}" không có quyền vào trang quản trị.`, 403);
  }

  await startSession(c, { login: user.login, avatar: user.avatar_url ?? "", token });
  return c.redirect(safeReturn(decodeURIComponent(returnTo ?? "")));
}

export function logout(c: Context<AppEnv>) {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
  return c.redirect("/");
}

// OAuth endpoint for Sveltia CMS (backend.base_url points at this worker).
// It speaks the Netlify/Decap popup protocol: the popup announces
// "authorizing:github", the opener echoes it back, then the popup posts the
// token. The token comes from the dashboard session, so there is no second
// round trip to GitHub, and it is only released to this worker's own origin.
export async function cmsAuth(c: Context<AppEnv>) {
  const session = await openSession(getCookie(c, SESSION_COOKIE), c.env.SESSION_SECRET);
  const ok = Boolean(session?.token);
  const content = ok
    ? { provider: "github", token: session!.token }
    : { provider: "github", error: "Hãy đăng nhập trang quản trị trước.", errorCode: "AUTH_REQUIRED" };
  const message = `authorization:github:${ok ? "success" : "error"}:${JSON.stringify(content)}`;
  const origin = new URL(c.req.url).origin;

  return c.html(`<!doctype html><html><body><script>
    (() => {
      const origin = ${JSON.stringify(origin)};
      const message = ${JSON.stringify(message).replaceAll("<", "\\u003c")};
      window.addEventListener("message", (event) => {
        if (event.data !== "authorizing:github" || event.origin !== origin) return;
        window.opener && window.opener.postMessage(message, origin);
      });
      window.opener && window.opener.postMessage("authorizing:github", origin);
    })();
  </script></body></html>`);
}
