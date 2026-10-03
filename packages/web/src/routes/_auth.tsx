import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { sessionQuery } from "@/lib/session";

export const Route = createFileRoute("/_auth")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    if (!session?.user) throw redirect({ to: "/" });
    return { user: session.user };
  },
  component: AuthLayout,
});

function AuthLayout() {
  return <Outlet />;
}
