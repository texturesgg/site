import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { displayName, PRIMARY_GAME_SLUG } from "@vgskins/shared";
import { type InferResponseType, parseResponse } from "hono/client";
import { api, apiError, getThumbnailUrl } from "@/lib/api";
import { featureFlag } from "@/lib/feature-flags";
import { EmptyState } from "@/ui/patterns/EmptyState";
import { Button } from "@/ui/primitives";
import { color, font, radius, space, text } from "@/ui/tokens.stylex";

export const Route = createFileRoute("/_admin/admin")({
  loader: async ({ context }) => {
    const [packs, codeMods] = await Promise.all([
      parseResponse(api.admin.packs.pending.$get()),
      featureFlag(context.queryClient, "codeMods").then((on) =>
        on ? parseResponse(api.admin["code-mods"].releases.pending.$get()) : { items: [] }
      ),
    ]);
    return { pending: packs.items, releases: codeMods.items };
  },
  head: () => ({ meta: [{ title: "Review queue - textures.gg" }] }),
  pendingComponent: QueueSkeleton,
  component: ReviewQueuePage,
});

const styles = stylex.create({
  list: { display: "flex", flexDirection: "column", gap: space.xs, margin: 0, padding: 0 },
  row: {
    display: "grid",
    gridTemplateColumns: "120px minmax(0, 1fr)",
    alignItems: "start",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    listStyle: "none",
  },
  thumb: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    aspectRatio: "16 / 10",
    overflow: "hidden",
    borderRadius: radius.md,
    backgroundColor: color.raise,
    fontSize: text.xs,
    color: color.muted,
  },
  image: { display: "block", width: "100%", height: "100%", objectFit: "cover" },
  body: { display: "flex", flexDirection: "column", gap: space.xs, minWidth: 0 },
  title: {
    fontSize: text.lg,
    fontWeight: 700,
    color: color.text,
    textDecoration: { default: "none", ":hover": "underline" },
    overflowWrap: "anywhere",
  },
  meta: { margin: 0, fontSize: text.sm, color: color.muted },
  mono: { fontFamily: font.mono },
  description: {
    margin: 0,
    fontSize: text.md,
    color: color.muted,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  actions: { display: "flex", flexWrap: "wrap", gap: space.xs, marginTop: space.xxs },
  error: { margin: 0, fontSize: text.sm, color: color.danger },
  sections: { display: "flex", flexDirection: "column", gap: space.xl },
  heading: { margin: 0, marginBottom: space.sm, fontSize: text.lg, fontWeight: 700 },
  releaseRow: {
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    listStyle: "none",
  },
  skeleton: { height: "136px", borderRadius: radius.lg, backgroundColor: color.surface },
});

function ReviewQueuePage() {
  const { pending, releases } = Route.useLoaderData();

  if (pending.length === 0 && releases.length === 0) {
    return (
      <EmptyState
        title="Nothing to review"
        body="New uploads appear here once their files finish processing."
      />
    );
  }

  return (
    <div {...stylex.props(styles.sections)}>
      {pending.length > 0 && <PackQueue pending={pending} />}
      {releases.length > 0 && <CodeModReleaseQueue releases={releases} />}
    </div>
  );
}

type PendingPack = InferResponseType<typeof api.admin.packs.pending.$get, 200>["items"][number];
type PendingRelease = InferResponseType<
  (typeof api.admin)["code-mods"]["releases"]["pending"]["$get"],
  200
>["items"][number];

function PackQueue({ pending }: { pending: PendingPack[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const decide = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: "approve" | "reject" }) => {
      const res =
        decision === "approve"
          ? await api.admin.packs[":id"].approve.$post({ param: { id } })
          : await api.admin.packs[":id"].reject.$post({ param: { id } });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      await router.invalidate();
    },
  });

  return (
    <section aria-label="Packs waiting for review">
      {decide.isError && (
        <p role="alert" {...stylex.props(styles.error)}>
          {decide.error.message || "That decision couldn't be saved."}
        </p>
      )}
      <ul {...stylex.props(styles.list)}>
        {pending.map((pack) => {
          const thumb = getThumbnailUrl(pack.thumbnailKey);
          const busy = decide.isPending && decide.variables?.id === pack.id;
          return (
            <li key={pack.id} {...stylex.props(styles.row)}>
              <span {...stylex.props(styles.thumb)}>
                {thumb ? <img src={thumb} alt="" {...stylex.props(styles.image)} /> : "No preview"}
              </span>
              <div {...stylex.props(styles.body)}>
                <Link
                  to="/games/$slug/packs/$packSlug"
                  params={{ slug: pack.gameSlug ?? PRIMARY_GAME_SLUG, packSlug: pack.slug }}
                  {...stylex.props(styles.title)}
                >
                  {pack.title}
                </Link>
                <p {...stylex.props(styles.meta)}>
                  {[pack.targetName, pack.gameName].filter(Boolean).join(" · ")}
                  {pack.modCount != null && (
                    <>
                      {" · "}
                      <span {...stylex.props(styles.mono)}>{pack.modCount}</span>{" "}
                      {pack.modCount === 1 ? "file" : "files"}
                    </>
                  )}
                  {" · by "}
                  {pack.userName ? displayName(pack.userName) : "unknown"}
                </p>
                {pack.description && (
                  <p {...stylex.props(styles.description)}>{pack.description}</p>
                )}
                <div {...stylex.props(styles.actions)}>
                  <Button
                    variant="primary"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: pack.id, decision: "approve" })}
                  >
                    {busy && decide.variables?.decision === "approve" ? "Approving…" : "Approve"}
                  </Button>
                  <Button
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: pack.id, decision: "reject" })}
                  >
                    {busy && decide.variables?.decision === "reject" ? "Rejecting…" : "Reject"}
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CodeModReleaseQueue({ releases }: { releases: PendingRelease[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const decide = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: "approve" | "reject" }) => {
      const param = { id };
      const res =
        decision === "approve"
          ? await api.admin["code-mods"].releases[":id"].approve.$post({ param })
          : await api.admin["code-mods"].releases[":id"].reject.$post({ param });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      await router.invalidate();
    },
  });

  return (
    <section aria-labelledby="code-mod-releases">
      <h2 id="code-mod-releases" {...stylex.props(styles.heading)}>
        Code mod releases
      </h2>
      {decide.isError && (
        <p role="alert" {...stylex.props(styles.error)}>
          {decide.error.message || "That decision couldn't be saved."}
        </p>
      )}
      <ul {...stylex.props(styles.list)}>
        {releases.map((release) => {
          const busy = decide.isPending && decide.variables?.id === release.id;
          return (
            <li key={release.id} {...stylex.props(styles.releaseRow)}>
              <Link
                to="/code-mods/$slug"
                params={{ slug: release.slug }}
                {...stylex.props(styles.title)}
              >
                {release.name}
              </Link>
              <p {...stylex.props(styles.meta)}>
                <span {...stylex.props(styles.mono)}>{release.version}</span>
                {" · "}
                {release.netplay === "gameplay" ? "Gameplay" : "Cosmetic"}
                {" · by "}
                {release.userName ? displayName(release.userName) : "unknown"}
              </p>
              <div {...stylex.props(styles.actions)}>
                <Button
                  variant="primary"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: release.id, decision: "approve" })}
                >
                  {busy && decide.variables?.decision === "approve" ? "Approving…" : "Approve"}
                </Button>
                <Button
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: release.id, decision: "reject" })}
                >
                  {busy && decide.variables?.decision === "reject" ? "Rejecting…" : "Reject"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function QueueSkeleton() {
  return (
    <div aria-hidden="true" {...stylex.props(styles.list)}>
      <div {...stylex.props(styles.skeleton)} />
      <div {...stylex.props(styles.skeleton)} />
      <div {...stylex.props(styles.skeleton)} />
    </div>
  );
}
