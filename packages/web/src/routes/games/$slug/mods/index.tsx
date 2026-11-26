import * as stylex from "@stylexjs/stylex";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { PRIMARY_GAME_SLUG } from "@vgskins/shared";
import { parseResponse } from "hono/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { api } from "@/lib/api";
import { requireFeatureFlag } from "@/lib/feature-flags";
import { EmptyState } from "@/ui/patterns/EmptyState";
import { FindMatch } from "@/ui/patterns/FindMatch";
import { layout } from "@/ui/patterns/layout";
import { ModGrid } from "@/ui/patterns/ModTile";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { SetGrid } from "@/ui/patterns/SetCard";
import { SearchField, Select, ToggleGroup, type ToggleOption } from "@/ui/primitives";
import { color, font, space, text } from "@/ui/tokens.stylex";

// The registry lists at most this many to a page; every mod fits in one for
// now, so search, filtering and sorting run here over the whole list.
const PAGE_SIZE = 100;

const MOD_CATEGORIES = ["all", "rules", "training", "replays", "hud", "modes"] as const;
type ModCategory = (typeof MOD_CATEGORIES)[number];

const MOD_SORTS = ["official", "installs"] as const;
type ModSort = (typeof MOD_SORTS)[number];

const ModsSearch = z.object({
  q: z.string().trim().min(1).optional().catch(undefined),
  category: z.enum(MOD_CATEGORIES).optional().catch(undefined),
  sort: z.enum(MOD_SORTS).optional().catch(undefined),
});

const CATEGORY_LABELS: Record<ModCategory, string> = {
  all: "All",
  rules: "Rules",
  training: "Training",
  replays: "Replays",
  hud: "On screen",
  modes: "Online modes",
};

const SORT_OPTIONS: readonly { value: ModSort; label: string }[] = [
  { value: "official", label: "Official first" },
  { value: "installs", label: "Most installed" },
];

export const Route = createFileRoute("/games/$slug/mods/")({
  validateSearch: (search: Record<string, unknown>) => ModsSearch.parse(search),
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
  head: ({ loaderData }) => {
    const name = loaderData?.game?.name ?? "Game";
    const description = `Browse and install ${name} mods and sets for tgg-melee on textures.gg.`;
    return {
      meta: [
        { title: `${name} mods - textures.gg` },
        { name: "description", content: description },
        { property: "og:title", content: `${name} mods - textures.gg` },
        { property: "og:description", content: description },
      ],
    };
  },
  component: Mods,
});

const WIDE = "@media (min-width: 1024px)";

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.xl },
  section: { display: "flex", flexDirection: "column", gap: space.md },
  sectionHead: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  heading: { margin: 0, fontSize: text.h3, fontWeight: 800 },
  count: { fontFamily: font.mono, fontSize: text.sm },
  showing: { fontFamily: font.mono, fontSize: text.sm, color: color.muted },
  search: { width: { default: "100%", [WIDE]: "520px" } },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  sort: { minWidth: "176px" },
});

type Mod = ReturnType<typeof Route.useLoaderData>["mods"][number];

/** Whether `mod` matches every word of `query`, in any field a player knows it by. */
function matchesQuery(mod: Mod, words: string[]): boolean {
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

/** Whether `mod` belongs to `category`, matching tgg-studio's filters. */
function matchesCategory(mod: Mod, category: ModCategory): boolean {
  const has = (tag: string) => mod.tags.includes(tag);
  switch (category) {
    case "all":
      return true;
    case "rules":
      return has("competitive");
    case "training":
      return has("training");
    case "replays":
      return has("replays");
    case "hud":
      return has("hud") || has("visual");
    case "modes":
      return has("mode");
  }
}

function Mods() {
  const { game, sets, mods } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const category: ModCategory = search.category ?? "all";
  const sort: ModSort = search.sort ?? "official";

  const [query, setQuery] = useState(search.q ?? "");
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => setQuery(search.q ?? ""), [search.q]);
  const updateSearch = (next: { q?: string; category?: ModCategory; sort?: ModSort }) =>
    void navigate({
      search: {
        q: next.q || undefined,
        category: next.category && next.category !== "all" ? next.category : undefined,
        sort: next.sort && next.sort !== "official" ? next.sort : undefined,
      },
      replace: true,
    });
  const onQueryChange = (value: string) => {
    setQuery(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(
      () => updateSearch({ q: value.trim() || undefined, category, sort }),
      300
    );
  };

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtering = words.length > 0 || category !== "all";

  const categoryOptions = useMemo((): ToggleOption<ModCategory>[] => {
    const options: ToggleOption<ModCategory>[] = [];
    for (const id of MOD_CATEGORIES) {
      const count =
        id === "all" ? mods.length : mods.filter((mod) => matchesCategory(mod, id)).length;
      if (id === "all" || count > 0 || id === category) {
        options.push({ value: id, label: CATEGORY_LABELS[id], meta: String(count) });
      }
    }
    return options;
  }, [mods, category]);

  const shown = useMemo(() => {
    const filtered = mods.filter(
      (mod) => matchesCategory(mod, category) && (words.length === 0 || matchesQuery(mod, words))
    );
    if (sort === "installs") {
      return [...filtered].sort((a, b) => b.installs - a.installs || a.name.localeCompare(b.name));
    }
    return filtered;
  }, [mods, category, words, sort]);

  const icons = useMemo(
    () => new Map(mods.flatMap((mod) => (mod.icon ? [[mod.id, mod.icon.url] as const] : []))),
    [mods]
  );
  const names = useMemo(() => new Map(mods.map((mod) => [mod.id, mod.name] as const)), [mods]);
  const count = `${mods.length} ${mods.length === 1 ? "mod" : "mods"}`;

  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader
        title="Mods"
        description={
          <>
            {game.name} · tgg-melee · <span {...stylex.props(styles.count)}>{count}</span>
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
      />

      {game.slug === PRIMARY_GAME_SLUG && !filtering && <FindMatch />}

      {sets.length > 0 && !filtering && (
        <section {...stylex.props(styles.section)}>
          <h2 {...stylex.props(styles.heading)}>Sets</h2>
          <SetGrid sets={sets} game={game.slug} icons={icons} names={names} />
        </section>
      )}

      {mods.length === 0 ? (
        <EmptyState title="No mods yet" />
      ) : (
        <section {...stylex.props(styles.section)}>
          <div {...stylex.props(styles.sectionHead)}>
            <h2 {...stylex.props(styles.heading)}>{filtering ? "Matching mods" : "All mods"}</h2>
            {filtering && (
              <span {...stylex.props(styles.showing)}>
                {shown.length} of {mods.length}
              </span>
            )}
          </div>
          <div {...stylex.props(styles.controls)}>
            {categoryOptions.length > 1 && (
              <ToggleGroup
                label="Category"
                value={category}
                options={categoryOptions}
                onValueChange={(next) =>
                  updateSearch({ q: query.trim() || undefined, category: next, sort })
                }
              />
            )}
            <div {...stylex.props(styles.sort)}>
              <Select
                label="Sort mods"
                value={sort}
                options={SORT_OPTIONS}
                onValueChange={(next) =>
                  updateSearch({ q: query.trim() || undefined, category, sort: next })
                }
              />
            </div>
          </div>
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
