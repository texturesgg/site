import * as stylex from "@stylexjs/stylex";
import { type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { layout } from "@/ui/patterns/layout";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { Button, ButtonLink } from "@/ui/primitives";
import { space } from "@/ui/tokens.stylex";
import { PRIMARY_GAME_SLUG } from "@vgskins/shared";

const styles = stylex.create({
  actions: { display: "flex", flexWrap: "wrap", gap: space.xs },
});

function StatusPage({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children: ReactNode;
}) {
  return (
    <div {...stylex.props(layout.container, layout.page)}>
      <PageHeader title={title} description={message}>
        <div {...stylex.props(styles.actions)}>{children}</div>
      </PageHeader>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <StatusPage
      title="Page not found"
      message="This page doesn't exist, or the pack was removed or isn't public yet."
    >
      <ButtonLink to="/games/$slug" params={{ slug: PRIMARY_GAME_SLUG }} variant="primary">
        Browse packs
      </ButtonLink>
      <ButtonLink to="/">Go home</ButtonLink>
    </StatusPage>
  );
}

/**
 * The router's default error component. It renders inside the root layout, so
 * navigation stays usable. A missing resource is handled separately: loaders
 * throw notFound(), which renders NotFoundPage.
 */
export function RouteErrorPage({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  console.error("Route failed to load", error);

  return (
    <StatusPage
      title="Something went wrong"
      message="This page couldn't be loaded. It may be a temporary problem, so try again in a moment."
    >
      <Button
        variant="primary"
        onClick={() => {
          reset();
          void router.invalidate();
        }}
      >
        Try again
      </Button>
      <ButtonLink to="/">Go home</ButtonLink>
    </StatusPage>
  );
}
