import type { SupportLink, SupportService } from "@vgskins/shared";

/** Each service a profile can link for support, in the order settings lists them. */
export const SUPPORT_SERVICE_NAMES: Record<SupportService, string> = {
  kofi: "Ko-fi",
  patreon: "Patreon",
  "github-sponsors": "GitHub Sponsors",
  youtube: "YouTube",
  twitch: "Twitch",
};

/** What a support link says: its service, or the label its owner gave it. */
export function supportLinkLabel(link: SupportLink): string {
  return link.kind === "other" ? link.label : SUPPORT_SERVICE_NAMES[link.kind];
}
