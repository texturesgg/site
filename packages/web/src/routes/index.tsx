import * as stylex from "@stylexjs/stylex";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { parseResponse } from "hono/client";
import { useState } from "react";
import { api } from "@/lib/api";
import { layout } from "@/ui/patterns/layout";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { CreatorCard } from "@/ui/patterns/CreatorCard";
import { PackRail, Rail } from "@/ui/patterns/PackRail";
import { ButtonLink, SearchField } from "@/ui/primitives";
import { shared } from "@/ui/primitives/shared";
import { color, font, radius, space, text, tracking } from "@/ui/tokens.stylex";

const RAIL_SIZE = "8";

/** A request's value, or undefined (logged) when it fails. */
async function settled<T>(request: Promise<T>): Promise<T | undefined> {
  try {
    return await request;
  } catch (error: unknown) {
    console.warn("A home page section is unavailable", error);
    return undefined;
  }
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "textures.gg - SSBM Texture Mods, Custom Skins & HD Costumes" },
      {
        name: "description",
        content:
          "Browse thousands of Super Smash Bros. Melee texture mods, custom character skins, and stage retextures. Free downloads, community uploads. the modern home for SSBM textures.",
      },
    ],
  }),
  // The games are the page; the counts and rails are extras, so one that
  // fails is left out instead of taking the page down.
  loader: async () => {
    const [games, stats, trending, newest, favorites, creators] = await Promise.all([
      parseResponse(api.games.$get()),
      settled(parseResponse(api.stats.$get())),
      settled(parseResponse(api.packs.$get({ query: { pageSize: RAIL_SIZE, sortBy: "hot" } }))),
      settled(parseResponse(api.packs.$get({ query: { pageSize: RAIL_SIZE, sortBy: "newest" } }))),
      settled(parseResponse(api.packs.$get({ query: { pageSize: RAIL_SIZE, sortBy: "top" } }))),
      settled(parseResponse(api.users["top-creators"].$get({ query: {} }))),
    ]);
    return {
      stats,
      // Largest catalog first; it is the default destination for search and "See all".
      games: [...games].sort((a, b) => b.packCount - a.packCount),
      trending: trending?.items ?? [],
      newest: newest?.items ?? [],
      favorites: favorites?.items ?? [],
      creators: creators ?? [],
    };
  },
  pendingComponent: HomeSkeleton,
  component: HomePage,
});

// ─── Styles ─────────────────────────────────────────────────────

const WIDE = "@media (min-width: 768px)";

const styles = stylex.create({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: { default: space.xxl, [WIDE]: space.xxxl },
  },
  // Browsing rows sit closer together than page sections so they read as one group.
  rails: { display: "flex", flexDirection: "column", gap: space.xl },
  heroBody: { display: "flex", flexDirection: "column", gap: space.sm },
  search: { maxWidth: "640px" },
  stats: { margin: 0, fontSize: text.md, color: color.muted },
  statValue: { fontFamily: font.mono, color: color.text },
  section: { display: "flex", flexDirection: "column", gap: space.lg },
  gameMeta: { fontFamily: font.mono, fontSize: text.md, fontWeight: 400, color: color.muted },
  group: { display: "flex", flexDirection: "column", gap: space.sm },
  sectionTitle: {
    margin: 0,
    fontSize: { default: text.h3, [WIDE]: text.h2 },
    fontWeight: 800,
    letterSpacing: tracking.tight,
  },
  railHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  games: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
    gap: space.sm,
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  gameCard: {
    display: "flex",
    flexDirection: "column",
    gap: space.xxs,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: { default: color.surface, ":hover": color.raise },
    color: color.text,
    textDecoration: "none",
    fontSize: text.lg,
    fontWeight: 700,
  },
  newcomer: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    padding: { default: space.md, [WIDE]: space.lg },
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  newcomerText: { display: "flex", flexDirection: "column", gap: space.xxs },
  newcomerTitle: { margin: 0, fontSize: text.xl, fontWeight: 700 },
  newcomerBody: { margin: 0, fontSize: text.md, color: color.muted },
  newcomerActions: { display: "flex", flexWrap: "wrap", gap: space.xs },
  skeleton: { borderRadius: radius.lg, backgroundColor: color.surface },
  skeletonHero: { height: "280px" },
  skeletonRails: { height: "360px" },
});

// ─── Page ───────────────────────────────────────────────────────

function HomePage() {
  const { stats, games, trending, newest, favorites, creators } = Route.useLoaderData();
  const primary = games[0];
  const gameNames = games.map((game) => game.name);

  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader
        title="Texture mods and custom skins"
        description={`A community archive for ${listNames(gameNames)}.`}
      >
        <div {...stylex.props(styles.heroBody)}>
          {primary && <HomeSearch gameSlug={primary.slug} gameName={primary.name} />}
          {stats && (
            <p {...stylex.props(styles.stats)}>
              <span {...stylex.props(styles.statValue)}>
                {stats.packCount.toLocaleString("en-US")}
              </span>{" "}
              packs ·{" "}
              <span {...stylex.props(styles.statValue)}>
                {stats.creatorCount.toLocaleString("en-US")}
              </span>{" "}
              creators
            </p>
          )}
        </div>
      </PageHeader>

      {/* A game picker only earns its space once there is more than one game. */}
      {games.length > 1 && (
        <section aria-labelledby="games-heading" {...stylex.props(styles.section)}>
          <h2 id="games-heading" {...stylex.props(styles.sectionTitle)}>
            Games
          </h2>
          <ul {...stylex.props(styles.games)}>
            {games.map((game) => (
              <li key={game.id}>
                <Link
                  to="/games/$slug"
                  params={{ slug: game.slug }}
                  {...stylex.props(styles.gameCard, shared.focusRing)}
                >
                  {game.name}
                  <span {...stylex.props(styles.gameMeta)}>
                    {game.packCount.toLocaleString("en-US")} packs
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {primary && (
        <div {...stylex.props(styles.rails)}>
          {trending.length > 0 && (
            <section aria-labelledby="trending-heading" {...stylex.props(styles.group)}>
              <RailHead
                id="trending-heading"
                title="Trending"
                link={{ slug: primary.slug, sort: undefined }}
                label="See all trending packs"
              />
              <PackRail packs={trending} label="Trending" />
            </section>
          )}
          {newest.length > 0 && (
            <section aria-labelledby="new-heading" {...stylex.props(styles.group)}>
              <RailHead
                id="new-heading"
                title="New uploads"
                link={{ slug: primary.slug, sort: "new" }}
                label="See all new uploads"
              />
              <PackRail packs={newest} label="New uploads" />
            </section>
          )}
          {favorites.length > 0 && (
            <section aria-labelledby="favorites-heading" {...stylex.props(styles.group)}>
              <RailHead
                id="favorites-heading"
                title="All-time favorites"
                link={{ slug: primary.slug, sort: "top" }}
                label="See the most liked packs"
              />
              <PackRail packs={favorites} label="All-time favorites" />
            </section>
          )}
          {creators.length > 0 && (
            <section aria-labelledby="creators-heading" {...stylex.props(styles.group)}>
              <h2 id="creators-heading" {...stylex.props(styles.sectionTitle)}>
                Creators
              </h2>
              <Rail items={creators} label="Creators" itemKey={(creator) => creator.id}>
                {(creator) => <CreatorCard creator={creator} />}
              </Rail>
            </section>
          )}
        </div>
      )}

      <aside aria-labelledby="newcomer-heading" {...stylex.props(styles.newcomer)}>
        <div {...stylex.props(styles.newcomerText)}>
          <h2 id="newcomer-heading" {...stylex.props(styles.newcomerTitle)}>
            New to texture mods?
          </h2>
          <p {...stylex.props(styles.newcomerBody)}>
            Learn how to install a skin, or let the desktop app do it for you.
          </p>
        </div>
        <div {...stylex.props(styles.newcomerActions)}>
          <ButtonLink to="/guides" variant="secondary">
            Install guide
          </ButtonLink>
          <ButtonLink to="/download" variant="primary">
            Get the app
          </ButtonLink>
        </div>
      </aside>
    </div>
  );
}

function RailHead({
  id,
  title,
  link,
  label,
}: {
  id: string;
  title: string;
  link: { slug: string; sort: "new" | "top" | undefined };
  label: string;
}) {
  return (
    <div {...stylex.props(styles.railHead)}>
      <h2 id={id} {...stylex.props(styles.sectionTitle)}>
        {title}
      </h2>
      <ButtonLink
        to="/games/$slug"
        params={{ slug: link.slug }}
        search={{ sort: link.sort }}
        variant="text"
        aria-label={label}
      >
        See all
      </ButtonLink>
    </div>
  );
}

/** Search starts in the main game's Explore; cross-game search comes with a second game. */
function HomeSearch({ gameSlug, gameName }: { gameSlug: string; gameName: string }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  return (
    <search {...stylex.props(styles.search)}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          navigate({
            to: "/games/$slug",
            params: { slug: gameSlug },
            search: { q: query.trim() || undefined },
          });
        }}
      >
        <SearchField
          label={`Search ${gameName} packs`}
          placeholder="Search by pack name or description"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </form>
    </search>
  );
}

function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "your favorite games";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function HomeSkeleton() {
  return (
    <div aria-hidden="true" {...stylex.props(layout.container, layout.page, styles.page)}>
      <div {...stylex.props(styles.skeleton, styles.skeletonHero)} />
      <div {...stylex.props(styles.skeleton, styles.skeletonRails)} />
    </div>
  );
}
