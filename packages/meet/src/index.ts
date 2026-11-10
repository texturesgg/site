/**
 * The meeting point: `wss://meet.textures.gg/v1?ticket=...`. The ticket comes
 * from the API (/api/meet/ticket, through `tgg account ticket meet`), and the
 * API checks it here over a Service Binding. The connection then belongs to
 * the account's Player DO.
 */
export { Player } from "./player";
export { Room } from "./room";

/** In development, `?ticket=dev:<name>` stands for a signed-in player. */
async function playerFor(env: MeetEnv, ticket: string) {
  if (env.ENVIRONMENT === "development" && ticket.startsWith("dev:")) {
    const name = ticket.slice(4);
    return /^[a-zA-Z0-9_-]{1,32}$/.test(name) ? { id: `dev-${name}`, name } : null;
  }
  return env.API.verifyTicket(ticket);
}

export default {
  async fetch(request: Request, env: MeetEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return Response.json({ status: "ok", service: "tgg-meet" });
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
    const stub = env.PLAYER.get(env.PLAYER.idFromName(player.id));
    return stub.fetch(new Request(request.url, { headers }));
  },
} satisfies ExportedHandler<MeetEnv>;
