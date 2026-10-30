import { ColumnChart } from "./charts";
import { countryName, DEVICE_LABEL, EVENT_LABEL, flag, fmtAgo, fmtDuration, fmtInt, fmtTime, useApi } from "./lib";

interface Active {
  id: string;
  session_id: string;
  path: string;
  title: string | null;
  ts: number;
  last_seen: number;
  duration_ms: number;
  scroll_pct: number;
  country: string | null;
  city: string | null;
  device: string;
  browser: string | null;
  os: string | null;
  ref_host: string | null;
}

interface FeedItem {
  type: string;
  ts: number;
  path: string;
  label: string | null;
  target: string | null;
  session_id: string;
  country: string | null;
  city: string | null;
  device: string;
}

export function Realtime({ onSession }: { onSession: (id: string) => void }) {
  const { data } = useApi<{
    now: number;
    active: Active[];
    visitors: number;
    perMinute: { minute: number; pageviews: number }[];
    feed: FeedItem[];
  }>("/api/stats/realtime", 10_000);

  const counts = new Map((data?.perMinute ?? []).map((r) => [r.minute, r.pageviews]));
  const bars = Array.from({ length: 30 }, (_, i) => ({
    label: i % 5 === 0 ? `-${30 - i}′` : "",
    value: counts.get(i) ?? 0,
    detail: `${30 - i} phút trước`,
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card flex flex-col justify-center p-6">
          <div className="text-sm text-ink-2">Đang xem ngay lúc này</div>
          <div className="mt-1 text-6xl font-semibold">{fmtInt(data?.visitors ?? 0)}</div>
          <div className="mt-2 text-xs text-muted">
            {fmtInt(data?.active.length ?? 0)} trang đang mở · tự cập nhật mỗi 10 giây
          </div>
        </section>
        <section className="card p-4 lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold">Lượt xem mỗi phút, 30 phút qua</h2>
          <ColumnChart bars={bars} label="Lượt xem" height={150} />
        </section>
      </div>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Ai đang xem trang nào</h2>
        {data?.active.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-2 font-normal">Trang</th>
                  <th className="pb-2 font-normal">Từ</th>
                  <th className="pb-2 font-normal">Thiết bị</th>
                  <th className="pb-2 font-normal">Nguồn</th>
                  <th className="pb-2 text-right font-normal">Đã xem</th>
                  <th className="pb-2 text-right font-normal">Cuộn</th>
                </tr>
              </thead>
              <tbody>
                {data.active.map((a) => (
                  <tr
                    key={a.id}
                    className="cursor-pointer border-t border-line hover:bg-wash"
                    onClick={() => onSession(a.session_id)}
                  >
                    <td className="max-w-80 truncate py-1.5 pr-3" title={a.title ?? a.path}>
                      {a.path}
                    </td>
                    <td className="py-1.5 pr-3">
                      {flag(a.country)} {a.city ?? countryName(a.country)}
                    </td>
                    <td className="py-1.5 pr-3 text-ink-2">
                      {DEVICE_LABEL[a.device] ?? a.device} · {a.browser} · {a.os}
                    </td>
                    <td className="py-1.5 pr-3 text-ink-2">{a.ref_host ?? "trực tiếp"}</td>
                    <td className="num py-1.5 text-right">{fmtDuration(a.duration_ms)}</td>
                    <td className="num py-1.5 text-right">{a.scroll_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted">Không có ai đang xem.</p>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Hoạt động 30 phút qua</h2>
        {data?.feed.length ? (
          <ol className="space-y-1 text-sm">
            {data.feed.map((f, i) => (
              <li
                key={i}
                className="flex cursor-pointer gap-3 rounded px-1 py-0.5 hover:bg-wash"
                onClick={() => onSession(f.session_id)}
                title={fmtAgo(f.ts, data.now)}
              >
                <span className="num w-20 shrink-0 text-muted">{fmtTime(f.ts)}</span>
                <span className="w-28 shrink-0 text-ink-2">{EVENT_LABEL[f.type] ?? f.type}</span>
                <span className="min-w-0 flex-1 truncate">
                  {f.type === "pageview" ? f.path : (f.label ?? f.target)}
                  <span className="text-muted">
                    {f.type === "pageview" ? (f.target ? ` ← ${f.target}` : "") : ` · ${f.path}`}
                  </span>
                </span>
                <span className="hidden shrink-0 text-ink-2 sm:inline">
                  {flag(f.country)} {f.city ?? countryName(f.country)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="py-6 text-center text-sm text-muted">Chưa có hoạt động.</p>
        )}
      </section>
    </div>
  );
}
