/**
 * The meeting point: `wss://meet.textures.gg/v1?ticket=...`. The ticket comes
 * from the API (/api/meet/ticket, through `tgg account ticket meet`), and the
 * API checks it here over a Service Binding. The connection then belongs to
 * the account's Player DO.
 */
export { Player } from "./player";
export { Room } from "./room";
export { Queue } from "./queue";
export { Directory } from "./directory";

/** How long the queue list is cached at the edge. */
const QUEUES_CACHE_S = 10;

/**
 * GET /v1/queues: the busiest queues and how many are searching in each, for
 * an app's Find a match screen. `?limit=` up to 50. Cached for
 * QUEUES_CACHE_S, so asking often costs the Directory nothing.
 */
async function queues(request: Request, env: MeetEnv, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit")) || 20));
  const cacheKey = new Request(`${url.origin}/v1/queues?limit=${limit}`);
  const cache = await caches.open("queues");
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName("all"));
  const response = Response.json(
    { queues: await directory.list(limit) },
    {
      headers: {
        "Cache-Control": `public, max-age=${QUEUES_CACHE_S}`,
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

/** In development, `?ticket=dev:<name>` stands for a signed-in player. */
async function playerFor(env: MeetEnv, ticket: string) {
  if (env.ENVIRONMENT === "development" && ticket.startsWith("dev:")) {
    const name = ticket.slice(4);
    return /^[a-zA-Z0-9_-]{1,32}$/.test(name) ? { id: `dev-${name}`, name } : null;
  }
  return env.API.verifyTicket(ticket);
}

export default {
  async fetch(request: Request, env: MeetEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return Response.json({ status: "ok", service: "tgg-meet" });
    }
    if (url.pathname === "/v1/queues" && request.method === "GET") {
      return queues(request, env, ctx);
    }
    if (url.pathname !== "/v1") {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return Response.json({ error: "This is a WebSocket" }, { status: 426 });
    }

    const ip = request.headers.get("cf-connecting-ip") ?? "";
    if (env.ENVIRONMENT !== "development") {
      const { success } = await env.RATE_LIMIT_CONNECT.limit({ key: ip });
      if (!success) {
        return Response.json(
          { error: "Too many connections. Wait a minute and try again." },
          { status: 429, headers: { "Retry-After": "60" } }
        );
      }
    }

    const ticket = url.searchParams.get("ticket") ?? "";
    const player = await playerFor(env, ticket);
    if (!player) {
      return Response.json(
        { error: "Your sign-in for online play expired. Try again." },
        { status: 401 }
      );
    }

    const headers = new Headers(request.headers);
    headers.set("x-meet-user", player.id);
    headers.set("x-meet-name", player.name);
    headers.set("x-meet-ip", ip);
    // Where Cloudflare places the connection, for pairing nearby players
    const cf = request.cf as { latitude?: string; longitude?: string } | undefined;
    headers.set("x-meet-lat", cf?.latitude ?? "");
    headers.set("x-meet-lon", cf?.longitude ?? "");
    const stub = env.PLAYER.get(env.PLAYER.idFromName(player.id));
    return stub.fetch(new Request(request.url, { headers }));
  },
} satisfies ExportedHandler<MeetEnv>;
