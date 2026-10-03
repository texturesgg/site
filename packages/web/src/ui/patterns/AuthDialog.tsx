import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { authClient, EMAIL_PASSWORD_AUTH_ENABLED, signIn, signUp } from "@/lib/auth-client";
import { DiscordIcon, GoogleIcon } from "../brand-icons";
import { ChevronLeftIcon } from "../icons";
import { Button, Dialog, TextField } from "../primitives";
import { color, font, space, text } from "../tokens.stylex";

const styles = stylex.create({
  body: { display: "flex", flexDirection: "column", gap: space.md },
  providers: { display: "flex", flexDirection: "column", gap: space.xs },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    fontSize: text.sm,
    color: color.muted,
    "::before": { content: "''", flexGrow: 1, height: "1px", backgroundColor: color.line },
    "::after": { content: "''", flexGrow: 1, height: "1px", backgroundColor: color.line },
  },
  form: { display: "flex", flexDirection: "column", gap: space.sm },
  back: { alignSelf: "flex-start" },
  email: { fontFamily: font.mono, fontSize: text.sm },
  hint: { margin: 0, fontSize: text.sm, color: color.muted },
  error: { margin: 0, fontSize: text.sm, color: color.danger },
  message: { margin: 0, fontSize: text.md, lineHeight: 1.5, color: color.muted },
  strong: { color: color.text, fontWeight: 600 },
});

type Sent = "account" | "verification" | "reset" | null;

/**
 * One dialog for signing in and signing up: an unknown email with a new
 * password creates the account, so nobody has to choose which they need.
 */
/**
 * better-auth's client resolves `{ data, error }` instead of throwing; this
 * throws the error with its message so a catch block sees it.
 */
function unwrap<T>(
  result: { data: T; error: null } | { data: null; error: { message?: string } }
): T {
  if (result.error) throw new Error(result.error.message || "Something went wrong. Try again.");
  return result.data;
}

export function AuthDialog() {
  const { modalState, closeAuthModal } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"email" | "password">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "account": sign-up's answer, which can't tell a new account from an existing one.
  // "verification": right password on an unverified account. "reset": reset link sent.
  const [sent, setSent] = useState<Sent>(null);

  const reset = () => {
    setEmail("");
    setPassword("");
    setStep("email");
    setBusy(false);
    setError(null);
    setSent(null);
  };
  const close = () => {
    closeAuthModal();
    reset();
  };

  const oauth = async (provider: "discord" | "google") => {
    setBusy(true);
    setError(null);
    try {
      // On success the browser leaves for the provider, so the dialog stays busy.
      unwrap(await signIn.social({ provider, callbackURL: window.location.href }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Try again.");
      setBusy(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (step === "email") {
      setStep("password");
      return;
    }
    setBusy(true);
    try {
      const result = await signIn.email({ email, password });
      if (!result.error) {
        close();
        return;
      }
      const code = result.error.code;
      if (code === "INVALID_EMAIL_OR_PASSWORD" || code === "USER_NOT_FOUND") {
        // Unknown email, or a wrong password: sign-up either creates the account or,
        // for an existing one (including an imported creator), emails a password link.
        unwrap(await signUp.email({ email, password, name: email.split("@")[0] }));
        setSent("account");
      } else if (code === "EMAIL_NOT_VERIFIED") {
        setSent("verification");
      } else {
        setError(result.error.message || "Sign-in failed. Try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    setBusy(true);
    setError(null);
    try {
      unwrap(
        await authClient.requestPasswordReset({
          email,
          redirectTo: `${window.location.origin}/reset-password`,
        })
      );
      setSent("reset");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The reset email couldn't be sent.");
    } finally {
      setBusy(false);
    }
  };

  const title =
    sent === "reset" ? "Reset link sent" : sent ? "Check your email" : "Sign in to textures.gg";

  return (
    <Dialog
      open={modalState.isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={title}
      description={
        sent ? undefined : (modalState.message ?? "New here? The same steps create your account.")
      }
    >
      {sent ? (
        <div {...stylex.props(styles.body)}>
          <p {...stylex.props(styles.message)}>
            {sent === "account" && (
              <>
                We sent a link to <span {...stylex.props(styles.strong)}>{email}</span>. If
                you&apos;re new, it activates your account. If you already have one, including a
                creator account from ssbmtextures, it lets you set a password.
              </>
            )}
            {sent === "verification" && (
              <>
                Your account isn&apos;t verified yet. We sent a new link to{" "}
                <span {...stylex.props(styles.strong)}>{email}</span>.
              </>
            )}
            {sent === "reset" && (
              <>
                We sent a password reset link to{" "}
                <span {...stylex.props(styles.strong)}>{email}</span>. It expires in an hour.
              </>
            )}
          </p>
          <p {...stylex.props(styles.hint)}>Nothing arrived? Check your spam folder.</p>
          {sent === "account" && (
            <Button
              fullWidth
              onClick={() => {
                setSent(null);
                setPassword("");
              }}
            >
              Mistyped your password? Try again
            </Button>
          )}
          <Button variant="primary" fullWidth onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <div {...stylex.props(styles.body)}>
          <div {...stylex.props(styles.providers)}>
            <Button
              fullWidth
              icon={<DiscordIcon />}
              disabled={busy}
              onClick={() => oauth("discord")}
            >
              Continue with Discord
            </Button>
            <Button fullWidth icon={<GoogleIcon />} disabled={busy} onClick={() => oauth("google")}>
              Continue with Google
            </Button>
          </div>

          {EMAIL_PASSWORD_AUTH_ENABLED && (
            <>
              <span {...stylex.props(styles.divider)}>or</span>
              <form onSubmit={submit} {...stylex.props(styles.form)}>
                {step === "email" ? (
                  <TextField
                    label="Email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    required
                    disabled={busy}
                    // oxlint-disable-next-line jsx-a11y/no-autofocus -- the dialog opens for this field, and stepping back from the password returns to it.
                    autoFocus
                    onChange={(event) => setEmail(event.currentTarget.value)}
                  />
                ) : (
                  <>
                    <span {...stylex.props(styles.back)}>
                      <Button
                        variant="text"
                        icon={<ChevronLeftIcon size={16} />}
                        onClick={() => {
                          setStep("email");
                          setPassword("");
                          setError(null);
                        }}
                      >
                        <span {...stylex.props(styles.email)}>{email}</span>
                      </Button>
                    </span>
                    <TextField
                      label="Password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      required
                      minLength={8}
                      disabled={busy}
                      // oxlint-disable-next-line jsx-a11y/no-autofocus -- the email field it replaces held focus; without this the step change drops it.
                      autoFocus
                      description="New here? Choose a password of at least 8 characters to create your account."
                      onChange={(event) => setPassword(event.currentTarget.value)}
                    />
                  </>
                )}
                {error && (
                  <p role="alert" {...stylex.props(styles.error)}>
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  disabled={busy || (step === "email" ? !email : password.length === 0)}
                >
                  {step === "email" ? "Continue with email" : busy ? "Signing in…" : "Continue"}
                </Button>
                {step === "password" && (
                  <Button variant="ghost" fullWidth disabled={busy} onClick={forgot}>
                    Forgot password?
                  </Button>
                )}
              </form>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
