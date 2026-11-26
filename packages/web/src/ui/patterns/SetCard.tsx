import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { Badge } from "../primitives";
import { shared } from "../primitives/shared";
import { color, font, radius, space, text, tracking } from "../tokens.stylex";

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
  head: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  title: { fontSize: text.h3, fontWeight: 800, letterSpacing: tracking.tight },
  description: { margin: 0, fontSize: text.md, lineHeight: 1.5, color: color.muted },
  footer: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    marginTop: "auto",
  },
  icons: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.xs, minWidth: 0 },
  icon: {
    width: "32px",
    height: "32px",
    borderRadius: radius.sm,
    objectFit: "cover",
    backgroundColor: color.raise,
  },
  letter: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: text.sm,
    fontWeight: 800,
    color: color.accentText,
  },
  count: { fontFamily: font.mono, fontSize: text.xs, color: color.muted, whiteSpace: "nowrap" },
});

export type SetCardData = {
  name: string;
  title: string;
  description: string | null;
  queue?: boolean;
  mods: readonly { id: string }[];
};

function initialFor(id: string, names?: ReadonlyMap<string, string>): string {
  const label = names?.get(id) ?? id.replace(/^tgg\./, "");
  return label.slice(0, 1).toUpperCase();
}

/** A set: its name, what it's for, and a peek at what's in it. */
export function SetCard({
  set,
  game,
  icons,
  names,
}: {
  set: SetCardData;
  game: string;
  /** Icon URLs of the set's mods, by mod id. */
  icons: ReadonlyMap<string, string>;
  /** Display names of the set's mods, by mod id. */
  names?: ReadonlyMap<string, string>;
}) {
  const shown = set.mods.slice(0, ICONS);
  const more = set.mods.length - shown.length;
  return (
    <Link
      to="/games/$slug/sets/$setName"
      params={{ slug: game, setName: set.name }}
      {...stylex.props(styles.card, shared.focusRing)}
    >
      <span {...stylex.props(styles.head)}>
        <span {...stylex.props(styles.title)}>{set.title}</span>
        {set.queue && <Badge tone="neutral">Matchmaking</Badge>}
      </span>
      {set.description && <p {...stylex.props(styles.description)}>{set.description}</p>}
      <span {...stylex.props(styles.footer)}>
        <span {...stylex.props(styles.icons)} aria-hidden="true">
          {shown.map((mod) => {
            const url = icons.get(mod.id);
            return url ? (
              <img key={mod.id} src={url} alt="" loading="lazy" {...stylex.props(styles.icon)} />
            ) : (
              <span key={mod.id} {...stylex.props(styles.icon, styles.letter)}>
                {initialFor(mod.id, names)}
              </span>
            );
          })}
          {more > 0 && <span {...stylex.props(styles.count)}>+{more}</span>}
        </span>
        <span {...stylex.props(styles.count)}>
          {set.mods.length} {set.mods.length === 1 ? "mod" : "mods"}
        </span>
      </span>
    </Link>
  );
}

export function SetGrid({
  sets,
  game,
  icons,
  names,
}: {
  sets: readonly SetCardData[];
  game: string;
  icons: ReadonlyMap<string, string>;
  names?: ReadonlyMap<string, string>;
}) {
  return (
    <ul aria-label="Sets" {...stylex.props(styles.grid)}>
      {sets.map((set) => (
        <li key={set.name}>
          <SetCard set={set} game={game} icons={icons} names={names} />
        </li>
      ))}
    </ul>
  );
}
