import type { HighlighterCore, ThemeRegistration } from "shiki/core";

// Lazy-loaded Shiki highlighter used only on mod docs routes. Uses Shiki's pure
// JavaScript regex engine and only the five languages the docs use, avoiding
// any WASM bundle or impact on non-docs routes.

export type SupportedLang = "luau" | "c" | "json" | "shellscript" | "powershell";

export type SyntaxKind =
  | "comment"
  | "keyword"
  | "string"
  | "number"
  | "fn"
  | "type"
  | "operator"
  | "punctuation"
  | "property";

const LANG_ALIASES: Record<string, SupportedLang> = {
  luau: "luau",
  lua: "luau",
  c: "c",
  h: "c",
  json: "json",
  jsonc: "json",
  sh: "shellscript",
  bash: "shellscript",
  shell: "shellscript",
  zsh: "shellscript",
  shellscript: "shellscript",
  powershell: "powershell",
  pwsh: "powershell",
  ps1: "powershell",
};

/** Normalize a fenced code block language tag to a loaded Shiki grammar, or null for plain text. */
export function normalizeDocsLang(raw: string | undefined): SupportedLang | null {
  if (!raw) return null;
  return LANG_ALIASES[raw.trim().toLowerCase()] ?? null;
}

const THEME_NAME = "textures-gallery";

// Shiki validates theme foregrounds as CSS color-like strings; map each token
// category to a distinct sentinel color and translate back to our StyleX
// `syntax.*` token classes in `-code.tsx` so no raw colors ever reach the DOM.
const COLOR_TO_KIND: Record<string, SyntaxKind> = {
  "#010101": "comment",
  "#020202": "keyword",
  "#030303": "string",
  "#040404": "number",
  "#050505": "fn",
  "#060606": "type",
  "#070707": "property",
  "#080808": "operator",
  "#090909": "punctuation",
};

const SENTINEL_THEME: ThemeRegistration = {
  name: THEME_NAME,
  type: "dark",
  colors: {
    "editor.background": "#000000",
    "editor.foreground": "#FFFFFF",
  },
  tokenColors: [
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: "#010101" },
    },
    {
      scope: [
        "keyword",
        "storage.type",
        "storage.modifier",
        "keyword.control",
        "keyword.operator.word",
        "constant.language.boolean",
        "constant.language.nil",
        "constant.language.null",
      ],
      settings: { foreground: "#020202" },
    },
    {
      scope: ["string", "string.quoted", "string.interpolated", "punctuation.definition.string"],
      settings: { foreground: "#030303" },
    },
    {
      scope: ["constant.numeric", "constant.character", "constant.other.color"],
      settings: { foreground: "#040404" },
    },
    {
      scope: [
        "entity.name.function",
        "support.function",
        "meta.function-call entity.name.function",
        "variable.function",
      ],
      settings: { foreground: "#050505" },
    },
    {
      scope: [
        "entity.name.type",
        "support.type",
        "storage.type.primitive",
        "entity.name.tag",
        "meta.preprocessor",
        "keyword.control.directive",
      ],
      settings: { foreground: "#060606" },
    },
    {
      scope: [
        "support.type.property-name",
        "entity.other.attribute-name",
        "variable.other.property",
        "variable.other.member",
        "meta.object-literal.key",
      ],
      settings: { foreground: "#070707" },
    },
    {
      scope: ["keyword.operator", "storage.type.function.arrow"],
      settings: { foreground: "#080808" },
    },
    {
      scope: ["punctuation", "meta.brace", "meta.delimiter"],
      settings: { foreground: "#090909" },
    },
  ],
};

export type HighlightToken = {
  content: string;
  kind?: SyntaxKind;
};

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = Promise.all([
      import("shiki/core"),
      import("shiki/engine/javascript"),
      import("shiki/langs/luau.mjs"),
      import("shiki/langs/c.mjs"),
      import("shiki/langs/json.mjs"),
      import("shiki/langs/shellscript.mjs"),
      import("shiki/langs/powershell.mjs"),
    ]).then(([core, engine, luau, c, json, sh, pwsh]) =>
      core.createHighlighterCore({
        engine: engine.createJavaScriptRegexEngine(),
        themes: [SENTINEL_THEME],
        langs: [luau.default, c.default, json.default, sh.default, pwsh.default],
      })
    );
  }
  return highlighterPromise;
}

export async function highlightCode(
  code: string,
  lang: SupportedLang
): Promise<HighlightToken[][]> {
  const highlighter = await getHighlighter();
  const lines = highlighter.codeToTokensBase(code, { lang, theme: THEME_NAME });
  return lines.map((line) =>
    line.map((token) => ({
      content: token.content,
      kind: token.color ? COLOR_TO_KIND[token.color.toLowerCase()] : undefined,
    }))
  );
}
