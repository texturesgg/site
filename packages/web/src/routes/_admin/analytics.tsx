import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { type InferResponseType, parseResponse } from "hono/client";
import { useState } from "react";
import { api } from "@/lib/api";
import { EmptyState } from "@/ui/patterns/EmptyState";
import { Button, ToggleGroup } from "@/ui/primitives";
import { color, font, radius, space, text, tracking } from "@/ui/tokens.stylex";

const PERIODS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] as const;
type Period = (typeof PERIODS)[number]["value"];

const numberFormat = new Intl.NumberFormat("en-US");
const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const syncedFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});
const formatNumber = (value: number) => numberFormat.format(value);
const formatDay = (day: string) => dayFormat.format(new Date(`${day}T00:00:00Z`));

type AnalyticsData = InferResponseType<typeof api.admin.analytics.$get, 200>;

export const Route = createFileRoute("/_admin/analytics")({
  head: () => ({ meta: [{ title: "Analytics - textures.gg" }] }),
  component: AnalyticsPage,
});

const WIDE = "@media (min-width: 1024px)";

const styles = stylex.create({
  section: { display: "flex", flexDirection: "column", gap: space.lg },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.sm,
  },
  synced: { margin: 0, fontSize: text.sm, color: color.muted },
  metrics: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: space.sm,
    margin: 0,
  },
  metric: {
    display: "flex",
    flexDirection: "column-reverse",
    justifyContent: "flex-end",
    gap: space.xxs,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  metricLabel: { fontSize: text.sm, color: color.muted },
  metricValue: { margin: 0, fontFamily: font.mono, fontSize: text.h2, color: color.text },
  metricValueAccent: { color: color.accentText },
  metricDetail: { fontSize: text.sm, color: color.muted },
  columns: {
    display: "grid",
    gridTemplateColumns: { default: "minmax(0, 1fr)", [WIDE]: "minmax(0, 1fr) 320px" },
    gap: space.md,
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    minWidth: 0,
  },
  cardHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: space.md,
  },
  cardTitle: { margin: 0, fontSize: text.xl, fontWeight: 800, letterSpacing: tracking.tight },
  cardHint: { margin: 0, fontSize: text.sm, color: color.muted },
  average: { textAlign: "right", fontSize: text.sm, color: color.muted },
  averageValue: { display: "block", fontFamily: font.mono, fontSize: text.xl, color: color.text },
  chart: { display: "block", width: "100%", height: "auto" },
  gridLine: { stroke: color.line, strokeWidth: 1 },
  bar: { fill: color.accent },
  signupDot: { fill: color.muted },
  packDot: { fill: color.success },
  axisLabel: { fill: color.muted, fontFamily: font.mono, fontSize: "11px" },
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.md,
    margin: 0,
    padding: 0,
    listStyle: "none",
    fontSize: text.sm,
    color: color.muted,
  },
  legendItem: { display: "inline-flex", alignItems: "center", gap: space.xxs },
  swatch: { width: "10px", height: "10px", borderRadius: radius.pill },
  swatchBar: { backgroundColor: color.accent, borderRadius: "2px" },
  swatchSignup: { backgroundColor: color.muted },
  swatchPack: { backgroundColor: color.success },
  statuses: {
    display: "flex",
    flexDirection: "column",
    gap: space.sm,
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  statusRow: { display: "flex", flexDirection: "column", gap: space.xxs },
  statusHead: { display: "flex", justifyContent: "space-between", fontSize: text.sm },
  statusName: { color: color.muted, textTransform: "capitalize" },
  statusCount: { fontFamily: font.mono },
  meter: {
    display: "block",
    height: "6px",
    overflow: "hidden",
    borderRadius: radius.pill,
    backgroundColor: color.raise,
  },
  meterFill: {
    display: "block",
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: color.accent,
  },
  meterWidth: (share: number) => ({ width: `${share}%` }),
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", minWidth: "640px", borderCollapse: "collapse", fontSize: text.md },
  th: {
    paddingBlock: space.xs,
    paddingInline: space.sm,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: color.line,
    fontSize: text.sm,
    fontWeight: 600,
    color: color.muted,
    textAlign: "left",
  },
  td: {
    paddingBlock: space.sm,
    paddingInline: space.sm,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: color.line,
    verticalAlign: "middle",
  },
  numeric: { textAlign: "right", fontFamily: font.mono },
  rank: { fontFamily: font.mono, color: color.muted, width: "3rem" },
  packLink: {
    color: color.text,
    fontWeight: 600,
    textDecoration: { default: "none", ":hover": "underline" },
  },
  note: { margin: 0, fontSize: text.sm, lineHeight: 1.5, color: color.muted, maxWidth: "80ch" },
  skeleton: { height: "320px", borderRadius: radius.lg, backgroundColor: color.surface },
});

function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>("30");
  const analytics = useQuery({
    queryKey: ["admin", "analytics", period],
    queryFn: () => parseResponse(api.admin.analytics.$get({ query: { days: period } })),
    staleTime: 60_000,
  });

  return (
    <section aria-label="Analytics" {...stylex.props(styles.section)}>
      <div {...stylex.props(styles.toolbar)}>
        <ToggleGroup label="Period" value={period} options={PERIODS} onValueChange={setPeriod} />
        {analytics.data && (
          <p {...stylex.props(styles.synced)}>
            Updated{" "}
            <time dateTime={analytics.data.generatedAt}>
              {syncedFormat.format(new Date(analytics.data.generatedAt))}
            </time>
            {analytics.isFetching && " · refreshing"}
          </p>
        )}
      </div>
      {analytics.isPending ? (
        <div aria-hidden="true" {...stylex.props(styles.skeleton)} />
      ) : analytics.isError ? (
        <EmptyState
          title="Analytics couldn't be loaded"
          body={analytics.error.message}
          action={<Button onClick={() => analytics.refetch()}>Try again</Button>}
        />
      ) : (
        <AnalyticsContent data={analytics.data} />
      )}
    </section>
  );
}

function AnalyticsContent({ data }: { data: AnalyticsData }) {
  const { overview } = data;
  return (
    <>
      <dl aria-label="Key figures" {...stylex.props(styles.metrics)}>
        <Metric
          label={`Downloads, last ${data.days} days`}
          value={overview.trackedDownloads}
          detail={`${formatNumber(overview.allTimeDownloads)} all time`}
          accent
        />
        <Metric
          label="Users"
          value={overview.totalUsers}
          detail={`+${formatNumber(overview.newUsers)} in period`}
        />
        <Metric
          label="Public packs"
          value={overview.totalPacks}
          detail={`+${formatNumber(overview.newPacks)} in period`}
        />
        <Metric
          label="Likes and comments"
          value={overview.totalVotes + overview.totalComments}
          detail={`${formatNumber(overview.totalVotes)} likes · ${formatNumber(overview.totalComments)} comments`}
        />
      </dl>

      <div {...stylex.props(styles.columns)}>
        <section aria-labelledby="downloads-heading" {...stylex.props(styles.card)}>
          <div {...stylex.props(styles.cardHead)}>
            <div>
              <h2 id="downloads-heading" {...stylex.props(styles.cardTitle)}>
                Downloads per day
              </h2>
              <p {...stylex.props(styles.cardHint)}>Full-pack downloads, by UTC day</p>
            </div>
            <span {...stylex.props(styles.average)}>
              Daily average
              <span {...stylex.props(styles.averageValue)}>
                {(overview.trackedDownloads / data.days).toFixed(1)}
              </span>
            </span>
          </div>
          <ActivityChart activity={data.activity} />
          <ul {...stylex.props(styles.legend)}>
            <li {...stylex.props(styles.legendItem)}>
              <span {...stylex.props(styles.swatch, styles.swatchBar)} /> Downloads
            </li>
            <li {...stylex.props(styles.legendItem)}>
              <span {...stylex.props(styles.swatch, styles.swatchSignup)} /> Sign-ups that day
            </li>
            <li {...stylex.props(styles.legendItem)}>
              <span {...stylex.props(styles.swatch, styles.swatchPack)} /> New packs that day
            </li>
          </ul>
        </section>

        <section aria-labelledby="catalog-heading" {...stylex.props(styles.card)}>
          <h2 id="catalog-heading" {...stylex.props(styles.cardTitle)}>
            Packs by status
          </h2>
          <ul {...stylex.props(styles.statuses)}>
            {data.packStatuses.map((status) => {
              const share =
                overview.totalPacks > 0 ? (status.count / overview.totalPacks) * 100 : 0;
              return (
                <li key={status.status} {...stylex.props(styles.statusRow)}>
                  <span {...stylex.props(styles.statusHead)}>
                    <span {...stylex.props(styles.statusName)}>{status.status}</span>
                    <span {...stylex.props(styles.statusCount)}>{formatNumber(status.count)}</span>
                  </span>
                  <span {...stylex.props(styles.meter)}>
                    <span
                      {...stylex.props(styles.meterFill, styles.meterWidth(Math.min(100, share)))}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section aria-labelledby="top-heading" {...stylex.props(styles.card)}>
        <div>
          <h2 id="top-heading" {...stylex.props(styles.cardTitle)}>
            Most downloaded packs
          </h2>
          <p {...stylex.props(styles.cardHint)}>Ranked by downloads in the selected period</p>
        </div>
        <div {...stylex.props(styles.tableWrap)}>
          <table {...stylex.props(styles.table)}>
            <thead>
              <tr>
                <th scope="col" {...stylex.props(styles.th)}>
                  #
                </th>
                <th scope="col" {...stylex.props(styles.th)}>
                  Pack
                </th>
                <th scope="col" {...stylex.props(styles.th, styles.numeric)}>
                  In period
                </th>
                <th scope="col" {...stylex.props(styles.th, styles.numeric)}>
                  All time
                </th>
              </tr>
            </thead>
            <tbody>
              {data.topPacks.map((pack, index) => (
                <tr key={pack.id}>
                  <td {...stylex.props(styles.td, styles.rank)}>{index + 1}</td>
                  <td {...stylex.props(styles.td)}>
                    <Link
                      to="/games/$slug/packs/$packSlug"
                      params={{ slug: pack.gameSlug, packSlug: pack.slug }}
                      {...stylex.props(styles.packLink)}
                    >
                      {pack.title}
                    </Link>
                  </td>
                  <td {...stylex.props(styles.td, styles.numeric)}>
                    {formatNumber(pack.periodDownloads)}
                  </td>
                  <td {...stylex.props(styles.td, styles.numeric)}>
                    {formatNumber(pack.allTimeDownloads)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p {...stylex.props(styles.note)}>
        Counts only full-pack downloads; single-file downloads and asset reads aren&apos;t included.
        Daily history starts with the analytics backfill; all-time totals come from each pack&apos;s
        running counter.
      </p>
    </>
  );
}

function Metric({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: number;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div {...stylex.props(styles.metric)}>
      <dt {...stylex.props(styles.metricLabel)}>{label}</dt>
      <dd {...stylex.props(styles.metricValue, accent && styles.metricValueAccent)}>
        {formatNumber(value)}
        <span {...stylex.props(styles.metricDetail)}> · {detail}</span>
      </dd>
    </div>
  );
}

function ActivityChart({ activity }: { activity: AnalyticsData["activity"] }) {
  const width = 960;
  const height = 230;
  const padX = 24;
  const padTop = 12;
  const padBottom = 34;
  const plotHeight = height - padTop - padBottom;
  const step = (width - padX * 2) / Math.max(1, activity.length);
  const barWidth = Math.max(2, Math.min(14, step * 0.68));
  const peak = Math.max(1, ...activity.map((point) => point.downloads));
  const labeled = new Set([0, Math.floor((activity.length - 1) / 2), activity.length - 1]);
  const total = activity.reduce((sum, point) => sum + point.downloads, 0);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an inline SVG chart cannot be an <img>.
      role="img"
      aria-label={`Downloads per day: ${formatNumber(total)} over ${activity.length} days, peaking at ${formatNumber(peak)}.`}
      {...stylex.props(styles.chart)}
    >
      {[0, 0.5, 1].map((fraction) => (
        <line
          key={fraction}
          x1={padX}
          x2={width - padX}
          y1={padTop + plotHeight * fraction}
          y2={padTop + plotHeight * fraction}
          {...stylex.props(styles.gridLine)}
        />
      ))}
      {activity.map((point, index) => {
        const x = padX + index * step + (step - barWidth) / 2;
        const barHeight = (point.downloads / peak) * plotHeight;
        return (
          <g key={point.day}>
            <rect
              x={x}
              y={padTop + plotHeight - barHeight}
              width={barWidth}
              height={Math.max(point.downloads > 0 ? 2 : 0, barHeight)}
              rx={2}
              {...stylex.props(styles.bar)}
            >
              <title>{`${formatDay(point.day)}: ${formatNumber(point.downloads)} downloads`}</title>
            </rect>
            {(point.signups > 0 || point.packs > 0) && (
              <circle
                cx={x + barWidth / 2}
                cy={padTop + plotHeight + 9}
                r={point.packs > 0 ? 3.5 : 2.5}
                {...stylex.props(point.packs > 0 ? styles.packDot : styles.signupDot)}
              >
                <title>{`${formatDay(point.day)}: ${point.signups} sign-ups, ${point.packs} new packs`}</title>
              </circle>
            )}
            {labeled.has(index) && (
              <text
                x={x + barWidth / 2}
                y={height - 6}
                textAnchor={
                  index === 0 ? "start" : index === activity.length - 1 ? "end" : "middle"
                }
                {...stylex.props(styles.axisLabel)}
              >
                {formatDay(point.day)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
