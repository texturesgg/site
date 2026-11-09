import * as stylex from "@stylexjs/stylex";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { api, apiError } from "@/lib/api";
import { Button, Switch, TextField } from "@/ui/primitives";
import { color, radius, space, text } from "@/ui/tokens.stylex";

const styles = stylex.create({
  card: {
    order: 3,
    display: "flex",
    flexDirection: "column",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  heading: { margin: 0, fontSize: text.md, fontWeight: 700 },
  row: { display: "flex", alignItems: "center", gap: space.sm },
  muted: { fontSize: text.sm, color: color.muted },
  error: { margin: 0, fontSize: text.sm, color: color.danger },
});

/**
 * Who the registry says publishes a mod (a name in place of its maker's) and
 * whether textures.gg vouches for it. Admins only.
 */
export function PublisherControls({
  modId,
  author,
  publisher,
}: {
  /** The mod's internal id, which admin routes take. */
  modId: string;
  author: string;
  publisher: { name: string; official: boolean };
}) {
  const router = useRouter();
  // What was last saved: the listing is cached for a minute, so a save
  // becomes the baseline here rather than waiting for it.
  const [saved, setSaved] = useState({
    name: publisher.name === author ? "" : publisher.name,
    official: publisher.official,
  });
  const [name, setName] = useState(saved.name);
  const [official, setOfficial] = useState(saved.official);
  const dirty = name.trim() !== saved.name || official !== saved.official;

  const save = useMutation({
    mutationFn: async () => {
      const res = await api.admin["code-mods"][":id"].publisher.$put({
        param: { id: modId },
        json: { name: name.trim() || null, official },
      });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: () => {
      setSaved({ name: name.trim(), official });
      void router.invalidate();
    },
  });

  return (
    <section {...stylex.props(styles.card)}>
      <h2 {...stylex.props(styles.heading)}>Publisher</h2>
      <TextField
        label="Shown as"
        placeholder={author}
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <Switch label="Official" checked={official} onCheckedChange={setOfficial} />
      {save.error && <p {...stylex.props(styles.error)}>{save.error.message}</p>}
      <div {...stylex.props(styles.row)}>
        <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        {save.isSuccess && !dirty && <span {...stylex.props(styles.muted)}>Saved</span>}
      </div>
    </section>
  );
}
