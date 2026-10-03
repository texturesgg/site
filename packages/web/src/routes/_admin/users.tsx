import * as stylex from "@stylexjs/stylex";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { displayName, USER_ROLES, type UserRole } from "@vgskins/shared";
import { type InferResponseType, parseResponse } from "hono/client";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { ChevronDownIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/patterns/EmptyState";
import { Pagination } from "@/ui/patterns/Pagination";
import {
  Badge,
  Button,
  ConfirmDialog,
  SearchField,
  TextField,
  TextLink,
  ToggleGroup,
} from "@/ui/primitives";
import { shared } from "@/ui/primitives/shared";
import { color, font, radius, space, text } from "@/ui/tokens.stylex";

interface AdminUsersSearch {
  q?: string;
  role?: UserRole;
  page?: number;
}

export const Route = createFileRoute("/_admin/users")({
  validateSearch: (search: Record<string, unknown>): AdminUsersSearch => ({
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    role: USER_ROLES.find((role) => role === search.role),
    page: typeof search.page === "number" && search.page > 1 ? search.page : undefined,
  }),
  head: () => ({ meta: [{ title: "Users - textures.gg" }] }),
  component: UsersPage,
});

type AdminUser = InferResponseType<typeof api.admin.users.$get, 200>["items"][number];

const ROLE_FILTERS = [
  { value: "all", label: "Everyone" },
  ...USER_ROLES.map((role) => ({
    value: role,
    label: `${role[0].toUpperCase()}${role.slice(1)}s`,
  })),
] as const;

const PROVIDER_LABELS: Record<string, string> = {
  discord: "Discord",
  google: "Google",
  github: "GitHub",
  twitter: "X",
  credential: "Email",
};

const styles = stylex.create({
  section: { display: "flex", flexDirection: "column", gap: space.md },
  toolbar: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.sm },
  search: { flexGrow: 1, flexBasis: "18rem", maxWidth: "480px" },
  count: { margin: 0, fontSize: text.md, color: color.muted },
  list: { display: "flex", flexDirection: "column", gap: space.xs, margin: 0, padding: 0 },
  item: {
    listStyle: "none",
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    overflow: "hidden",
  },
  summary: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    width: "100%",
    minHeight: "64px",
    paddingInline: space.md,
    borderWidth: 0,
    backgroundColor: { default: "transparent", ":hover": color.raise },
    color: color.text,
    textAlign: "left",
    cursor: "pointer",
  },
  avatar: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "36px",
    height: "36px",
    borderRadius: radius.pill,
    objectFit: "cover",
    backgroundColor: color.raise,
    fontSize: text.md,
    fontWeight: 700,
    color: color.muted,
  },
  dimmed: { opacity: 0.5 },
  who: { display: "flex", flexDirection: "column", minWidth: 0, flexGrow: 1 },
  nameRow: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.xs },
  name: { fontSize: text.md, fontWeight: 700 },
  struck: { textDecoration: "line-through", color: color.muted },
  email: {
    fontFamily: font.mono,
    fontSize: text.xs,
    color: color.muted,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  providers: { display: { default: "none", "@media (min-width: 768px)": "flex" }, gap: space.xxs },
  chevron: {
    flexShrink: 0,
    color: color.muted,
    transitionProperty: "transform",
    transitionDuration: "120ms",
  },
  chevronOpen: { transform: "rotate(180deg)" },
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: space.md,
    padding: space.md,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: color.line,
  },
  control: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.sm },
  controlLabel: { minWidth: "6rem", fontSize: text.sm, fontWeight: 600, color: color.muted },
  note: { margin: 0, fontSize: text.sm, color: color.muted },
  error: { margin: 0, fontSize: text.sm, color: color.danger },
  skeleton: { height: "64px", borderRadius: radius.lg, backgroundColor: color.surface },
});

function UsersPage() {
  const { q, role, page = 1 } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { canSetRoles, canBan } = useRouteContext({ from: "/_admin" });
  const [open, setOpen] = useState<string | null>(null);

  // Search is typed locally and written to the URL after a pause.
  const [input, setInput] = useState(q ?? "");
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => setInput(q ?? ""), [q]);

  const users = useQuery({
    queryKey: ["admin", "users", q, role, page],
    placeholderData: keepPreviousData,
    queryFn: () =>
      parseResponse(
        api.admin.users.$get({ query: { search: q, role, page: String(page), pageSize: "50" } })
      ),
  });

  const items = users.data?.items ?? [];

  return (
    <section aria-label="Users" {...stylex.props(styles.section)}>
      <div {...stylex.props(styles.toolbar)}>
        <div {...stylex.props(styles.search)}>
          <SearchField
            label="Search users"
            placeholder="Search by name or email"
            value={input}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setInput(value);
              clearTimeout(debounce.current);
              debounce.current = setTimeout(
                () =>
                  navigate({
                    search: (prev) => ({ ...prev, q: value || undefined, page: undefined }),
                  }),
                300
              );
            }}
          />
        </div>
        <ToggleGroup
          label="Filter by role"
          value={role ?? "all"}
          options={ROLE_FILTERS}
          onValueChange={(next) =>
            navigate({
              search: (prev) => ({
                ...prev,
                role: next === "all" ? undefined : next,
                page: undefined,
              }),
            })
          }
        />
      </div>
      <p aria-live="polite" {...stylex.props(styles.count)}>
        {users.data ? `${users.data.total.toLocaleString("en-US")} users` : "Loading…"}
      </p>

      {users.isPending ? (
        <div aria-hidden="true" {...stylex.props(styles.list)}>
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} {...stylex.props(styles.skeleton)} />
          ))}
        </div>
      ) : users.isError ? (
        <EmptyState
          title="Users couldn't be loaded"
          body={users.error.message}
          action={<Button onClick={() => users.refetch()}>Try again</Button>}
        />
      ) : items.length === 0 ? (
        <EmptyState title="No users match" body="Try another name, email, or role." />
      ) : (
        <ul {...stylex.props(styles.list)}>
          {items.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              open={open === user.id}
              onToggle={() => setOpen(open === user.id ? null : user.id)}
              canSetRoles={canSetRoles}
              canBan={canBan}
            />
          ))}
        </ul>
      )}

      {users.data && (
        <Pagination
          page={page}
          totalPages={users.data.totalPages}
          onPageChange={(next) => {
            navigate({ search: (prev) => ({ ...prev, page: next > 1 ? next : undefined }) });
            window.scrollTo({ top: 0 });
          }}
        />
      )}
    </section>
  );
}

function UserRow({
  user,
  open,
  onToggle,
  canSetRoles,
  canBan,
}: {
  user: AdminUser;
  open: boolean;
  onToggle: () => void;
  canSetRoles: boolean;
  canBan: boolean;
}) {
  const panelId = useId();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
  const [banReason, setBanReason] = useState("");
  const [confirming, setConfirming] = useState<"ban" | "purge" | null>(null);
  const banned = Boolean(user.banned);
  const currentRole = USER_ROLES.find((role) => role === user.role) ?? "user";
  const name = user.name ? displayName(user.name) : "Unnamed";

  // better-auth's admin client resolves with { error } instead of throwing.
  const run = async <T,>(call: Promise<{ data: T; error: { message?: string } | null }>) => {
    const result = await call;
    if (result.error) throw new Error(result.error.message || "That action failed.");
    return result.data;
  };

  const setRole = useMutation({
    mutationFn: (role: UserRole) => run(authClient.admin.setRole({ userId: user.id, role })),
    onSuccess: refresh,
  });
  const ban = useMutation({
    mutationFn: () =>
      run(authClient.admin.banUser({ userId: user.id, banReason: banReason.trim() || undefined })),
    onSuccess: () => {
      setConfirming(null);
      setBanReason("");
      refresh();
    },
  });
  const unban = useMutation({
    mutationFn: () => run(authClient.admin.unbanUser({ userId: user.id })),
    onSuccess: refresh,
  });
  const verify = useMutation({
    mutationFn: async () => {
      const res = await api.admin.users[":id"]["verify-email"].$post({ param: { id: user.id } });
      if (!res.ok) throw await apiError(res);
    },
    onSuccess: refresh,
  });
  const purge = useMutation({
    mutationFn: async () => {
      const res = await api.admin.users[":id"]["ban-purge"].$post({
        param: { id: user.id },
        json: { banReason: banReason.trim() || undefined },
      });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
    onSuccess: (data) => {
      setConfirming(null);
      setBanReason("");
      refresh();
      toast(`${name} banned and purged`, {
        description: `${data.purged.packs} packs, ${data.purged.comments} comments, and ${data.purged.files} files deleted.`,
      });
    },
  });
  const actionError = setRole.error ?? unban.error ?? verify.error;

  return (
    <li {...stylex.props(styles.item)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        {...stylex.props(styles.summary, shared.focusRing)}
      >
        {user.image ? (
          <img src={user.image} alt="" {...stylex.props(styles.avatar, banned && styles.dimmed)} />
        ) : (
          <span aria-hidden="true" {...stylex.props(styles.avatar, banned && styles.dimmed)}>
            {name[0]?.toUpperCase()}
          </span>
        )}
        <span {...stylex.props(styles.who)}>
          <span {...stylex.props(styles.nameRow)}>
            <span {...stylex.props(styles.name, banned && styles.struck)}>{name}</span>
            {currentRole !== "user" && <Badge tone="accent">{currentRole}</Badge>}
            {!user.emailVerified && <Badge>Unverified</Badge>}
            {banned && <Badge>Banned</Badge>}
          </span>
          <span {...stylex.props(styles.email)}>{user.email}</span>
        </span>
        <span {...stylex.props(styles.providers)}>
          {(user.providers ?? []).map((provider) => (
            <Badge key={provider}>{PROVIDER_LABELS[provider] ?? provider}</Badge>
          ))}
        </span>
        <span {...stylex.props(styles.chevron, open && styles.chevronOpen)}>
          <ChevronDownIcon />
        </span>
      </button>

      {open && (
        <div id={panelId} {...stylex.props(styles.panel)}>
          <div {...stylex.props(styles.control)}>
            <span {...stylex.props(styles.controlLabel)}>Profile</span>
            {user.name && (
              <TextLink to="/users/$username" params={{ username: user.name }}>
                View profile
              </TextLink>
            )}
          </div>

          {canSetRoles && (
            <div {...stylex.props(styles.control)}>
              <span {...stylex.props(styles.controlLabel)}>Role</span>
              <ToggleGroup
                label={`Role for ${name}`}
                value={currentRole}
                options={USER_ROLES.map((role) => ({ value: role, label: role }))}
                onValueChange={(role) => {
                  if (role !== currentRole && !setRole.isPending) setRole.mutate(role);
                }}
              />
            </div>
          )}

          {canSetRoles && !user.emailVerified && (
            <div {...stylex.props(styles.control)}>
              <span {...stylex.props(styles.controlLabel)}>Email</span>
              <Button disabled={verify.isPending} onClick={() => verify.mutate()}>
                {verify.isPending ? "Saving…" : "Mark as verified"}
              </Button>
            </div>
          )}

          {canBan && (
            <div {...stylex.props(styles.control)}>
              <span {...stylex.props(styles.controlLabel)}>Ban</span>
              {banned ? (
                <>
                  {user.banReason && <p {...stylex.props(styles.note)}>Reason: {user.banReason}</p>}
                  <Button disabled={unban.isPending} onClick={() => unban.mutate()}>
                    {unban.isPending ? "Unbanning…" : "Unban"}
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={() => setConfirming("ban")}>Ban…</Button>
                  {canSetRoles && (
                    <Button variant="ghost" onClick={() => setConfirming("purge")}>
                      Ban and delete all content…
                    </Button>
                  )}
                </>
              )}
            </div>
          )}

          {actionError && (
            <p role="alert" {...stylex.props(styles.error)}>
              {actionError.message}
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(next) => {
          if (!next) {
            setConfirming(null);
            ban.reset();
            purge.reset();
          }
        }}
        title={confirming === "purge" ? `Ban ${name} and delete everything?` : `Ban ${name}?`}
        description={
          confirming === "purge"
            ? "This bans them now and permanently deletes all their packs, comments, and files. It can't be undone."
            : "They're signed out immediately and can't sign in until unbanned."
        }
        confirmLabel={confirming === "purge" ? "Ban and delete" : "Ban"}
        pending={ban.isPending || purge.isPending}
        error={(confirming === "purge" ? purge.error : ban.error)?.message}
        onConfirm={() => (confirming === "purge" ? purge.mutate() : ban.mutate())}
      >
        <TextField
          label="Reason (optional)"
          value={banReason}
          onChange={(event) => setBanReason(event.currentTarget.value)}
        />
      </ConfirmDialog>
    </li>
  );
}
