import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import { encode } from "uqr";
import { authClient } from "@/lib/auth-client";
import { Button, TextAnchor, TextField } from "../primitives";
import { color, font, radius, space, text } from "../tokens.stylex";

// Two-factor sign-in, which moderators and admins need: the code a signed-in
// session or an email sign-in asks for, and turning it on.

const styles = stylex.create({
  form: { display: "flex", flexDirection: "column", gap: space.sm },
  body: { display: "flex", flexDirection: "column", gap: space.md, maxWidth: "28rem" },
  heading: { margin: 0, fontSize: text.lg, fontWeight: 600 },
  message: { margin: 0, fontSize: text.md, lineHeight: 1.5, color: color.muted },
  error: { margin: 0, fontSize: text.sm, color: color.danger },
  key: {
    margin: 0,
    fontFamily: font.mono,
    fontSize: text.md,
    wordBreak: "break-all",
    color: color.text,
  },
  qr: { display: "block", width: "200px", height: "200px", borderRadius: radius.md },
  codes: {
    display: "grid",
    gridTemplateColumns: "repeat(2, max-content)",
    columnGap: space.lg,
    margin: 0,
    padding: 0,
    listStyle: "none",
    fontFamily: font.mono,
    fontSize: text.md,
    color: color.text,
  },
});

/** Asks for the authenticator app's code, or a backup code. */
export function TwoFactorCodeForm({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const trimmed = code.trim();
    const result = backup
      ? await authClient.twoFactor.verifyBackupCode({ code: trimmed })
      : await authClient.twoFactor.verifyTotp({ code: trimmed });
    setBusy(false);
    if (result.error) {
      setError(result.error.message || "That code didn't work. Try again.");
      return;
    }
    onDone();
  };

  return (
    <form onSubmit={submit} {...stylex.props(styles.form)}>
      <TextField
        label={backup ? "Backup code" : "Code from your authenticator app"}
        autoComplete="one-time-code"
        inputMode={backup ? "text" : "numeric"}
        value={code}
        required
        disabled={busy}
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the form opens for this field.
        autoFocus
        onChange={(event) => setCode(event.currentTarget.value)}
      />
      {error && (
        <p role="alert" {...stylex.props(styles.error)}>
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={busy || code.trim() === ""}>
        {busy ? "Checking…" : "Continue"}
      </Button>
      <Button
        variant="ghost"
        disabled={busy}
        onClick={() => {
          setBackup(!backup);
          setCode("");
          setError(null);
        }}
      >
        {backup ? "Use your authenticator app" : "Use a backup code"}
      </Button>
    </form>
  );
}

/** The quiet margin QR readers expect around the code, in modules. */
const QR_MARGIN = 4;

/**
 * A QR code drawn in the browser, dark on light so every reader scans it. The
 * value never leaves the page.
 */
function QrCode({ value, label }: { value: string; label: string }) {
  const { data, size } = encode(value, { ecc: "M", border: 0 });
  const span = size + QR_MARGIN * 2;
  let path = "";
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) path += `M${x + QR_MARGIN} ${y + QR_MARGIN}h1v1h-1z`;
    })
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}" shape-rendering="crispEdges"><rect width="${span}" height="${span}" fill="#FFFFFF"/><path d="${path}" fill="#000000"/></svg>`;
  return (
    <img
      src={`data:image/svg+xml,${encodeURIComponent(svg)}`}
      alt={label}
      {...stylex.props(styles.qr)}
    />
  );
}

/** Turns two-factor sign-in on: the code or key for the app, backup codes, then a code. */
export function TwoFactorSetup({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ uri: string; codes: string[] } | null>(null);

  const start = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await authClient.twoFactor.enable({ password: password || undefined });
    setBusy(false);
    if (result.error) {
      setError(result.error.message || "Couldn't start two-factor sign-in. Try again.");
      return;
    }
    setSetup({ uri: result.data.totpURI, codes: result.data.backupCodes });
  };

  if (!setup) {
    return (
      <form onSubmit={start} {...stylex.props(styles.form)}>
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          disabled={busy}
          description="Only if you sign in with email and a password."
          onChange={(event) => setPassword(event.currentTarget.value)}
        />
        {error && (
          <p role="alert" {...stylex.props(styles.error)}>
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Starting…" : "Turn on two-factor sign-in"}
        </Button>
      </form>
    );
  }

  const key = new URL(setup.uri).searchParams.get("secret") ?? "";
  return (
    <div {...stylex.props(styles.body)}>
      <p {...stylex.props(styles.message)}>
        Scan this with your authenticator app, or{" "}
        <TextAnchor href={setup.uri}>open it in the app</TextAnchor> on your phone.
      </p>
      <QrCode value={setup.uri} label="QR code for your authenticator app" />
      <p {...stylex.props(styles.message)}>Can't scan it? Enter this key instead.</p>
      <p {...stylex.props(styles.key)}>{key}</p>
      <p {...stylex.props(styles.message)}>
        Save these backup codes somewhere safe. Each one works once if you lose your phone.
      </p>
      <ul {...stylex.props(styles.codes)}>
        {setup.codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <p {...stylex.props(styles.message)}>Then enter the code the app shows.</p>
      <TwoFactorCodeForm onDone={onDone} />
    </div>
  );
}

/**
 * What a moderator sees until this session proved two-factor sign-in: the
 * code, or turning it on first.
 */
export function TwoFactorGate({ enabled, onDone }: { enabled: boolean; onDone: () => void }) {
  return (
    <section {...stylex.props(styles.body)}>
      <h2 {...stylex.props(styles.heading)}>Two-factor sign-in</h2>
      <p {...stylex.props(styles.message)}>
        {enabled
          ? "Enter the code from your authenticator app to moderate."
          : "Moderating needs a code from an authenticator app as well as your sign-in."}
      </p>
      {enabled ? <TwoFactorCodeForm onDone={onDone} /> : <TwoFactorSetup onDone={onDone} />}
    </section>
  );
}
