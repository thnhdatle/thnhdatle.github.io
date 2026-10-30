import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { fmtInt } from "./lib";

// Small hand-rolled SVG charts following the data-viz specs: 2px lines,
// <=24px columns with a 4px rounded data end, hairline grid, crosshair or
// per-mark tooltips, and a table view for every chart.

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceMax(value: number) {
  if (value <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow * 4 >= value) ?? 10;
  return step * pow * 4;
}

const barPath = (x: number, y: number, w: number, h: number, r = 4) => {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
};

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x + 12, 0), width - 180);
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-36 rounded-md border border-line bg-raised px-3 py-2 text-xs shadow-lg"
      style={{ left, top: Math.max(0, y - 8) }}
      role="status"
    >
      {children}
    </div>
  );
}

function TableView({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-2 text-xs text-ink-2">
      <summary className="cursor-pointer select-none text-muted hover:text-ink-2">Xem dạng bảng</summary>
      <div className="mt-2 max-h-64 overflow-auto">
        <table className="num w-full">
          <thead>
            <tr className="text-left text-muted">
              {head.map((h) => (
                <th key={h} className="py-1 pr-4 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                {r.map((c, j) => (
                  <td key={j} className="py-1 pr-4">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export interface Series {
  name: string;
  color: string; // CSS color, normally var(--series-n)
}

const PAD = { top: 12, right: 12, bottom: 26, left: 40 };

export function LineChart({
  points,
  series,
  formatX,
  formatXLong,
  height = 220,
}: {
  points: { x: number; values: number[] }[];
  series: Series[];
  formatX: (x: number) => string;
  formatXLong: (x: number) => string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const max = niceMax(Math.max(0, ...points.flatMap((p) => p.values)));
  const n = points.length;
  const xAt = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 90))));

  const pick = (clientX: number, rect: DOMRect) => {
    if (!n) return;
    const rel = (clientX - rect.left - PAD.left) / plotW;
    setHover(Math.min(n - 1, Math.max(0, Math.round(rel * (n - 1)))));
  };

  return (
    <div ref={ref} className="relative">
      {series.length > 1 && (
        <div className="mb-2 flex gap-4 text-xs text-ink-2">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={series.map((s) => s.name).join(", ")}
        tabIndex={0}
        className="block touch-none"
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
          if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n) - 1));
        }}
        onBlur={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={yAt(t)} y2={yAt(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={PAD.left - 6} y={yAt(t)} dy="0.32em" textAnchor="end" className="num fill-muted text-[11px]">
              {fmtInt(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text
              key={p.x}
              x={xAt(i)}
              y={height - 8}
              textAnchor={n > 1 && i === n - 1 ? "end" : i === 0 && n > 1 ? "start" : "middle"}
              className="num fill-muted text-[11px]"
            >
              {formatX(p.x)}
            </text>
          ) : null,
        )}
        {series.map((s, si) => {
          const d = points.map((p, i) => `${i ? "L" : "M"}${xAt(i)},${yAt(p.values[si])}`).join("");
          return (
            <g key={s.name}>
              {si === 0 && n > 1 && (
                <path
                  d={`${d}L${xAt(n - 1)},${yAt(0)}L${xAt(0)},${yAt(0)}Z`}
                  fill={s.color}
                  opacity={0.1}
                />
              )}
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}
        {hover !== null && points[hover] && (
          <g>
            <line
              x1={xAt(hover)}
              x2={xAt(hover)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="var(--axis)"
              strokeWidth={1}
            />
            {series.map((s, si) => (
              <circle
                key={s.name}
                cx={xAt(hover)}
                cy={yAt(points[hover].values[si])}
                r={4}
                fill={s.color}
                stroke="var(--surface)"
                strokeWidth={2}
              />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && points[hover] && (
        <Tooltip x={xAt(hover)} y={PAD.top} width={width}>
          <div className="mb-1 text-muted">{formatXLong(points[hover].x)}</div>
          {series.map((s, si) => (
            <div key={s.name} className="flex items-center gap-2">
              <span className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} />
              <span className="num font-semibold text-ink">{fmtInt(points[hover].values[si])}</span>
              <span className="text-ink-2">{s.name}</span>
            </div>
          ))}
        </Tooltip>
      )}
      <TableView
        head={["Thời điểm", ...series.map((s) => s.name)]}
        rows={points.map((p) => [formatXLong(p.x), ...p.values.map(fmtInt)])}
      />
    </div>
  );
}

export function ColumnChart({
  bars,
  label,
  format = fmtInt,
  height = 180,
}: {
  bars: { label: string; value: number; detail?: string }[];
  label: string;
  format?: (v: number) => string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const max = niceMax(Math.max(0, ...bars.map((b) => b.value)));
  const band = plotW / Math.max(1, bars.length);
  const barW = Math.min(24, Math.max(2, band - 2));
  const yAt = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const peak = bars.reduce((best, b, i) => (b.value > (bars[best]?.value ?? -1) ? i : best), 0);
  const labelEvery = Math.max(1, Math.ceil((bars.length * 44) / plotW));

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={height} role="img" aria-label={label} className="block">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={yAt(t * max)}
              y2={yAt(t * max)}
              stroke="var(--grid)"
              strokeWidth={1}
            />
            <text x={PAD.left - 6} y={yAt(t * max)} dy="0.32em" textAnchor="end" className="num fill-muted text-[11px]">
              {fmtInt(t * max)}
            </text>
          </g>
        ))}
        {bars.map((b, i) => {
          const cx = PAD.left + band * i + band / 2;
          const h = Math.max(b.value > 0 ? 2 : 0, plotH - (yAt(b.value) - PAD.top));
          return (
            <g
              key={b.label + i}
              tabIndex={0}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            >
              <rect x={cx - band / 2} y={PAD.top} width={band} height={plotH} fill="transparent" />
              {h > 0 && (
                <path
                  d={barPath(cx - barW / 2, PAD.top + plotH - h, barW, h)}
                  fill="var(--series-1)"
                  opacity={hover === null || hover === i ? 1 : 0.55}
                />
              )}
              {i === peak && b.value > 0 && (
                <text x={cx} y={PAD.top + plotH - h - 4} textAnchor="middle" className="num fill-ink-2 text-[11px]">
                  {format(b.value)}
                </text>
              )}
              {i % labelEvery === 0 && (
                <text x={cx} y={height - 8} textAnchor="middle" className="fill-muted text-[11px]">
                  {b.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && bars[hover] && (
        <Tooltip x={PAD.left + band * hover + band / 2} y={PAD.top} width={width}>
          <div className="num font-semibold text-ink">{format(bars[hover].value)}</div>
          <div className="text-ink-2">{bars[hover].detail ?? bars[hover].label}</div>
        </Tooltip>
      )}
      <TableView head={["", label]} rows={bars.map((b) => [b.detail ?? b.label, format(b.value)])} />
    </div>
  );
}

export interface BarRow {
  key: string;
  label: ReactNode;
  value: number;
  cells: ReactNode[];
  title?: string;
}

// A ranked list where each row carries a wash bar proportional to its value.
export function BarList({
  rows,
  columns,
  onSelect,
  empty = "Chưa có dữ liệu",
}: {
  rows: BarRow[];
  columns: string[];
  onSelect?: (key: string) => void;
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted">{empty}</p>;
  return (
    <table className="w-full table-fixed text-sm">
      <thead>
        <tr className="text-left text-xs text-muted">
          <th className="pb-2 font-normal" />
          {columns.map((c) => (
            <th key={c} className="w-20 pb-2 text-right font-normal">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.key}
            className={onSelect ? "cursor-pointer hover:bg-wash" : undefined}
            onClick={onSelect ? () => onSelect(r.key) : undefined}
            title={r.title}
          >
            <td className="relative py-1 pr-2">
              <div
                className="absolute inset-y-0.5 left-0 rounded-r"
                style={{ width: `${(r.value / max) * 100}%`, background: "var(--bar-wash)" }}
              />
              <div className="relative truncate px-2">{r.label}</div>
            </td>
            {r.cells.map((c, i) => (
              <td key={i} className="num py-1 text-right text-ink-2">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
