import { createExecutionContext, env } from "cloudflare:test";
import { Hono } from "hono";
import { expect, it, vi } from "vitest";
import type { HonoEnv } from "../types";
import flagsRoutes from "./flags";

// Someone signed out is asked about as the role `anonymous`, so a Flagship
// rule for everyone turns a flag on for visitors from a link or search too.
const app = new Hono<HonoEnv>().route("/api/flags", flagsRoutes);

it("asks Flagship about a signed-out viewer as anonymous", async () => {
  const flags = vi
    .spyOn(env.FLAGS, "getBooleanValue")
    .mockImplementation(async (_key, fallback, context) =>
      context?.role === "anonymous" ? true : fallback,
    );
  const res = await app.request("/api/flags/me", {}, env, createExecutionContext());
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ codeMods: true });
  expect(flags).toHaveBeenCalledWith("code-mods", false, { role: "anonymous" });
  flags.mockRestore();
});
