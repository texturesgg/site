import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { displayName, LIMITS } from "@vgskins/shared";
import { parseResponse } from "hono/client";
import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { api, apiError } from "@/lib/api";
import { Badge, Button, ConfirmDialog, TextArea } from "../primitives";
import { color, font, radius, space, text, tracking } from "../tokens.stylex";
import { ReportDialog } from "./ReportDialog";
import { relativeTime } from "@/lib/format";

const styles = stylex.create({
  section: { display: "flex", flexDirection: "column", gap: space.md },
  heading: { margin: 0, fontSize: text.h3, fontWeight: 800, letterSpacing: tracking.tight },
  count: { fontFamily: font.mono, fontSize: text.lg, fontWeight: 500, color: color.muted },
  prompt: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.sm,
    margin: 0,
    fontSize: text.md,
    color: color.muted,
  },
  form: { display: "flex", flexDirection: "column", gap: space.xs },
  formActions: { display: "flex", justifyContent: "flex-end", gap: space.xs },
  error: { margin: 0, fontSize: text.sm, color: color.danger },
  list: { display: "flex", flexDirection: "column", gap: space.md, margin: 0, padding: 0 },
  item: { listStyle: "none" },
  comment: { display: "flex", gap: space.sm },
  replies: {
    display: "flex",
    flexDirection: "column",
    gap: space.sm,
    marginTop: space.sm,
    marginLeft: space.md,
    paddingLeft: space.md,
    borderLeftWidth: "2px",
    borderLeftStyle: "solid",
    borderLeftColor: color.line,
  },
  avatar: {
    flexShrink: 0,
    width: "32px",
    height: "32px",
    borderRadius: radius.pill,
    objectFit: "cover",
    backgroundColor: color.raise,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: text.sm,
    fontWeight: 700,
    color: color.muted,
  },
  main: { display: "flex", flexDirection: "column", gap: space.xxs, minWidth: 0, flexGrow: 1 },
  meta: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.xs },
  name: {
    fontSize: text.md,
    fontWeight: 700,
    color: color.text,
    textDecoration: { default: "none", ":hover": "underline" },
  },
  time: { fontFamily: font.mono, fontSize: text.xs, color: color.muted },
  body: {
    margin: 0,
    fontSize: text.md,
    lineHeight: 1.55,
    color: color.text,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  actions: { display: "flex", flexWrap: "wrap", columnGap: space.md },
  empty: { margin: 0, fontSize: text.md, color: color.muted },
  skeleton: { height: "56px", borderRadius: radius.md, backgroundColor: color.surface },
});

function useCommentsQuery(packId: string) {
  return useQuery({
    queryKey: ["comments", packId],
    queryFn: () =>
      parseResponse(api.packs["by-id"][":id"].comments.$get({ param: { id: packId } })),
  });
}

type Comment = NonNullable<ReturnType<typeof useCommentsQuery>["data"]>["comments"][number];

function CommentForm({
  packId,
  parentId,
  onDone,
}: {
  packId: string;
  parentId?: string;
  onDone?: () => void;
}) {
  const [body, setBody] = useState("");
  const queryClient = useQueryClient();
  const post = useMutation({
    mutationFn: async () => {
      const res = await api.packs["by-id"][":id"].comments.$post({
        param: { id: packId },
        json: { body, parentId },
      });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["comments", packId] });
      onDone?.();
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (body.trim()) post.mutate();
      }}
      {...stylex.props(styles.form)}
    >
      <TextArea
        label={parentId ? "Reply" : "Add a comment"}
        hideLabel
        placeholder={parentId ? "Write a reply" : "Add a comment"}
        value={body}
        onChange={(event) => setBody(event.currentTarget.value)}
        maxLength={LIMITS.COMMENT_MAX}
        rows={parentId ? 2 : 3}
        disabled={post.isPending}
      />
      {post.isError && (
        <p role="alert" {...stylex.props(styles.error)}>
          {post.error.message || "The comment couldn't be posted."}
        </p>
      )}
      <div {...stylex.props(styles.formActions)}>
        {onDone && (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={!body.trim() || post.isPending}>
          {post.isPending ? "Posting…" : parentId ? "Reply" : "Post"}
        </Button>
      </div>
    </form>
  );
}

function CommentItem({
  comment,
  packId,
  canReply,
  children,
}: {
  comment: Comment;
  packId: string;
  canReply: boolean;
  children?: React.ReactNode;
}) {
  const { user } = useAuth();
  const [replying, setReplying] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: () =>
      parseResponse(
        api.packs["by-id"][":id"].comments[":commentId"].$delete({
          param: { id: packId, commentId: comment.id },
        })
      ),
    onSuccess: () => {
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["comments", packId] });
    },
  });

  const isAuthor = user?.id === comment.userId;
  const isModerator = user?.role === "moderator" || user?.role === "admin";

  return (
    <li {...stylex.props(styles.item)}>
      <article {...stylex.props(styles.comment)}>
        {comment.userImage ? (
          <img src={comment.userImage} alt="" {...stylex.props(styles.avatar)} />
        ) : (
          <span aria-hidden="true" {...stylex.props(styles.avatar)}>
            {displayName(comment.userName || "?")[0].toUpperCase()}
          </span>
        )}
        <div {...stylex.props(styles.main)}>
          <div {...stylex.props(styles.meta)}>
            {comment.userName ? (
              <Link
                to="/users/$username"
                params={{ username: comment.userName }}
                {...stylex.props(styles.name)}
              >
                {displayName(comment.userName)}
              </Link>
            ) : (
              <span {...stylex.props(styles.name)}>Deleted user</span>
            )}
            <time
              dateTime={new Date(comment.createdAt).toISOString()}
              {...stylex.props(styles.time)}
            >
              {relativeTime(comment.createdAt)}
            </time>
            {comment.source && <Badge>Legacy</Badge>}
          </div>
          <p {...stylex.props(styles.body)}>{comment.body}</p>
          {user && (
            <div {...stylex.props(styles.actions)}>
              {canReply && (
                <Button
                  variant="text"
                  aria-expanded={replying}
                  onClick={() => setReplying(!replying)}
                >
                  Reply
                </Button>
              )}
              {!isAuthor && (
                <Button variant="text" onClick={() => setReportOpen(true)}>
                  Report
                </Button>
              )}
              {(isAuthor || isModerator) && (
                <Button variant="text" onClick={() => setConfirmOpen(true)}>
                  Delete
                </Button>
              )}
            </div>
          )}
          {replying && (
            <CommentForm packId={packId} parentId={comment.id} onDone={() => setReplying(false)} />
          )}
          {children}
        </div>
      </article>
      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        targetType="comment"
        targetId={comment.id}
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this comment?"
        description="It will be removed for everyone."
        confirmLabel="Delete comment"
        pending={remove.isPending}
        error={remove.error?.message}
        onConfirm={() => remove.mutate()}
      />
    </li>
  );
}

/** A pack's comment thread: top-level comments with one level of replies. */
export function Comments({ packId }: { packId: string }) {
  const { isAuthenticated, requireAuth } = useAuth();
  const { data, isPending, isError, refetch } = useCommentsQuery(packId);
  const comments = data?.comments ?? [];
  const topLevel = comments.filter((comment) => !comment.parentId);
  const replies = (parentId: string) => comments.filter((c) => c.parentId === parentId);

  return (
    <section aria-labelledby="comments-heading" {...stylex.props(styles.section)}>
      <h2 id="comments-heading" {...stylex.props(styles.heading)}>
        Comments{" "}
        {comments.length > 0 && <span {...stylex.props(styles.count)}>{comments.length}</span>}
      </h2>

      {isAuthenticated ? (
        <CommentForm packId={packId} />
      ) : (
        <p {...stylex.props(styles.prompt)}>
          <Button onClick={() => requireAuth("leave a comment")}>Sign in to comment</Button>
        </p>
      )}

      {isPending ? (
        <div aria-hidden="true" {...stylex.props(styles.list)}>
          <div {...stylex.props(styles.skeleton)} />
          <div {...stylex.props(styles.skeleton)} />
        </div>
      ) : isError ? (
        <p role="alert" {...stylex.props(styles.prompt)}>
          Comments couldn't be loaded.
          <Button variant="text" onClick={() => refetch()}>
            Try again
          </Button>
        </p>
      ) : topLevel.length === 0 ? (
        <p {...stylex.props(styles.empty)}>No comments yet.</p>
      ) : (
        <ul {...stylex.props(styles.list)}>
          {topLevel.map((comment) => {
            const thread = replies(comment.id);
            return (
              <CommentItem key={comment.id} comment={comment} packId={packId} canReply>
                {thread.length > 0 && (
                  <ul {...stylex.props(styles.replies)}>
                    {thread.map((reply) => (
                      <CommentItem
                        key={reply.id}
                        comment={reply}
                        packId={packId}
                        canReply={false}
                      />
                    ))}
                  </ul>
                )}
              </CommentItem>
            );
          })}
        </ul>
      )}
    </section>
  );
}
