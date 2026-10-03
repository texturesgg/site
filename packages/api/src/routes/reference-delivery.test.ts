import { createHash } from "node:crypto";
import { env } from "cloudflare:test";
import {
  getMeleeAnimationReferenceAsset,
  MELEE_ANIMATION_REFERENCE_ASSETS,
} from "@vgskins/shared/melee-animation-reference";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { HonoEnv } from "../types";
import filesRoutes from "./files";

const reference = MELEE_ANIMATION_REFERENCE_ASSETS.reduce((smallest, asset) =>
  asset.byteLength < smallest.byteLength ? asset : smallest
);
// Synthetic transport bytes in isolated local R2, not an authenticated DAT.
// Browser SHA validation is a separate contract; this route streams approved keys.
const bytes = Buffer.alloc(reference.byteLength, 0x5a);
const digest = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const expectedDigest = digest(bytes);
const path = `/api/files/${reference.key}`;
const unknownKey = `reference/melee/gale01-r2/${"f".repeat(64)}.dat`;
const remoteOrigin = "https://assets.example";
let remoteBody = bytes;
let remoteStatus = 200;
let remoteRequests: string[] = [];

// Exercise the actual route with real bindings. The route returns its expected
// errors; anything thrown is an unexpected failure, which the API maps to 500.
// Global API CORS and error-body policy remain the full-Worker smoke boundary.
const app = new Hono<HonoEnv>()
  .route("/api/files", filesRoutes)
  .onError((_error, c) => c.body(null, 500));

function request(url = path, mode = "development", method = "GET") {
  return app.request(
    url,
    { method },
    {
      ...env,
      ENVIRONMENT: mode,
      ASSETS_BASE_URL: remoteOrigin,
    }
  );
}

// The public artifact host that preview falls back to. Nothing leaves the
// runtime: the Worker's outbound fetch is answered here.
beforeAll(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : input);
    remoteRequests.push(url.pathname);
    if (
      url.origin !== remoteOrigin ||
      url.pathname !== `/${reference.key}` ||
      remoteStatus !== 200
    ) {
      return new Response(null, { status: 404 });
    }
    return new Response(remoteBody, {
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(remoteBody.byteLength),
      },
    });
  });
});

beforeEach(async () => {
  await env.BUCKET.delete([reference.key, unknownKey]);
  remoteRequests = [];
  remoteBody = bytes;
  remoteStatus = 200;
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("immutable original reference delivery", () => {
  it.each(["GET", "HEAD"])("serves an allowlisted local object with %s", async (method) => {
    await env.BUCKET.put(reference.key, bytes);
    const response = await request(path, "production", method);
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-length")).toBe(String(bytes.byteLength));
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const body = new Uint8Array(await response.arrayBuffer());
    if (method === "HEAD") expect(body.byteLength).toBe(0);
    else expect(digest(body)).toBe(expectedDigest);
    expect(remoteRequests).toEqual([]);
  });

  it("rejects an unlisted hash even if the bucket contains it", async () => {
    expect(getMeleeAnimationReferenceAsset(unknownKey)).toBeUndefined();
    await env.BUCKET.put(unknownKey, bytes);
    const response = await request(`/api/files/${unknownKey}`, "preview");
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBeNull();
    expect(remoteRequests).toEqual([]);
  });

  it("rejects undeclared reference paths", async () => {
    await env.BUCKET.put(reference.key, bytes);
    for (const url of [
      path.replace(/\.dat$/, ".DAT"),
      "/api/files/reference/melee/gale01-r2/%2e%2e%2fsecret.dat",
      "/api/files/reference/melee/other/secret.dat",
    ]) {
      const response = await request(url, "preview");
      expect([400, 404]).toContain(response.status);
      expect(response.headers.get("cache-control")).toBeNull();
    }
    expect(remoteRequests).toEqual([]);
  });

  it("does not fall back outside preview when the local object is absent", async () => {
    const response = await request(path, "production");
    expect(response.status).toBe(404);
    expect(remoteRequests).toEqual([]);
  });

  it("prefers preview R2 over the public fallback", async () => {
    await env.BUCKET.put(reference.key, bytes);
    remoteStatus = 404;
    const response = await request(path, "preview");
    expect(response.status).toBe(200);
    expect(digest(new Uint8Array(await response.arrayBuffer()))).toBe(expectedDigest);
    expect(remoteRequests).toEqual([]);
  });

  it("uses the exact approved key on the public fallback without writing local R2", async () => {
    const response = await request(path, "preview");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe(String(bytes.byteLength));
    expect(digest(new Uint8Array(await response.arrayBuffer()))).toBe(expectedDigest);
    expect(remoteRequests).toEqual([`/${reference.key}`]);
    expect(await env.BUCKET.head(reference.key)).toBeNull();
  });

  it("reports a missing public fallback object", async () => {
    remoteStatus = 404;
    const response = await request(path, "preview");
    expect(response.status).toBe(404);
    expect(remoteRequests).toEqual([`/${reference.key}`]);
  });

  it.each(["local", "fallback"])(
    "refuses observed %s size mismatches without immutable success headers",
    async (source) => {
      const truncated = bytes.subarray(0, bytes.byteLength - 1);
      if (source === "local") await env.BUCKET.put(reference.key, truncated);
      else remoteBody = truncated;
      const response = await request(path, "preview");
      expect(response.status).toBe(500);
      expect(response.headers.get("cache-control")).toBeNull();
      expect(response.headers.get("content-length")).toBeNull();
      expect(remoteRequests).toEqual(source === "local" ? [] : [`/${reference.key}`]);
    }
  );
});
