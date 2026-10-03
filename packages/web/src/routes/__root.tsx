import * as stylex from "@stylexjs/stylex";
import { useQueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { Toaster } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { signOut } from "@/lib/auth-client";
import type { RouterContext } from "@/lib/router-context";
import { currentUserQuery, sessionQuery } from "@/lib/session";
import { SiteFooter } from "@/ui/patterns/SiteFooter";
import { SiteHeader } from "@/ui/patterns/SiteHeader";
import { color, font, radius, text } from "@/ui/tokens.stylex";

// Most visits never sign in, so the dialog loads on first open and then stays
// mounted to keep its closing animation.
const AuthDialog = lazy(() =>
  import("@/ui/patterns/AuthDialog").then((module) => ({ default: module.AuthDialog }))
);

function RootComponent() {
  const { user, isLoading, openAuthModal, modalState } = useAuth();
  const [authDialogNeeded, setAuthDialogNeeded] = useState(false);
  if (modalState.isOpen && !authDialogNeeded) setAuthDialogNeeded(true);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleSignOut = async () => {
    await signOut();
    queryClient.removeQueries({ queryKey: ["user", "me"] });
    navigate({ to: "/" });
  };

  return (
    <div {...stylex.props(styles.shell)}>
      <HeadContent />
      <SiteHeader
        user={user ?? null}
        isLoading={isLoading}
        onSignIn={() => openAuthModal("signIn")}
        onSignOut={handleSignOut}
      />
      <main {...stylex.props(styles.main)}>
        <Outlet />
      </main>
      <SiteFooter />
      {authDialogNeeded && (
        <Suspense fallback={null}>
          <AuthDialog />
        </Suspense>
      )}
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{ className: stylex.props(styles.toast).className }}
      />
    </div>
  );
}

const styles = stylex.create({
  shell: { minHeight: "100dvh", display: "flex", flexDirection: "column" },
  main: { flexGrow: 1 },
  toast: {
    backgroundColor: color.raise,
    borderColor: color.lineStrong,
    color: color.text,
    fontFamily: font.sans,
    fontSize: text.md,
    borderRadius: radius.md,
  },
});

export const Route = createRootRouteWithContext<RouterContext>()({
  // A signed-in account that has not chosen its name goes to onboarding before
  // any page renders. Both lookups are cached; a failed one lets the page load.
  beforeLoad: async ({ context, location }) => {
    if (location.pathname === "/onboarding") return;
    try {
      const session = await context.queryClient.ensureQueryData(sessionQuery);
      if (!session?.user) return;
      const user = await context.queryClient.ensureQueryData(currentUserQuery);
      if (user.onboardingCompleted) return;
    } catch {
      return;
    }
    throw redirect({ to: "/onboarding" });
  },
  head: () => ({
    meta: [
      { title: "textures.gg - Video Game Texture Mods & Custom Skins" },
      {
        name: "description",
        content:
          "Community archive for video game texture mods and custom skins. Browse and download SSBM textures, Melee costumes, and more.",
      },
    ],
  }),
  component: RootComponent,
});
