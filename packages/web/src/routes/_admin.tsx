import { useQuery } from "@tanstack/react-query";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { api } from "@/lib/api";
import { authClient, type UserRole } from "@/lib/auth-client";
import { sessionQuery } from "@/lib/session";
import { layout } from "@/ui/patterns/layout";
import { NavTab, NavTabs } from "@/ui/patterns/NavTabs";
import { PageHeader } from "@/ui/patterns/PageHeader";
import { color, font, space, text } from "@/ui/tokens.stylex";
import { parseResponse } from "hono/client";

export const Route = createFileRoute("/_admin")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    if (!session?.user) throw redirect({ to: "/" });

    const role = (session.user.role || "user") as UserRole;

    const canModerate = authClient.admin.checkRolePermission({
      permissions: { pack: ["approve"] },
      role,
    });

    if (!canModerate) {
      throw redirect({ to: "/" });
    }

    const canViewUsers = authClient.admin.checkRolePermission({
      permissions: { user: ["list"] },
      role,
    });

    const canSetRoles = authClient.admin.checkRolePermission({
      permissions: { user: ["set-role"] },
      role,
    });

    const canBan = authClient.admin.checkRolePermission({
      permissions: { user: ["ban"] },
      role,
    });

    return {
      user: session.user,
      role,
      canViewUsers,
      canSetRoles,
      canBan,
    };
  },
  component: AdminLayout,
});

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: space.lg },
  stats: {
    display: "flex",
    flexWrap: "wrap",
    columnGap: space.md,
    margin: 0,
    fontSize: text.md,
    color: color.muted,
  },
  number: { fontFamily: font.mono, color: color.text },
  urgent: { fontFamily: font.mono, color: color.accentText },
});

function AdminLayout() {
  const { canViewUsers, role } = Route.useRouteContext();
  const { data: stats } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => parseResponse(api.admin.stats.$get()),
    refetchInterval: 30_000,
  });
  const isAdmin = role === "admin";

  return (
    <div {...stylex.props(layout.container, layout.page, styles.page)}>
      <PageHeader
        title="Moderation"
        description={`Signed in as ${role}.`}
        actions={
          stats && (
            <p {...stylex.props(styles.stats)}>
              <span>
                <span {...stylex.props(stats.pendingPacks > 0 ? styles.urgent : styles.number)}>
                  {stats.pendingPacks}
                </span>{" "}
                waiting for review
              </span>
              <span>
                <span {...stylex.props(stats.pendingReports > 0 ? styles.urgent : styles.number)}>
                  {stats.pendingReports}
                </span>{" "}
                open reports
              </span>
            </p>
          )
        }
      />
      <NavTabs label="Moderation sections">
        <NavTab to="/admin" count={stats?.pendingPacks} urgent={(stats?.pendingPacks ?? 0) > 0}>
          Review queue
        </NavTab>
        <NavTab
          to="/reports"
          count={stats?.pendingReports}
          urgent={(stats?.pendingReports ?? 0) > 0}
        >
          Reports
        </NavTab>
        {canViewUsers && (
          <NavTab to="/users" count={stats?.totalUsers}>
            Users
          </NavTab>
        )}
        {isAdmin && <NavTab to="/analytics">Analytics</NavTab>}
      </NavTabs>
      <Outlet />
    </div>
  );
}
