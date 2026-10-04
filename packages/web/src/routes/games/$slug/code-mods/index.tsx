import * as stylex from "@stylexjs/stylex";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { parseResponse } from "hono/client";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { requireFeatureFlag } from "@/lib/feature-flags";
import { CodeModList } from "@/ui/patterns/CodeModList";
import { EmptyState } from "@/ui/patterns/EmptyState";
import { GameSections } from "@/ui/patterns/GameSections";
import { layout } from "@/ui/patterns/layout";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { Pagination } from "@/ui/patterns/Pagination";
import { ButtonLink } from "@/ui/primitives";
import { font, space, text } from "@/ui/tokens.stylex";

export const Route = createFileRoute("/games/$slug/code-mods/")({
  validateSearch: (search: Record<string, unknown>): { page?: number } => ({
    page: typeof search.page === "number" && search.page > 1 ? search.page : undefined,
  }),
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: async ({ context, params, deps }) => {
    await requireFeatureFlag(context.queryClient, "codeMods");
    const [gameRes, mods] = await Promise.all([
      api.games[":slug"].$get({ param: { slug: params.slug } }),
      parseResponse(
        api["code-mods"].$get({ query: { game: params.slug, page: String(deps.page) } })
      ),
    ]);
    if (gameRes.status === 404) throw notFound();
    return { game: await parseResponse(gameRes), mods };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.game?.name ?? "Game"} code mods - textures.gg` }],
  }),
  component: CodeMods,
});

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.lg },
  count: { fontFamily: font.mono, fontSize: text.sm },
});

function CodeMods() {
  const { game, mods } = Route.useLoaderData();
  const { user } = useAuth();
  const navigate = useNavigate({ from: Route.fullPath });
  const count = `${mods.total} ${mods.total === 1 ? "code mod" : "code mods"}`;

  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader
        title="Explore"
        description={
          <>
            {game.name} · <span {...stylex.props(styles.count)}>{count}</span>
          </>
        }
        actions={
          user && (
            <ButtonLink
              to="/games/$slug/code-mods/new"
              params={{ slug: game.slug }}
              variant="primary"
            >
              New code mod
            </ButtonLink>
          )
        }
      >
        <GameSections slug={game.slug} />
      </PageHeader>
      {mods.items.length === 0 ? (
        <EmptyState title="No code mods yet" />
      ) : (
        <CodeModList mods={mods.items} label="Code mods" />
      )}
      <Pagination
        page={mods.page}
        totalPages={mods.totalPages}
        onPageChange={(next) => {
          void navigate({ search: { page: next <= 1 ? undefined : next } });
          window.scrollTo({ top: 0 });
        }}
      />
    </div>
  );
}
