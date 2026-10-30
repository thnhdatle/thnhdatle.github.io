export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

  SITE_ORIGINS: string;
  SITE_URL: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  CONTENT_ROOT: string;
  DEPLOY_WORKFLOW: string;
  ADMIN_LOGINS: string;
  RETENTION_DAYS: string;

  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;

  // Local development only (.dev.vars): sign in as this login without GitHub.
  // Ignored unless the request comes from localhost.
  DEV_AUTH_LOGIN?: string;
  DEV_GITHUB_TOKEN?: string;
}

export interface Session {
  login: string;
  avatar: string;
  token: string;
  exp: number;
}

export type AppEnv = { Bindings: Env; Variables: { session: Session } };

export const list = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
