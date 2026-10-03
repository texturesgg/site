import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { displayName, PRIMARY_GAME_SLUG } from "@vgskins/shared";
import { getThumbnailUrl } from "@/lib/api";
import { HeartIcon } from "../icons";
import { Badge } from "../primitives";
import { shared } from "../primitives/shared";
import { color, font, motion, radius, space, text, tracking } from "../tokens.stylex";

const PHONE = "@media (max-width: 640px)";
const TABLET = "@media (max-width: 1024px)";

const styles = stylex.create({
  grid: {
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(3, minmax(0, 1fr))",
      [TABLET]: "repeat(2, minmax(0, 1fr))",
    },
    columnGap: { default: space.lg, [PHONE]: space.sm },
    rowGap: { default: space.xl, [PHONE]: space.lg },
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  tile: { display: "flex", flexDirection: "column", gap: space.sm, minWidth: 0 },
  frame: {
    position: "relative",
    display: "block",
    overflow: "hidden",
    aspectRatio: "16 / 10",
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  image: {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transform: { default: "scale(1)", [stylex.when.ancestor(":hover")]: "scale(1.03)" },
    transitionProperty: "transform",
    transitionDuration: motion.normal,
    transitionTimingFunction: motion.easing,
    "@media (prefers-reduced-motion: reduce)": { transitionDuration: "0s" },
  },
  placeholder: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
    color: color.muted,
    fontSize: text.sm,
  },
  meta: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: space.sm,
  },
  text: { display: "flex", flexDirection: "column", gap: space.xxs, minWidth: 0 },
  title: {
    margin: 0,
    fontSize: { default: text.xl, [PHONE]: text.md },
    fontWeight: 700,
    letterSpacing: tracking.tight,
    lineHeight: 1.25,
    overflowWrap: "anywhere",
    // Two lines at most, so a long title never pushes its row out of step.
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  titleLink: {
    color: color.text,
    textDecoration: { default: "none", ":hover": "underline" },
    borderRadius: radius.sm,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accentText}` },
    outlineOffset: "2px",
  },
  byline: {
    margin: 0,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    fontSize: { default: text.md, [PHONE]: text.xs },
    color: color.muted,
  },
  likes: {
    display: { default: "flex", [PHONE]: "none" },
    alignItems: "center",
    gap: space.xxs,
    flexShrink: 0,
    fontFamily: font.mono,
    fontSize: text.sm,
    color: color.muted,
  },
  status: { position: "absolute", top: space.xs, left: space.xs },
  skeletonFrame: {
    aspectRatio: "16 / 10",
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  skeletonLine: {
    height: "14px",
    width: "70%",
    borderRadius: radius.sm,
    backgroundColor: color.surface,
  },
  skeletonShort: { width: "40%" },
});

export type PackTileData = {
  title: string;
  slug: string;
  gameSlug: string | null;
  thumbnailKey: string | null;
  targetName: string | null;
  creatorName: string | null;
  voteCount: number;
  /** Shown as a badge when not public yet; only owners and moderators receive such packs. */
  status?: string;
};

const STATUS_LABELS: Record<string, string> = {
  processing: "Processing",
  pending: "In review",
  rejected: "Rejected",
  corrupted: "Needs attention",
};

export function PackTile({ pack }: { pack: PackTileData }) {
  const thumbnail = getThumbnailUrl(pack.thumbnailKey);
  const linkProps = {
    to: "/games/$slug/packs/$packSlug",
    params: { slug: pack.gameSlug ?? PRIMARY_GAME_SLUG, packSlug: pack.slug },
  } as const;

  return (
    <article {...stylex.props(styles.tile, stylex.defaultMarker())}>
      {/* The title is the accessible link and carries the status; the image and
          its badge repeat them for pointer users. */}
      <Link {...linkProps} tabIndex={-1} aria-hidden="true" {...stylex.props(styles.frame)}>
        {thumbnail ? (
          <img src={thumbnail} alt="" loading="lazy" {...stylex.props(styles.image)} />
        ) : (
          <span {...stylex.props(styles.placeholder)}>No preview</span>
        )}
        {pack.status && pack.status !== "approved" && (
          <span {...stylex.props(styles.status)}>
            <Badge tone="accent">{STATUS_LABELS[pack.status] ?? pack.status}</Badge>
          </span>
        )}
      </Link>
      <div {...stylex.props(styles.meta)}>
        <div {...stylex.props(styles.text)}>
          <h3 {...stylex.props(styles.title)}>
            <Link {...linkProps} {...stylex.props(styles.titleLink)}>
              {pack.title}
              {pack.status && pack.status !== "approved" && (
                <span {...stylex.props(shared.visuallyHidden)}>
                  {` (${STATUS_LABELS[pack.status] ?? pack.status})`}
                </span>
              )}
            </Link>
          </h3>
          <p {...stylex.props(styles.byline)}>
            {[pack.targetName, pack.creatorName && displayName(pack.creatorName)]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span {...stylex.props(styles.likes)}>
          <HeartIcon size={16} />
          {pack.voteCount}
          <span {...stylex.props(shared.visuallyHidden)}> likes</span>
        </span>
      </div>
    </article>
  );
}

export function PackGrid({ packs, label }: { packs: readonly PackTileData[]; label: string }) {
  return (
    <ul aria-label={label} {...stylex.props(styles.grid)}>
      {packs.map((pack) => (
        <li key={pack.slug}>
          <PackTile pack={pack} />
        </li>
      ))}
    </ul>
  );
}

export function PackGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div aria-hidden="true" {...stylex.props(styles.grid)}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} {...stylex.props(styles.tile)}>
          <div {...stylex.props(styles.skeletonFrame)} />
          <div {...stylex.props(styles.skeletonLine)} />
          <div {...stylex.props(styles.skeletonLine, styles.skeletonShort)} />
        </div>
      ))}
    </div>
  );
}
