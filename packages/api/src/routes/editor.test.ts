import { createExecutionContext, env } from "cloudflare:test";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { HonoEnv } from "../types";
import editorRoutes, { MAX_EDITOR_REPORT_CHARS } from "./editor";

const app = new Hono<HonoEnv>().route("/api/editor", editorRoutes);

function send(body: string) {
  return app.request(
    "/api/editor/reports",
    { method: "POST", headers: { "content-type": "application/json" }, body },
    env,
    createExecutionContext()
  );
}

describe("editor problem reports", () => {
  it("keeps a report under the id it returns", async () => {
    const report = "textures.gg editor 0.1.0 (linux x86_64)\n\n[    0.002] panic: example";
    const response = await send(JSON.stringify({ report }));
    expect(response.status).toBe(201);
    const { id } = await response.json<{ id: string }>();

    // The key carries the day the report arrived, so find it by its id.
    const { objects } = await env.BUCKET.list({ prefix: "editor-reports/" });
    const key = objects.find((object) => object.key.endsWith(`/${id}.txt`))?.key;
    const stored = key ? await env.BUCKET.get(key) : null;
    expect(await stored?.text()).toBe(report);
    expect(stored?.httpMetadata?.contentType).toBe("text/plain; charset=utf-8");
  });

  it("refuses an empty or oversized report, or a body that isn't one", async () => {
    for (const [body, status] of [
      [JSON.stringify({ report: "  \n" }), 400],
      [JSON.stringify({ report: "a".repeat(MAX_EDITOR_REPORT_CHARS + 1) }), 400],
      [JSON.stringify({}), 400],
      ["a".repeat(MAX_EDITOR_REPORT_CHARS * 4 + 1), 413],
    ] as const) {
      const response = await send(body);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: expect.any(String) });
    }
  });
});
