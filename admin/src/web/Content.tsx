import { fmtAgo, useApi } from "./lib";

interface Run {
  id: number;
  status: string;
  conclusion: string | null;
  createdAt: string;
  updatedAt: string;
  url: string;
  message: string;
}

function runState(run: Run) {
  if (run.status !== "completed") return { icon: "◌", label: "Đang build", color: "var(--status-warning)" };
  if (run.conclusion === "success") return { icon: "✓", label: "Đã lên site", color: "var(--status-good)" };
  return { icon: "✕", label: "Build lỗi", color: "var(--status-critical)" };
}

// Latest site build. CMS saves are commits, and the site is live once the
// deploy workflow for that commit finishes.
export function DeployStatus({ compact = false }: { compact?: boolean }) {
  const { data } = useApi<{ runs: Run[]; error?: string }>("/api/content/deploys", 15_000);
  const runs = data?.runs ?? [];
  if (!runs.length) return compact ? null : <p className="text-sm text-muted">{data?.error ?? "Chưa có lần build nào."}</p>;

  if (compact) {
    const s = runState(runs[0]);
    return (
      <a href={runs[0].url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-ink-2 hover:text-ink">
        <span style={{ color: s.color }} aria-hidden>
          {s.icon}
        </span>
        {s.label} · {fmtAgo(Date.parse(runs[0].updatedAt))}
      </a>
    );
  }

  return (
    <ul className="space-y-1.5 text-sm">
      {runs.map((r) => {
        const s = runState(r);
        return (
          <li key={r.id} className="flex items-center gap-2">
            <span style={{ color: s.color }} aria-hidden className="w-4 text-center">
              {s.icon}
            </span>
            <span className="w-24 shrink-0 text-ink-2">{s.label}</span>
            <a href={r.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
              {r.message}
            </a>
            <span className="shrink-0 text-xs text-muted">{fmtAgo(Date.parse(r.createdAt))}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function Content() {
  return (
    <div className="space-y-3">
      <section className="card p-4">
        <h2 className="mb-2 text-sm font-semibold">Trạng thái build</h2>
        <p className="mb-3 text-xs text-muted">
          Mỗi lần bấm Lưu là một commit vào repo; GitHub Actions build lại site, thường mất 2–5 phút.
        </p>
        <DeployStatus />
      </section>
      <iframe src="/cms/" title="Trình quản lý nội dung" className="card h-[calc(100vh-14rem)] min-h-[640px] w-full" />
    </div>
  );
}
