import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PRIMARY_GAME_SLUG } from "@vgskins/shared";
import type { CompetitionState } from "@vgskins/shared/competition";
import { competitionQuery } from "@/lib/competition-queries";
import type { ReactNode } from "react";
import { requireFeatureFlag } from "@/lib/feature-flags";
import { Article, ArticleSection, BulletList, Step, Steps } from "@/ui/patterns/Article";
import { VoteButton, YourVotes } from "@/ui/patterns/CompetitionVote";
import { layout } from "@/ui/patterns/layout";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { TextAnchor, TextLink } from "@/ui/primitives";
import { color, font, radius, space, text } from "@/ui/tokens.stylex";

// The December 2026 mod competition, behind the code-mods flag: its entries
// and votes (the API enforces the rules, packages/shared/src/competition.ts).
// What isn't decided yet shows as "To confirm", and the rules are a draft.

const PRIZES = [
  { place: "1st", amount: "$250" },
  { place: "2nd", amount: "$150" },
  { place: "3rd", amount: "$100" },
];

export const Route = createFileRoute("/competition")({
  loader: async ({ context }) => {
    await requireFeatureFlag(context.queryClient, "codeMods");
    void context.queryClient.prefetchQuery(competitionQuery());
  },
  head: () => ({
    meta: [
      { title: "Mod competition - textures.gg" },
      {
        name: "description",
        content:
          "Make a Melee mod in December 2026. The top three share $500: $250, $150 and $100.",
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
  entries: { display: "flex", flexDirection: "column", gap: space.md },
  heading: { margin: 0, fontSize: text.h3, fontWeight: 800 },
  list: {
    display: "flex",
    flexDirection: "column",
    margin: 0,
    padding: 0,
    listStyle: "none",
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  row: {
    display: "grid",
    gridTemplateColumns: "2ch 40px minmax(0, 1fr) auto auto",
    alignItems: "center",
    gap: space.md,
    padding: `${space.sm} ${space.lg}`,
    borderTopWidth: { default: "1px", ":first-child": 0 },
    borderTopStyle: "solid",
    borderTopColor: color.line,
  },
  rank: { fontFamily: font.mono, fontSize: text.sm, color: color.muted, textAlign: "right" },
  icon: { width: "40px", height: "40px", borderRadius: radius.md, backgroundColor: color.line },
  who: { display: "flex", flexDirection: "column", minWidth: 0 },
  name: { fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  author: { fontSize: text.sm, color: color.muted },
  count: { fontFamily: font.mono, fontSize: text.sm, whiteSpace: "nowrap" },
  empty: { margin: 0, fontSize: text.sm, color: color.muted },
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

/** The entries, most votes first, with the viewer's votes above them. */
function Entries({ state }: { state: CompetitionState }) {
  return (
    <section {...stylex.props(styles.entries)} aria-labelledby="entries">
      <h2 id="entries" {...stylex.props(styles.heading)}>
        Entries
      </h2>
      <YourVotes state={state} />
      {state.entries.length === 0 ? (
        <p {...stylex.props(styles.empty)}>
          {state.open ? "No entries yet." : "Entries show here from Dec 1."}
        </p>
      ) : (
        <ol {...stylex.props(styles.list)}>
          {state.entries.map((entry, index) => (
            <li key={entry.id} {...stylex.props(styles.row)}>
              <span {...stylex.props(styles.rank)}>{index + 1}</span>
              {entry.icon ? (
                <img src={entry.icon} alt="" {...stylex.props(styles.icon)} />
              ) : (
                <span {...stylex.props(styles.icon)} />
              )}
              <span {...stylex.props(styles.who)}>
                <TextLink
                  to="/games/$slug/mods/$modId"
                  params={{ slug: PRIMARY_GAME_SLUG, modId: entry.id }}
                  {...stylex.props(styles.name)}
                >
                  {entry.name}
                </TextLink>
                <span {...stylex.props(styles.author)}>by {entry.author}</span>
              </span>
              <span {...stylex.props(styles.count)}>
                {entry.votes} {entry.votes === 1 ? "vote" : "votes"}
              </span>
              <VoteButton mod={entry.id} state={state} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Competition() {
  const { data: state } = useQuery(competitionQuery());
  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader
        title="Mod competition"
        description="tgg-melee loads mods, stacks several at once, puts them in sets you can share, and matches players by the mods they run. In December, make one. Players vote, and the top three share $500."
      />
      <dl {...stylex.props(styles.facts)}>
        <Fact label="Entries open">Dec 1</Fact>
        <Fact label="Entries close">Dec 31</Fact>
        <Fact label="Voting">Through Dec 31</Fact>
        <Fact label="Prizes">$500</Fact>
      </dl>

      {state && (
        <div {...stylex.props(layout.narrow)}>
          <Entries state={state} />
        </div>
      )}

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
                <p>
                  Once it&apos;s reviewed and listed, turn on Enter the competition on its page.
                </p>
              </Step>
              <Step number={3}>
                <p>
                  Share it on X and tag{" "}
                  <TextAnchor href="https://x.com/texturesgg">@texturesgg</TextAnchor> so players
                  find it.
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
          </ArticleSection>

          <ArticleSection title="Judging">
            <p>
              Players vote on textures.gg through Dec 31. Every account gets one vote, and two more
              with X linked and following @texturesgg. Vote counts are public while voting is open.
            </p>
            <p>
              textures.gg admins confirm the winners from the results and announce them a few days
              after.
            </p>
          </ArticleSection>

          <ArticleSection title="Rules">
            <p {...stylex.props(styles.draft)}>
              <strong>Draft.</strong> These rules are waiting for review and may change before the
              competition starts.
            </p>
            <BulletList>
              <li>One account per person. You can enter more than one mod.</li>
              <li>
                Mods first released on textures.gg on or after Dec 1 can enter. Official textures.gg
                mods can&apos;t.
              </li>
              <li>Teams can enter. The prize goes to whoever published the mod.</li>
              <li>Your mod has to follow the terms of service. A withdrawn mod is out.</li>
              <li>Don&apos;t buy votes or ask for votes in exchange for anything.</li>
              <li>
                You can&apos;t vote for your own mod. Moderators and admins don&apos;t vote and
                can&apos;t win prizes.
              </li>
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
