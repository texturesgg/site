import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { displayName, PRIMARY_GAME_SLUG } from "@vgskins/shared";
import { parseResponse } from "hono/client";
import { api, apiError, getThumbnailUrl } from "@/lib/api";
import { EmptyState } from "@/ui/patterns/EmptyState";
import { Button } from "@/ui/primitives";
import { color, font, radius, space, text } from "@/ui/tokens.stylex";

export const Route = createFileRoute("/_admin/admin")({
  loader: async () => {
    const data = await parseResponse(api.admin.packs.pending.$get());
    return { pending: data.items };
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
  skeleton: { height: "136px", borderRadius: radius.lg, backgroundColor: color.surface },
});

function ReviewQueuePage() {
  const { pending } = Route.useLoaderData();
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

  if (pending.length === 0) {
    return (
      <EmptyState
        title="Nothing to review"
        body="New uploads appear here once their files finish processing."
      />
    );
  }

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

function QueueSkeleton() {
  return (
    <div aria-hidden="true" {...stylex.props(styles.list)}>
      <div {...stylex.props(styles.skeleton)} />
      <div {...stylex.props(styles.skeleton)} />
      <div {...stylex.props(styles.skeleton)} />
    </div>
  );
}
