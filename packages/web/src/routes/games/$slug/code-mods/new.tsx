import * as stylex from "@stylexjs/stylex";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { createCodeModSchema } from "@vgskins/shared";
import { parseResponse } from "hono/client";
import { type FormEvent, useState } from "react";
import { api, apiError } from "@/lib/api";
import { requireFeatureFlag } from "@/lib/feature-flags";
import { sessionQuery } from "@/lib/session";
import { layout } from "@/ui/patterns/layout";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { Button, TextArea, TextField } from "@/ui/primitives";
import { color, space, text } from "@/ui/tokens.stylex";

export const Route = createFileRoute("/games/$slug/code-mods/new")({
  beforeLoad: async ({ context, params }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    if (!session?.user) throw redirect({ to: "/games/$slug/code-mods", params });
  },
  loader: ({ context }) => requireFeatureFlag(context.queryClient, "codeMods"),
  head: () => ({ meta: [{ title: "New code mod - textures.gg" }] }),
  component: NewCodeMod,
});

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.xl },
  form: { display: "flex", flexDirection: "column", gap: space.lg },
  error: { margin: 0, fontSize: text.sm, color: color.danger },
  actions: { display: "flex", gap: space.sm },
});

function NewCodeMod() {
  const navigate = useNavigate();
  const { slug: game } = Route.useParams();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const parsed = createCodeModSchema.safeParse({
    slug,
    name,
    description: description || undefined,
  });
  const slugError =
    slug && !parsed.success
      ? parsed.error.issues.find((i) => i.path[0] === "slug")?.message
      : undefined;

  const create = useMutation({
    mutationFn: async () => {
      if (!parsed.success) return null;
      const res = await api["code-mods"].$post({ json: parsed.data });
      if (!res.ok) throw await apiError(res);
      return parseResponse(res);
    },
    onSuccess: (mod) => {
      if (mod) {
        void navigate({
          to: "/games/$slug/code-mods/$modSlug",
          params: { slug: game, modSlug: mod.slug },
        });
      }
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader title="New code mod" />
      <form onSubmit={submit} {...stylex.props(layout.narrow, styles.form)}>
        <TextField
          label="Mod id"
          placeholder="you.mod-name"
          value={slug}
          onChange={(event) => setSlug(event.currentTarget.value)}
          error={slugError}
          autoComplete="off"
          spellCheck={false}
        />
        <TextField
          label="Name"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <TextArea
          label="Description"
          value={description}
          maxLength={2000}
          onChange={(event) => setDescription(event.currentTarget.value)}
        />
        {create.error && <p {...stylex.props(styles.error)}>{create.error.message}</p>}
        <div {...stylex.props(styles.actions)}>
          <Button type="submit" variant="primary" disabled={!parsed.success || create.isPending}>
            Create
          </Button>
        </div>
      </form>
    </div>
  );
}
