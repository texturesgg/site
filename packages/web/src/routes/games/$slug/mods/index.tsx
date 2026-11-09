import * as stylex from "@stylexjs/stylex";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { PRIMARY_GAME_SLUG } from "@vgskins/shared";
import { parseResponse } from "hono/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { requireFeatureFlag } from "@/lib/feature-flags";
import { EmptyState } from "@/ui/patterns/EmptyState";
import { GameSections } from "@/ui/patterns/GameSections";
import { layout } from "@/ui/patterns/layout";
import { ModGrid } from "@/ui/patterns/ModTile";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { SetGrid } from "@/ui/patterns/SetCard";
import { SearchField } from "@/ui/primitives";
import { font, space, text } from "@/ui/tokens.stylex";

// The registry lists at most this many to a page; every mod fits in one for
// now, so search runs here over the whole list.
const PAGE_SIZE = 100;

export const Route = createFileRoute("/games/$slug/mods/")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" && search.q ? search.q : undefined,
  }),
  loader: async ({ context, params }) => {
    await requireFeatureFlag(context.queryClient, "codeMods");
    const gameRes = await api.games[":slug"].$get({ param: { slug: params.slug } });
    if (gameRes.status === 404) throw notFound();
    const game = await parseResponse(gameRes);
    // Mods are for tgg-melee, so only Melee has any.
    if (game.slug !== PRIMARY_GAME_SLUG) return { game, sets: [], mods: [] };
    const [sets, mods] = await Promise.all([
      parseResponse(api.registry.sets.$get()),
      parseResponse(api.registry.mods.$get({ query: { pageSize: String(PAGE_SIZE) } })),
    ]);
    return { game, sets, mods: mods.items };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.game?.name ?? "Game"} mods - textures.gg` }],
  }),
  component: Mods,
});

const WIDE = "@media (min-width: 1024px)";

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.xl },
  section: { display: "flex", flexDirection: "column", gap: space.md },
  heading: { margin: 0, fontSize: text.h3, fontWeight: 800 },
  count: { fontFamily: font.mono, fontSize: text.sm },
  search: { width: { default: "100%", [WIDE]: "520px" } },
});

type Mod = ReturnType<typeof Route.useLoaderData>["mods"][number];

/** Whether `mod` matches every word of `query`, in any field a player knows it by. */
function matches(mod: Mod, words: string[]): boolean {
  const haystack = [
    mod.name,
    mod.id,
    mod.description ?? "",
    mod.publisher.name,
    mod.author,
    ...mod.tags,
  ]
    .join(" ")
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

function Mods() {
  const { game, sets, mods } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const [query, setQuery] = useState(search.q ?? "");
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => setQuery(search.q ?? ""), [search.q]);
  const onQueryChange = (value: string) => {
    setQuery(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(
      () => void navigate({ search: { q: value.trim() || undefined }, replace: true }),
      300
    );
  };

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length ? mods.filter((mod) => matches(mod, words)) : mods;
  const icons = useMemo(
    () => new Map(mods.flatMap((mod) => (mod.icon ? [[mod.id, mod.icon.url] as const] : []))),
    [mods]
  );
  const count = `${mods.length} ${mods.length === 1 ? "mod" : "mods"}`;

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
          mods.length > 0 && (
            <div {...stylex.props(styles.search)}>
              <SearchField
                label="Search mods"
                placeholder="Search mods"
                value={query}
                onChange={(event) => onQueryChange(event.currentTarget.value)}
              />
            </div>
          )
        }
      >
        <GameSections slug={game.slug} />
      </PageHeader>

      {sets.length > 0 && words.length === 0 && (
        <section {...stylex.props(styles.section)}>
          <h2 {...stylex.props(styles.heading)}>Sets</h2>
          <SetGrid sets={sets} game={game.slug} icons={icons} />
        </section>
      )}

      {mods.length === 0 ? (
        <EmptyState title="No mods yet" />
      ) : (
        <section {...stylex.props(styles.section)}>
          {words.length === 0 && <h2 {...stylex.props(styles.heading)}>All mods</h2>}
          {shown.length === 0 ? (
            <EmptyState title="No mods match" />
          ) : (
            <ModGrid mods={shown} game={game.slug} label="Mods" />
          )}
        </section>
      )}
    </div>
  );
}
