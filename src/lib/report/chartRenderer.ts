/**
 * Chart renderer for the monthly skill report. Hand-built SVGs styled after the
 * template's chart images (soft palette, value labels, rounded bars), rasterized
 * to PNG at the template's exact pixel sizes so they slot into the PPTX media
 * files without any layout changes.
 */

import type { Resvg } from "@resvg/resvg-js";

/**
 * Lazy-load resvg at runtime. The package ships a native `.node` binary that
 * webpack cannot parse — it must stay out of the bundle (also enforced via
 * `serverExternalPackages` in next.config.ts). A dynamic import keeps it
 * server-only and defers loading until a chart is actually rendered.
 */
async function getResvg(): Promise<typeof import("@resvg/resvg-js")> {
  return (await import("@resvg/resvg-js")) as typeof import("@resvg/resvg-js");
}

const FONT = "Arial, Helvetica, sans-serif";

// Template palette (sampled from the deck's chart PNGs)
const COLORS = {
  excellent: "#22c55e", // emerald
  good: "#3b82f6",      // blue
  average: "#f59e0b",   // amber
  poor: "#ef4444",      // red
  bar: "#6366f1",       // indigo
  barAlt: "#4F46E5",    // brand magenta
  text: "#334155",
  grid: "#e2e8f0",
  bg: "#ffffff"
};

function esc(s: string | number): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Attendance distribution pie/donut — like template's image8.png (881×436). */
export async function renderAttendanceChartPNG(buckets: {
  excellent: number; good: number; average: number; poor: number;
}): Promise<Buffer> {
  const W = 880, H = 436;
  const total = buckets.excellent + buckets.good + buckets.average + buckets.poor || 1;
  const cx = 210, cy = 218, r = 150, inner = 80;

  const segs: { val: number; color: string; label: string }[] = [
    { val: buckets.excellent, color: COLORS.excellent, label: "Excellent (90-100%)" },
    { val: buckets.good, color: COLORS.good, label: "Good (80-89%)" },
    { val: buckets.average, color: COLORS.average, label: "Average (75-79%)" },
    { val: buckets.poor, color: COLORS.poor, label: "Poor (<75%)" }
  ];

  let angle = -Math.PI / 2;
  let paths = "";
  for (const seg of segs) {
    if (seg.val <= 0) continue;
    const frac = seg.val / total;
    const a2 = angle + frac * Math.PI * 2;
    const large = frac > 0.5 ? 1 : 0;
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    const xi2 = cx + inner * Math.cos(a2), yi2 = cy + inner * Math.sin(a2);
    const xi1 = cx + inner * Math.cos(angle), yi1 = cy + inner * Math.sin(angle);
    paths += `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${inner} ${inner} 0 ${large} 0 ${xi1} ${yi1} Z" fill="${seg.color}" stroke="#fff" stroke-width="2"/>`;
    // value label
    const mid = (angle + a2) / 2;
    const lx = cx + (r + 26) * Math.cos(mid), ly = cy + (r + 26) * Math.sin(mid);
    paths += `<text x="${lx}" y="${ly}" font-family="${FONT}" font-size="15" font-weight="700" fill="${COLORS.text}" text-anchor="middle" dominant-baseline="middle">${seg.val}</text>`;
    angle = a2;
  }

  const legend = segs.map((s, i) => `
    <g transform="translate(440, ${120 + i * 58})">
      <rect width="18" height="18" rx="4" fill="${s.color}"/>
      <text x="28" y="14" font-family="${FONT}" font-size="15" font-weight="700" fill="${COLORS.text}">${esc(s.label)}</text>
      <text x="380" y="14" font-family="${FONT}" font-size="16" font-weight="800" fill="${COLORS.text}" text-anchor="end">${s.val} student${s.val !== 1 ? "s" : ""}</text>
    </g>`).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${COLORS.bg}"/>
    ${paths}
    <text x="${cx}" y="${cy - 6}" font-family="${FONT}" font-size="26" font-weight="800" fill="${COLORS.text}" text-anchor="middle">${total}</text>
    <text x="${cx}" y="${cy + 18}" font-family="${FONT}" font-size="12" font-weight="600" fill="#94a3b8" text-anchor="middle">STUDENTS</text>
    ${legend}
  </svg>`;
  const { Resvg } = await getResvg();
  return new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
}

/** Horizontal bar chart for CEFR / aptitude / LeetCode distributions (880×437). */
export async function renderDistributionChartPNG(opts: {
  bars: { label: string; value: number; color?: string }[];
  valueSuffix?: string;
  maxOverride?: number;
}): Promise<Buffer> {
  const W = 880, H = 436;
  const padL = 210, padR = 90, padT = 28, barH = 44, gap = 26;
  const n = Math.max(1, opts.bars.length);
  const chartH = Math.max(H, padT + n * (barH + gap) + padT);
  const max = opts.maxOverride ?? Math.max(1, ...opts.bars.map(b => b.value));
  const trackW = W - padL - padR;

  let body = "";
  opts.bars.forEach((b, i) => {
    const y = padT + i * (barH + gap);
    const w = Math.max(4, (b.value / max) * trackW);
    const color = b.color || COLORS.bar;
    body += `
      <text x="${padL - 12}" y="${y + barH / 2}" font-family="${FONT}" font-size="14" font-weight="700" fill="${COLORS.text}" text-anchor="end" dominant-baseline="middle">${esc(b.label)}</text>
      <rect x="${padL}" y="${y}" width="${trackW}" height="${barH}" rx="8" fill="${COLORS.grid}" opacity="0.45"/>
      <rect x="${padL}" y="${y}" width="${w}" height="${barH}" rx="8" fill="${color}"/>
      <text x="${padL + w + 10}" y="${y + barH / 2}" font-family="${FONT}" font-size="15" font-weight="800" fill="${COLORS.text}" dominant-baseline="middle">${esc(b.value)}${esc(opts.valueSuffix || "")}</text>`;
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${chartH}" viewBox="0 0 ${W} ${chartH}">
    <rect width="${W}" height="${chartH}" fill="${COLORS.bg}"/>
    ${body}
  </svg>`;
  const { Resvg } = await getResvg();
  return new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
}

/** Simple class-average gauge card used on technical-evaluation slides. */
export async function renderClassAveragePNG(avgPct: number, problemsAssigned: number, avgSolved: number): Promise<Buffer> {
  const W = 880, H = 220;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${COLORS.bg}"/>
    <rect x="0" y="0" width="${W}" height="${H}" rx="16" fill="#eef2ff" opacity="0.6"/>
    <text x="40" y="70" font-family="${FONT}" font-size="15" font-weight="700" fill="#64748b">CLASS AVERAGE SCORE</text>
    <text x="40" y="140" font-family="${FONT}" font-size="64" font-weight="800" fill="${COLORS.barAlt}">${avgPct}%</text>
    <text x="360" y="100" font-family="${FONT}" font-size="18" font-weight="700" fill="${COLORS.text}">Average problems solved: ${avgSolved} / ${problemsAssigned}</text>
    <text x="360" y="140" font-family="${FONT}" font-size="14" font-weight="600" fill="#64748b">Assessed on LeetCode homework submissions for the month</text>
  </svg>`;
  const { Resvg } = await getResvg();
  return new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
}
