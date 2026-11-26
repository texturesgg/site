import * as stylex from "@stylexjs/stylex";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { PRIMARY_GAME_SLUG } from "@vgskins/shared";
import { parseResponse } from "hono/client";
import { api } from "@/lib/api";
import { appLinks } from "@/lib/app-links";
import { requireFeatureFlag } from "@/lib/feature-flags";
import { InstallActions } from "@/ui/patterns/InstallActions";
import { layout } from "@/ui/patterns/layout";
import { ModEyebrow } from "@/ui/patterns/ModHeader";
import { ModGrid } from "@/ui/patterns/ModTile";
import { Badge } from "@/ui/primitives";
import { color, font, radius, space, text, tracking } from "@/ui/tokens.stylex";

export const Route = createFileRoute("/games/$slug/sets/$setName")({
  loader: async ({ context, params }) => {
    await requireFeatureFlag(context.queryClient, "codeMods");
    if (params.slug !== PRIMARY_GAME_SLUG) throw notFound();
    const [game, sets, mods] = await Promise.all([
      parseResponse(api.games[":slug"].$get({ param: { slug: params.slug } })),
      parseResponse(api.registry.sets.$get()),
      parseResponse(api.registry.mods.$get({ query: { pageSize: "100" } })),
    ]);
    const set = sets.find((candidate) => candidate.name === params.setName);
    if (!set) throw notFound();
    // The set's mods in its order; one the registry no longer lists, or one
    // left out of a set it builds on, drops out.
    const listed = set.mods.flatMap((entry) => {
      if (entry.left_out) return [];
      const mod = mods.items.find((candidate) => candidate.id === entry.id);
      return mod ? [mod] : [];
    });
    return { game, set, mods: listed };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.set.title ?? "Set"} - textures.gg` },
      ...(loaderData?.set.description
        ? [{ name: "description", content: loaderData.set.description }]
        : []),
    ],
  }),
  component: SetPage,
});

const WIDE = "@media (min-width: 1024px)";
const MEDIUM = "@media (min-width: 768px)";

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.xl },
  hero: {
    display: "grid",
    gridTemplateColumns: { default: "minmax(0, 1fr)", [WIDE]: "minmax(0, 1fr) 340px" },
    gap: { default: space.lg, [WIDE]: space.xl },
    alignItems: "start",
    paddingBottom: space.xl,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: color.line,
  },
  heroLead: { display: "flex", flexDirection: "column", gap: space.md, minWidth: 0 },
  titleBlock: { display: "flex", flexDirection: "column", gap: space.xs, minWidth: 0 },
  titleRow: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: space.sm },
  title: {
    margin: 0,
    fontSize: { default: text.h2, [MEDIUM]: text.h1 },
    fontWeight: 800,
    letterSpacing: tracking.tight,
    lineHeight: 1.08,
    overflowWrap: "anywhere",
  },
  version: { fontFamily: font.mono, fontSize: text.sm, color: color.muted },
  byline: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.sm,
    margin: 0,
    fontSize: text.md,
    color: color.muted,
  },
  description: {
    margin: 0,
    maxWidth: "64ch",
    fontSize: text.lg,
    lineHeight: 1.5,
    color: color.muted,
  },
  installBox: {
    display: "flex",
    flexDirection: "column",
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: color.line,
  },
  installMeta: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    fontSize: text.xs,
    color: color.muted,
  },
  mono: { fontFamily: font.mono },
  section: { display: "flex", flexDirection: "column", gap: space.md },
  heading: {
    margin: 0,
    fontSize: text.h3,
    fontWeight: 800,
    letterSpacing: tracking.tight,
  },
});

function SetPage() {
  const { game, set, mods } = Route.useLoaderData();
  const countLabel = `${mods.length} ${mods.length === 1 ? "mod" : "mods"}`;

  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <header {...stylex.props(styles.hero)}>
        <div {...stylex.props(styles.heroLead)}>
          <ModEyebrow to="/games/$slug/mods" params={{ slug: game.slug }}>
            Set · {game.name}
          </ModEyebrow>
          <div {...stylex.props(styles.titleBlock)}>
            <div {...stylex.props(styles.titleRow)}>
              <h1 {...stylex.props(styles.title)}>{set.title}</h1>
              <span {...stylex.props(styles.version)}>v{set.version}</span>
            </div>
            <p {...stylex.props(styles.byline)}>
              <span>
                by {set.owner.name} · {countLabel}
              </span>
              {set.queue && <Badge tone="neutral">Matchmaking</Badge>}
            </p>
          </div>
          {set.description && <p {...stylex.props(styles.description)}>{set.description}</p>}
        </div>

        <aside aria-label="Install" {...stylex.props(styles.installBox)}>
          <InstallActions
            href={appLinks.set(set.name)}
            label={`Install ${set.title}`}
            command={`tgg mod install --set ${set.name}`}
            fullWidth
          />
          <div {...stylex.props(styles.installMeta)}>
            <span>Installs {countLabel}</span>
            <span {...stylex.props(styles.mono)}>{set.name}</span>
          </div>
        </aside>
      </header>

      <section aria-labelledby="in-this-set-heading" {...stylex.props(styles.section)}>
        <h2 id="in-this-set-heading" {...stylex.props(styles.heading)}>
          In this set
        </h2>
        <ModGrid mods={mods} game={game.slug} label={`Mods in ${set.title}`} />
      </section>
    </div>
  );
}
