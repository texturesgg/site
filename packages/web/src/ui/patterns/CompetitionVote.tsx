import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { COMPETITION_X_HANDLE, type CompetitionState } from "@vgskins/shared/competition";
import { useAuth } from "@/contexts/auth-context";
import { authClient } from "@/lib/auth-client";
import { competitionQuery, useCompetitionChange } from "@/lib/competition-queries";
import { AnchorButton, Button, Switch, TextLink } from "../primitives";
import { color, font, radius, space, text } from "../tokens.stylex";

// Voting in the competition: the button on an entry, the box on an entered
// mod's page (with its owner's switch), and the viewer's votes with the
// follow step on /competition. The API enforces every rule; this shows them.

const FOLLOW_URL = `https://x.com/intent/follow?screen_name=${COMPETITION_X_HANDLE}`;

const styles = stylex.create({
  box: {
    display: "flex",
    flexDirection: "column",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.md },
  label: { margin: 0, fontSize: text.sm, color: color.muted },
  count: { fontFamily: font.mono, fontSize: text.sm, color: color.text, whiteSpace: "nowrap" },
  note: { margin: 0, fontSize: text.sm, color: color.muted },
  error: { margin: 0, fontSize: text.sm, color: color.danger },
  steps: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.sm },
});

type Me = NonNullable<CompetitionState["me"]>;

/** Vote, or Voted to take it back. Signed out, it asks to sign in. */
export function VoteButton({ mod, state }: { mod: string; state: CompetitionState }) {
  const { requireAuth } = useAuth();
  const change = useCompetitionChange();
  const me = state.me;
  const voted = me?.votes.includes(mod) ?? false;
  const own = me?.mods.some((entry) => entry.id === mod) ?? false;
  const full = me ? me.votes.length >= me.budget : false;
  const disabled = !state.open || own || Boolean(me?.why) || (!voted && full) || change.isPending;
  return (
    <Button
      variant={voted ? "primary" : "secondary"}
      disabled={disabled}
      title={own ? "You can't vote for your own mod" : (me?.why ?? undefined)}
      onClick={() => {
        if (!requireAuth("vote")) return;
        change.mutate({ kind: voted ? "unvote" : "vote", mod });
      }}
    >
      {voted ? "Voted" : "Vote"}
    </Button>
  );
}

/** How many votes the viewer has used, and the way to two more. */
export function YourVotes({ state }: { state: CompetitionState }) {
  const { requireAuth } = useAuth();
  if (!state.me) {
    return (
      <div {...stylex.props(styles.box)}>
        <div {...stylex.props(styles.row)}>
          <Button variant="primary" onClick={() => requireAuth("vote")}>
            Sign in to vote
          </Button>
          <p {...stylex.props(styles.note)}>One vote per account, three with X linked.</p>
        </div>
      </div>
    );
  }
  return <SignedInVotes me={state.me} open={state.open} />;
}

function SignedInVotes({ me, open }: { me: Me; open: boolean }) {
  const change = useCompetitionChange();
  const used = me.votes.length;
  return (
    <div {...stylex.props(styles.box)}>
      <p {...stylex.props(styles.label)}>
        {me.why ?? `${used} of ${me.budget} ${me.budget === 1 ? "vote" : "votes"} used`}
      </p>
      {open && !me.why && !me.x.claimed && (
        <div {...stylex.props(styles.steps)}>
          {me.x.linked ? (
            <>
              <AnchorButton href={FOLLOW_URL} target="_blank" rel="noreferrer">
                Follow @{COMPETITION_X_HANDLE}
              </AnchorButton>
              <Button
                variant="primary"
                disabled={change.isPending}
                onClick={() => change.mutate({ kind: "claim" })}
              >
                I follow @{COMPETITION_X_HANDLE}
              </Button>
              <span {...stylex.props(styles.note)}>for two more votes</span>
            </>
          ) : (
            <>
              <Button
                onClick={() =>
                  authClient.linkSocial({ provider: "twitter", callbackURL: "/competition" })
                }
              >
                Link X
              </Button>
              <span {...stylex.props(styles.note)}>
                and follow @{COMPETITION_X_HANDLE} for two more votes
              </span>
            </>
          )}
        </div>
      )}
      {me.x.claimed && (
        <div {...stylex.props(styles.steps)}>
          <span {...stylex.props(styles.note)}>
            Following as @{me.x.handle ?? "your X account"}
          </span>
          {open && (
            <Button
              variant="ghost"
              disabled={change.isPending}
              onClick={() => change.mutate({ kind: "unclaim" })}
            >
              Undo
            </Button>
          )}
        </div>
      )}
      {change.error && <p {...stylex.props(styles.error)}>{change.error.message}</p>}
    </div>
  );
}

/**
 * On a mod's page: its votes and the vote button when it's an entry, and for
 * its owner, the switch that enters it.
 */
export function CompetitionModBox({ mod }: { mod: string }) {
  const { data: state } = useQuery(competitionQuery());
  const change = useCompetitionChange();
  if (!state) return null;
  const entry = state.entries.find((candidate) => candidate.id === mod);
  const own = state.me?.mods.find((candidate) => candidate.id === mod);
  if (!entry && !own) return null;
  return (
    <div {...stylex.props(styles.box)}>
      {entry && (
        <div {...stylex.props(styles.row)}>
          <VoteButton mod={mod} state={state} />
          <span {...stylex.props(styles.count)}>
            {entry.votes} {entry.votes === 1 ? "vote" : "votes"}
          </span>
          <p {...stylex.props(styles.note)}>
            In the <TextLink to="/competition">mod competition</TextLink>
          </p>
        </div>
      )}
      {own && (
        <>
          <Switch
            label="Enter the competition"
            checked={own.entered}
            disabled={change.isPending || (!own.entered && own.why !== null) || !state.open}
            onCheckedChange={(checked) => change.mutate({ kind: checked ? "enter" : "leave", mod })}
          />
          {own.why && !own.entered && <p {...stylex.props(styles.note)}>{own.why}</p>}
        </>
      )}
      {change.error && <p {...stylex.props(styles.error)}>{change.error.message}</p>}
    </div>
  );
}
