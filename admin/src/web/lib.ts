import { useEffect, useRef, useState } from "react";

export interface Range {
  preset: string;
  from: number;
  to: number;
}

export type Filters = Record<string, string>;

export const DAY = 24 * 60 * 60 * 1000;

export const PRESETS: { id: string; label: string }[] = [
  { id: "today", label: "Hôm nay" },
  { id: "24h", label: "24 giờ" },
  { id: "7d", label: "7 ngày" },
  { id: "30d", label: "30 ngày" },
  { id: "90d", label: "90 ngày" },
  { id: "365d", label: "12 tháng" },
];

export function rangeFor(preset: string, now = Date.now()): Range {
  if (preset === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { preset, from: start.getTime(), to: now };
  }
  const hours = preset === "24h" ? 24 : Number(preset.replace("d", "")) * 24;
  return { preset, from: now - hours * 60 * 60 * 1000, to: now };
}

export function query(range: Range, filters: Filters, extra: Record<string, string | number> = {}) {
  const params = new URLSearchParams({
    from: String(range.from),
    to: String(range.to),
    tz: String(-new Date().getTimezoneOffset()),
  });
  for (const [k, v] of Object.entries(filters)) params.set(`f.${k}`, v);
  for (const [k, v] of Object.entries(extra)) params.set(k, String(v));
  return params.toString();
}

export class Unauthorized extends Error {}

export async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (res.status === 401) throw new Unauthorized();
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

// Fetches `url` whenever it changes. The previous data stays in place while
// the next request is in flight, so charts dim instead of flashing.
export function useApi<T>(url: string | null, refreshMs?: number) {
  const [data, setData] = useState<T | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>();
  const latest = useRef(url);
  latest.current = url;

  useEffect(() => {
    if (!url) return;
    let stop = false;
    const load = () => {
      setLoading(true);
      getJSON<T>(url)
        .then((d) => {
          if (!stop && latest.current === url) {
            setData(d);
            setError(undefined);
          }
        })
        .catch((e: Error) => {
          if (e instanceof Unauthorized) location.href = `/login?return=${encodeURIComponent(location.pathname)}`;
          else if (!stop) setError(e);
        })
        .finally(() => !stop && setLoading(false));
    };
    load();
    const timer = refreshMs ? setInterval(load, refreshMs) : undefined;
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [url, refreshMs]);

  return { data, loading, error };
}

const compact = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat("vi-VN");

export const fmtInt = (n: number) => (n >= 10000 ? compact.format(n) : plain.format(Math.round(n)));
export const fmtPct = (r: number) => `${Math.round(r * 100)}%`;

export function fmtDuration(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const fmtDateTime = (ts: number) =>
  new Date(ts).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function fmtAgo(ts: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s} giây trước`;
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86400)} ngày trước`;
}

let regionNames: Intl.DisplayNames | undefined;
export function countryName(code: string | null | undefined) {
  if (!code || code === "??" || code === "XX" || code === "T1") return "Không rõ";
  try {
    regionNames ??= new Intl.DisplayNames(["vi"], { type: "region" });
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export function flag(code: string | null | undefined) {
  if (!code || !/^[A-Z]{2}$/.test(code)) return "🏳️";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export const DEVICE_LABEL: Record<string, string> = {
  desktop: "Máy tính",
  mobile: "Điện thoại",
  tablet: "Máy tính bảng",
  other: "Khác",
};

export const EVENT_LABEL: Record<string, string> = {
  pageview: "Xem trang",
  click: "Click",
  outbound: "Link ra ngoài",
  download: "Tải xuống",
  copy: "Copy",
};
