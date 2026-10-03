import * as stylex from "@stylexjs/stylex";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { authClient, EMAIL_PASSWORD_AUTH_ENABLED } from "@/lib/auth-client";
import { EmptyState } from "@/ui/patterns/EmptyState";
import { layout } from "@/ui/patterns/layout";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { Button, ButtonLink, TextField } from "@/ui/primitives";
import { color, space, text } from "@/ui/tokens.stylex";

interface ResetPasswordSearch {
  token?: string;
}

const MIN_LENGTH = 8;

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  beforeLoad: () => {
    if (!EMAIL_PASSWORD_AUTH_ENABLED) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Reset your password - textures.gg" }] }),
  component: ResetPasswordPage,
});

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.xl },
  form: { display: "flex", flexDirection: "column", gap: space.md },
  error: { margin: 0, fontSize: text.sm, color: color.danger },
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || password.length < MIN_LENGTH || password !== confirm) return;
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) setError(result.error.message || "This reset link didn't work.");
      else setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "This reset link didn't work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader
        title={done ? "Password changed" : "Choose a new password"}
        description={done ? "You can sign in with it now." : undefined}
      />
      <div {...stylex.props(layout.narrow)}>
        {!token ? (
          <EmptyState
            title="This reset link is incomplete"
            body="Open the link from your email again, or request a new one from the sign-in dialog."
            action={<ButtonLink to="/">Back to textures.gg</ButtonLink>}
          />
        ) : done ? (
          <ButtonLink to="/" variant="primary">
            Continue to textures.gg
          </ButtonLink>
        ) : (
          <form onSubmit={submit} noValidate {...stylex.props(styles.form)}>
            <TextField
              label="New password"
              type="password"
              autoComplete="new-password"
              value={password}
              required
              minLength={MIN_LENGTH}
              // oxlint-disable-next-line jsx-a11y/no-autofocus -- the page is reached from an emailed link and holds this one field.
              autoFocus
              disabled={busy}
              error={tooShort ? `Use at least ${MIN_LENGTH} characters` : undefined}
              description={tooShort ? undefined : `At least ${MIN_LENGTH} characters.`}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
            <TextField
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              required
              disabled={busy}
              error={mismatch ? "The passwords don't match" : undefined}
              onChange={(event) => setConfirm(event.currentTarget.value)}
            />
            {error && (
              <p role="alert" {...stylex.props(styles.error)}>
                {error}
              </p>
            )}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={busy || password.length < MIN_LENGTH || password !== confirm}
            >
              {busy ? "Saving…" : "Save new password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
