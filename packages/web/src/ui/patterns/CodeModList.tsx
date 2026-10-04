import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/ui/primitives";
import { color, font, radius, space, text } from "@/ui/tokens.stylex";

export type CodeModListItem = {
  slug: string;
  game: string;
  name: string;
  owner: string;
  latest: { version: string; status: string; netplay: string } | null;
};

const styles = stylex.create({
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

/** Code mods as rows: name, id and creator, and the latest release. */
export function CodeModList({ mods, label }: { mods: CodeModListItem[]; label: string }) {
  return (
    <ul aria-label={label} {...stylex.props(styles.list)}>
      {mods.map((mod) => (
        <li key={mod.slug} {...stylex.props(styles.row)}>
          <span {...stylex.props(styles.text)}>
            <Link
              to="/games/$slug/code-mods/$modSlug"
              params={{ slug: mod.game, modSlug: mod.slug }}
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
              {mod.latest.status !== "approved" && <Badge tone="accent">{mod.latest.status}</Badge>}
              {mod.latest.netplay === "gameplay" && <Badge>Gameplay</Badge>}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
