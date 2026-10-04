import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { parseResponse } from "hono/client";
import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { api, apiError } from "@/lib/api";
import { API_BASE_URL } from "@/lib/config";
import { EmptyState } from "@/ui/patterns/EmptyState";
import { layout } from "@/ui/patterns/layout";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { AnchorButton, Badge, Button } from "@/ui/primitives";
import { color, font, radius, space, text } from "@/ui/tokens.stylex";

export const Route = createFileRoute("/code-mods/$slug")({
  loader: async ({ params }) => {
    const res = await api["code-mods"][":slug"].$get({ param: { slug: params.slug } });
    if (res.status === 404) throw notFound();
    return parseResponse(res);
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.name ?? "Code mod"} - textures.gg` }],
  }),
  component: CodeMod,
});

type Mod = ReturnType<typeof Route.useLoaderData>;
type Release = Mod["releases"][number];
type Build = Release["builds"][number];

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.xl },
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
  note: { margin: 0, fontSize: text.sm, color: color.accentText },
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

  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader
        title={mod.name}
        description={
          <>
            <span {...stylex.props(styles.id)}>{mod.slug}</span>
            {mod.owner && ` by ${mod.owner}`}
          </>
        }
      />
      {mod.description && <p {...stylex.props(styles.muted)}>{mod.description}</p>}
      {mod.mine && <Publish slug={mod.slug} />}
      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.heading)}>Releases</h2>
        {mod.releases.length === 0 ? (
          <EmptyState
            title="No releases yet"
            body={mod.mine ? "Push a tag to build one." : undefined}
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

/** The commands an owner pushes with, with a fresh token. */
function Publish({ slug }: { slug: string }) {
  const access = useMutation({
    mutationFn: async () => {
      const res = await api["code-mods"][":slug"]["push-token"].$post({ param: { slug } });
      if (!res.ok) throw await apiError(res);
      return parseResponse(res);
    },
  });

  return (
    <section {...stylex.props(styles.section)}>
      <h2 {...stylex.props(styles.heading)}>Publish</h2>
      <div {...stylex.props(styles.card)}>
        <p {...stylex.props(styles.muted)}>
          Each version you push builds a release. From your mod&apos;s folder, with tgg-mod:
        </p>
        {access.data ? (
          <>
            <pre {...stylex.props(styles.code)}>
              {`env TGG_PUSH_TOKEN=${access.data.token} tgg-mod publish --remote ${access.data.remote}`}
            </pre>
            <p {...stylex.props(styles.muted)}>The token works for an hour.</p>
          </>
        ) : (
          <div {...stylex.props(styles.row)}>
            <Button onClick={() => access.mutate()} disabled={access.isPending}>
              Get push access
            </Button>
          </div>
        )}
        {access.error && <p {...stylex.props(styles.error)}>{access.error.message}</p>}
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
          <Badge>{release.netplay === "gameplay" ? "Gameplay" : "Cosmetic"}</Badge>
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
      {release.reviewNotes.map((note: string) => (
        <p key={note} {...stylex.props(styles.note)}>
          {note}
        </p>
      ))}
      {review.error && <p {...stylex.props(styles.error)}>{review.error.message}</p>}
      {release.builds.map((build: Build) => (
        <BuildRow key={build.id} build={build} />
      ))}
    </article>
  );
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
            <span {...stylex.props(styles.muted)}>{(build.size / 1024).toFixed(1)} KB</span>
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
