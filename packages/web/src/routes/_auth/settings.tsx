import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { displayName, LIMITS, validateUsername } from "@vgskins/shared";
import { parseResponse } from "hono/client";
import { type ReactNode, useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { DiscordIcon, GithubIcon, XIcon } from "@/ui/brand-icons";
import { layout } from "@/ui/patterns/layout";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { Button, ButtonLink, Switch, TextArea, TextField } from "@/ui/primitives";
import { color, font, radius, space, text, tracking } from "@/ui/tokens.stylex";

export const Route = createFileRoute("/_auth/settings")({
  loader: async () => ({ profile: await parseResponse(api.users.me.$get()) }),
  head: () => ({ meta: [{ title: "Settings - textures.gg" }] }),
  component: SettingsPage,
});

type Provider = "discord" | "github" | "twitter";

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.xl },
  form: { display: "flex", flexDirection: "column", gap: space.xl },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: space.md,
    paddingTop: space.lg,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: color.line,
  },
  sectionHead: { display: "flex", flexDirection: "column", gap: space.xxs },
  sectionTitle: { margin: 0, fontSize: text.h3, fontWeight: 800, letterSpacing: tracking.tight },
  sectionHint: { margin: 0, fontSize: text.md, color: color.muted },
  accounts: { display: "flex", flexDirection: "column", gap: space.xs, margin: 0, padding: 0 },
  account: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    listStyle: "none",
  },
  accountName: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    fontSize: text.md,
    fontWeight: 600,
  },
  accountStatus: { fontSize: text.sm, fontWeight: 400, color: color.muted },
  facts: {
    display: "grid",
    gridTemplateColumns: "max-content 1fr",
    columnGap: space.lg,
    rowGap: space.xs,
    margin: 0,
  },
  factLabel: { fontSize: text.md, color: color.muted },
  factValue: { margin: 0, fontSize: text.md, overflowWrap: "anywhere" },
  mono: { fontFamily: font.mono },
  actions: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.sm },
  saved: { fontSize: text.md, color: color.success },
  error: { margin: 0, fontSize: text.sm, color: color.danger },
});

function SettingsPage() {
  const { profile } = Route.useLoaderData();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState(profile.name);
  const [pronouns, setPronouns] = useState(profile.pronouns ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [website, setWebsite] = useState(profile.websiteUrl ?? "");
  const [shown, setShown] = useState<Record<Provider, boolean>>({
    discord: profile.showDiscord ?? false,
    github: profile.showGithub ?? false,
    twitter: profile.showTwitter ?? false,
  });
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const nameCheck = validateUsername(name);
  // The current name may be an imported one the rules no longer allow; only a change is checked.
  const nameError = name !== profile.name && !nameCheck.valid ? nameCheck.error : undefined;

  // After linking GitHub or X, copy the handle from the linked account. Only a
  // missing handle is filled, so there is nothing to ask for otherwise; a
  // failure leaves the handle unset, which is the state before the call.
  const missingHandle =
    (profile.hasGithub && !profile.githubUsername) ||
    (profile.hasTwitter && !profile.twitterHandle);
  useEffect(() => {
    if (!missingHandle) return;
    parseResponse(api.users.me["sync-socials"].$post())
      .then(() => router.invalidate())
      .catch((error: unknown) => console.warn("Could not copy linked account handles", error));
  }, [missingHandle, router]);

  const save = useMutation({
    mutationFn: async () => {
      // Empty strings are sent as they are, so clearing a field clears it.
      const res = await api.users.me.$put({
        json: {
          name: name === profile.name ? undefined : name,
          pronouns,
          bio,
          websiteUrl: website.trim(),
          showDiscord: shown.discord,
          showGithub: shown.github,
          showTwitter: shown.twitter,
        },
      });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: async () => {
      // The loader's profile feeds "View profile", which must follow a rename.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["user", "me"] }),
        router.invalidate(),
      ]);
      setSavedAt(Date.now());
    },
  });

  const accounts: { provider: Provider; label: string; icon: ReactNode; linked: boolean }[] = [
    {
      provider: "discord",
      label: "Discord",
      icon: <DiscordIcon />,
      linked: Boolean(profile.hasDiscord),
    },
    {
      provider: "github",
      label: "GitHub",
      icon: <GithubIcon />,
      linked: Boolean(profile.hasGithub),
    },
    { provider: "twitter", label: "X", icon: <XIcon />, linked: Boolean(profile.hasTwitter) },
  ];

  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader
        title="Settings"
        description="Your public profile and account."
        actions={
          <ButtonLink to="/users/$username" params={{ username: profile.name }}>
            View profile
          </ButtonLink>
        }
      />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!nameError) save.mutate();
        }}
        noValidate
        {...stylex.props(layout.narrow, styles.form)}
      >
        <section aria-labelledby="profile-heading" {...stylex.props(styles.section)}>
          <div {...stylex.props(styles.sectionHead)}>
            <h2 id="profile-heading" {...stylex.props(styles.sectionTitle)}>
              Profile
            </h2>
            <p {...stylex.props(styles.sectionHint)}>
              Shown on your profile and beside your packs.
            </p>
          </div>
          <TextField
            label="Username"
            value={name}
            maxLength={LIMITS.USERNAME_MAX}
            autoComplete="username"
            error={nameError}
            description={`Your profile address. Shown as ${displayName(name) || "your name"}.`}
            disabled={save.isPending}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <TextField
            label="Pronouns (optional)"
            value={pronouns}
            maxLength={LIMITS.PRONOUNS_MAX}
            placeholder="they/them"
            disabled={save.isPending}
            onChange={(event) => setPronouns(event.currentTarget.value)}
          />
          <TextArea
            label="Bio (optional)"
            value={bio}
            maxLength={LIMITS.BIO_MAX}
            rows={4}
            placeholder="What you make, your mains, where to find you."
            disabled={save.isPending}
            onChange={(event) => setBio(event.currentTarget.value)}
          />
          <TextField
            label="Website (optional)"
            type="url"
            value={website}
            placeholder="https://"
            autoComplete="url"
            disabled={save.isPending}
            onChange={(event) => setWebsite(event.currentTarget.value)}
          />
        </section>

        <section aria-labelledby="accounts-heading" {...stylex.props(styles.section)}>
          <div {...stylex.props(styles.sectionHead)}>
            <h2 id="accounts-heading" {...stylex.props(styles.sectionTitle)}>
              Linked accounts
            </h2>
            <p {...stylex.props(styles.sectionHint)}>
              Sign in with any of them, and choose which appear on your profile.
            </p>
          </div>
          <ul {...stylex.props(styles.accounts)}>
            {accounts.map((account) => (
              <li key={account.provider} {...stylex.props(styles.account)}>
                <span {...stylex.props(styles.accountName)}>
                  {account.icon}
                  {account.label}
                  <span {...stylex.props(styles.accountStatus)}>
                    {account.linked ? "Linked" : "Not linked"}
                  </span>
                </span>
                {account.linked ? (
                  <Switch
                    label="Show on profile"
                    checked={shown[account.provider]}
                    disabled={save.isPending}
                    onCheckedChange={(checked) =>
                      setShown((current) => ({ ...current, [account.provider]: checked }))
                    }
                  />
                ) : (
                  <Button
                    onClick={() =>
                      authClient.linkSocial({
                        provider: account.provider,
                        callbackURL: "/settings",
                      })
                    }
                  >
                    Link {account.label}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <div {...stylex.props(styles.actions)}>
          <Button type="submit" variant="primary" disabled={save.isPending || Boolean(nameError)}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
          <span aria-live="polite" {...stylex.props(styles.saved)}>
            {savedAt && !save.isPending && !save.isError ? "Saved" : ""}
          </span>
        </div>
        {save.isError && (
          <p role="alert" {...stylex.props(styles.error)}>
            {save.error.message || "Your changes couldn't be saved."}
          </p>
        )}

        <section aria-labelledby="account-heading" {...stylex.props(styles.section)}>
          <h2 id="account-heading" {...stylex.props(styles.sectionTitle)}>
            Account
          </h2>
          <dl {...stylex.props(styles.facts)}>
            <dt {...stylex.props(styles.factLabel)}>Email</dt>
            <dd {...stylex.props(styles.factValue, styles.mono)}>{profile.email}</dd>
            <dt {...stylex.props(styles.factLabel)}>Member since</dt>
            <dd {...stylex.props(styles.factValue)}>
              {new Date(profile.createdAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </dd>
          </dl>
        </section>
      </form>
    </div>
  );
}
