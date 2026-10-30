import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";
import { Content, DeployStatus } from "./Content";
import { PRESETS, rangeFor, useApi, type Filters } from "./lib";
import { dimLabel, FILTER_LABEL, Overview } from "./Overview";
import { Realtime } from "./Realtime";
import { SessionDetail, Sessions } from "./Sessions";

const minuteNow = () => Math.ceil(Date.now() / 60_000) * 60_000;

const TABS = [
  { path: "/", label: "Tổng quan" },
  { path: "/realtime", label: "Thời gian thực" },
  { path: "/sessions", label: "Phiên truy cập" },
  { path: "/content", label: "Nội dung" },
];

// Dashboard state lives in the URL so views can be bookmarked and shared:
// /sessions?range=30d&f.country=VN&session=<id>
function useLocation() {
  const [loc, setLoc] = useState(() => new URL(location.href));
  useEffect(() => {
    const onPop = () => setLoc(new URL(location.href));
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  const navigate = (update: (url: URL) => void, replace = false) => {
    const next = new URL(location.href);
    update(next);
    history[replace ? "replaceState" : "pushState"](null, "", next);
    setLoc(next);
  };
  return [loc, navigate] as const;
}

function App() {
  const me = useApi<{ login: string; avatar: string; siteUrl: string }>("/api/me");
  const [loc, navigate] = useLocation();
  // Re-anchor relative ranges ("last 7 days") every minute. Rounding keeps the
  // API URLs stable between renders within the same minute.
  const [now, setNow] = useState(minuteNow);
  useEffect(() => {
    const t = setInterval(() => setNow(minuteNow()), 60_000);
    return () => clearInterval(t);
  }, []);

  const preset = loc.searchParams.get("range") ?? "7d";
  const range = rangeFor(preset, now);
  const filters: Filters = {};
  for (const [k, v] of loc.searchParams) if (k.startsWith("f.")) filters[k.slice(2)] = v;
  const session = loc.searchParams.get("session");
  const tab = TABS.find((t) => t.path === loc.pathname)?.path ?? "/";

  const setFilter = (dim: string, value: string | null) =>
    navigate((u) => (value === null ? u.searchParams.delete(`f.${dim}`) : u.searchParams.set(`f.${dim}`, value)));
  const openSession = (id: string | null) =>
    navigate((u) => (id ? u.searchParams.set("session", id) : u.searchParams.delete("session")));

  if (!me.data) {
    return <div className="grid h-screen place-items-center text-sm text-muted">{me.error ? "Lỗi tải dữ liệu" : "Đang tải…"}</div>;
  }

  const showFilters = tab === "/" || tab === "/sessions";

  return (
    <div className="mx-auto max-w-7xl px-4 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3 py-4">
        <nav className="flex flex-wrap items-center gap-1" aria-label="Mục">
          <a href={me.data.siteUrl} target="_blank" rel="noreferrer" className="mr-3 font-semibold">
            Site Admin
          </a>
          {TABS.map((t) => (
            <button
              key={t.path}
              onClick={() => navigate((u) => (u.pathname = t.path))}
              aria-current={tab === t.path ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm ${tab === t.path ? "bg-surface font-semibold shadow-sm ring-1 ring-[var(--border)]" : "text-ink-2 hover:bg-wash"}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <DeployStatus compact />
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-ink-2">
              {me.data.avatar && <img src={me.data.avatar} alt="" className="h-6 w-6 rounded-full" />}
              {me.data.login}
            </summary>
            <div className="card absolute right-0 z-30 mt-2 w-72 p-3 text-sm shadow-lg">
              <a
                className="block rounded px-2 py-1.5 hover:bg-wash"
                href={`${me.data.siteUrl}/?sa_ignore=1`}
                target="_blank"
                rel="noreferrer"
              >
                Không đếm lượt xem từ trình duyệt này
                <span className="block text-xs text-muted">Mở site một lần với ?sa_ignore=1 (bỏ bằng ?sa_ignore=0)</span>
              </a>
              <a className="block rounded px-2 py-1.5 hover:bg-wash" href="/logout">
                Đăng xuất
              </a>
            </div>
          </details>
        </div>
      </header>

      {showFilters && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex rounded-md bg-surface p-0.5 ring-1 ring-[var(--border)]" role="radiogroup" aria-label="Khoảng thời gian">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                role="radio"
                aria-checked={preset === p.id}
                onClick={() => navigate((u) => u.searchParams.set("range", p.id))}
                className={`rounded px-2.5 py-1 text-sm ${preset === p.id ? "bg-wash font-semibold" : "text-ink-2 hover:bg-wash"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {Object.entries(filters).map(([dim, value]) => (
            <button
              key={dim}
              onClick={() => setFilter(dim, null)}
              className="flex items-center gap-1 rounded-full bg-surface px-3 py-1 text-sm ring-1 ring-[var(--border)] hover:bg-wash"
              title="Bỏ bộ lọc"
            >
              <span className="text-muted">{FILTER_LABEL[dim] ?? dim}:</span> {dimLabel(dim, value)} <span aria-hidden>✕</span>
            </button>
          ))}
        </div>
      )}

      {tab === "/" && <Overview range={range} filters={filters} onFilter={setFilter} />}
      {tab === "/realtime" && <Realtime onSession={openSession} />}
      {tab === "/sessions" && <Sessions range={range} filters={filters} onSession={openSession} />}
      {tab === "/content" && <Content />}
      {session && <SessionDetail id={session} onClose={() => openSession(null)} onSession={openSession} />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
