import type { Env } from "../types";

export interface ArtifactBody {
  body: ReadableStream<Uint8Array> | null;
  readonly size?: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export function artifactUrl(baseUrl: string, key: string): string {
  const encodedKey = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${baseUrl.replace(/\/$/, "")}/${encodedKey}`;
}

/**
 * Read from the environment's writable bucket first. Preview falls back to
 * production's public artifact host so snapshots do not require an R2 copy.
 */
export async function getArtifact(env: Env, key: string): Promise<ArtifactBody | null> {
  const object = await env.BUCKET.get(key);
  if (object) return object;

  if (env.ENVIRONMENT !== "preview") return null;

  const response = await fetch(artifactUrl(env.ASSETS_BASE_URL, key));
  return response.ok ? response : null;
}
