import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { shared } from "../primitives/shared";
import { color, radius, space, text, tracking } from "../tokens.stylex";

const PHONE = "@media (max-width: 640px)";
const ICONS = 6;

const styles = stylex.create({
  grid: {
    display: "grid",
    gridTemplateColumns: { default: "repeat(2, minmax(0, 1fr))", [PHONE]: "minmax(0, 1fr)" },
    gap: space.sm,
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: space.sm,
    height: "100%",
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: { default: color.surface, ":hover": color.raise },
    color: color.text,
    textDecoration: "none",
  },
  title: { fontSize: text.h3, fontWeight: 800, letterSpacing: tracking.tight },
  description: { margin: 0, fontSize: text.md, lineHeight: 1.5, color: color.muted },
  icons: { display: "flex", alignItems: "center", gap: space.xs, marginTop: "auto" },
  icon: {
    width: "32px",
    height: "32px",
    borderRadius: radius.sm,
    objectFit: "cover",
    backgroundColor: color.raise,
  },
  count: { fontSize: text.sm, color: color.muted },
});

export type SetCardData = {
  name: string;
  title: string;
  description: string | null;
  mods: readonly { id: string }[];
};

/** A set: its name, what it's for, and a peek at what's in it. */
export function SetCard({
  set,
  game,
  icons,
}: {
  set: SetCardData;
  game: string;
  /** Icon URLs of the set's mods, by mod id. */
  icons: ReadonlyMap<string, string>;
}) {
  const shown = set.mods.slice(0, ICONS);
  const more = set.mods.length - shown.length;
  return (
    <Link
      to="/games/$slug/sets/$setName"
      params={{ slug: game, setName: set.name }}
      {...stylex.props(styles.card, shared.focusRing)}
    >
      <span {...stylex.props(styles.title)}>{set.title}</span>
      {set.description && <p {...stylex.props(styles.description)}>{set.description}</p>}
      <span {...stylex.props(styles.icons)} aria-hidden="true">
        {shown.map((mod) => {
          const url = icons.get(mod.id);
          return url ? (
            <img key={mod.id} src={url} alt="" loading="lazy" {...stylex.props(styles.icon)} />
          ) : (
            <span key={mod.id} {...stylex.props(styles.icon)} />
          );
        })}
        {more > 0 && <span {...stylex.props(styles.count)}>+{more}</span>}
      </span>
      <span {...stylex.props(shared.visuallyHidden)}>
        {set.mods.length} {set.mods.length === 1 ? "mod" : "mods"}
      </span>
    </Link>
  );
}

export function SetGrid({
  sets,
  game,
  icons,
}: {
  sets: readonly SetCardData[];
  game: string;
  icons: ReadonlyMap<string, string>;
}) {
  return (
    <ul aria-label="Sets" {...stylex.props(styles.grid)}>
      {sets.map((set) => (
        <li key={set.name}>
          <SetCard set={set} game={game} icons={icons} />
        </li>
      ))}
    </ul>
  );
}
