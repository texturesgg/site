import { type CodeModWithdrawMode, WITHDRAW_REASON_MAX } from "@vgskins/shared";
import { useState } from "react";
import { ConfirmDialog, RadioGroup, TextField } from "../primitives";

const MODES = [
  { value: "off", label: "Turn it off for players who have it" },
  { value: "warn", label: "Leave it on and tell them why" },
] as const satisfies readonly { value: CodeModWithdrawMode; label: string }[];

/**
 * Asks why before withdrawing a release or a whole mod, and what tgg does
 * with installed copies. Players read the reason.
 */
export function WithdrawDialog({
  open,
  onOpenChange,
  what,
  pending,
  error,
  onWithdraw,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "1.2.0" or "every version of Pink FD" */
  what: string;
  pending: boolean;
  error?: string;
  onWithdraw: (input: { reason: string; mode: CodeModWithdrawMode }) => void;
}) {
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<CodeModWithdrawMode>("off");
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setReason("");
          setMode("off");
        }
        onOpenChange(next);
      }}
      title={`Withdraw ${what}?`}
      description="It stops installing and downloading right away. Players who have it see your reason the next time tgg or the app goes online."
      confirmLabel="Withdraw"
      pending={pending}
      error={error}
      onConfirm={() => onWithdraw({ reason: reason.trim(), mode })}
    >
      <TextField
        label="Reason players see"
        value={reason}
        maxLength={WITHDRAW_REASON_MAX}
        onChange={(event) => setReason(event.currentTarget.value)}
      />
      <RadioGroup
        label="Copies already installed"
        value={mode}
        options={MODES}
        onValueChange={setMode}
      />
    </ConfirmDialog>
  );
}
