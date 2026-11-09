import { useState } from "react";
import { ConfirmDialog, TextArea } from "../primitives";

/** Asks why before rejecting a mod release; the maker sees the reason. */
export function RejectReleaseDialog({
  open,
  onOpenChange,
  version,
  pending,
  error,
  onReject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: string;
  pending: boolean;
  error?: string;
  onReject: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason("");
        onOpenChange(next);
      }}
      title={`Reject ${version}?`}
      description="The maker sees your reason."
      confirmLabel="Reject"
      pending={pending}
      error={error}
      onConfirm={() => onReject(reason.trim())}
    >
      <TextArea
        label="Reason"
        value={reason}
        maxLength={1000}
        rows={3}
        onChange={(event) => setReason(event.currentTarget.value)}
      />
    </ConfirmDialog>
  );
}
