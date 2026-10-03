import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { displayName } from "@vgskins/shared";
import { getThumbnailUrl } from "@/lib/api";
import { shared } from "../primitives/shared";
import { color, font, radius, space, text } from "../tokens.stylex";

const COVERS = 3;

const styles = stylex.create({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.lg,
    backgroundColor: { default: color.surface, ":hover": color.raise },
    color: color.text,
    textDecoration: "none",
  },
  covers: {
    display: "grid",
    gridTemplateColumns: `repeat(${COVERS}, minmax(0, 1fr))`,
    gap: space.xxs,
  },
  cover: {
    display: "block",
    width: "100%",
    aspectRatio: "1 / 1",
    objectFit: "cover",
    borderRadius: radius.sm,
    backgroundColor: color.raise,
  },
  who: { display: "flex", alignItems: "center", gap: space.sm, minWidth: 0 },
  avatar: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "36px",
    height: "36px",
    borderRadius: radius.pill,
    objectFit: "cover",
    backgroundColor: color.raise,
    fontSize: text.md,
    fontWeight: 700,
    color: color.muted,
  },
  text: { display: "flex", flexDirection: "column", minWidth: 0 },
  name: {
    fontSize: text.md,
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  meta: { fontSize: text.sm, color: color.muted },
  number: { fontFamily: font.mono },
});

export type CreatorCardData = {
  id: string;
  name: string;
  image: string | null;
  packCount: number;
  downloadCount: number;
  coverThumbnailKeys: readonly string[];
};

/** A creator with their most-downloaded work, linking to their profile. */
export function CreatorCard({ creator }: { creator: CreatorCardData }) {
  const name = displayName(creator.name);
  const covers = creator.coverThumbnailKeys.slice(0, COVERS);
  return (
    <Link
      to="/users/$username"
      params={{ username: creator.name }}
      {...stylex.props(styles.card, shared.focusRing)}
    >
      <span {...stylex.props(styles.covers)} aria-hidden="true">
        {Array.from({ length: COVERS }, (_, index) => {
          const url = getThumbnailUrl(covers[index] ?? null);
          return url ? (
            <img key={index} src={url} alt="" loading="lazy" {...stylex.props(styles.cover)} />
          ) : (
            <span key={index} {...stylex.props(styles.cover)} />
          );
        })}
      </span>
      <span {...stylex.props(styles.who)}>
        {creator.image ? (
          <img src={creator.image} alt="" {...stylex.props(styles.avatar)} />
        ) : (
          <span aria-hidden="true" {...stylex.props(styles.avatar)}>
            {name[0]?.toUpperCase()}
          </span>
        )}
        <span {...stylex.props(styles.text)}>
          <span {...stylex.props(styles.name)}>{name}</span>
          <span {...stylex.props(styles.meta)}>
            <span {...stylex.props(styles.number)}>
              {creator.packCount.toLocaleString("en-US")}
            </span>{" "}
            {creator.packCount === 1 ? "pack" : "packs"} ·{" "}
            <span {...stylex.props(styles.number)}>
              {creator.downloadCount.toLocaleString("en-US")}
            </span>{" "}
            downloads
          </span>
        </span>
      </span>
    </Link>
  );
}
