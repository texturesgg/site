import * as stylex from "@stylexjs/stylex";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { codeModRangeSchema, codeModSetNameSchema, putCodeModSetSchema } from "@vgskins/shared";
import { type InferResponseType, parseResponse } from "hono/client";
import { useState } from "react";
import { api, apiError } from "@/lib/api";
import { featureFlag } from "@/lib/feature-flags";
import { CloseIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/patterns/EmptyState";
import { Button, IconButton, Select, TextArea, TextField } from "@/ui/primitives";
import { color, font, radius, space, text } from "@/ui/tokens.stylex";

type RegistrySet = InferResponseType<typeof api.registry.sets.$get, 200>[number];
type SetMod = { id: string; range: string };

export const Route = createFileRoute("/_admin/sets")({
  beforeLoad: ({ context }) => {
    if (context.role !== "admin") throw redirect({ to: "/admin" });
  },
  loader: async ({ context }) => {
    if (!(await featureFlag(context.queryClient, "codeMods"))) throw redirect({ to: "/admin" });
    const [sets, mods] = await Promise.all([
      // Fresh, not the public minute-long cache, so a save shows at once.
      parseResponse(api.registry.sets.$get(undefined, { init: { cache: "no-store" } })),
      parseResponse(api.registry.mods.$get({ query: { pageSize: "100" } })),
    ]);
    return { sets, mods: mods.items };
  },
  head: () => ({ meta: [{ title: "Sets - textures.gg" }] }),
  component: SetsPage,
});

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.lg },
  bar: { display: "flex", justifyContent: "flex-end" },
  list: { display: "flex", flexDirection: "column", gap: space.sm },
  card: {
    maxWidth: "760px",
    display: "flex",
    flexDirection: "column",
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  head: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: space.sm },
  title: { margin: 0, fontSize: text.lg, fontWeight: 700 },
  meta: { margin: 0, fontSize: text.sm, color: color.muted },
  mono: { fontFamily: font.mono },
  mods: { display: "flex", flexDirection: "column", gap: space.xs, margin: 0, padding: 0 },
  mod: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 160px auto",
    alignItems: "center",
    gap: space.sm,
    listStyle: "none",
  },
  modName: { display: "flex", flexDirection: "column", minWidth: 0 },
  order: { display: "flex", gap: space.xxs },
  add: { display: "flex", alignItems: "flex-end", gap: space.sm },
  addSelect: { flexGrow: 1, minWidth: 0 },
  actions: { display: "flex", alignItems: "center", gap: space.sm },
  error: { margin: 0, fontSize: text.sm, color: color.danger },
});

/** How installers compare a set: its mods and ranges, in any order. */
function key(mods: readonly SetMod[]): string {
  return mods
    .map((mod) => `${mod.id} ${mod.range}`)
    .sort()
    .join("\n");
}

function SetsPage() {
  const { sets, mods } = Route.useLoaderData();
  const [creating, setCreating] = useState(false);
  const names = new Map(mods.map((mod) => [mod.id, mod.name]));
  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.bar)}>
        {!creating && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            New set
          </Button>
        )}
      </div>
      <div {...stylex.props(styles.list)}>
        {creating && <SetEditor mods={mods} names={names} onDone={() => setCreating(false)} />}
        {sets.length === 0 && !creating ? (
          <EmptyState title="No sets yet" />
        ) : (
          sets.map((set) => (
            <SetEditor key={`${set.name}@${set.version}`} set={set} mods={mods} names={names} />
          ))
        )}
      </div>
    </div>
  );
}

function SetEditor({
  set,
  mods,
  names,
  onDone,
}: {
  /** The set as saved; none for a new one. */
  set?: RegistrySet;
  mods: readonly { id: string; name: string; version: string }[];
  names: ReadonlyMap<string, string>;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(set?.name ?? "");
  const [title, setTitle] = useState(set?.title ?? "");
  const [description, setDescription] = useState(set?.description ?? "");
  const [list, setList] = useState<SetMod[]>(set?.mods ?? []);
  const [adding, setAdding] = useState("");

  const nameError =
    !set && name ? codeModSetNameSchema.safeParse(name).error?.issues[0]?.message : undefined;
  const parsed = putCodeModSetSchema.safeParse({ title, description, mods: list });
  const listChanged = !set || key(list) !== key(set.mods);
  const dirty =
    !set || title !== set.title || description !== (set.description ?? "") || listChanged;
  const nextVersion = set ? set.version + (listChanged ? 1 : 0) : 1;

  const save = useMutation({
    mutationFn: async () => {
      if (!parsed.success) return;
      const res = await api.admin["code-mods"].sets[":name"].$put({
        param: { name: set?.name ?? name },
        json: parsed.data,
      });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: async () => {
      await router.invalidate();
      onDone?.();
    },
  });

  const move = (index: number, by: number) =>
    setList((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item);
      return next;
    });

  // A new entry takes releases compatible with the newest, as the sets so far do.
  const defaultRange = (id: string) => {
    const version = mods.find((mod) => mod.id === id)?.version;
    const [major, minor] = version?.split(".") ?? [];
    return major === undefined ? "*" : major === "0" ? `^0.${minor}` : `^${major}`;
  };

  const addable = mods.filter((mod) => !list.some((entry) => entry.id === mod.id));

  return (
    <section {...stylex.props(styles.card)}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{set ? set.title : "New set"}</h2>
        {set && (
          <p {...stylex.props(styles.meta)}>
            <span {...stylex.props(styles.mono)}>{set.name}</span> · version {set.version}
          </p>
        )}
      </div>

      {!set && (
        <TextField
          label="Name"
          placeholder="competitive"
          value={name}
          error={nameError}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setName(event.currentTarget.value)}
        />
      )}
      <TextField
        label="Title"
        value={title}
        onChange={(event) => setTitle(event.currentTarget.value)}
      />
      <TextArea
        label="Description"
        value={description}
        maxLength={2000}
        onChange={(event) => setDescription(event.currentTarget.value)}
      />

      <ul aria-label="Mods" {...stylex.props(styles.mods)}>
        {list.map((entry, index) => {
          const rangeError = codeModRangeSchema.safeParse(entry.range).error?.issues[0]?.message;
          return (
            <li key={entry.id} {...stylex.props(styles.mod)}>
              <span {...stylex.props(styles.modName)}>
                <span>{names.get(entry.id) ?? entry.id}</span>
                <span {...stylex.props(styles.meta, styles.mono)}>{entry.id}</span>
              </span>
              <TextField
                label={`Range for ${entry.id}`}
                hideLabel
                value={entry.range}
                error={rangeError}
                spellCheck={false}
                onChange={(event) => {
                  const range = event.currentTarget.value;
                  setList((current) =>
                    current.map((item, i) => (i === index ? { ...item, range } : item))
                  );
                }}
              />
              <span {...stylex.props(styles.order)}>
                <Button
                  variant="ghost"
                  disabled={index === 0}
                  aria-label={`Move ${entry.id} up`}
                  onClick={() => move(index, -1)}
                >
                  Up
                </Button>
                <Button
                  variant="ghost"
                  disabled={index === list.length - 1}
                  aria-label={`Move ${entry.id} down`}
                  onClick={() => move(index, 1)}
                >
                  Down
                </Button>
                <IconButton
                  label={`Remove ${entry.id}`}
                  icon={<CloseIcon />}
                  onClick={() => setList((current) => current.filter((_, i) => i !== index))}
                />
              </span>
            </li>
          );
        })}
      </ul>

      {addable.length > 0 && (
        <div {...stylex.props(styles.add)}>
          <div {...stylex.props(styles.addSelect)}>
            <Select
              label="Add a mod"
              fullWidth
              value={adding}
              placeholder="Pick a mod"
              options={addable.map((mod) => ({ value: mod.id, label: mod.name, meta: mod.id }))}
              onValueChange={setAdding}
            />
          </div>
          <Button
            disabled={!adding}
            onClick={() => {
              setList((current) => [...current, { id: adding, range: defaultRange(adding) }]);
              setAdding("");
            }}
          >
            Add
          </Button>
        </div>
      )}

      {save.error && <p {...stylex.props(styles.error)}>{save.error.message}</p>}
      {!parsed.success && (set ? dirty : title !== "" || list.length > 0) && (
        <p {...stylex.props(styles.error)}>{parsed.error.issues[0]?.message}</p>
      )}
      <div {...stylex.props(styles.actions)}>
        <Button
          variant="primary"
          disabled={
            !dirty || !parsed.success || (!set && !!nameError) || (!set && !name) || save.isPending
          }
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        {onDone && <Button onClick={onDone}>Cancel</Button>}
        {dirty && set && (
          <span {...stylex.props(styles.meta)}>
            {listChanged ? `Saves as version ${nextVersion}` : "Same version, new wording"}
          </span>
        )}
      </div>
    </section>
  );
}
