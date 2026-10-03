import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { displayName, LIMITS, validateUsername } from "@vgskins/shared";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { api, apiError } from "@/lib/api";
import { layout } from "@/ui/patterns/layout";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { Button, TextArea, TextField } from "@/ui/primitives";
import { color, radius, space, text } from "@/ui/tokens.stylex";

export const Route = createFileRoute("/_auth/onboarding")({
  head: () => ({ meta: [{ title: "Welcome - textures.gg" }] }),
  component: OnboardingPage,
});

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.xl },
  form: { display: "flex", flexDirection: "column", gap: space.md },
  notice: {
    display: "flex",
    flexDirection: "column",
    gap: space.xxs,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  noticeTitle: { margin: 0, fontSize: text.lg, fontWeight: 700 },
  noticeBody: { margin: 0, fontSize: text.md, lineHeight: 1.5, color: color.muted },
  error: { margin: 0, fontSize: text.sm, color: color.danger },
});

function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // The _auth route loads the session before rendering, so the name is ready here;
  // useAuth()'s profile query may still be loading on a direct visit.
  const { user: sessionUser } = Route.useRouteContext();
  const [name, setName] = useState(sessionUser.name);
  const [pronouns, setPronouns] = useState("");
  const [bio, setBio] = useState("");
  const returning = user?.source === "ssbmtextures";

  // Keeping the current name is always allowed (an imported name may predate the rules).
  const check = validateUsername(name);
  const nameError = name !== sessionUser.name && !check.valid ? check.error : undefined;

  const finish = useMutation({
    mutationFn: async () => {
      const res = await api.users.me.onboarding.$post({
        json: { name, bio: bio || undefined, pronouns: pronouns || undefined },
      });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user", "me"] });
      navigate({ to: "/" });
      if (returning) {
        toast("Welcome back", {
          description: "Your ssbmtextures account is linked, with all your packs.",
          duration: 8000,
        });
      }
    },
  });

  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader
        title={returning ? "Welcome back" : "Welcome to textures.gg"}
        description="Choose how you appear on the site. You can change all of this later in settings."
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!nameError) finish.mutate();
        }}
        noValidate
        {...stylex.props(layout.narrow, styles.form)}
      >
        {returning && (
          <div role="note" {...stylex.props(styles.notice)}>
            <p {...stylex.props(styles.noticeTitle)}>Your ssbmtextures packs are here</p>
            <p {...stylex.props(styles.noticeBody)}>
              This account was imported from ssbmtextures, so your packs are already on your
              profile. Keep your name or pick a new one.
            </p>
          </div>
        )}
        <TextField
          label="Username"
          value={name}
          required
          autoComplete="username"
          error={nameError}
          description={`Your profile address. Shown as ${displayName(name) || "your name"}.`}
          disabled={finish.isPending}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <TextField
          label="Pronouns (optional)"
          value={pronouns}
          maxLength={LIMITS.PRONOUNS_MAX}
          placeholder="they/them"
          disabled={finish.isPending}
          onChange={(event) => setPronouns(event.currentTarget.value)}
        />
        <TextArea
          label="Bio (optional)"
          value={bio}
          maxLength={LIMITS.BIO_MAX}
          rows={3}
          placeholder="What you make, your mains, where to find you."
          disabled={finish.isPending}
          onChange={(event) => setBio(event.currentTarget.value)}
        />
        {finish.isError && (
          <p role="alert" {...stylex.props(styles.error)}>
            {finish.error.message || "Setup couldn't be finished. Try again."}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={finish.isPending || Boolean(nameError) || !name}
        >
          {finish.isPending ? "Saving…" : "Finish setup"}
        </Button>
      </form>
    </div>
  );
}
