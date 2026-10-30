import { useState } from "react";
import { BarList, ColumnChart, LineChart, type BarRow } from "./charts";
import {
  countryName,
  DAY,
  DEVICE_LABEL,
  EVENT_LABEL,
  flag,
  fmtDuration,
  fmtInt,
  fmtPct,
  query,
  useApi,
  type Filters,
  type Range,
} from "./lib";

interface Totals {
  pageviews: number;
  visitors: number;
  sessions: number;
  avg_duration: number;
  avg_scroll: number;
  bounce_rate: number;
  avg_session: number;
  pages_per_session: number;
  events: Record<string, number>;
}

interface BreakdownRow {
  key: string;
  title?: string;
  pageviews: number;
  visitors: number;
  sessions: number;
  avg_duration: number;
  avg_scroll: number;
  bounce_rate?: number;
}

interface EventRow {
  type: string;
  label: string | null;
  target: string | null;
  count: number;
  sessions: number;
  pages: number;
}

export const FILTER_LABEL: Record<string, string> = {
  path: "Trang",
  ref_host: "Nguồn",
  referrer: "URL nguồn",
  utm_source: "utm_source",
  utm_medium: "utm_medium",
  utm_campaign: "utm_campaign",
  country: "Quốc gia",
  region: "Vùng",
  city: "Thành phố",
  timezone: "Múi giờ",
  as_org: "Nhà mạng",
  browser: "Trình duyệt",
  browser_version: "Phiên bản",
  os: "Hệ điều hành",
  os_version: "Phiên bản HĐH",
  device: "Thiết bị",
  screen: "Màn hình",
  language: "Ngôn ngữ",
};

export function dimLabel(dim: string, key: string) {
  if (dim === "country") return `${flag(key)} ${countryName(key)}`;
  if (dim === "city" || dim === "region") {
    const [cc, rest] = key.split(" / ");
    return `${flag(cc)} ${rest === "?" ? "Không rõ" : rest}, ${countryName(cc)}`;
  }
  if (dim === "device") return DEVICE_LABEL[key] ?? key;
  return key;
}

function Delta({ now, before, invert = false }: { now: number; before: number; invert?: boolean }) {
  if (!before) return <span className="text-xs text-muted">—</span>;
  const change = (now - before) / before;
  if (Math.abs(change) < 0.005) return <span className="text-xs text-muted">0%</span>;
  const good = invert ? change < 0 : change > 0;
  return (
    <span className={`text-xs ${good ? "text-good" : "text-bad"}`}>
      {change > 0 ? "▲" : "▼"} {Math.abs(Math.round(change * 100))}%
    </span>
  );
}

function Stat({
  label,
  value,
  now,
  before,
  invert,
  hint,
}: {
  label: string;
  value: string;
  now: number;
  before: number;
  invert?: boolean;
  hint: string;
}) {
  return (
    <div className="card px-4 py-3" title={hint}>
      <div className="text-xs text-ink-2">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      <div className="mt-0.5 flex items-center gap-1">
        <Delta now={now} before={before} invert={invert} />
        <span className="text-xs text-muted">so với kỳ trước</span>
      </div>
    </div>
  );
}

function Card({
  title,
  tabs,
  tab,
  onTab,
  children,
  loading,
}: {
  title: string;
  tabs?: { id: string; label: string }[];
  tab?: string;
  onTab?: (id: string) => void;
  children: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <section className="card p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {tabs && (
          <div className="flex flex-wrap gap-1" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => onTab?.(t.id)}
                className={`rounded px-2 py-0.5 text-xs ${tab === t.id ? "bg-wash font-semibold text-ink" : "text-muted hover:text-ink-2"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </header>
      <div className={loading ? "loading" : undefined}>{children}</div>
    </section>
  );
}

function Breakdown({
  title,
  tabs,
  range,
  filters,
  onFilter,
}: {
  title: string;
  tabs: { id: string; label: string }[];
  range: Range;
  filters: Filters;
  onFilter: (dim: string, value: string) => void;
}) {
  const [dim, setDim] = useState(tabs[0].id);
  const { data, loading } = useApi<{ rows: BreakdownRow[] }>(
    `/api/stats/breakdown?${query(range, filters, { dim, limit: 50 })}`,
  );
  const sessionDim = dim === "entry" || dim === "exit";
  const rows: BarRow[] = (data?.rows ?? []).map((r) => ({
    key: r.key,
    value: sessionDim ? r.sessions : r.pageviews,
    title: r.title ? `${r.key}\n${r.title}` : r.key,
    label: dim === "path" && r.title ? (
      <span>
        {r.key} <span className="text-muted">· {r.title}</span>
      </span>
    ) : (
      dimLabel(dim, r.key)
    ),
    cells: sessionDim
      ? [fmtInt(r.sessions), fmtPct(r.bounce_rate ?? 0)]
      : [fmtInt(r.pageviews), fmtInt(r.visitors), fmtDuration(r.avg_duration), `${Math.round(r.avg_scroll)}%`],
  }));
  return (
    <Card title={title} tabs={tabs} tab={dim} onTab={setDim} loading={loading}>
      <div className="max-h-96 overflow-y-auto">
        <BarList
          rows={rows}
          columns={sessionDim ? ["Phiên", "Thoát"] : ["Lượt xem", "Khách", "TG xem", "Cuộn"]}
          onSelect={sessionDim ? (k) => onFilter("path", k) : (k) => FILTER_LABEL[dim] && onFilter(dim, k)}
        />
      </div>
    </Card>
  );
}

function Events({ range, filters }: { range: Range; filters: Filters }) {
  const [type, setType] = useState("download");
  const { data, loading } = useApi<{ rows: EventRow[] }>(
    `/api/stats/events?${query(range, filters, { type, limit: 100 })}`,
  );
  const rows: BarRow[] = (data?.rows ?? []).map((r, i) => ({
    key: `${i}`,
    value: r.count,
    title: `${r.label ?? ""}\n${r.target ?? ""}`,
    label: (
      <span>
        {r.label || "(không có nhãn)"} <span className="text-muted">· {r.target}</span>
      </span>
    ),
    cells: [fmtInt(r.count), fmtInt(r.sessions), fmtInt(r.pages)],
  }));
  return (
    <Card
      title="Hành động của người xem"
      tabs={["download", "outbound", "click", "copy"].map((id) => ({ id, label: EVENT_LABEL[id] }))}
      tab={type}
      onTab={setType}
      loading={loading}
    >
      <div className="max-h-96 overflow-y-auto">
        <BarList rows={rows} columns={["Lần", "Phiên", "Trang"]} empty="Chưa có hành động nào" />
      </div>
    </Card>
  );
}

const DURATION_BUCKETS = ["<10s", "10–30s", "30s–1m", "1–3m", "3–10m", ">10m"];
const SCROLL_BUCKETS = ["0–25%", "25–50%", "50–75%", "75–99%", "100%"];

function Engagement({ range, filters }: { range: Range; filters: Filters }) {
  const { data, loading } = useApi<{ duration: number[]; scroll: number[] }>(
    `/api/stats/distribution?${query(range, filters)}`,
  );
  return (
    <Card title="Mức độ đọc" loading={loading}>
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 text-xs text-ink-2">Thời gian xem mỗi trang</h3>
          <ColumnChart
            label="Lượt xem"
            bars={DURATION_BUCKETS.map((label, i) => ({ label, value: data?.duration[i] ?? 0 }))}
          />
        </div>
        <div>
          <h3 className="mb-1 text-xs text-ink-2">Cuộn sâu nhất mỗi trang</h3>
          <ColumnChart label="Lượt xem" bars={SCROLL_BUCKETS.map((label, i) => ({ label, value: data?.scroll[i] ?? 0 }))} />
        </div>
      </div>
    </Card>
  );
}

export function Overview({
  range,
  filters,
  onFilter,
}: {
  range: Range;
  filters: Filters;
  onFilter: (dim: string, value: string) => void;
}) {
  const q = query(range, filters);
  const hourly = range.to - range.from <= 2 * DAY;
  const overview = useApi<{ current: Totals; previous: Totals }>(`/api/stats/overview?${q}`);
  const series = useApi<{ interval: number; rows: { start: number; pageviews: number; visitors: number }[] }>(
    `/api/stats/timeseries?${query(range, filters, { interval: hourly ? "hour" : "day" })}`,
  );

  // Fill empty buckets so the line drops to zero instead of skipping them.
  const size = hourly ? DAY / 24 : DAY;
  const start = new Date(range.from);
  if (hourly) start.setMinutes(0, 0, 0);
  else start.setHours(0, 0, 0, 0);
  const byStart = new Map((series.data?.rows ?? []).map((r) => [r.start, r]));
  const points: { x: number; values: number[] }[] = [];
  for (let t = start.getTime(); t < range.to; t += size) {
    const r = byStart.get(t);
    points.push({ x: t, values: [r?.pageviews ?? 0, r?.visitors ?? 0] });
  }

  const c = overview.data?.current;
  const p = overview.data?.previous;
  const downloads = (t?: Totals) => t?.events.download ?? 0;

  return (
    <div className="space-y-4">
      <div className={`grid grid-cols-2 gap-3 md:grid-cols-4 ${overview.loading ? "loading" : ""}`}>
        <Stat
          label="Lượt xem trang"
          value={fmtInt(c?.pageviews ?? 0)}
          now={c?.pageviews ?? 0}
          before={p?.pageviews ?? 0}
          hint="Số lần một trang được mở"
        />
        <Stat
          label="Khách"
          value={fmtInt(c?.visitors ?? 0)}
          now={c?.visitors ?? 0}
          before={p?.visitors ?? 0}
          hint="Người xem khác nhau, đếm theo từng ngày (không dùng cookie)"
        />
        <Stat
          label="Thời gian xem / trang"
          value={fmtDuration(c?.avg_duration ?? 0)}
          now={c?.avg_duration ?? 0}
          before={p?.avg_duration ?? 0}
          hint="Thời gian tab đang mở và người xem còn thao tác"
        />
        <Stat
          label="Tỷ lệ thoát"
          value={fmtPct(c?.bounce_rate ?? 0)}
          now={c?.bounce_rate ?? 0}
          before={p?.bounce_rate ?? 0}
          invert
          hint="Phiên chỉ xem đúng một trang"
        />
        <Stat
          label="Phiên truy cập"
          value={fmtInt(c?.sessions ?? 0)}
          now={c?.sessions ?? 0}
          before={p?.sessions ?? 0}
          hint="Chuỗi trang liên tiếp, ngắt sau 30 phút không hoạt động"
        />
        <Stat
          label="Thời gian / phiên"
          value={fmtDuration(c?.avg_session ?? 0)}
          now={c?.avg_session ?? 0}
          before={p?.avg_session ?? 0}
          hint="Tổng thời gian xem các trang trong một phiên"
        />
        <Stat
          label="Cuộn trung bình"
          value={`${Math.round(c?.avg_scroll ?? 0)}%`}
          now={c?.avg_scroll ?? 0}
          before={p?.avg_scroll ?? 0}
          hint="Phần trăm chiều dài trang đã được cuộn tới"
        />
        <Stat
          label="Lượt tải xuống"
          value={fmtInt(downloads(c))}
          now={downloads(c)}
          before={downloads(p)}
          hint="Click vào PDF, BibTeX, tệp đính kèm (gồm tải CV)"
        />
      </div>

      <Card title="Lượt xem theo thời gian" loading={series.loading}>
        <LineChart
          points={points}
          series={[
            { name: "Lượt xem", color: "var(--series-1)" },
            { name: "Khách", color: "var(--series-2)" },
          ]}
          formatX={(x) =>
            hourly
              ? new Date(x).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
              : new Date(x).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })
          }
          formatXLong={(x) =>
            new Date(x).toLocaleString("vi-VN", hourly
              ? { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }
              : { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })
          }
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Breakdown
          title="Trang được xem"
          tabs={[
            { id: "path", label: "Trang" },
            { id: "entry", label: "Trang vào" },
            { id: "exit", label: "Trang thoát" },
          ]}
          range={range}
          filters={filters}
          onFilter={onFilter}
        />
        <Breakdown
          title="Đến từ đâu"
          tabs={[
            { id: "ref_host", label: "Nguồn" },
            { id: "referrer", label: "URL" },
            { id: "utm_source", label: "utm_source" },
            { id: "utm_medium", label: "utm_medium" },
            { id: "utm_campaign", label: "utm_campaign" },
          ]}
          range={range}
          filters={filters}
          onFilter={onFilter}
        />
        <Breakdown
          title="Vị trí"
          tabs={[
            { id: "country", label: "Quốc gia" },
            { id: "region", label: "Vùng" },
            { id: "city", label: "Thành phố" },
            { id: "as_org", label: "Nhà mạng" },
            { id: "timezone", label: "Múi giờ" },
          ]}
          range={range}
          filters={filters}
          onFilter={onFilter}
        />
        <Breakdown
          title="Thiết bị"
          tabs={[
            { id: "device", label: "Loại" },
            { id: "browser", label: "Trình duyệt" },
            { id: "browser_version", label: "Phiên bản" },
            { id: "os", label: "HĐH" },
            { id: "screen", label: "Màn hình" },
            { id: "language", label: "Ngôn ngữ" },
          ]}
          range={range}
          filters={filters}
          onFilter={onFilter}
        />
        <Events range={range} filters={filters} />
        <Engagement range={range} filters={filters} />
      </div>
    </div>
  );
}
