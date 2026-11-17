import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { PRIMARY_GAME_SLUG } from "@vgskins/shared";
import type { ReactNode } from "react";
import { requireFeatureFlag } from "@/lib/feature-flags";
import { Article, ArticleSection, BulletList, Step, Steps } from "@/ui/patterns/Article";
import { layout } from "@/ui/patterns/layout";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { TextLink } from "@/ui/primitives";
import { color, font, radius, space, text } from "@/ui/tokens.stylex";

// The December 2026 mod competition. A shell behind the code-mods flag: what
// isn't decided yet shows as "To confirm", and the rules are a draft. The
// voting itself happens on a third-party platform, not here.

const PRIZES = [
  { place: "1st", amount: "$300" },
  { place: "2nd", amount: "$200" },
  { place: "3rd", amount: "$100" },
];

export const Route = createFileRoute("/competition")({
  loader: async ({ context }) => {
    await requireFeatureFlag(context.queryClient, "codeMods");
  },
  head: () => ({
    meta: [
      { title: "Mod competition - textures.gg" },
      {
        name: "description",
        content: "Make a Melee mod in December 2026. The top three win $300, $200 and $100.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Competition,
});

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.xl },
  facts: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: space.sm,
    margin: 0,
  },
  fact: {
    display: "flex",
    flexDirection: "column",
    gap: space.xxs,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  factLabel: { fontSize: text.sm, color: color.muted },
  factValue: { margin: 0, fontSize: text.h3, fontWeight: 800 },
  prizes: { display: "flex", flexWrap: "wrap", gap: space.sm },
  prize: {
    display: "flex",
    alignItems: "baseline",
    gap: space.xs,
    padding: `${space.sm} ${space.lg}`,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  amount: { fontFamily: font.mono, fontSize: text.h3, fontWeight: 700, color: color.accentText },
  tbd: {
    display: "inline-block",
    padding: `0 ${space.xs}`,
    borderRadius: radius.sm,
    borderWidth: "1px",
    borderStyle: "dashed",
    borderColor: color.accent,
    color: color.accentText,
    fontSize: text.sm,
    fontWeight: 600,
  },
  draft: {
    margin: 0,
    padding: `${space.sm} ${space.md}`,
    borderRadius: radius.md,
    borderLeftWidth: "3px",
    borderLeftStyle: "solid",
    borderLeftColor: color.accent,
    backgroundColor: color.surface,
    fontSize: text.sm,
  },
});

/** Something not decided yet: shown so it's easy to spot and fill in. */
function ToConfirm({ children }: { children: ReactNode }) {
  return <span {...stylex.props(styles.tbd)}>To confirm: {children}</span>;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div {...stylex.props(styles.fact)}>
      <dt {...stylex.props(styles.factLabel)}>{label}</dt>
      <dd {...stylex.props(styles.factValue)}>{children}</dd>
    </div>
  );
}

function Competition() {
  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader
        title="Mod competition"
        description="Make a Melee mod in December. The community votes, and the top three win."
      />
      <dl {...stylex.props(styles.facts)}>
        <Fact label="Entries open">Dec 1</Fact>
        <Fact label="Entries close">
          <ToConfirm>date</ToConfirm>
        </Fact>
        <Fact label="Voting">
          <ToConfirm>dates</ToConfirm>
        </Fact>
        <Fact label="First prize">$300</Fact>
      </dl>

      <div {...stylex.props(layout.narrow)}>
        <Article>
          <ArticleSection title="How to enter">
            <Steps>
              <Step number={1}>
                <p>
                  Make a mod for tgg-melee and publish it on textures.gg. Anything counts, from a
                  new mode or a training drill to a stage or a fix.
                </p>
              </Step>
              <Step number={2}>
                <p>Once it&apos;s reviewed and listed, copy the link to its page.</p>
              </Step>
              <Step number={3}>
                <p>
                  Post the link on X and tag <ToConfirm>account</ToConfirm>. That post is your
                  entry.
                </p>
              </Step>
            </Steps>
            <p>
              Every release is reviewed before it&apos;s listed. Script mods are usually quick.
              Native mods take longer, so publish early if yours is native.
            </p>
            <p>
              Not sure where to start? Look at the{" "}
              <TextLink to="/games/$slug/mods" params={{ slug: PRIMARY_GAME_SLUG }}>
                mods already up
              </TextLink>
              .
            </p>
          </ArticleSection>

          <ArticleSection title="Prizes">
            <div {...stylex.props(styles.prizes)}>
              {PRIZES.map((prize) => (
                <div key={prize.place} {...stylex.props(styles.prize)}>
                  <span {...stylex.props(styles.amount)}>{prize.amount}</span>
                  <span>{prize.place}</span>
                </div>
              ))}
            </div>
            <p>Paid by SaavyLab LLC, the company behind textures.gg.</p>
          </ArticleSection>

          <ArticleSection title="Judging">
            <p>
              Players vote on <ToConfirm>voting platform</ToConfirm>, a third-party site that checks
              each vote comes from a real account. Jayson and Santi confirm the winners from the
              results.
            </p>
          </ArticleSection>

          <ArticleSection title="Rules">
            <p {...stylex.props(styles.draft)}>
              <strong>Draft.</strong> These rules are waiting for review and may change before the
              competition starts.
            </p>
            <BulletList>
              <li>One account per person. You can enter more than one mod.</li>
              <li>Mods have to be published on textures.gg between the open and close dates.</li>
              <li>Teams can enter. The prize goes to whoever published the mod.</li>
              <li>Your mod has to follow the terms of service. A withdrawn mod is out.</li>
              <li>Don&apos;t buy votes or ask for votes in exchange for anything.</li>
              <li>Moderators and the people confirming winners can&apos;t win prizes.</li>
              <li>
                <ToConfirm>eligibility, taxes and where it&apos;s void</ToConfirm>
              </li>
            </BulletList>
          </ArticleSection>
        </Article>
      </div>
    </div>
  );
}
