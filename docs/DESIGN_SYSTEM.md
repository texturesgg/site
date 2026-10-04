# Gallery design system

The website's visual language. textures.gg is a catalog of community work, so
the skins are the content and the interface stays quiet around them.

No bevels, scanlines, grid backgrounds or HUD details.

## Principles

1. **The skins are the content.** Large images, generous spacing, little chrome.
   Decoration never competes with a thumbnail or a 3D preview.
2. **Tokens, never raw values.** Components read colors, spacing, radii, type,
   and motion from tokens. A palette is only a set of token values, so a new
   palette never touches a component.
3. **Primitives own behavior.** Focus, keyboard, ARIA, portals, and positioning
   come from Base UI. Styling never re-implements them.
4. **Readable by default.** Body text is 15–16 px, metadata at least 13 px, all
   text at least 4.5:1 contrast (3:1 at 24 px and above), and touch targets at
   least 44 px.
5. **Catalog, not storefront.** Clear information hierarchy, honest counts, and
   plain labels. No marketing gradients, fake urgency, or gimmicky effects.

## Stack

| Concern  | Choice                                                                                        |
| -------- | --------------------------------------------------------------------------------------------- |
| Styling  | [StyleX](https://stylexjs.com) (`@stylexjs/stylex`, compiled by `@stylexjs/unplugin` in Vite) |
| Behavior | [Base UI](https://base-ui.com) (`@base-ui/react`)                                             |
| Fonts    | Schibsted Grotesk (text and display), DM Mono (numbers, codes, file names)                    |
| Icons    | Inline stroke SVGs in `src/ui/icons.tsx` (24×24 grid, `currentColor`, 2 px stroke)            |

StyleX compiles styles to atomic CSS at build time. Base UI
components are unstyled. They take StyleX output through `className` (a string,
or a function of the component's state) and `style`.

StyleX is pre-1.0. Its versions are pinned exactly; upgrade them deliberately
and read the changelog.

## File layout

```text
packages/web/src/ui/
  tokens.stylex.ts   color, space, radius, font, text, shadow, motion tokens
  themes.ts          alternative palettes (createTheme over the color tokens)
  icons.tsx          the icon set
  primitives/        Base UI wrapped with StyleX: Button, Checkbox, Popover, …
  patterns/          product components built only from primitives and tokens
```

Pages compose patterns and primitives. A page may add layout styles with
`stylex.create`, using tokens, but does not restyle a primitive's internals.

## Tokens

Defined in `src/ui/tokens.stylex.ts`. That file exports only `defineVars`
groups (a StyleX rule for token files).

### Color (Gallery palette)

| Token        | Value     | Use                                                                                           |
| ------------ | --------- | --------------------------------------------------------------------------------------------- |
| `bg`         | `#111110` | Page background                                                                               |
| `surface`    | `#1B1B19` | Cards, inputs, controls                                                                       |
| `raise`      | `#262522` | Popovers, sheets, menus                                                                       |
| `text`       | `#F2EFE8` | Primary text                                                                                  |
| `muted`      | `#A8A39A` | Secondary text and icons (7.6:1 on `bg`)                                                      |
| `line`       | `#2F2E2A` | Borders and dividers                                                                          |
| `lineStrong` | `#3A3934` | Borders on `raise` and emphasized outlines                                                    |
| `accent`     | `#F5C84B` | Fills: primary actions, checked controls, progress                                            |
| `accentText` | `#F5C84B` | Accent text and lines: links, focus rings, active underlines, selected borders (12:1 on `bg`) |
| `onAccent`   | `#111110` | Text and icons on `accent`                                                                    |
| `danger`     | `#F07167` | Destructive actions and errors (6.9:1 on `bg`)                                                |
| `onDanger`   | `#111110` | Text and icons on a `danger` fill (6.5:1)                                                     |
| `success`    | `#7BD88F` | Confirmations                                                                                 |

Use the accent sparingly: primary actions, selection, focus, and small
highlights. `accent` is only ever a fill. Anything drawn in the accent color as
text or a line (inline links, focus rings, an active tab's underline, a
selected card's border) uses `accentText`. The two are equal in Gallery, but
a light palette needs a darker `accentText`, because the gold is too faint on
a pale ground.

### Space, radius, type, motion

- **Space** (`space`): `xxs 4`, `xs 8`, `sm 12`, `md 16`, `lg 24`, `xl 32`,
  `xxl 48`, `xxxl 64` px. Layout gaps come from this scale.
- **Radius** (`radius`): `sm 8` (thumbnails in dense lists), `md 12` (text
  fields, cards), `lg 16` (media, popovers), `xl 20` (sheets and large panels),
  `pill`. One rule keeps shapes consistent: anything you press (buttons,
  selects, tags, toggles) is a `pill`; anything you type in is `md`; surfaces
  use `md` and up.
- **Font** (`font`): `sans`, `mono`.
- **Text** (`text`): `xs 13`, `sm 14`, `md 15`, `lg 16`, `xl 18`, `h3 24`,
  `h2 28`, `h1 40`, `display 56`, `hero 96` px. Headings use weight 700–800 and
  negative tracking (`tracking.tight -0.02em`, `tracking.tighter -0.045em`).
  Body text is 15–16 px with 1.5–1.6 line height.
- **Shadow** (`shadow`): `popover` for floating surfaces only. Cards are flat.
- **Motion** (`motion`): `fast 120ms`, `normal 200ms`, `easing`. Respect
  `prefers-reduced-motion`; motion is never required to understand state.

## Themes and palette swapping

The Gallery values are the tokens' defaults, so no theme needs to be applied
for the default palette. Other palettes are `createTheme`s over the tokens in
`src/ui/themes.ts`. `paper` is the light palette, with `paperShadow` to go with
it. The site doesn't switch themes yet.

### Paper

| Token            | Value                                | Contrast                          |
| ---------------- | ------------------------------------ | --------------------------------- |
| `bg`             | `#F3EFE6`                            |                                   |
| `surface`        | `#FAF7F0`                            |                                   |
| `raise`          | `#FFFDF8`                            |                                   |
| `text`           | `#1C1B19`                            | 15.0:1 on `bg`, 16.9:1 on `raise` |
| `muted`          | `#5C574E`                            | 6.3:1 on `bg`                     |
| `line`           | `#E0D9CA`                            |                                   |
| `lineStrong`     | `#B8AF9C`                            |                                   |
| `accent`         | `#F5C84B`                            | `onAccent` 10.9:1 on it           |
| `accentText`     | `#7A5A00`                            | 5.6:1 on `bg`                     |
| `onAccent`       | `#1C1B19`                            |                                   |
| `danger`         | `#B42E24`                            | 5.5:1 on `bg`                     |
| `onDanger`       | `#FFFDF8`                            | 6.2:1 on `danger`                 |
| `success`        | `#27713B`                            | 5.2:1 on `bg`                     |
| `scrim`          | `rgba(28, 27, 25, 0.35)`             |                                   |
| `shadow.popover` | `0 24px 60px rgba(28, 27, 25, 0.18)` | (`paperShadow`)                   |

Surfaces lighten toward the viewer, like sheets of paper, rather than inverting
Gallery's darkening.

**Apply a theme to `<html>`, never to a wrapper.** Popovers, menus, dialogs, and
sheets render in portals at the end of `<body>`, outside any wrapper, so a
theme applied lower in the tree does not reach them. Every theme overrides
every color token, and must pass the same contrast checks as the default.
Apply `paperShadow` together with `paper`.

`#root` has `isolation: isolate` (in `src/index.css`), so z-indices inside the
app never cover a portal. Do not give portaled content its own z-index.

## Primitives

Each primitive wraps a Base UI component (or a native element where Base UI has
none), styles it with tokens, and exposes a small typed API. Consumers pass
content and choose variants; they do not pass colors or arbitrary styles.

| Primitive                                                      | Base UI                     | Variants and notes                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                                                       | `Button`                    | `primary` (accent pill), `secondary` (surface), `ghost`, `danger` (confirms a destructive action), `text` (inline actions under content, such as Reply or Show more: no box, so the label lines up with the text); sizes `md`, `lg`; optional leading `icon`; `fullWidth` |
| `ButtonLink`                                                   | router `Link`               | A `Button`-styled link, made with TanStack Router's `createLink`, so `to`/`params` stay typed                                                                                                                                                                             |
| `IconButton`                                                   | `Button`                    | Requires `label` (the accessible name); circular, 44 px, or 52 px with `size="lg"` beside a large Button                                                                                                                                                                  |
| `TextField`, `SearchField`                                     | `Field`                     | Visible label, or a visually hidden one; `description` and `error`                                                                                                                                                                                                        |
| `TextArea`                                                     | `Field`                     | Multi-line text with a character count when `maxLength` is set                                                                                                                                                                                                            |
| `Checkbox`, `CheckboxGroup`                                    | `Checkbox`, `CheckboxGroup` | Label and optional right-aligned `meta` (a count); 1 or 2 columns                                                                                                                                                                                                         |
| `PopoverRoot`, `PopoverTrigger`, `PopoverPanel`                | `Popover`                   | Anchored panel on `raise` with a title, for filters and small forms                                                                                                                                                                                                       |
| `MenuRoot`, `MenuTrigger`, `MenuPanel`, `MenuItem`, `MenuLink` | `Menu`                      | Action lists such as the account menu; `MenuLink` navigates                                                                                                                                                                                                               |
| `Select`                                                       | `Select`                    | Single choice from typed options, such as sort order; options can carry a `group` heading, be `disabled` with a `meta` reason, and a `null` value shows a `placeholder`                                                                                                   |
| `RadioGroup`                                                   | `RadioGroup`, `Radio`       | Single choice shown as selectable rows, such as report reasons                                                                                                                                                                                                            |
| `ToggleGroup`                                                  | `ToggleGroup`, `Toggle`     | Pick one of a few views (up to about six) as pills, such as the costume shown in 3D; use `Select` for more                                                                                                                                                                |
| `Sheet`                                                        | `Drawer`                    | Bottom sheet for small screens, swipe to dismiss, optional footer                                                                                                                                                                                                         |
| `Dialog`                                                       | `Dialog`                    | Centered modal for focused tasks: sign in, report                                                                                                                                                                                                                         |
| `Switch`                                                       | `Switch`                    | An on/off setting with its label beside it, such as showing a linked account on your profile                                                                                                                                                                              |
| `TextLink`, `TextAnchor`                                       | router `Link`, native `a`   | Links inside running text; external `TextAnchor`s open in a new tab                                                                                                                                                                                                       |
| `Tabs`                                                         | `Tabs`                      | Switch between views of one thing, with optional counts, such as a profile's packs and likes                                                                                                                                                                              |
| `AnchorButton`                                                 | native `a`                  | A `Button`-styled plain link for destinations outside the site                                                                                                                                                                                                            |
| `Progress`                                                     | `Progress`                  | Labeled progress bar for long tasks such as uploads                                                                                                                                                                                                                       |
| `ConfirmDialog`                                                | `AlertDialog`               | Asks before a hard-to-undo action; stays open while pending and shows a failure; `children` add inputs such as a reason                                                                                                                                                   |
| `Tag`                                                          | native `button`             | Removable filter token                                                                                                                                                                                                                                                    |
| `Badge`                                                        | native `span`               | Counts and small statuses; `neutral` or `accent`                                                                                                                                                                                                                          |

Triggers take the element to render (usually a `Button`), so a trigger is a real
button with the right ARIA state. Review every primitive on the unlinked
`/design-system` page.

State styles use Base UI's state, not class toggles. `stateStyles` in
`primitives/shared.ts` turns a pick of StyleX styles into Base UI's `className`
callback:

```tsx
<Checkbox.Root className={stateStyles((state) => [styles.box, state.checked && styles.checked])} />
```

Styling from a parent's state uses `stylex.when.ancestor(':hover')` with a
marker on the parent, for example a card that zooms its image on hover.

Things the StyleX compiler needs:

- Tokens are CSS variables, so string arithmetic on them is invalid CSS; combine
  them with `calc()`.
- Values in `stylex.create` must be static: tokens, literals, and template
  strings of them. A call to an imported helper function fails the build
  ("Could not resolve the path to the imported file").
- Typed `Select`, `RadioGroup`, and `ToggleGroup` values come from their
  `options`, so callers get the option type without an assertion.

## Patterns

Product components live in `src/ui/patterns/` and are built only from
primitives and tokens: `SiteHeader`, `SiteFooter`, `PageHeader` (with an optional `leading` slot, such as an avatar), `PackTile` (shows a status badge for
unapproved packs), `PackGrid`,
`TargetPicker`, `PackRail` (and the generic `Rail`), `CreatorCard`, `Pagination`, `EmptyState`,
`MediaViewer` (screenshots and the
3D preview), `Description` (user text: paragraphs, safe links, "Show more"),
`Comments`, `ReportDialog`, `AuthDialog` (the combined sign-in and sign-up dialog), `Article` (prose pages: sections, numbered
steps, tips), `NavTabs`/`NavTab` (section tabs that are links, as in moderation), `FileDropZone` (drop or choose files; a compact form once
files are added), and `TagInput` (tag chips with suggestions, on Base UI
`Combobox`).

## Layout

- Page content is centered with a maximum width of 1440 px and `space.xxl`
  (48 px) side padding on desktop, `space.md` (16 px) on phones
  (`layout.container`).
- Form and short pages (settings, onboarding, password reset) put their content in
  `layout.narrow` (640 px) under a full-width `PageHeader`.
- Every page body uses `layout.page` for its top and bottom spacing and starts
  with `PageHeader` (title, optional description, actions, and content below),
  so titles begin at the same point and size on every page. The pack page is
  the exception: its title is the pack name in the side column.
- Pack grids are 3 columns on desktop, 2 on tablets and phones; thumbnails are
  16:10 with `radius.md`.
- Filters are a bar of popover buttons on desktop and one "Filters" button that
  opens a `Drawer` on phones. Active filters show as removable `Tag`s.

## Accessibility

- Use real elements: `<button>`, `<a href>`, `<input>` with a `<label>`.
- Every control has a visible focus ring: 2 px `accentText`, 2 px offset.
- Icon-only controls have an `aria-label` (the `IconButton` API requires one).
- Color is never the only signal: selected state also changes weight, a check
  mark, or a badge.
- Images have alt text from the pack or costume name; decorative images use
  `alt=""`.

## Do and don't

| Do                                                           | Don't                                                                                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Reference tokens (`color.muted`, `space.md`, `text.lg`)      | Write colors, spacing, radii, or font sizes outside `tokens.stylex.ts` (one-off dimensions such as 1 px borders or 44 px targets are fine) |
| Use `Button variant="text"` for inline actions under content | Pull elements into alignment with negative margins                                                                                         |
| Build new UI from primitives and patterns                    | Style a Base UI component directly in a page                                                                                               |
| Apply themes to `<html>`                                     | Apply a theme to a wrapper element                                                                                                         |
| Use `mono` for numbers, codes, and file names                | Use uppercase monospace for labels and headings                                                                                            |
| Keep cards flat on `surface`                                 | Add glows, gradients, scanlines, or grid backgrounds                                                                                       |

## CSS layering

Components are styled only with StyleX, which emits unlayered CSS
(`useCSSLayers: false` in `vite.config.ts`). `src/index.css` holds a small
base reset inside `@layer base`. Unlayered rules always beat layered ones, so
any component style overrides the reset regardless of load order in dev or
production, with no specificity tricks. Keep `index.css` to resets and
document-level rules.
