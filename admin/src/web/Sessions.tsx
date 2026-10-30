import { useState } from "react";
import {
  countryName,
  DEVICE_LABEL,
  EVENT_LABEL,
  flag,
  fmtDateTime,
  fmtDuration,
  fmtTime,
  query,
  useApi,
  type Filters,
  type Range,
} from "./lib";

interface SessionRow {
  session_id: string;
  start: number;
  end: number;
  pages: number;
  duration: number;
  country: string | null;
  city: string | null;
  device: string;
  browser: string | null;
  os: string | null;
  ref_host: string | null;
  utm_source: string | null;
  entry: string;
  events: number;
}

interface PageviewDetail {
  id: string;
  ts: number;
  last_seen: number;
  path: string;
  title: string | null;
  referrer: string | null;
  duration_ms: number;
  scroll_pct: number;
  country: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  as_org: string | null;
  browser: string | null;
  browser_version: string | null;
  os: string | null;
  os_version: string | null;
  device: string;
  screen: string | null;
  language: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

interface EventDetail {
  id: number;
  pageview_id: string;
  ts: number;
  type: string;
  label: string | null;
  target: string | null;
}

const PAGE = 50;

export function Sessions({
  range,
  filters,
  onSession,
}: {
  range: Range;
  filters: Filters;
  onSession: (id: string) => void;
}) {
  const [offset, setOffset] = useState(0);
  const { data, loading } = useApi<{ rows: SessionRow[] }>(
    `/api/sessions?${query(range, filters, { limit: PAGE, offset })}`,
  );
  const rows = data?.rows ?? [];

  return (
    <section className={`card p-4 ${loading ? "loading" : ""}`}>
      <h2 className="mb-3 text-sm font-semibold">Phiên truy cập gần đây</h2>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="pb-2 font-normal">Bắt đầu</th>
                <th className="pb-2 font-normal">Từ</th>
                <th className="pb-2 font-normal">Thiết bị</th>
                <th className="pb-2 font-normal">Nguồn</th>
                <th className="pb-2 font-normal">Trang vào</th>
                <th className="pb-2 text-right font-normal">Trang</th>
                <th className="pb-2 text-right font-normal">Thời gian</th>
                <th className="pb-2 text-right font-normal">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr
                  key={s.session_id}
                  className="cursor-pointer border-t border-line hover:bg-wash"
                  onClick={() => onSession(s.session_id)}
                >
                  <td className="num py-1.5 pr-3 whitespace-nowrap">{fmtDateTime(s.start)}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {flag(s.country)} {s.city ?? countryName(s.country)}
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap text-ink-2">
                    {DEVICE_LABEL[s.device] ?? s.device} · {s.browser}
                  </td>
                  <td className="py-1.5 pr-3 text-ink-2">{s.utm_source ?? s.ref_host ?? "trực tiếp"}</td>
                  <td className="max-w-64 truncate py-1.5 pr-3">{s.entry}</td>
                  <td className="num py-1.5 text-right">{s.pages}</td>
                  <td className="num py-1.5 text-right">{fmtDuration(s.duration)}</td>
                  <td className="num py-1.5 text-right">{s.events}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-muted">Không có phiên nào trong khoảng này.</p>
      )}
      <div className="mt-3 flex justify-end gap-2 text-sm">
        <button
          disabled={offset === 0}
          onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
          className="rounded border border-line px-3 py-1 disabled:opacity-40"
        >
          ← Mới hơn
        </button>
        <button
          disabled={rows.length < PAGE}
          onClick={() => setOffset((o) => o + PAGE)}
          className="rounded border border-line px-3 py-1 disabled:opacity-40"
        >
          Cũ hơn →
        </button>
      </div>
    </section>
  );
}

const Fact = ({ label, value }: { label: string; value: string | null | undefined }) =>
  value ? (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  ) : null;

// Slide-over with one session's timeline: each page view with its reading
// time and scroll depth, and the clicks/downloads made on it.
export function SessionDetail({ id, onClose, onSession }: { id: string; onClose: () => void; onSession: (id: string) => void }) {
  const { data, error } = useApi<{
    pageviews: PageviewDetail[];
    events: EventDetail[];
    otherSessions: { session_id: string; start: number; pages: number }[];
  }>(`/api/sessions/${encodeURIComponent(id)}`);
  const first = data?.pageviews[0];

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="h-full w-full max-w-xl overflow-y-auto bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        aria-label="Chi tiết phiên"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Chi tiết phiên</h2>
          <button onClick={onClose} className="rounded px-2 py-1 text-ink-2 hover:bg-wash" aria-label="Đóng">
            ✕
          </button>
        </div>
        {error && <p className="text-sm text-bad">Không tải được phiên này.</p>}
        {first && (
          <>
            <dl className="mb-5 grid grid-cols-2 gap-3">
              <Fact
                label="Vị trí"
                value={`${flag(first.country)} ${[first.city, first.region, countryName(first.country)].filter(Boolean).join(", ")}`}
              />
              <Fact label="Nhà mạng" value={first.as_org} />
              <Fact label="Thiết bị" value={`${DEVICE_LABEL[first.device] ?? first.device} · ${first.screen ?? ""}`} />
              <Fact label="Trình duyệt" value={`${first.browser ?? "?"} ${first.browser_version ?? ""} · ${first.os ?? "?"} ${first.os_version ?? ""}`} />
              <Fact label="Ngôn ngữ / múi giờ" value={`${first.language ?? "?"} · ${first.timezone ?? "?"}`} />
              <Fact label="Đến từ" value={first.referrer ?? "Trực tiếp / không rõ"} />
              <Fact
                label="Chiến dịch"
                value={[first.utm_source, first.utm_medium, first.utm_campaign].filter(Boolean).join(" / ") || null}
              />
            </dl>
            <ol className="relative space-y-4 border-l border-line pl-5">
              {data!.pageviews.map((p) => (
                <li key={p.id}>
                  <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-s1 ring-2 ring-[var(--surface)]" />
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.path}</div>
                      {p.title && <div className="truncate text-xs text-muted">{p.title}</div>}
                    </div>
                    <span className="num shrink-0 text-xs text-muted">{fmtTime(p.ts)}</span>
                  </div>
                  <div className="num mt-0.5 text-xs text-ink-2">
                    Đọc {fmtDuration(p.duration_ms)} · cuộn {p.scroll_pct}%
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {data!.events
                      .filter((e) => e.pageview_id === p.id)
                      .map((e) => (
                        <li key={e.id} className="flex gap-2 text-xs">
                          <span className="num text-muted">{fmtTime(e.ts)}</span>
                          <span className="text-ink-2">{EVENT_LABEL[e.type] ?? e.type}</span>
                          <span className="min-w-0 truncate" title={e.target ?? ""}>
                            {e.label} <span className="text-muted">{e.target}</span>
                          </span>
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ol>
            {data!.otherSessions.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-2 text-xs text-muted">Phiên khác của cùng người xem trong ngày</h3>
                <ul className="space-y-1 text-sm">
                  {data!.otherSessions.map((s) => (
                    <li key={s.session_id}>
                      <button className="text-s1 hover:underline" onClick={() => onSession(s.session_id)}>
                        {fmtDateTime(s.start)} · {s.pages} trang
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
