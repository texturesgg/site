import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { normalizeRoomCode } from "@vgskins/shared/meet";
import { useEffect, useRef } from "react";
import { appLinks } from "@/lib/app-links";
import { requireFeatureFlag } from "@/lib/feature-flags";
import { DownloadIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/patterns/EmptyState";
import { layout } from "@/ui/patterns/layout";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { AnchorButton, ButtonLink } from "@/ui/primitives";
import { color, font, radius, space, text } from "@/ui/tokens.stylex";

/**
 * A room invite from tgg-studio. Chat apps don't link the app's own scheme,
 * so the app shares this page, which opens textures-gg://join/CODE.
 */
export const Route = createFileRoute("/join/$code")({
  loader: async ({ context }) => {
    await requireFeatureFlag(context.queryClient, "codeMods");
  },
  head: () => ({
    meta: [{ title: "Join a room - textures.gg" }, { name: "robots", content: "noindex" }],
  }),
  component: JoinPage,
});

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.xl },
  body: { display: "flex", flexDirection: "column", gap: space.lg },
  code: {
    alignSelf: "flex-start",
    paddingBlock: space.sm,
    paddingInline: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    fontFamily: font.mono,
    fontSize: text.h2,
    color: color.text,
  },
  note: { margin: 0, fontSize: text.md, color: color.muted },
  actions: { display: "flex", flexWrap: "wrap", gap: space.sm },
});

function JoinPage() {
  const code = normalizeRoomCode(Route.useParams().code);
  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader title="Join a room" />
      <div {...stylex.props(layout.narrow, styles.body)}>
        {code ? (
          <OpenRoom code={code} />
        ) : (
          <EmptyState
            title="That isn't a room code"
            body="Room codes are 4 letters. Check the link and try again."
          />
        )}
      </div>
    </div>
  );
}

function OpenRoom({ code }: { code: string }) {
  const link = appLinks.join(code);
  // Once per code, even when React runs effects twice in development.
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (opened.current === link) return;
    opened.current = link;
    window.location.assign(link);
  }, [link]);

  return (
    <>
      <span {...stylex.props(styles.code)}>{code}</span>
      <p {...stylex.props(styles.note)}>This opens the textures.gg app and joins the room.</p>
      <div {...stylex.props(styles.actions)}>
        <AnchorButton href={link} variant="primary">
          Open the app
        </AnchorButton>
        <ButtonLink to="/download" icon={<DownloadIcon />}>
          Download the app
        </ButtonLink>
      </div>
      <p {...stylex.props(styles.note)}>
        Nothing opened? You need the textures.gg app. Download it, then open this link again.
      </p>
      <p {...stylex.props(styles.note)}>
        You can also join from tgg-melee. Go to Online, then Join a room, and type the code.
      </p>
    </>
  );
}
