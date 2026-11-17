import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { type MeetQueueSummary, MeetQueuesResponse } from "@vgskins/shared/meet";
import { MEET_URL } from "@/lib/config";
import { color, font, radius, space, text } from "../tokens.stylex";

/** How often the list refreshes; the meeting point caches it for 10 seconds. */
const REFRESH_MS = 15_000;
/** The most queues shown. */
const SHOWN = 6;

const styles = stylex.create({
  section: { display: "flex", flexDirection: "column", gap: space.md },
  heading: { margin: 0, fontSize: text.h3, fontWeight: 800 },
  list: {
    display: "flex",
    flexDirection: "column",
    margin: 0,
    padding: 0,
    listStyle: "none",
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: space.md,
    padding: `${space.sm} ${space.lg}`,
    borderTopWidth: { default: "1px", ":first-child": 0 },
    borderTopStyle: "solid",
    borderTopColor: color.line,
  },
  label: { fontSize: text.lg, fontWeight: 700 },
  mode: { fontSize: text.sm, color: color.muted, whiteSpace: "nowrap" },
  searching: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: space.xs,
    fontFamily: font.mono,
    fontSize: text.sm,
    whiteSpace: "nowrap",
  },
  dot: {
    width: "8px",
    height: "8px",
    borderRadius: radius.pill,
    backgroundColor: color.success,
    flexShrink: 0,
  },
  quiet: {
    margin: 0,
    display: "flex",
    alignItems: "center",
    gap: space.xs,
    fontSize: text.sm,
    color: color.muted,
  },
  quietDot: {
    width: "8px",
    height: "8px",
    borderRadius: radius.pill,
    backgroundColor: color.lineStrong,
    flexShrink: 0,
  },
  how: { margin: 0, fontSize: text.sm, color: color.muted },
});

/** A queue's mode as a player knows it: VS Mode, or a mod's menu entry ("main/first-to-3"). */
export function modeName(mode: string): string {
  if (mode === "vs") return "VS Mode";
  const last = mode.split("/").pop() ?? mode;
  const words = last.replace(/[-_.]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

async function fetchQueues(): Promise<MeetQueueSummary[]> {
  const response = await fetch(`${MEET_URL}/v1/queues?limit=${SHOWN}`);
  if (!response.ok) throw new Error(`The queue list answered ${response.status}`);
  return MeetQueuesResponse.parse(await response.json()).queues;
}

/**
 * Who is searching for a match in the game right now, by queue: a short list
 * when anyone is, otherwise one quiet line. Nothing when the list can't load.
 */
export function FindMatch() {
  const { data } = useQuery({
    queryKey: ["meet", "queues"],
    queryFn: fetchQueues,
    refetchInterval: REFRESH_MS,
    retry: false,
  });
  if (!data) return null;
  const queues = data.filter((queue) => queue.searching > 0);

  if (queues.length === 0) {
    return (
      <p {...stylex.props(styles.quiet)}>
        <span {...stylex.props(styles.quietDot)} aria-hidden="true" />
        No one is searching for a match right now.
      </p>
    );
  }
  return (
    <section {...stylex.props(styles.section)} aria-labelledby="find-match">
      <h2 id="find-match" {...stylex.props(styles.heading)}>
        Searching now
      </h2>
      <ul {...stylex.props(styles.list)}>
        {queues.map((queue) => (
          <li key={`${queue.mode} ${queue.label}`} {...stylex.props(styles.row)}>
            <span {...stylex.props(styles.label)}>{queue.label}</span>
            <span {...stylex.props(styles.mode)}>{modeName(queue.mode)}</span>
            <span {...stylex.props(styles.searching)}>
              <span {...stylex.props(styles.dot)} aria-hidden="true" />
              {queue.searching} searching
            </span>
          </li>
        ))}
      </ul>
      <p {...stylex.props(styles.how)}>In the game, open Online and pick Find a match.</p>
    </section>
  );
}
