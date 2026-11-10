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

export type RelayCredentials = { server: string; username: string; credential: string };

type IceServers = { urls?: string | string[]; username?: string; credential?: string };

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
  const body = (await res.json()) as { iceServers?: IceServers | IceServers[] };
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
