import type { CodeModNetplay, ReportReason } from "@vgskins/shared";

/** "just now", "5m ago", "3d ago", "2y ago". */
export function relativeTime(timestamp: string | number): string {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** What a report reason is called, to the reporter and to moderators alike. */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  inappropriate: "Inappropriate content",
  stolen: "Stolen or uncredited work",
  spam: "Spam",
  broken: "Broken or corrupt file",
  other: "Something else",
};

/** What a code mod's package counts as for netplay, as tgg works it out. */
export const NETPLAY_LABELS: Record<CodeModNetplay, string> = {
  code: "Counts for netplay",
  files: "Counts for netplay",
  costumes: "Counts for netplay unless its costumes only change looks",
  data: "Free for netplay",
};
