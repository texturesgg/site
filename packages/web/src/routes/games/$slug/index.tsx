import * as stylex from "@stylexjs/stylex";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { parseResponse } from "hono/client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { ChevronDownIcon, FiltersIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/patterns/EmptyState";
import { layout } from "@/ui/patterns/layout";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { PackGrid, PackGridSkeleton } from "@/ui/patterns/PackTile";
import { Pagination } from "@/ui/patterns/Pagination";
import { type PickerSection, TargetPicker } from "@/ui/patterns/TargetPicker";
import {
  Badge,
  Button,
  PopoverPanel,
  PopoverRoot,
  PopoverTrigger,
  SearchField,
  Select,
  Sheet,
  Tag,
} from "@/ui/primitives";
import { font, space, text } from "@/ui/tokens.stylex";

// ─── Search params ──────────────────────────────────────────────

const SORTS = [
  { value: "hot", label: "Trending", api: "hot" },
  { value: "new", label: "Newest", api: "newest" },
  { value: "top", label: "Most liked", api: "top" },
  { value: "downloads", label: "Most downloaded", api: "downloads" },
] as const;
type SortMode = (typeof SORTS)[number]["value"];

const PERIODS = [
  { value: "all", label: "All time" },
  { value: "year", label: "Past year" },
  { value: "month", label: "Past month" },
  { value: "week", label: "Past week" },
] as const;
type Period = (typeof PERIODS)[number]["value"];

const TYPES = [
  { value: "any", label: "Any type" },
  { value: "character", label: "Characters" },
  { value: "stage", label: "Stages" },
  { value: "ui", label: "Interface" },
] as const;
type TypeFilter = (typeof TYPES)[number]["value"];

const PAGE_SIZE = 24;

interface BrowseSearch {
  /** Target slugs, comma-separated in the URL: ?target=fox,falco */
  target?: string;
  type?: Exclude<TypeFilter, "any">;
  tag?: string;
  sort?: SortMode;
  period?: Period;
  q?: string;
  page?: number;
}

const isOneOf = <T extends string>(values: readonly { value: T }[], value: unknown): value is T =>
  values.some((option) => option.value === value);

export const Route = createFileRoute("/games/$slug/")({
  validateSearch: (search: Record<string, unknown>): BrowseSearch => ({
    target: typeof search.target === "string" && search.target ? search.target : undefined,
    type: isOneOf(TYPES, search.type) && search.type !== "any" ? search.type : undefined,
    tag: typeof search.tag === "string" ? search.tag : undefined,
    sort: isOneOf(SORTS, search.sort) && search.sort !== "hot" ? search.sort : undefined,
    period: isOneOf(PERIODS, search.period) && search.period !== "all" ? search.period : undefined,
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    page: typeof search.page === "number" && search.page > 1 ? search.page : undefined,
  }),
  loader: async ({ params }) => {
    const targets = (category: "character" | "stage") =>
      api.games[":slug"].targets.$get({ param: { slug: params.slug }, query: { category } });
    const [gameRes, charactersRes, stagesRes] = await Promise.all([
      api.games[":slug"].$get({ param: { slug: params.slug } }),
      targets("character"),
      targets("stage"),
    ]);
    if (gameRes.status === 404) throw notFound();
    const [game, characters, stages] = await Promise.all([
      parseResponse(gameRes),
      parseResponse(charactersRes),
      parseResponse(stagesRes),
    ]);
    return { game, characters, stages };
  },
  head: ({ loaderData }) => {
    const name = loaderData?.game?.name || "Game";
    return {
      meta: [
        { title: `${name} Texture Mods & Custom Skins - textures.gg` },
        {
          name: "description",
          content: `Browse and download ${name} texture mods, custom skins, and costumes. Free character retextures and stage mods on textures.gg.`,
        },
      ],
    };
  },
  pendingComponent: BrowseSkeleton,
  component: BrowsePage,
});

// ─── Styles ─────────────────────────────────────────────────────

const WIDE = "@media (min-width: 768px)";

const styles = stylex.create({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: space.lg,
  },
  search: { width: { default: "100%", [WIDE]: "520px" } },
  bar: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.xs },
  wideOnly: {
    display: { default: "none", [WIDE]: "flex" },
    flexGrow: 1,
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.xs,
  },
  // Filters and Sort share the row equally on phones.
  narrowOnly: {
    display: { default: "grid", [WIDE]: "none" },
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    flexGrow: 1,
    gap: space.xs,
  },
  spacer: { flexGrow: 1 },
  count: { fontFamily: font.mono, fontSize: text.sm },
  tokens: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.xs },
  pickerBody: { paddingInline: space.sm, paddingBottom: space.sm, overflowY: "auto", minHeight: 0 },
  sheetBody: { display: "flex", flexDirection: "column", gap: space.md, paddingBottom: space.md },
  results: { transitionProperty: "opacity", transitionDuration: "120ms" },
  stale: { opacity: 0.6 },
});

// ─── Page ───────────────────────────────────────────────────────

function BrowsePage() {
  const { game, characters, stages } = Route.useLoaderData();
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/games/$slug/" });

  const sort: SortMode = search.sort ?? "hot";
  const period: Period = search.period ?? "all";
  const type: TypeFilter = search.type ?? "any";
  const page = search.page ?? 1;
  const showPeriod = sort === "top" || sort === "downloads";

  // Only slugs that exist; a stale or hand-edited URL never breaks the page.
  const allTargets = [...characters, ...stages];
  const selected = (search.target ?? "")
    .split(",")
    .filter((targetSlug) => allTargets.some((target) => target.slug === targetSlug));

  const update = (changes: Partial<BrowseSearch>, resetPage = true) =>
    navigate({
      search: (prev) => ({ ...prev, ...changes, ...(resetPage ? { page: undefined } : {}) }),
    });

  const setSelected = (slugs: string[]) =>
    update({ target: slugs.length > 0 ? slugs.join(",") : undefined });

  const setType = (next: TypeFilter) => {
    const category = next === "any" ? undefined : next;
    // Drop selected targets the new type excludes, so the filters never contradict.
    const kept = selected.filter(
      (targetSlug) =>
        !category || allTargets.find((t) => t.slug === targetSlug)?.category === category
    );
    update({ type: category, target: kept.length > 0 ? kept.join(",") : undefined });
  };

  const [filtersOpen, setFiltersOpen] = useState(false);

  // Search is typed locally and written to the URL after a pause.
  const [searchInput, setSearchInput] = useState(search.q ?? "");
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => setSearchInput(search.q ?? ""), [search.q]);
  const onSearchChange = (value: string) => {
    setSearchInput(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => update({ q: value.trim() || undefined }), 300);
  };

  const { data, isPending, isPlaceholderData, isError, refetch } = useQuery({
    queryKey: ["packs", slug, search.target, search.type, search.tag, sort, period, search.q, page],
    placeholderData: keepPreviousData,
    queryFn: () =>
      parseResponse(
        api.packs.$get({
          query: {
            game: slug,
            target: selected.length > 0 ? selected.join(",") : undefined,
            category: search.type,
            tag: search.tag,
            sortBy: SORTS.find((option) => option.value === sort)?.api,
            period: showPeriod && period !== "all" ? period : undefined,
            search: search.q,
            pageSize: String(PAGE_SIZE),
            page: String(page),
          },
        })
      ),
  });

  const sections: PickerSection[] = [
    ...(type === "any" || type === "character"
      ? [{ label: "Characters", targets: sortByName(characters) }]
      : []),
    ...(type === "any" || type === "stage"
      ? [{ label: "Stages", targets: sortByName(stages) }]
      : []),
  ];
  const nameOf = (targetSlug: string) =>
    allTargets.find((target) => target.slug === targetSlug)?.name ?? targetSlug;
  const activeFilterCount = selected.length + (search.type ? 1 : 0) + (search.tag ? 1 : 0);
  const hasFilters = activeFilterCount > 0 || Boolean(search.q);
  const clearAll = () => {
    setSearchInput("");
    update({ target: undefined, type: undefined, tag: undefined, q: undefined });
  };
  const total = data?.total ?? 0;
  const pickerLabel =
    type === "stage" ? "Stage" : type === "character" ? "Character" : "Character or stage";

  const setSort = (value: SortMode) => update({ sort: value === "hot" ? undefined : value });
  const setPeriod = (value: Period) => update({ period: value === "all" ? undefined : value });

  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader
        title="Explore"
        description={
          <>
            {game.name} ·{" "}
            <span aria-live="polite" {...stylex.props(styles.count)}>
              {isPending
                ? "Loading…"
                : `${total.toLocaleString("en-US")} ${total === 1 ? "pack" : "packs"}`}
            </span>
          </>
        }
        actions={
          <div {...stylex.props(styles.search)}>
            <SearchField
              label="Search packs"
              placeholder="Search by name or description"
              value={searchInput}
              onChange={(event) => onSearchChange(event.currentTarget.value)}
            />
          </div>
        }
      />

      <div {...stylex.props(styles.bar)}>
        <div {...stylex.props(styles.wideOnly)}>
          <PopoverRoot>
            <PopoverTrigger>
              <Button icon={<FiltersIcon />}>
                {pickerLabel}
                {selected.length > 0 && <Badge tone="accent">{selected.length}</Badge>}
                <ChevronDownIcon size={14} />
              </Button>
            </PopoverTrigger>
            <PopoverPanel title={`Filter by ${pickerLabel.toLowerCase()}`} width={560}>
              <div {...stylex.props(styles.pickerBody)}>
                <TargetPicker sections={sections} value={selected} onValueChange={setSelected} />
              </div>
            </PopoverPanel>
          </PopoverRoot>
          <Select label="Type" hideLabel value={type} options={TYPES} onValueChange={setType} />
          <span {...stylex.props(styles.spacer)} />
          <Select label="Sort" value={sort} options={SORTS} onValueChange={setSort} />
          {showPeriod && (
            <Select
              label="Period"
              hideLabel
              value={period}
              options={PERIODS}
              onValueChange={setPeriod}
            />
          )}
        </div>

        <div {...stylex.props(styles.narrowOnly)}>
          <Sheet
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
            trigger={
              <Button icon={<FiltersIcon />} fullWidth>
                Filters {activeFilterCount > 0 && <Badge tone="accent">{activeFilterCount}</Badge>}
              </Button>
            }
            title="Filters"
            footer={
              <>
                <Button variant="ghost" onClick={clearAll}>
                  Clear all
                </Button>
                <Button variant="primary" fullWidth onClick={() => setFiltersOpen(false)}>
                  {isPending ? "Loading…" : `Show ${total.toLocaleString("en-US")} packs`}
                </Button>
              </>
            }
          >
            <div {...stylex.props(styles.sheetBody)}>
              <Select label="Type" value={type} options={TYPES} onValueChange={setType} />
              {showPeriod && (
                <Select label="Period" value={period} options={PERIODS} onValueChange={setPeriod} />
              )}
              <TargetPicker
                sections={sections}
                value={selected}
                onValueChange={setSelected}
                columns={1}
              />
            </div>
          </Sheet>
          <Select
            label="Sort"
            hideLabel
            fullWidth
            value={sort}
            options={SORTS}
            onValueChange={setSort}
          />
        </div>
      </div>

      {hasFilters && (
        <div {...stylex.props(styles.tokens)}>
          {selected.map((targetSlug) => (
            <Tag
              key={targetSlug}
              onRemove={() => setSelected(selected.filter((s) => s !== targetSlug))}
            >
              {nameOf(targetSlug)}
            </Tag>
          ))}
          {search.type && (
            <Tag onRemove={() => setType("any")}>
              {TYPES.find((option) => option.value === search.type)?.label ?? search.type}
            </Tag>
          )}
          {search.tag && <Tag onRemove={() => update({ tag: undefined })}>{`#${search.tag}`}</Tag>}
          {search.q && (
            <Tag
              onRemove={() => {
                setSearchInput("");
                update({ q: undefined });
              }}
            >
              {`“${search.q}”`}
            </Tag>
          )}
          <Button variant="ghost" onClick={clearAll}>
            Clear all
          </Button>
        </div>
      )}

      <section
        aria-label="Results"
        {...stylex.props(styles.results, isPlaceholderData && styles.stale)}
      >
        {isError ? (
          <EmptyState
            title="Packs couldn't be loaded"
            body="This may be a temporary problem."
            action={<Button onClick={() => refetch()}>Try again</Button>}
          />
        ) : isPending ? (
          <PackGridSkeleton />
        ) : data.items.length === 0 ? (
          <EmptyState
            title="No packs match"
            body={
              hasFilters
                ? "Try removing a filter or searching for something else."
                : "Nothing has been uploaded yet."
            }
            action={hasFilters ? <Button onClick={clearAll}>Clear all filters</Button> : undefined}
          />
        ) : (
          <PackGrid packs={data.items} label={`${total.toLocaleString("en-US")} packs`} />
        )}
      </section>

      {data && (
        <Pagination
          page={page}
          totalPages={data.totalPages}
          onPageChange={(next) => {
            update({ page: next <= 1 ? undefined : next }, false);
            window.scrollTo({ top: 0 });
          }}
        />
      )}
    </div>
  );
}

function sortByName<T extends { name: string }>(targets: readonly T[]): T[] {
  return [...targets].sort((a, b) => a.name.localeCompare(b.name));
}

function BrowseSkeleton() {
  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PackGridSkeleton />
    </div>
  );
}
