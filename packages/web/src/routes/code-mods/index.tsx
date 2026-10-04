import * as stylex from "@stylexjs/stylex";
import { createFileRoute, Link } from "@tanstack/react-router";
import { parseResponse } from "hono/client";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { requireFeatureFlag } from "@/lib/feature-flags";
import { EmptyState } from "@/ui/patterns/EmptyState";
import { layout } from "@/ui/patterns/layout";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { Badge, ButtonLink } from "@/ui/primitives";
import { color, font, radius, space, text } from "@/ui/tokens.stylex";

export const Route = createFileRoute("/code-mods/")({
  loader: async ({ context }) => {
    await requireFeatureFlag(context.queryClient, "codeMods");
    return parseResponse(api["code-mods"].$get({ query: {} }));
  },
  head: () => ({ meta: [{ title: "Code mods - textures.gg" }] }),
  component: CodeMods,
});

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.xl },
  list: { display: "flex", flexDirection: "column", gap: space.xs, margin: 0, padding: 0 },
  row: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    listStyle: "none",
  },
  text: { display: "flex", flexDirection: "column", gap: space.xxs, minWidth: 0 },
  name: { fontSize: text.lg, fontWeight: 700, color: color.text, textDecoration: "none" },
  meta: { fontSize: text.sm, color: color.muted },
  id: { fontFamily: font.mono },
  badges: { display: "flex", gap: space.xs },
});

function CodeMods() {
  const { items: mods } = Route.useLoaderData();
  const { user } = useAuth();

  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader
        title="Code mods"
        description="Mods that change the game itself, built from their source."
        actions={
          user && (
            <ButtonLink to="/code-mods/new" variant="primary">
              New mod
            </ButtonLink>
          )
        }
      />
      {mods.length === 0 ? (
        <EmptyState title="No code mods yet" />
      ) : (
        <ul aria-label="Code mods" {...stylex.props(styles.list)}>
          {mods.map((mod) => (
            <li key={mod.slug} {...stylex.props(styles.row)}>
              <span {...stylex.props(styles.text)}>
                <Link
                  to="/code-mods/$slug"
                  params={{ slug: mod.slug }}
                  {...stylex.props(styles.name)}
                >
                  {mod.name}
                </Link>
                <span {...stylex.props(styles.meta)}>
                  <span {...stylex.props(styles.id)}>{mod.slug}</span> by {mod.owner}
                </span>
              </span>
              {mod.latest && (
                <span {...stylex.props(styles.badges)}>
                  <Badge>{mod.latest.version}</Badge>
                  {mod.latest.status !== "approved" && (
                    <Badge tone="accent">{mod.latest.status}</Badge>
                  )}
                  {mod.latest.netplay === "gameplay" && <Badge>Gameplay</Badge>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
