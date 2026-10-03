import { Turnstile as TurnstileWidget } from "@marsidev/react-turnstile";
import * as stylex from "@stylexjs/stylex";
import { color, text } from "@/ui/tokens.stylex";

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";

/** The API's answer when it has TURNSTILE_SECRET and the request carried no token. */
export const VERIFICATION_REQUIRED = "Bot verification required";

const styles = stylex.create({
  notice: { margin: 0, fontSize: text.sm, color: color.danger },
});

interface TurnstileFieldProps {
  /** Called with the token when verification succeeds, or null on failure/expiry */
  onTokenChange: (token: string | null) => void;
  /** The API refused a request for want of verification. */
  verificationRequired?: boolean;
  className?: string;
}

export function TurnstileField({
  onTokenChange,
  verificationRequired = false,
  className,
}: TurnstileFieldProps) {
  if (!SITE_KEY) {
    // The API verifies but this build has no widget to show: a deployment
    // mismatch the uploader cannot fix, so say what is missing.
    return verificationRequired ? (
      <p role="alert" {...stylex.props(styles.notice)}>
        Uploads are paused: this site build has no Turnstile key (VITE_TURNSTILE_SITE_KEY) to match
        the API's TURNSTILE_SECRET.
      </p>
    ) : null;
  }

  return (
    <TurnstileWidget
      siteKey={SITE_KEY}
      onSuccess={(token) => onTokenChange(token)}
      onError={() => onTokenChange(null)}
      onExpire={() => onTokenChange(null)}
      options={{ theme: "dark", size: "flexible" }}
      className={className}
    />
  );
}
