import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  COMPETITION,
  type CompetitionAuditEntry,
  type CompetitionFlag,
  type CompetitionVoter,
  competitionAuditSchema,
} from "@vgskins/shared/competition";
import { useState } from "react";
import { api, apiError } from "@/lib/api";
import { featureFlag } from "@/lib/feature-flags";
import { EmptyState } from "@/ui/patterns/EmptyState";
import { Badge, Button, ConfirmDialog, TextAnchor, TextField } from "@/ui/primitives";
import { color, font, radius, space, text } from "@/ui/tokens.stylex";

// The competition audit: every entry's voters with what each vote recorded,
// flags worth a look, voiding with a reason, and marking the winners announced.

const auditQuery = {
  queryKey: ["admin", "competition"],
  queryFn: async () => {
    const res = await api.admin.competition.$get();
    if (!res.ok) throw await apiError(res);
    return competitionAuditSchema.parse(await res.json());
  },
};

export const Route = createFileRoute("/_admin/competition-audit")({
  beforeLoad: ({ context }) => {
    if (context.role !== "admin") throw redirect({ to: "/admin" });
  },
  loader: async ({ context }) => {
    if (!(await featureFlag(context.queryClient, "codeMods"))) throw redirect({ to: "/admin" });
  },
  head: () => ({ meta: [{ title: "Competition - textures.gg" }] }),
  component: CompetitionAuditPage,
});

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.lg },
  bar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  note: { margin: 0, fontSize: text.sm, color: color.muted },
  error: { margin: 0, fontSize: text.sm, color: color.danger },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  head: { display: "flex", alignItems: "baseline", gap: space.sm },
  title: { margin: 0, fontSize: text.lg, fontWeight: 700 },
  count: { fontFamily: font.mono, fontSize: text.sm, color: color.muted },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", minWidth: "960px", borderCollapse: "collapse", fontSize: text.sm },
  th: {
    paddingBlock: space.xs,
    paddingInline: space.sm,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: color.line,
    fontWeight: 600,
    color: color.muted,
    textAlign: "left",
    whiteSpace: "nowrap",
  },
  td: {
    paddingBlock: space.xs,
    paddingInline: space.sm,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: color.line,
    verticalAlign: "middle",
  },
  mono: { fontFamily: font.mono, whiteSpace: "nowrap" },
  voided: { opacity: 0.55 },
  flags: { display: "flex", flexWrap: "wrap", gap: space.xxs },
  actions: { display: "flex", gap: space.xxs, justifyContent: "flex-end" },
});

const FLAG_LABELS = {
  new_account: "New account",
  burst: "Burst",
  shared_ip: "Shared IP",
} as const satisfies Record<CompetitionFlag, string>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** One vote, or every vote from that voter's account. */
type Target = { kind: "vote" | "user"; voter: CompetitionVoter };

function CompetitionAuditPage() {
  const queryClient = useQueryClient();
  const { data: audit, error } = useQuery(auditQuery);
  const [target, setTarget] = useState<Target | null>(null);
  const [reason, setReason] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: auditQuery.queryKey });

  const voidVotes = useMutation({
    mutationFn: async (input: { target: Target; reason: string }) => {
      const json = { reason: input.reason };
      const res =
        input.target.kind === "vote"
          ? await api.admin.competition.votes[":id"].void.$post({
              param: { id: input.target.voter.vote },
              json,
            })
          : await api.admin.competition.users[":userId"].void.$post({
              param: { userId: input.target.voter.user.id },
              json,
            });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: async () => {
      setTarget(null);
      setReason("");
      await refresh();
    },
  });

  const announce = useMutation({
    mutationFn: async () => {
      const res = await api.admin.competition.announced.$post();
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: refresh,
  });

  if (error) return <p {...stylex.props(styles.error)}>{error.message}</p>;
  if (!audit) return null;
  const closed = Date.now() >= Date.parse(COMPETITION.closes);

  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.bar)}>
        <p {...stylex.props(styles.note)}>
          {audit.announced_at
            ? `Winners announced ${new Date(audit.announced_at).toLocaleDateString()}. Votes are deleted 90 days after.`
            : closed
              ? "Voting is closed."
              : `Voting closes ${new Date(COMPETITION.closes).toLocaleString()}.`}
        </p>
        {!audit.announced_at && (
          <Button
            variant="primary"
            disabled={!closed || announce.isPending}
            title={closed ? undefined : "Voting hasn't closed yet"}
            onClick={() => announce.mutate()}
          >
            Winners announced
          </Button>
        )}
      </div>
      {announce.error && <p {...stylex.props(styles.error)}>{announce.error.message}</p>}
      {audit.entries.length === 0 ? (
        <EmptyState title="No entries yet" />
      ) : (
        audit.entries.map((entry) => (
          <EntryVoters key={entry.id} entry={entry} onVoid={setTarget} />
        ))
      )}
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (open) return;
          setTarget(null);
          setReason("");
          voidVotes.reset();
        }}
        title={
          target?.kind === "user"
            ? `Void every vote from ${target.voter.user.name}?`
            : `Void ${target?.voter.user.name ?? ""}'s vote?`
        }
        description="It stops counting right away and stays on record with your reason."
        confirmLabel="Void"
        pending={voidVotes.isPending}
        error={voidVotes.error?.message}
        onConfirm={() => {
          if (target && reason.trim()) voidVotes.mutate({ target, reason: reason.trim() });
        }}
      >
        <TextField
          label="Reason"
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.currentTarget.value)}
        />
      </ConfirmDialog>
    </div>
  );
}

function EntryVoters({
  entry,
  onVoid,
}: {
  entry: CompetitionAuditEntry;
  onVoid: (target: Target) => void;
}) {
  return (
    <section {...stylex.props(styles.card)}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{entry.name}</h2>
        <span {...stylex.props(styles.count)}>
          by {entry.author} · {entry.votes} {entry.votes === 1 ? "vote" : "votes"}
        </span>
      </div>
      <p {...stylex.props(styles.note)}>
        Post:{" "}
        <TextAnchor href={entry.post_url} target="_blank" rel="noreferrer">
          {entry.post_url.replace("https://", "")}
        </TextAnchor>
      </p>
      {entry.voters.length === 0 ? (
        <p {...stylex.props(styles.note)}>No votes yet.</p>
      ) : (
        <div {...stylex.props(styles.tableWrap)}>
          <table {...stylex.props(styles.table)}>
            <thead>
              <tr>
                {[
                  "Voter",
                  "Voted",
                  "Account age",
                  "Sign-in",
                  "X",
                  "IP",
                  "Country",
                  "Flags",
                  "",
                ].map((label) => (
                  <th key={label} scope="col" {...stylex.props(styles.th)}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entry.voters.map((voter) => (
                <VoterRow key={voter.vote} voter={voter} onVoid={onVoid} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function VoterRow({
  voter,
  onVoid,
}: {
  voter: CompetitionVoter;
  onVoid: (target: Target) => void;
}) {
  const votedAt = Date.parse(voter.voted_at);
  const ageDays = Math.floor((votedAt - Date.parse(voter.account_created_at)) / DAY_MS);
  return (
    <tr {...stylex.props((voter.voided || voter.banned) && styles.voided)}>
      <td {...stylex.props(styles.td)}>{voter.user.name}</td>
      <td {...stylex.props(styles.td, styles.mono)}>{new Date(votedAt).toLocaleString()}</td>
      <td {...stylex.props(styles.td, styles.mono)}>
        {ageDays} {ageDays === 1 ? "day" : "days"}
      </td>
      <td {...stylex.props(styles.td)}>{voter.sign_in_methods.join(", ") || "none"}</td>
      <td {...stylex.props(styles.td)}>
        {voter.x ? `@${voter.x.handle ?? voter.x.account_id}` : ""}
        {voter.follow_claim ? " (follows)" : ""}
        {voter.bonus ? " · bonus vote" : ""}
      </td>
      <td {...stylex.props(styles.td, styles.mono)}>{voter.ip}</td>
      <td {...stylex.props(styles.td)}>{voter.country ?? ""}</td>
      <td {...stylex.props(styles.td)}>
        {voter.voided ? (
          <span title={voter.voided.reason}>
            Voided{voter.voided.by ? ` by ${voter.voided.by}` : ""}. {voter.voided.reason}
          </span>
        ) : voter.banned ? (
          <span>Banned (not counted)</span>
        ) : (
          <span {...stylex.props(styles.flags)}>
            {voter.flags.map((flag) => (
              <Badge key={flag} tone="accent">
                {FLAG_LABELS[flag]}
              </Badge>
            ))}
          </span>
        )}
      </td>
      <td {...stylex.props(styles.td)}>
        {!voter.voided && (
          <span {...stylex.props(styles.actions)}>
            <Button variant="ghost" onClick={() => onVoid({ kind: "vote", voter })}>
              Void
            </Button>
            <Button variant="ghost" onClick={() => onVoid({ kind: "user", voter })}>
              Void account
            </Button>
          </span>
        )}
      </td>
    </tr>
  );
}
