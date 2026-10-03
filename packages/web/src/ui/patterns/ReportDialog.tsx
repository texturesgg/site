import * as stylex from "@stylexjs/stylex";
import { useMutation } from "@tanstack/react-query";
import type { ReportReason, ReportTargetType } from "@vgskins/shared";
import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { api, apiError } from "@/lib/api";
import { Button, Dialog, RadioGroup, TextArea } from "../primitives";
import { color, space, text } from "../tokens.stylex";
import { LIMITS } from "@vgskins/shared";
import { REPORT_REASON_LABELS } from "@/lib/format";

const REASONS_BY_TYPE: Record<ReportTargetType, readonly ReportReason[]> = {
  pack: ["inappropriate", "stolen", "spam", "broken", "other"],
  comment: ["inappropriate", "spam", "other"],
};

const styles = stylex.create({
  form: { display: "flex", flexDirection: "column", gap: space.md },
  actions: { display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: space.xs },
  error: { margin: 0, fontSize: text.sm, color: color.danger },
  done: { margin: 0, fontSize: text.md, lineHeight: 1.5, color: color.muted },
});

/** Report a pack or comment to moderators. Opened from a menu, so it is controlled. */
export function ReportDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
  targetLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: ReportTargetType;
  targetId: string;
  targetLabel?: string;
}) {
  const { isAuthenticated, requireAuth } = useAuth();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");

  const report = useMutation({
    mutationFn: async (chosen: ReportReason) => {
      const res = await api.reports.$post({
        json: { targetType, targetId, reason: chosen, details: details.trim() || undefined },
      });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });

  const setOpen = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setReason(null);
      setDetails("");
      report.reset();
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAuthenticated) {
      setOpen(false);
      requireAuth("report content");
      return;
    }
    if (reason) report.mutate(reason);
  };

  const title = `Report ${targetType}`;

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={report.isSuccess ? "Report sent" : title}
      description={report.isSuccess ? undefined : targetLabel}
    >
      {report.isSuccess ? (
        <div {...stylex.props(styles.form)}>
          <p {...stylex.props(styles.done)}>
            Thanks. A moderator will review it and act if it breaks the rules.
          </p>
          <div {...stylex.props(styles.actions)}>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} {...stylex.props(styles.form)}>
          <RadioGroup
            label="Reason"
            value={reason}
            options={REASONS_BY_TYPE[targetType].map((value) => ({
              value,
              label: REPORT_REASON_LABELS[value],
            }))}
            onValueChange={setReason}
          />
          <TextArea
            label="Details (optional)"
            value={details}
            onChange={(event) => setDetails(event.currentTarget.value)}
            maxLength={LIMITS.REPORT_DETAILS_MAX}
            rows={3}
          />
          {report.isError && (
            <p role="alert" {...stylex.props(styles.error)}>
              {report.error.message || "The report couldn't be sent."}
            </p>
          )}
          <div {...stylex.props(styles.actions)}>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!reason || report.isPending}>
              {report.isPending ? "Sending…" : "Send report"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
