import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { CheckIcon } from "../icons";
import { shared } from "../primitives/shared";
import { color, font, radius, space, text } from "../tokens.stylex";

const PHONE = "@media (max-width: 640px)";
const TABLET = "@media (max-width: 1024px)";

const styles = stylex.create({
  grid: {
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(3, minmax(0, 1fr))",
      [TABLET]: "repeat(2, minmax(0, 1fr))",
      [PHONE]: "minmax(0, 1fr)",
    },
    gap: space.sm,
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  tile: {
    display: "flex",
    gap: space.md,
    height: "100%",
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: { default: color.surface, ":hover": color.raise },
    color: color.text,
    textDecoration: "none",
  },
  icon: {
    flexShrink: 0,
    width: "56px",
    height: "56px",
    borderRadius: radius.md,
    objectFit: "cover",
    backgroundColor: color.raise,
  },
  text: { display: "flex", flexDirection: "column", gap: space.xxs, minWidth: 0 },
  name: {
    fontSize: text.lg,
    fontWeight: 700,
    lineHeight: 1.25,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  publisher: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xxs,
    fontSize: text.sm,
    color: color.muted,
  },
  // In a sentence, such as a mod page's byline, it reads as part of it.
  inline: { fontSize: "inherit", color: "inherit" },
  official: { display: "inline-flex", color: color.accentText },
  description: {
    margin: 0,
    fontSize: text.sm,
    lineHeight: 1.45,
    color: color.muted,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  installs: { fontFamily: font.mono, fontSize: text.xs, color: color.muted },
});

export type ModTileData = {
  id: string;
  name: string;
  description: string | null;
  publisher: { name: string; official: boolean };
  icon: { url: string } | null;
  installs: number;
};

/** Who publishes a mod, with a check when textures.gg vouches for them. */
export function Publisher({
  publisher,
  inline = false,
}: {
  publisher: ModTileData["publisher"];
  inline?: boolean;
}) {
  return (
    <span {...stylex.props(styles.publisher, inline && styles.inline)}>
      {publisher.name}
      {publisher.official && (
        <span {...stylex.props(styles.official)} title="Official">
          <CheckIcon size={14} />
          <span {...stylex.props(shared.visuallyHidden)}> (official)</span>
        </span>
      )}
    </span>
  );
}

export function ModTile({ mod, game }: { mod: ModTileData; game: string }) {
  return (
    <Link
      to="/games/$slug/mods/$modId"
      params={{ slug: game, modId: mod.id }}
      {...stylex.props(styles.tile, shared.focusRing)}
    >
      {mod.icon ? (
        <img src={mod.icon.url} alt="" loading="lazy" {...stylex.props(styles.icon)} />
      ) : (
        <span aria-hidden="true" {...stylex.props(styles.icon)} />
      )}
      <span {...stylex.props(styles.text)}>
        <span {...stylex.props(styles.name)}>{mod.name}</span>
        <Publisher publisher={mod.publisher} />
        {mod.description && <p {...stylex.props(styles.description)}>{mod.description}</p>}
        <span {...stylex.props(styles.installs)}>
          {mod.installs.toLocaleString("en-US")} {mod.installs === 1 ? "install" : "installs"}
        </span>
      </span>
    </Link>
  );
}

export function ModGrid({
  mods,
  game,
  label,
}: {
  mods: readonly ModTileData[];
  game: string;
  label: string;
}) {
  return (
    <ul aria-label={label} {...stylex.props(styles.grid)}>
      {mods.map((mod) => (
        <li key={mod.id}>
          <ModTile mod={mod} game={game} />
        </li>
      ))}
    </ul>
  );
}
