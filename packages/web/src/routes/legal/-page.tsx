import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { Article } from "@/ui/patterns/Article";
import { layout } from "@/ui/patterns/layout";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { space } from "@/ui/tokens.stylex";

/** When the current legal text took effect; shown under each page's title. */
export const LEGAL_UPDATED = "Effective November 26, 2026";

/** The meta tags of a legal page. */
export function legalHead(title: string, description: string) {
  return {
    meta: [{ title: `${title} - textures.gg` }, { name: "description", content: description }],
  };
}

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.xl },
});

/** A legal page: its title, effective date, and sections. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader title={title} description={`Saavylab LLC · ${LEGAL_UPDATED}`} />
      <div {...stylex.props(layout.narrow)}>
        <Article>{children}</Article>
      </div>
    </div>
  );
}
