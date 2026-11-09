import * as stylex from "@stylexjs/stylex";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { PRIMARY_GAME_SLUG } from "@vgskins/shared";
import { parseResponse } from "hono/client";
import { appLinks } from "@/lib/app-links";
import { api } from "@/lib/api";
import { requireFeatureFlag } from "@/lib/feature-flags";
import { InstallActions } from "@/ui/patterns/InstallActions";
import { layout } from "@/ui/patterns/layout";
import { ModEyebrow, ModHeader } from "@/ui/patterns/ModHeader";
import { ModGrid } from "@/ui/patterns/ModTile";
import { color, space, text } from "@/ui/tokens.stylex";

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
    // The set's mods in its order; one the registry no longer lists drops out.
    const listed = set.mods.flatMap((entry) => {
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

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.xl },
  head: { display: "flex", flexDirection: "column", gap: space.md, maxWidth: "760px" },
  description: { margin: 0, fontSize: text.lg, lineHeight: 1.5, color: color.muted },
  section: { display: "flex", flexDirection: "column", gap: space.md },
  heading: { margin: 0, fontSize: text.h3, fontWeight: 800 },
});

function SetPage() {
  const { game, set, mods } = Route.useLoaderData();
  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <div {...stylex.props(styles.head)}>
        <ModHeader
          eyebrow={
            <ModEyebrow to="/games/$slug/mods" params={{ slug: game.slug }}>
              Set · {game.name}
            </ModEyebrow>
          }
          title={set.title}
          byline={`${set.mods.length} ${set.mods.length === 1 ? "mod" : "mods"} · version ${set.version}`}
        >
          {set.description && <p {...stylex.props(styles.description)}>{set.description}</p>}
          <InstallActions href={appLinks.set(set.name)} label={`Install ${set.title}`} />
        </ModHeader>
      </div>
      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.heading)}>In this set</h2>
        <ModGrid mods={mods} game={game.slug} label={`Mods in ${set.title}`} />
      </section>
    </div>
  );
}
