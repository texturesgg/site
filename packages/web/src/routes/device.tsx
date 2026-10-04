import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { authClient } from "@/lib/auth-client";
import { EmptyState } from "@/ui/patterns/EmptyState";
import { layout } from "@/ui/patterns/layout";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { Button, TextField } from "@/ui/primitives";
import { color, font, radius, space, text } from "@/ui/tokens.stylex";

interface DeviceSearch {
  user_code?: string;
}

/** `tgg login` sends people here with the code it shows in the terminal. */
export const Route = createFileRoute("/device")({
  validateSearch: (search: Record<string, unknown>): DeviceSearch => ({
    user_code: typeof search.user_code === "string" ? search.user_code : undefined,
  }),
  head: () => ({ meta: [{ title: "Sign in to tgg - textures.gg" }] }),
  component: DevicePage,
});

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.xl },
  body: { display: "flex", flexDirection: "column", gap: space.lg },
  form: { display: "flex", flexDirection: "column", gap: space.md },
  code: {
    alignSelf: "flex-start",
    paddingBlock: space.sm,
    paddingInline: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    fontFamily: font.mono,
    fontSize: text.h2,
    color: color.text,
  },
  note: { margin: 0, fontSize: text.md, color: color.muted },
  actions: { display: "flex", flexWrap: "wrap", gap: space.sm },
  error: { margin: 0, fontSize: text.sm, color: color.danger },
});

/** A code the way the terminal shows it: ABCD-EFGH. */
function formatCode(code: string) {
  const clean = code.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

function DevicePage() {
  const { user_code } = Route.useSearch();
  const { isAuthenticated, isLoading, openAuthModal } = useAuth();

  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader title="Sign in to tgg" />
      <div {...stylex.props(layout.narrow, styles.body)}>
        {isLoading ? null : !isAuthenticated ? (
          <>
            <p {...stylex.props(styles.note)}>
              Sign in to textures.gg, then confirm the code from your terminal.
            </p>
            <div {...stylex.props(styles.actions)}>
              <Button variant="primary" onClick={() => openAuthModal("signIn")}>
                Sign in
              </Button>
            </div>
          </>
        ) : user_code ? (
          <Confirm code={formatCode(user_code)} />
        ) : (
          <EnterCode />
        )}
      </div>
    </div>
  );
}

function EnterCode() {
  const navigate = useNavigate({ from: Route.fullPath });
  const [code, setCode] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (code.trim()) void navigate({ search: { user_code: formatCode(code) } });
  };
  return (
    <form onSubmit={submit} {...stylex.props(styles.form)}>
      <TextField
        label="Code"
        description="The code `tgg login` shows in your terminal."
        value={code}
        autoComplete="off"
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the page holds this one field.
        autoFocus
        onChange={(event) => setCode(event.currentTarget.value)}
      />
      <div {...stylex.props(styles.actions)}>
        <Button type="submit" variant="primary" disabled={!code.trim()}>
          Continue
        </Button>
      </div>
    </form>
  );
}

function Confirm({ code }: { code: string }) {
  // Looking the code up as the signed-in user ties it to them; only they can
  // then approve it.
  const lookup = useQuery({
    queryKey: ["device", code],
    queryFn: async () => {
      const { data, error } = await authClient.device({ query: { user_code: code } });
      if (error) throw new Error(error.error_description);
      return data;
    },
    retry: false,
  });
  const decide = useMutation({
    mutationFn: async (decision: "approve" | "deny") => {
      const { error } =
        decision === "approve"
          ? await authClient.device.approve({ userCode: code })
          : await authClient.device.deny({ userCode: code });
      if (error) throw new Error("That didn't work. Run tgg login again.");
      return decision;
    },
  });

  if (decide.data === "approve") {
    return (
      <EmptyState
        title="You're signed in"
        body="You can close this and go back to your terminal."
      />
    );
  }
  if (decide.data === "deny") {
    return <EmptyState title="Cancelled" body="tgg wasn't signed in." />;
  }
  if (lookup.isError || (lookup.data && lookup.data.status !== "pending")) {
    return (
      <EmptyState
        title="That code didn't work"
        body="It may have expired or been used already. Run tgg login again for a new one."
      />
    );
  }

  return (
    <>
      <p {...stylex.props(styles.note)}>Check that this matches the code in your terminal.</p>
      <span {...stylex.props(styles.code)}>{code}</span>
      {decide.isError && (
        <p role="alert" {...stylex.props(styles.error)}>
          {decide.error.message}
        </p>
      )}
      <div {...stylex.props(styles.actions)}>
        <Button
          variant="primary"
          disabled={!lookup.data || decide.isPending}
          onClick={() => decide.mutate("approve")}
        >
          Sign in to tgg
        </Button>
        <Button disabled={!lookup.data || decide.isPending} onClick={() => decide.mutate("deny")}>
          Cancel
        </Button>
      </div>
    </>
  );
}
