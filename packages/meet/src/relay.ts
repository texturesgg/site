import { z } from "zod";
import { RELAY_TTL_S } from "./protocol";

/**
 * Credentials for Cloudflare's TURN server, for a host whose games couldn't
 * punch through to each other. The TURN key (TURN_KEY_ID, TURN_KEY_API_TOKEN,
 * Worker secrets) never leaves this Worker; the game gets a username and
 * credential that work for RELAY_TTL_S.
 *
 * In development, TURN_DEV_SERVER ("host:port"), TURN_DEV_USER and
 * TURN_DEV_PASS stand for them: a local TURN server's static credentials.
 */

/**
 * Relayed sessions a day across every account (wrangler.toml
 * RELAY_TOTAL_DAILY): the cap on the whole relay bill, beside each account's
 * RELAY_DAILY. 0 turns the relay off. A value that isn't a whole number
 * counts as 0, so a typo closes the relay rather than opening it.
 */
export function relayTotalDaily(env: Pick<MeetEnv, "RELAY_TOTAL_DAILY">): number {
  const cap = z.coerce.number().int().min(0).safeParse(env.RELAY_TOTAL_DAILY);
  if (!cap.success) console.error("RELAY_TOTAL_DAILY isn't a whole number; the relay is off");
  return cap.success ? cap.data : 0;
}

export type RelayCredentials = { server: string; username: string; credential: string };

/** Cloudflare's answer: one ICE server or a list, each with one URL or a list. */
const IceServer = z.object({
  urls: z.union([z.string(), z.array(z.string())]).optional(),
  username: z.string().optional(),
  credential: z.string().optional(),
});
const IceServersResponse = z.object({
  iceServers: z.union([IceServer, z.array(IceServer)]).optional(),
});

/** "turn:turn.cloudflare.com:3478?transport=udp" → "turn.cloudflare.com:3478" */
export function udpServer(urls: string[]): string | null {
  for (const url of urls) {
    const m = /^turn:([^?]+)(\?transport=udp)?$/.exec(url);
    if (m && (m[2] !== undefined || !url.includes("?"))) {
      return m[1].includes(":") ? m[1] : `${m[1]}:3478`;
    }
  }
  return null;
}

export async function relayCredentials(env: MeetEnv): Promise<RelayCredentials | null> {
  if (env.ENVIRONMENT === "development" && env.TURN_DEV_SERVER) {
    return {
      server: env.TURN_DEV_SERVER,
      username: env.TURN_DEV_USER ?? "",
      credential: env.TURN_DEV_PASS ?? "",
    };
  }
  const keyId = env.TURN_KEY_ID;
  const token = env.TURN_KEY_API_TOKEN;
  if (!keyId || !token) return null;

  const res = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: RELAY_TTL_S }),
    }
  );
  if (!res.ok) {
    console.error("TURN credentials refused", res.status);
    return null;
  }
  const parsed = IceServersResponse.safeParse(await res.json());
  if (!parsed.success) {
    console.error("TURN credentials in an unknown shape");
    return null;
  }
  const body = parsed.data;
  const servers = Array.isArray(body.iceServers) ? body.iceServers : [body.iceServers ?? {}];
  for (const s of servers) {
    const urls = Array.isArray(s.urls) ? s.urls : s.urls ? [s.urls] : [];
    const server = udpServer(urls);
    if (server && s.username && s.credential) {
      return { server, username: s.username, credential: s.credential };
    }
  }
  console.error("TURN credentials without a UDP server");
  return null;
}
