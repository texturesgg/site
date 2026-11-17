// The share card a mod or set link shows when it's posted (Open Graph and
// Twitter): 1200x630, drawn by satori from flexbox markup. Colors are the
// Gallery palette's (src/ui/tokens.stylex.ts), which satori can't read.

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

const C = {
  bg: "#111110",
  raise: "#262522",
  text: "#F2EFE8",
  muted: "#A8A39A",
  accent: "#F5C84B",
  onAccent: "#111110",
};

/** What a card says, worked out from a mod or set (see view.ts). */
export type CardInput = {
  /** Above the title: "Melee mod", "Melee set". */
  eyebrow: string;
  title: string;
  /** "by textures.gg", "6 mods". */
  byline: string;
  /** A check after the byline, as the site marks official publishers. */
  official: boolean;
  /** One line under the byline, cut with an ellipsis. */
  description: string | null;
  /** The first is drawn filled. */
  chips: string[];
  /** The icon as a data: URL, or null for a lettered tile. */
  iconData: string | null;
};

function Mark({ size }: { size: number }) {
  // The favicon's "t." mark.
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill={C.accent} />
      <path d="M22 11h10v10h11v9H32v9q0 5 5 5h6v9h-8q-13 0-13-14z" fill={C.onAccent} />
      <circle cx="50" cy="48" r="5.5" fill={C.onAccent} />
    </svg>
  );
}

function Check({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        fill="none"
        stroke={C.accent}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Icon({ card }: { card: CardInput }) {
  const size = 280;
  if (card.iconData) {
    return (
      <img
        src={card.iconData}
        alt=""
        width={size}
        height={size}
        style={{ borderRadius: 48, objectFit: "cover" }}
      />
    );
  }
  // No icon: the first letter on a raised tile, like the site's lettered tiles.
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: 48,
        backgroundColor: C.raise,
        color: C.accent,
        fontSize: 140,
        fontWeight: 800,
      }}
    >
      {card.title.slice(0, 1).toUpperCase()}
    </div>
  );
}

/** A name sized down as it gets longer, so most fit on two lines. */
function titleSize(title: string): number {
  if (title.length <= 14) return 84;
  if (title.length <= 24) return 68;
  return 54;
}

export function Card({ card }: { card: CardInput }) {
  // Satori sizes boxes content-box, so the frame is fixed and the content
  // grows to fill it rather than taking 100% plus its padding.
  return (
    <div style={{ display: "flex", width: CARD_WIDTH, height: CARD_HEIGHT, backgroundColor: C.bg }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          flexGrow: 1,
          padding: 72,
          color: C.text,
        }}
      >
        <div style={{ display: "flex", gap: 56, alignItems: "center" }}>
          <Icon card={card} />
          <div style={{ display: "flex", flexDirection: "column", gap: 20, flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: C.accent }}>{card.eyebrow}</div>
            <div
              style={{
                display: "block",
                fontSize: titleSize(card.title),
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: -2,
                lineClamp: 2,
                overflow: "hidden",
              }}
            >
              {card.title}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 34,
                color: C.muted,
              }}
            >
              <span>{card.byline}</span>
              {card.official && <Check size={34} />}
            </div>
            {card.description && (
              <div
                style={{
                  display: "block",
                  fontSize: 28,
                  color: C.muted,
                  lineClamp: 1,
                  overflow: "hidden",
                }}
              >
                {card.description}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 12 }}>
            {card.chips.map((chip, i) => (
              <div
                key={chip}
                style={{
                  display: "flex",
                  padding: "10px 22px",
                  borderRadius: 999,
                  fontSize: 26,
                  fontWeight: 700,
                  backgroundColor: i === 0 ? C.accent : C.raise,
                  color: i === 0 ? C.onAccent : C.text,
                }}
              >
                {chip}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Mark size={44} />
            <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.5 }}>textures.gg</span>
          </div>
        </div>
      </div>
    </div>
  );
}
