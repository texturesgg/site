import type { AppType } from "@vgskins/api";
import { DetailedError, hc } from "hono/client";
import { API_BASE_URL, ASSETS_URL } from "./config";

// hono/client for typed API calls
const client = hc<AppType>(API_BASE_URL, {
  init: { credentials: "include" },
});

export const api = client.api;

// Helper to get file URLs from R2 (direct from CDN)
export function getFileUrl(key: string | null | undefined): string | undefined {
  if (!key) return undefined;
  return `${ASSETS_URL}/${key}`;
}

// Image URLs — DB stores base keys, R2 files have size suffixes
export function getThumbnailUrl(key: string | null | undefined): string | undefined {
  if (!key) return undefined;
  return `${ASSETS_URL}/${key}_sm.webp`;
}

export function getImageUrl(key: string | null | undefined): string | undefined {
  if (!key) return undefined;
  return `${ASSETS_URL}/${key}_full.webp`;
}

/**
 * The error for a response that was not OK: the API's `{ error }` message and
 * the status, as hono's DetailedError, the same class `parseResponse` throws.
 */
export async function apiError(response: {
  status: number;
  json(): Promise<unknown>;
}): Promise<DetailedError> {
  const body = await response.json().catch(() => null);
  const message =
    body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : `Request failed with status ${response.status}`;
  return new DetailedError(message, { statusCode: response.status });
}

/** Whether a request failed because nobody is signed in. */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof DetailedError && error.statusCode === 401;
}

/** Retry a failed query once, and only when retrying can help: a network error or a 5xx. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  return !(error instanceof DetailedError && error.statusCode < 500);
}

export function uploadFormData<T>(
  path: string,
  formData: FormData,
  options: {
    signal?: AbortSignal;
    onProgress?: (percentage: number) => void;
  } = {}
): Promise<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  const xhr = new XMLHttpRequest();
  xhr.open("POST", `${API_BASE_URL}${path}`);
  xhr.withCredentials = true;

  const abort = () => xhr.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  xhr.upload.addEventListener("progress", (event) => {
    if (event.lengthComputable) {
      options.onProgress?.(Math.round((event.loaded / event.total) * 100));
    }
  });
  xhr.addEventListener("load", () => {
    options.signal?.removeEventListener("abort", abort);
    let body: unknown;
    try {
      body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
    } catch {
      body = null;
    }
    if (xhr.status >= 200 && xhr.status < 300) {
      resolve(body as T);
      return;
    }
    const message =
      body && typeof body === "object" && "error" in body
        ? String(body.error)
        : `Request failed: ${xhr.status}`;
    reject(new Error(message));
  });
  xhr.addEventListener("error", () => {
    options.signal?.removeEventListener("abort", abort);
    reject(new Error("Upload failed because the network connection was interrupted"));
  });
  xhr.addEventListener("abort", () => {
    options.signal?.removeEventListener("abort", abort);
    reject(new DOMException("Upload canceled", "AbortError"));
  });
  xhr.send(formData);
  return promise;
}
