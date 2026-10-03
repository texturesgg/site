import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { DownloadIcon, FiltersIcon, HeartIcon, UploadIcon } from "@/ui/icons";
import { paper, paperShadow } from "@/ui/themes";
import {
  Badge,
  Button,
  ButtonLink,
  Checkbox,
  CheckboxGroup,
  ConfirmDialog,
  Dialog,
  IconButton,
  MenuItem,
  MenuLink,
  MenuPanel,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
  PopoverPanel,
  PopoverRoot,
  PopoverTrigger,
  RadioGroup,
  SearchField,
  Select,
  Sheet,
  Tag,
  TextArea,
  TextField,
  ToggleGroup,
} from "@/ui/primitives";
import { color, font, radius, space, text, tracking } from "@/ui/tokens.stylex";
import { PRIMARY_GAME_SLUG } from "@vgskins/shared";

// An unlinked review page for the Gallery primitives (docs/DESIGN_SYSTEM.md).
export const Route = createFileRoute("/design-system")({
  head: () => ({
    meta: [{ title: "Design system - textures.gg" }, { name: "robots", content: "noindex" }],
  }),
  component: DesignSystemPage,
});

const styles = stylex.create({
  page: {
    minHeight: "100vh",
    backgroundColor: color.bg,
    color: color.text,
    fontFamily: font.sans,
    paddingBlock: space.xxl,
    paddingInline: { default: space.xxl, "@media (max-width: 640px)": space.md },
  },
  inner: {
    maxWidth: "1100px",
    marginInline: "auto",
    display: "flex",
    flexDirection: "column",
    gap: space.xxl,
  },
  h1: {
    margin: 0,
    fontSize: text.display,
    fontWeight: 800,
    letterSpacing: tracking.tighter,
    lineHeight: 1,
  },
  lede: {
    margin: 0,
    marginTop: space.sm,
    fontSize: text.lg,
    lineHeight: 1.6,
    color: color.muted,
    maxWidth: "640px",
  },
  section: { display: "flex", flexDirection: "column", gap: space.md },
  h2: { margin: 0, fontSize: text.h2, fontWeight: 800, letterSpacing: tracking.tight },
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.sm },
  swatches: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
    gap: space.sm,
  },
  swatch: { display: "flex", flexDirection: "column", gap: space.xs, fontSize: text.sm },
  chip: {
    height: "64px",
    borderRadius: radius.md,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: color.line,
  },
  mono: { fontFamily: font.mono, fontSize: text.xs, color: color.muted },
  typeRow: {
    display: "flex",
    alignItems: "baseline",
    gap: space.md,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: color.line,
    paddingBottom: space.xs,
  },
  fields: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: space.md,
  },
  popoverBody: {
    paddingInline: space.xs,
    paddingBlock: space.xs,
    maxHeight: "320px",
    overflowY: "auto",
  },
  popoverSearch: { paddingInline: space.md, paddingTop: space.sm },
  popoverFooter: {
    display: "flex",
    justifyContent: "space-between",
    paddingBlock: space.sm,
    paddingInline: space.md,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: color.lineStrong,
  },
  body: { margin: 0, fontSize: text.md, lineHeight: 1.6, color: color.muted },
});

const swatchStyles = stylex.create({
  bg: { backgroundColor: color.bg },
  surface: { backgroundColor: color.surface },
  raise: { backgroundColor: color.raise },
  text: { backgroundColor: color.text },
  muted: { backgroundColor: color.muted },
  line: { backgroundColor: color.line },
  lineStrong: { backgroundColor: color.lineStrong },
  accent: { backgroundColor: color.accent },
  accentText: { backgroundColor: color.accentText },
  onAccent: { backgroundColor: color.onAccent },
  danger: { backgroundColor: color.danger },
  onDanger: { backgroundColor: color.onDanger },
  success: { backgroundColor: color.success },
});

const typeStyles = stylex.create({
  hero: { fontSize: text.hero, fontWeight: 800, letterSpacing: tracking.tighter, lineHeight: 0.95 },
  display: {
    fontSize: text.display,
    fontWeight: 800,
    letterSpacing: tracking.tighter,
    lineHeight: 1,
  },
  h1: { fontSize: text.h1, fontWeight: 800, letterSpacing: tracking.tighter },
  h2: { fontSize: text.h2, fontWeight: 800, letterSpacing: tracking.tight },
  h3: { fontSize: text.h3, fontWeight: 700, letterSpacing: tracking.tight },
  body: { fontSize: text.lg, lineHeight: 1.6 },
  small: { fontSize: text.sm, color: color.muted },
  mono: { fontFamily: font.mono, fontSize: text.sm },
});

const characters = [
  "Captain Falcon",
  "Falco",
  "Fox",
  "Jigglypuff",
  "Marth",
  "Peach",
  "Sheik",
  "Young Link",
];
const sortOptions = [
  { value: "liked", label: "Most liked" },
  { value: "newest", label: "Newest" },
  { value: "downloads", label: "Most downloaded" },
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section {...stylex.props(styles.section)}>
      <h2 {...stylex.props(styles.h2)}>{title}</h2>
      {children}
    </section>
  );
}

/** Apply a palette to <html> while this page is open (see Themes in the design doc). */
function usePalette(palette: "gallery" | "paper") {
  useEffect(() => {
    if (palette === "gallery") return;
    const classes = (stylex.props(paper, paperShadow).className ?? "").split(" ").filter(Boolean);
    document.documentElement.classList.add(...classes);
    return () => document.documentElement.classList.remove(...classes);
  }, [palette]);
}

function DesignSystemPage() {
  const [palette, setPalette] = useState<"gallery" | "paper">("gallery");
  usePalette(palette);
  const [selected, setSelected] = useState<string[]>(["Fox", "Falco"]);
  const [sort, setSort] = useState<(typeof sortOptions)[number]["value"]>("liked");
  const [liked, setLiked] = useState(false);
  const [reason, setReason] = useState<"spam" | "broken" | null>(null);
  const [costume, setCostume] = useState("Nr");
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.inner)}>
        <header>
          <h1 {...stylex.props(styles.h1)}>Gallery design system</h1>
          <p {...stylex.props(styles.lede)}>
            Tokens and primitives from docs/DESIGN_SYSTEM.md. Every control here is keyboard
            operable; tab through the page to check focus rings.
          </p>
          <ToggleGroup
            label="Palette"
            value={palette}
            options={[
              { value: "gallery", label: "Gallery" },
              { value: "paper", label: "Paper" },
            ]}
            onValueChange={setPalette}
          />
        </header>

        <Section title="Color">
          <div {...stylex.props(styles.swatches)}>
            {(Object.keys(swatchStyles) as (keyof typeof swatchStyles)[]).map((name) => (
              <div key={name} {...stylex.props(styles.swatch)}>
                <div {...stylex.props(styles.chip, swatchStyles[name])} />
                <span {...stylex.props(styles.mono)}>color.{name}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type">
          {(
            [
              ["hero", "Every Melee skin"],
              ["display", "Explore"],
              ["h1", "Falco Drip Set"],
              ["h2", "Most liked"],
              ["h3", "4 costumes"],
              ["body", "Full set of Falco skins with an urban theme, compatible with doubles."],
              ["small", "Falco · ube · May 2021"],
              ["mono", "PlFcNr.dat · 695 packs"],
            ] as const
          ).map(([name, sample]) => (
            <div key={name} {...stylex.props(styles.typeRow)}>
              <span {...stylex.props(styles.mono)}>{name}</span>
              <span {...stylex.props(typeStyles[name])}>{sample}</span>
            </div>
          ))}
        </Section>

        <Section title="Buttons">
          <div {...stylex.props(styles.row)}>
            <Button variant="primary" icon={<DownloadIcon />}>
              Download all 4 files
            </Button>
            <Button
              variant="secondary"
              icon={<HeartIcon filled={liked} />}
              onClick={() => setLiked((v) => !v)}
              aria-pressed={liked}
            >
              {liked ? "Liked" : "Like"} · {liked ? 11 : 10}
            </Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="danger">Delete pack</Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </div>
          <div {...stylex.props(styles.row)}>
            <Button variant="primary" size="lg" icon={<UploadIcon />}>
              Upload a pack
            </Button>
            <ButtonLink
              to="/games/$slug"
              params={{ slug: PRIMARY_GAME_SLUG }}
              variant="secondary"
              size="lg"
            >
              Explore (link)
            </ButtonLink>
            <IconButton label="Download PlFcNr.dat" icon={<DownloadIcon />} variant="secondary" />
            <IconButton label="Filters" icon={<FiltersIcon />} />
          </div>
        </Section>

        <Section title="Fields">
          <div {...stylex.props(styles.fields)}>
            <SearchField label="Search packs" placeholder="Search by name, character or creator" />
            <TextField
              label="Pack title"
              placeholder="Falco Drip Set"
              description="Shown on the pack page and in search."
            />
            <TextField
              label="Username"
              defaultValue="ab"
              error="Username must be at least 3 characters"
            />
            <TextArea
              label="Comment"
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
              maxLength={2000}
              rows={3}
            />
            <RadioGroup
              label="Reason"
              value={reason}
              options={[
                { value: "spam", label: "Spam" },
                { value: "broken", label: "Broken or corrupt file" },
              ]}
              onValueChange={setReason}
            />
          </div>
          <div {...stylex.props(styles.row)}>
            <ToggleGroup
              label="Costume shown in 3D"
              value={costume}
              options={[
                { value: "Nr", label: "Neutral" },
                { value: "Re", label: "Red" },
                { value: "Bu", label: "Blue" },
              ]}
              onValueChange={setCostume}
            />
          </div>
        </Section>

        <Section title="Filters: popover, checkbox group, tags, select">
          <div {...stylex.props(styles.row)}>
            <PopoverRoot>
              <PopoverTrigger>
                <Button icon={<FiltersIcon />}>
                  Character {selected.length > 0 && <Badge tone="accent">{selected.length}</Badge>}
                </Button>
              </PopoverTrigger>
              <PopoverPanel title="Filter by character" width={520}>
                <div {...stylex.props(styles.popoverSearch)}>
                  <SearchField label="Find a character" placeholder="Find a character" />
                </div>
                <div {...stylex.props(styles.popoverBody)}>
                  <CheckboxGroup
                    aria-label="Characters"
                    value={selected}
                    onValueChange={setSelected}
                    columns={2}
                  >
                    {characters.map((name) => (
                      <Checkbox
                        key={name}
                        name="character"
                        value={name}
                        label={name}
                        meta={name.length * 17}
                      />
                    ))}
                  </CheckboxGroup>
                </div>
                <div {...stylex.props(styles.popoverFooter)}>
                  <Button variant="ghost" onClick={() => setSelected([])}>
                    Clear
                  </Button>
                  <Button variant="primary">Show results</Button>
                </div>
              </PopoverPanel>
            </PopoverRoot>
            <Select label="Sort" value={sort} options={sortOptions} onValueChange={setSort} />
          </div>
          <div {...stylex.props(styles.row)}>
            {selected.map((name) => (
              <Tag
                key={name}
                onRemove={() => setSelected((current) => current.filter((c) => c !== name))}
              >
                {name}
              </Tag>
            ))}
            <Badge>695</Badge>
            <Badge tone="accent">2</Badge>
          </div>
        </Section>

        <Section title="Menu, dialogs, sheet">
          <div {...stylex.props(styles.row)}>
            <MenuRoot>
              <MenuTrigger>
                <Button>Account</Button>
              </MenuTrigger>
              <MenuPanel>
                <MenuLink to="/settings">Settings</MenuLink>
                <MenuLink to="/games/$slug" params={{ slug: PRIMARY_GAME_SLUG }}>
                  Explore
                </MenuLink>
                <MenuSeparator />
                <MenuItem tone="danger">Sign out</MenuItem>
              </MenuPanel>
            </MenuRoot>
            <Dialog
              trigger={<Button>Open dialog</Button>}
              title="Report this pack"
              description="Tell the moderators what is wrong."
            >
              <p {...stylex.props(styles.body)}>Dialog content goes here.</p>
            </Dialog>
            <Button onClick={() => setConfirmOpen(true)}>Open confirm</Button>
            <ConfirmDialog
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              title="Delete this pack?"
              description="It will be hidden from the site. A moderator can restore it."
              confirmLabel="Delete pack"
              onConfirm={() => setConfirmOpen(false)}
            />
            <Sheet
              trigger={<Button icon={<FiltersIcon />}>Open sheet</Button>}
              title="Filters"
              footer={
                <Button variant="primary" fullWidth>
                  Show 695 packs
                </Button>
              }
            >
              <CheckboxGroup aria-label="Characters" value={selected} onValueChange={setSelected}>
                {characters.map((name) => (
                  <Checkbox key={name} name="sheet-character" value={name} label={name} />
                ))}
              </CheckboxGroup>
            </Sheet>
          </div>
        </Section>
      </div>
    </div>
  );
}
