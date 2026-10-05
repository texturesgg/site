import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { displayName } from "@vgskins/shared";
import { type InferResponseType, parseResponse } from "hono/client";
import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { api, apiError } from "@/lib/api";
import { API_BASE_URL } from "@/lib/config";
import { NETPLAY_LABELS } from "@/lib/format";
import { EmptyState } from "@/ui/patterns/EmptyState";
import { layout } from "@/ui/patterns/layout";
import { ModEyebrow, ModHeader } from "@/ui/patterns/ModHeader";
import { AnchorButton, Badge, Button } from "@/ui/primitives";
import { color, font, radius, space, text } from "@/ui/tokens.stylex";

export const Route = createFileRoute("/games/$slug/code-mods/$modSlug")({
  loader: async ({ params }) => {
    const [res, gameRes] = await Promise.all([
      api["code-mods"][":slug"].$get({ param: { slug: params.modSlug } }),
      api.games[":slug"].$get({ param: { slug: params.slug } }),
    ]);
    if (res.status === 404 || gameRes.status === 404) throw notFound();
    const [mod, game] = await Promise.all([parseResponse(res), parseResponse(gameRes)]);
    // A mod belongs to one game; another game's URL for it is not a page.
    if (mod.game !== game.slug) throw notFound();
    return { ...mod, gameName: game.name };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.name ?? "Code mod"} - textures.gg` }],
  }),
  component: CodeMod,
});

type Release = InferResponseType<
  (typeof api)["code-mods"][":slug"]["$get"],
  200
>["releases"][number];
type Build = Release["builds"][number];

const WIDE = "@media (min-width: 1024px)";

const styles = stylex.create({
  // The pack page's frame: on wide screens the work on the left and the
  // header in a side column; on phones the header first.
  page: {
    display: { default: "flex", [WIDE]: "grid" },
    flexDirection: "column",
    gridTemplateColumns: "minmax(0, 1fr) 400px",
    alignItems: { default: "stretch", [WIDE]: "start" },
    gap: { default: space.lg, [WIDE]: space.xl },
  },
  side: {
    order: { default: 1, [WIDE]: 2 },
    display: "flex",
    flexDirection: "column",
    gap: space.xl,
    minWidth: 0,
  },
  main: { order: { default: 2, [WIDE]: 1 }, minWidth: 0 },
  // The header is order 1 (ModHeader), so what follows it in the column
  // comes after it.
  afterHead: { order: 2 },
  creator: { color: color.text, textDecoration: { default: "none", ":hover": "underline" } },
  description: { margin: 0, fontSize: text.md, lineHeight: 1.5, color: color.muted },
  section: { display: "flex", flexDirection: "column", gap: space.md },
  heading: { margin: 0, fontSize: text.lg, fontWeight: 700 },
  id: { fontFamily: font.mono },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.sm },
  spread: { justifyContent: "space-between" },
  version: { fontSize: text.lg, fontWeight: 700 },
  muted: { margin: 0, fontSize: text.sm, color: color.muted },
  error: { margin: 0, fontSize: text.sm, color: color.danger },
  build: {
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.line,
  },
  code: {
    margin: 0,
    padding: space.sm,
    overflowX: "auto",
    borderRadius: radius.sm,
    backgroundColor: color.bg,
    fontFamily: font.mono,
    fontSize: text.xs,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
});

function CodeMod() {
  const mod = Route.useLoaderData();
  const { user } = useAuth();
  const canReview = user?.role === "moderator" || user?.role === "admin";
  const created = new Date(mod.createdAt);
  const latest = mod.releases.find((release) => release.status === "approved") ?? mod.releases[0];

  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <div {...stylex.props(styles.side)}>
        <ModHeader
          eyebrow={
            <ModEyebrow to="/games/$slug/code-mods" params={{ slug: mod.game }}>
              Code mod · {mod.gameName}
            </ModEyebrow>
          }
          title={mod.name}
          byline={
            <>
              {mod.owner && (
                <>
                  by{" "}
                  <Link
                    to="/users/$username"
                    params={{ username: mod.owner }}
                    {...stylex.props(styles.creator)}
                  >
                    {displayName(mod.owner)}
                  </Link>{" "}
                  ·{" "}
                </>
              )}
              <time dateTime={created.toISOString()}>
                {created.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </time>
            </>
          }
        >
          <div {...stylex.props(styles.row)}>
            <span {...stylex.props(styles.id)}>{mod.slug}</span>
            {latest && <Badge>{latest.version}</Badge>}
            {latest?.netplay && <Badge>{NETPLAY_LABELS[latest.netplay]}</Badge>}
          </div>
          {mod.description && <p {...stylex.props(styles.description)}>{mod.description}</p>}
        </ModHeader>
        {mod.mine && (
          <div {...stylex.props(styles.afterHead)}>
            <Publish />
          </div>
        )}
      </div>
      <section {...stylex.props(styles.main, styles.section)}>
        <h2 {...stylex.props(styles.heading)}>Releases</h2>
        {mod.releases.length === 0 ? (
          <EmptyState
            title="No releases yet"
            body={mod.mine ? "Publish a version to build one." : undefined}
          />
        ) : (
          mod.releases.map((release) => (
            <ReleaseCard key={release.id} release={release} canReview={canReview} />
          ))
        )}
      </section>
    </div>
  );
}

/** How the owner publishes a version, with the tgg command line. */
function Publish() {
  return (
    <section {...stylex.props(styles.section)}>
      <h2 {...stylex.props(styles.heading)}>Publish</h2>
      <div {...stylex.props(styles.card)}>
        <p {...stylex.props(styles.muted)}>
          Bump the version in manifest.json, commit, then from your mod&apos;s folder:
        </p>
        <pre {...stylex.props(styles.code)}>{"tgg login\ntgg mod publish"}</pre>
        <p {...stylex.props(styles.muted)}>Each version you publish builds a release.</p>
      </div>
    </section>
  );
}

function ReleaseCard({ release, canReview }: { release: Release; canReview: boolean }) {
  const router = useRouter();
  const review = useMutation({
    mutationFn: async (decision: "approve" | "reject") => {
      const param = { id: release.id };
      const res =
        decision === "approve"
          ? await api.admin["code-mods"].releases[":id"].approve.$post({ param })
          : await api.admin["code-mods"].releases[":id"].reject.$post({ param });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () => router.invalidate(),
  });

  return (
    <article {...stylex.props(styles.card)}>
      <div {...stylex.props(styles.row, styles.spread)}>
        <div {...stylex.props(styles.row)}>
          <span {...stylex.props(styles.version)}>{release.version}</span>
          <Badge tone={release.status === "approved" ? "neutral" : "accent"}>
            {release.status}
          </Badge>
          {release.netplay && <Badge>{NETPLAY_LABELS[release.netplay]}</Badge>}
          {release.license && <Badge>{release.license}</Badge>}
        </div>
        {canReview && release.status === "pending" && (
          <div {...stylex.props(styles.row)}>
            <Button
              variant="primary"
              onClick={() => review.mutate("approve")}
              disabled={review.isPending}
            >
              Approve
            </Button>
            <Button onClick={() => review.mutate("reject")} disabled={review.isPending}>
              Reject
            </Button>
          </div>
        )}
      </div>
      <p {...stylex.props(styles.muted)}>
        {release.tag} at <span {...stylex.props(styles.id)}>{release.commit.slice(0, 12)}</span>
      </p>
      {release.error && <p {...stylex.props(styles.error)}>{release.error}</p>}
      {review.error && <p {...stylex.props(styles.error)}>{review.error.message}</p>}
      {release.builds.map((build: Build) => (
        <BuildRow key={build.id} build={build} />
      ))}
    </article>
  );
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** The game files a build ships, the first few by name. */
function fileSummary(files: Build["files"]): string {
  const shown = files.slice(0, 6).map((file) => file.path);
  const more = files.length - shown.length;
  return `Files: ${shown.join(", ")}${more > 0 ? `, and ${more} more` : ""}`;
}

function hookSummary(hooks: Build["hooks"]): string | null {
  if (!hooks) return null;
  const parts = [
    hooks.replaces?.length ? `replaces ${hooks.replaces.join(", ")}` : null,
    hooks.before?.length ? `runs before ${hooks.before.join(", ")}` : null,
    hooks.after?.length ? `runs after ${hooks.after.join(", ")}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : null;
}

function BuildRow({ build }: { build: Build }) {
  const [showLog, setShowLog] = useState(false);
  const log = useQuery({
    queryKey: ["code-mod-build", build.id, "log"],
    enabled: showLog,
    queryFn: async () => {
      const res = await api["code-mods"].builds[":id"].log.$get({ param: { id: build.id } });
      if (!res.ok) throw await apiError(res);
      return res.text();
    },
  });
  const hooks = hookSummary(build.hooks);

  return (
    <div {...stylex.props(styles.build)}>
      <div {...stylex.props(styles.row, styles.spread)}>
        <div {...stylex.props(styles.row)}>
          <span {...stylex.props(styles.id)}>{build.layout}</span>
          <Badge tone={build.status === "succeeded" ? "neutral" : "accent"}>{build.status}</Badge>
          {build.size !== null && (
            <span {...stylex.props(styles.muted)}>{formatSize(build.size)}</span>
          )}
          {build.state !== null && <span {...stylex.props(styles.muted)}>Keeps state</span>}
        </div>
        <div {...stylex.props(styles.row)}>
          {build.hasLog && (
            <Button variant="text" onClick={() => setShowLog((shown) => !shown)}>
              {showLog ? "Hide log" : "Log"}
            </Button>
          )}
          {build.sha256 && (
            <AnchorButton href={`${API_BASE_URL}/api/code-mods/packages/${build.sha256}.zip`}>
              Download
            </AnchorButton>
          )}
        </div>
      </div>
      {hooks && <p {...stylex.props(styles.muted)}>{hooks}</p>}
      {build.files.length > 0 && <p {...stylex.props(styles.muted)}>{fileSummary(build.files)}</p>}
      {build.error && <p {...stylex.props(styles.error)}>{build.error}</p>}
      {showLog && (
        <pre {...stylex.props(styles.code)}>
          {log.isPending
            ? "Loading…"
            : log.error
              ? log.error.message
              : log.data || "The log is empty."}
        </pre>
      )}
    </div>
  );
}
