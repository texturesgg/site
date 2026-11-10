import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { PRIMARY_GAME_SLUG } from "@vgskins/shared";
import { type InferResponseType, parseResponse } from "hono/client";
import { type ReactNode, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { api, apiError } from "@/lib/api";
import { requireFeatureFlag } from "@/lib/feature-flags";
import { NETPLAY_LABELS } from "@/lib/format";
import { EmptyState } from "@/ui/patterns/EmptyState";
import { layout } from "@/ui/patterns/layout";
import { ModEyebrow } from "@/ui/patterns/ModHeader";
import { RejectReleaseDialog } from "@/ui/patterns/RejectReleaseDialog";
import { Badge, Button, ButtonLink } from "@/ui/primitives";
import { color, font, radius, space, text } from "@/ui/tokens.stylex";
import { BuildRow } from "../-releases";

type Listing = InferResponseType<
  (typeof api)["code-mod-releases"][":id"]["listing"]["$get"],
  200
>["release"];

export const Route = createFileRoute("/games/$slug/mods/$modId/review/$releaseId")({
  loader: async ({ context, params }) => {
    await requireFeatureFlag(context.queryClient, "codeMods");
    if (params.slug !== PRIMARY_GAME_SLUG) throw notFound();
    const id = { param: { id: params.releaseId } };
    const [modRes, diffRes, listingRes] = await Promise.all([
      api["code-mods"][":slug"].$get({ param: { slug: params.modId } }),
      api["code-mod-releases"][":id"].diff.$get(id),
      api["code-mod-releases"][":id"].listing.$get(id),
    ]);
    // The diff is for the mod's maker and moderators; anyone else has no review.
    if (!modRes.ok || !diffRes.ok || !listingRes.ok) throw notFound();
    const [mod, diff, listings] = await Promise.all([
      parseResponse(modRes),
      diffRes.json(),
      listingRes.json(),
    ]);
    const release = mod.releases.find((candidate) => candidate.id === params.releaseId);
    if (!release) throw notFound();
    return { mod, release, diff, listings };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: `Review ${loaderData?.mod.name ?? "mod"} ${loaderData?.release.version ?? ""} - textures.gg`,
      },
    ],
  }),
  component: ReviewPage,
});

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.xl },
  head: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: space.md,
  },
  headText: { display: "flex", flexDirection: "column", gap: space.xs },
  title: { margin: 0, fontSize: text.h2, fontWeight: 800 },
  muted: { margin: 0, fontSize: text.sm, color: color.muted },
  mono: { fontFamily: font.mono },
  actions: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.sm },
  section: { display: "flex", flexDirection: "column", gap: space.sm },
  heading: { margin: 0, fontSize: text.h3, fontWeight: 800 },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  changes: {
    display: "grid",
    gridTemplateColumns: "max-content minmax(0, 1fr) minmax(0, 1fr)",
    columnGap: space.lg,
    rowGap: space.sm,
    margin: 0,
    fontSize: text.sm,
  },
  label: { color: color.muted },
  before: {
    margin: 0,
    color: color.muted,
    textDecoration: "line-through",
    overflowWrap: "anywhere",
  },
  after: { margin: 0, overflowWrap: "anywhere" },
  file: {
    display: "flex",
    flexDirection: "column",
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  fileHead: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    width: "100%",
    padding: `${space.sm} ${space.md}`,
    border: "none",
    background: "none",
    color: color.text,
    cursor: "pointer",
    fontFamily: font.mono,
    fontSize: text.sm,
    textAlign: "left",
  },
  path: { flexGrow: 1, overflowWrap: "anywhere" },
  added: { color: color.success },
  removed: { color: color.danger },
  patch: {
    margin: 0,
    padding: space.md,
    overflowX: "auto",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.line,
    fontFamily: font.mono,
    fontSize: text.xs,
    lineHeight: 1.5,
  },
  patchLine: { display: "block", whiteSpace: "pre", minHeight: "1.5em" },
  plus: { color: color.success, backgroundColor: "rgba(80, 200, 120, 0.08)" },
  minus: { color: color.danger, backgroundColor: "rgba(240, 90, 90, 0.08)" },
  hunk: { color: color.accentText },
  error: { margin: 0, fontSize: text.sm, color: color.danger },
});

const FILE_STATUS: Record<string, string> = {
  added: "Added",
  removed: "Removed",
  modified: "Changed",
  renamed: "Renamed",
};

function ReviewPage() {
  const { mod, release, diff, listings } = Route.useLoaderData();
  const { slug } = Route.useParams();
  const { user } = useAuth();
  const router = useRouter();
  const canReview =
    (user?.role === "moderator" || user?.role === "admin") && release.status === "pending";
  const [rejecting, setRejecting] = useState(false);
  const review = useMutation({
    mutationFn: async (decision: { approve: true } | { approve: false; reason: string }) => {
      const param = { id: release.id };
      const res = decision.approve
        ? await api.admin["code-mods"].releases[":id"].approve.$post({ param, json: {} })
        : await api.admin["code-mods"].releases[":id"].reject.$post({
            param,
            json: { reason: decision.reason || undefined },
          });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: async () => {
      setRejecting(false);
      await router.invalidate();
    },
  });

  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <div {...stylex.props(styles.head)}>
        <div {...stylex.props(styles.headText)}>
          <ModEyebrow to="/games/$slug/mods/$modId" params={{ slug, modId: mod.slug }}>
            {mod.name}
          </ModEyebrow>
          <h1 {...stylex.props(styles.title)}>
            <span {...stylex.props(styles.mono)}>{release.version}</span>
          </h1>
          <p {...stylex.props(styles.muted)}>
            {diff.base ? (
              <>
                Changes since <span {...stylex.props(styles.mono)}>{diff.base.version}</span>
              </>
            ) : (
              "First release: all of its source is new"
            )}{" "}
            · by {mod.owner}
          </p>
        </div>
        <div {...stylex.props(styles.actions)}>
          <ButtonLink
            to="/games/$slug/mods/$modId/source"
            params={{ slug, modId: mod.slug }}
            search={{ release: release.id }}
          >
            Browse source
          </ButtonLink>
          {canReview && (
            <>
              <Button onClick={() => setRejecting(true)} disabled={review.isPending}>
                Reject
              </Button>
              <Button
                variant="primary"
                onClick={() => review.mutate({ approve: true })}
                disabled={review.isPending}
              >
                Approve
              </Button>
            </>
          )}
          {!canReview && <Badge>{release.status}</Badge>}
        </div>
      </div>
      {review.error && !rejecting && <p {...stylex.props(styles.error)}>{review.error.message}</p>}

      <ListingChanges release={listings.release} previous={listings.previous} />

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.heading)}>Check build</h2>
        <div {...stylex.props(styles.card)}>
          {release.error && <p {...stylex.props(styles.error)}>{release.error}</p>}
          {release.builds.length === 0 ? (
            <p {...stylex.props(styles.muted)}>No builds yet.</p>
          ) : (
            release.builds.map((build) => <BuildRow key={build.id} build={build} />)
          )}
        </div>
      </section>

      {diff.base && (
        <section {...stylex.props(styles.section)}>
          <h2 {...stylex.props(styles.heading)}>
            {diff.files.length} {diff.files.length === 1 ? "file" : "files"} changed
          </h2>
          {diff.files.length === 0 && <EmptyState title="The source didn't change" />}
          {diff.files.map((file) => (
            <ChangedFile key={file.path} releaseId={release.id} file={file} />
          ))}
          {diff.truncated && (
            <p {...stylex.props(styles.muted)}>Only the first 500 files are listed.</p>
          )}
        </section>
      )}

      <RejectReleaseDialog
        open={rejecting}
        onOpenChange={setRejecting}
        version={release.version}
        pending={review.isPending}
        error={review.error?.message}
        onReject={(reason) => review.mutate({ approve: false, reason })}
      />
    </div>
  );
}

/** One row of what changed in the listing: before, then after. */
function Change({ label, before, after }: { label: string; before: ReactNode; after: ReactNode }) {
  return (
    <>
      <dt {...stylex.props(styles.label)}>{label}</dt>
      <dd {...stylex.props(styles.before)}>{before}</dd>
      <dd {...stylex.props(styles.after)}>{after}</dd>
    </>
  );
}

const show = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "none";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "none";
  return String(value);
};

const hooks = (value: Listing["hooks"]) =>
  value
    ? [
        value.replaces?.length ? `replaces ${value.replaces.join(", ")}` : null,
        value.before?.length ? `before ${value.before.join(", ")}` : null,
        value.after?.length ? `after ${value.after.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join("; ") || "none"
    : "none";

/**
 * What players and the game see differently from the last approved release:
 * the store listing and how the mod runs. A first release lists everything.
 */
function ListingChanges({ release, previous }: { release: Listing; previous: Listing | null }) {
  const rows: { label: string; value: (listing: Listing) => string }[] = [
    { label: "Name", value: (l) => show(l.name) },
    { label: "Description", value: (l) => show(l.description) },
    { label: "Tags", value: (l) => show(l.tags) },
    { label: "License", value: (l) => show(l.license) },
    { label: "Homepage", value: (l) => show(l.homepage) },
    { label: "Needs", value: (l) => show(l.depends.map((d) => `${d.id} ${d.range}`)) },
    { label: "Netplay", value: (l) => (l.netplay ? NETPLAY_LABELS[l.netplay] : "none") },
    { label: "Hooks", value: (l) => hooks(l.hooks) },
    { label: "Game files", value: (l) => show(l.files.map((f) => f.path)) },
    { label: "Keeps state", value: (l) => (l.state !== null ? `${l.state} bytes` : "no") },
    { label: "Icon", value: (l) => (l.icon ? l.icon.url.split("/").pop()!.slice(0, 12) : "none") },
    { label: "Screenshots", value: (l) => String(l.screenshots.length) },
    {
      label: "README",
      value: (l) => (l.readme ? `${l.readme.length.toLocaleString("en-US")} characters` : "none"),
    },
  ];
  const changed = rows.filter((row) => !previous || row.value(previous) !== row.value(release));
  return (
    <section {...stylex.props(styles.section)}>
      <h2 {...stylex.props(styles.heading)}>Listing and behavior</h2>
      {changed.length === 0 ? (
        <p {...stylex.props(styles.muted)}>Nothing changed.</p>
      ) : (
        <dl {...stylex.props(styles.card, styles.changes)}>
          {changed.map((row) => (
            <Change
              key={row.label}
              label={row.label}
              before={previous ? row.value(previous) : ""}
              after={row.value(release)}
            />
          ))}
        </dl>
      )}
    </section>
  );
}

function ChangedFile({
  releaseId,
  file,
}: {
  releaseId: string;
  file: {
    path: string;
    previousPath: string | null;
    status: string;
    binary: boolean;
    additions: number | null;
    deletions: number | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const patch = useQuery({
    queryKey: ["code-mod-release", releaseId, "diff", file.path],
    enabled: open && !file.binary,
    queryFn: async () => {
      const res = await api["code-mod-releases"][":id"].diff.file.$get({
        param: { id: releaseId },
        query: { path: file.path },
      });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });
  return (
    <div {...stylex.props(styles.file)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        {...stylex.props(styles.fileHead)}
      >
        <Badge>{FILE_STATUS[file.status] ?? file.status}</Badge>
        <span {...stylex.props(styles.path)}>
          {file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}
        </span>
        {file.additions !== null && <span {...stylex.props(styles.added)}>+{file.additions}</span>}
        {file.deletions !== null && (
          <span {...stylex.props(styles.removed)}>−{file.deletions}</span>
        )}
      </button>
      {open && (
        <pre {...stylex.props(styles.patch)}>
          {file.binary
            ? "Binary file"
            : patch.isPending
              ? "Loading…"
              : patch.error
                ? patch.error.message
                : patch.data.patch === null
                  ? "Too big to show."
                  : patch.data.patch.split("\n").map((line, index) => (
                      <span
                        key={index}
                        {...stylex.props(
                          styles.patchLine,
                          line.startsWith("+") && !line.startsWith("+++") && styles.plus,
                          line.startsWith("-") && !line.startsWith("---") && styles.minus,
                          line.startsWith("@@") && styles.hunk
                        )}
                      >
                        {line}
                      </span>
                    ))}
        </pre>
      )}
    </div>
  );
}
