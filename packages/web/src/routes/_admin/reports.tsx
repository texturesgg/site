import * as stylex from "@stylexjs/stylex";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { displayName, type ReportStatus } from "@vgskins/shared";
import { type InferResponseType, parseResponse } from "hono/client";
import { useState } from "react";
import { api } from "@/lib/api";
import { EmptyState } from "@/ui/patterns/EmptyState";
import { Pagination } from "@/ui/patterns/Pagination";
import { Badge, Button, ConfirmDialog, Select } from "@/ui/primitives";
import { color, radius, space, text } from "@/ui/tokens.stylex";
import { REPORT_REASON_LABELS, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/_admin/reports")({
  head: () => ({ meta: [{ title: "Reports - textures.gg" }] }),
  component: ReportsPage,
});

const STATUS_OPTIONS = [
  { value: "pending", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All reports" },
] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number]["value"];

const styles = stylex.create({
  section: { display: "flex", flexDirection: "column", gap: space.md },
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.sm,
  },
  count: { margin: 0, fontSize: text.md, color: color.muted },
  list: { display: "flex", flexDirection: "column", gap: space.xs, margin: 0, padding: 0 },
  row: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    listStyle: "none",
  },
  body: {
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
    minWidth: 0,
    flexBasis: "24rem",
    flexGrow: 1,
  },
  badges: { display: "flex", flexWrap: "wrap", gap: space.xxs },
  target: {
    fontSize: text.lg,
    fontWeight: 700,
    color: color.text,
    textDecoration: { default: "none", ":hover": "underline" },
    overflowWrap: "anywhere",
  },
  meta: { margin: 0, fontSize: text.sm, color: color.muted },
  details: {
    margin: 0,
    fontSize: text.md,
    lineHeight: 1.5,
    whiteSpace: "pre-line",
    overflowWrap: "anywhere",
  },
  actions: { display: "flex", flexWrap: "wrap", gap: space.xs },
  error: { margin: 0, fontSize: text.sm, color: color.danger },
  skeleton: { height: "112px", borderRadius: radius.lg, backgroundColor: color.surface },
});

type Report = InferResponseType<typeof api.admin.reports.$get, 200>["items"][number];

function ReportsPage() {
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<Report | null>(null);
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "reports"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
  };

  const reports = useQuery({
    queryKey: ["admin", "reports", status, page],
    placeholderData: keepPreviousData,
    queryFn: () =>
      parseResponse(
        api.admin.reports.$get({
          query: {
            status: status === "all" ? undefined : (status satisfies ReportStatus),
            page: String(page),
          },
        })
      ),
  });

  const resolve = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "resolved" | "dismissed" }) =>
      parseResponse(api.admin.reports[":id"].resolve.$post({ param: { id }, json: { action } })),
    onSuccess: refresh,
  });

  const deleteAndResolve = useMutation({
    mutationFn: async (report: Report) => {
      if (report.targetType === "pack") {
        await parseResponse(
          api.admin.packs[":id"].delete.$post({ param: { id: report.targetId } })
        );
      } else {
        await parseResponse(
          api.admin.comments[":id"].delete.$post({ param: { id: report.targetId } })
        );
      }
      await parseResponse(
        api.admin.reports[":id"].resolve.$post({
          param: { id: report.id },
          json: { action: "resolved" },
        })
      );
    },
    onSuccess: () => {
      setDeleting(null);
      refresh();
    },
  });

  const busy = resolve.isPending || deleteAndResolve.isPending;
  const items = reports.data?.items ?? [];
  const label = STATUS_OPTIONS.find((option) => option.value === status)?.label.toLowerCase();

  return (
    <section aria-label="Reports" {...stylex.props(styles.section)}>
      <div {...stylex.props(styles.toolbar)}>
        <p aria-live="polite" {...stylex.props(styles.count)}>
          {reports.data
            ? `${reports.data.total.toLocaleString("en-US")} ${status === "all" ? "reports" : label}`
            : ""}
        </p>
        <Select
          label="Show"
          value={status}
          options={STATUS_OPTIONS}
          onValueChange={(next) => {
            setStatus(next);
            setPage(1);
          }}
        />
      </div>

      {resolve.isError && (
        <p role="alert" {...stylex.props(styles.error)}>
          {resolve.error.message || "The report couldn't be updated."}
        </p>
      )}

      {reports.isPending ? (
        <div aria-hidden="true" {...stylex.props(styles.list)}>
          <div {...stylex.props(styles.skeleton)} />
          <div {...stylex.props(styles.skeleton)} />
        </div>
      ) : reports.isError ? (
        <EmptyState
          title="Reports couldn't be loaded"
          action={<Button onClick={() => reports.refetch()}>Try again</Button>}
        />
      ) : items.length === 0 ? (
        <EmptyState title={status === "pending" ? "No open reports" : "No reports here"} />
      ) : (
        <ul {...stylex.props(styles.list)}>
          {items.map((report) => (
            <li key={report.id} {...stylex.props(styles.row)}>
              <div {...stylex.props(styles.body)}>
                <div {...stylex.props(styles.badges)}>
                  <Badge>{report.targetType === "pack" ? "Pack" : "Comment"}</Badge>
                  <Badge tone={report.reason === "stolen" ? "accent" : "neutral"}>
                    {REPORT_REASON_LABELS[report.reason]}
                  </Badge>
                  {report.status !== "pending" && (
                    <Badge>{report.status === "resolved" ? "Resolved" : "Dismissed"}</Badge>
                  )}
                </div>
                {report.targetSlug && report.targetGameSlug ? (
                  <Link
                    to="/games/$slug/packs/$packSlug"
                    params={{ slug: report.targetGameSlug, packSlug: report.targetSlug }}
                    {...stylex.props(styles.target)}
                  >
                    {report.targetLabel || report.targetId}
                  </Link>
                ) : (
                  <span {...stylex.props(styles.target)}>
                    {report.targetLabel || report.targetId}
                  </span>
                )}
                <p {...stylex.props(styles.meta)}>
                  Reported by {report.reporterName ? displayName(report.reporterName) : "unknown"} ·{" "}
                  <time dateTime={new Date(report.createdAt).toISOString()}>
                    {relativeTime(report.createdAt)}
                  </time>
                </p>
                {report.details && <p {...stylex.props(styles.details)}>{report.details}</p>}
              </div>
              {report.status === "pending" && (
                <div {...stylex.props(styles.actions)}>
                  <Button
                    variant="primary"
                    disabled={busy}
                    onClick={() => resolve.mutate({ id: report.id, action: "resolved" })}
                  >
                    Resolve
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => resolve.mutate({ id: report.id, action: "dismissed" })}
                  >
                    Dismiss
                  </Button>
                  {report.targetLabel !== "[deleted]" && (
                    <Button variant="ghost" disabled={busy} onClick={() => setDeleting(report)}>
                      Delete {report.targetType} and resolve
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {reports.data && (
        <Pagination page={page} totalPages={reports.data.totalPages} onPageChange={setPage} />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            deleteAndResolve.reset();
          }
        }}
        title={`Delete this ${deleting?.targetType ?? "item"}?`}
        description={`“${deleting?.targetLabel || deleting?.targetId || ""}” will be removed and the report marked resolved.`}
        confirmLabel={`Delete ${deleting?.targetType ?? ""}`}
        pending={deleteAndResolve.isPending}
        error={deleteAndResolve.error?.message}
        onConfirm={() => deleting && deleteAndResolve.mutate(deleting)}
      />
    </section>
  );
}
