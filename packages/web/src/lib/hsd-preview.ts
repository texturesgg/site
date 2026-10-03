import { LIMITS } from "@vgskins/shared";
import { API_BASE_URL } from "./config";

/** `meleeFighter` for character costumes; `genericHsd` for everything else. */
export type HsdEvaluationPolicy = "meleeFighter" | "genericHsd";

export type HsdBackend = "webgpu" | "webgl";

/** A catalog reference DAT, served by the API under `key`. */
export interface ReferenceAsset {
  key: string;
  byteLength: number;
}

/** A parsed DAT before it has a canvas (`HsdScene` in either build). */
export interface HsdScene {
  /** Storage objects the costume's idle needs; `undefined` when none applies. */
  idleReferenceAssets(): ReferenceAsset[] | undefined;
  attachIdle(files: Uint8Array[]): boolean;
  readonly hasIdle: boolean;
  free(): void;
}

/** A scene drawing on a canvas (`HsdViewer` in either build). */
export interface HsdViewer {
  advance(ticks: number): void;
  setOrbit(yaw: number, pitch: number, zoom: number): void;
  resize(width: number, height: number): void;
  render(): void;
  readonly hasIdle: boolean;
  free(): void;
}

/**
 * The API both builds export. They come from one Rust source, but
 * wasm-bindgen's private class members make each build's classes nominally
 * distinct, so the site depends on this structural shape instead.
 */
export interface HsdRenderModule {
  default(): Promise<unknown>;
  HsdScene: new (dat: Uint8Array, policy: HsdEvaluationPolicy) => HsdScene;
  HsdViewer: {
    create(
      canvas: HTMLCanvasElement,
      scene: HsdScene,
      width: number,
      height: number
    ): Promise<HsdViewer>;
  };
}

/** An HTTP response that was not OK; the request itself reached the server. */
export class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "HttpStatusError";
  }
}

/** The error code the Rust adapter attaches to a thrown `Error`, if any. */
export function hsdErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

const modules = new Map<HsdBackend, Promise<HsdRenderModule>>();

/**
 * Load and initialize one build once per page. A module that trapped (a Rust
 * panic or an out-of-memory abort) is dropped, so the next preview starts a
 * fresh one instead of reusing broken state.
 */
export function loadHsdRenderModule(backend: HsdBackend): Promise<HsdRenderModule> {
  let module = modules.get(backend);
  if (!module) {
    const imported: Promise<HsdRenderModule> =
      backend === "webgpu"
        ? import("@vgskins/hsd-render/webgpu")
        : import("@vgskins/hsd-render/webgl");
    module = imported.then(async (loaded) => {
      await loaded.default();
      return loaded;
    });
    modules.set(backend, module);
  }
  return module;
}

/** Forget `backend`'s module after `error` if it was a trap. */
export function dropTrappedHsdModule(backend: HsdBackend, error: unknown): void {
  if (error instanceof WebAssembly.RuntimeError) modules.delete(backend);
}

let preferred: Promise<HsdBackend> | undefined;

/**
 * WebGPU when the browser offers an adapter; otherwise the WebGL2 build, which
 * is several times larger, so only browsers that need it download it.
 */
export function preferredHsdBackend(): Promise<HsdBackend> {
  preferred ??= (async () => {
    try {
      const adapter = await navigator.gpu?.requestAdapter();
      return adapter ? "webgpu" : "webgl";
    } catch {
      return "webgl";
    }
  })();
  return preferred;
}

async function fetchBoundedBytes(
  url: string,
  maxBytes: number,
  limitMessage: string,
  signal?: AbortSignal
): Promise<Uint8Array> {
  const response = await fetch(url, { credentials: "include", signal });
  if (!response.ok) {
    throw new HttpStatusError(response.status, `Request failed with status ${response.status}`);
  }
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error(limitMessage);
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        throw new Error(limitMessage);
      }
      chunks.push(value);
    }
  } else {
    const value = new Uint8Array(await response.arrayBuffer());
    byteLength = value.byteLength;
    if (byteLength > maxBytes) throw new Error(limitMessage);
    chunks.push(value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Fetch the idle reference DATs a costume needs. `undefined` means one was
 * unavailable (an HTTP or network failure), so the preview shows the bind pose;
 * Rust admits the bytes only by their catalog size and SHA-256.
 */
async function fetchIdleReferences(
  assets: ReferenceAsset[],
  signal: AbortSignal
): Promise<Uint8Array[] | undefined> {
  const controller = new AbortController();
  const referenceSignal = AbortSignal.any([signal, controller.signal]);
  try {
    return await Promise.all(
      assets.map((asset) =>
        fetchBoundedBytes(
          `${API_BASE_URL}/api/files/${asset.key}`,
          asset.byteLength,
          `Animation reference ${asset.key} exceeds its declared size`,
          referenceSignal
        )
      )
    );
  } catch (error: unknown) {
    controller.abort();
    if (signal.aborted) throw error;
    const unavailable = error instanceof HttpStatusError || error instanceof TypeError;
    if (!unavailable) throw error;
    console.warn("Idle animation references are unavailable; showing the bind pose", {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

/** Everything a canvas needs to build its own scene on every mount. */
export interface HsdPreviewInput {
  backend: HsdBackend;
  module: HsdRenderModule;
  dat: Uint8Array;
  policy: HsdEvaluationPolicy;
  /** Present when the costume's idle attached. */
  references?: Uint8Array[];
  /** The scene parsed while loading, until the first viewer takes it. */
  scene?: HsdScene;
}

/**
 * A scene for one viewer; `HsdViewer.create` takes ownership of it. The first
 * viewer gets the scene parsed while loading, so a DAT is parsed once per
 * preview, not twice.
 */
export function createHsdScene(input: HsdPreviewInput) {
  if (input.scene) {
    const parsed = input.scene;
    input.scene = undefined;
    return parsed;
  }
  const scene = new input.module.HsdScene(input.dat, input.policy);
  try {
    if (input.references) scene.attachIdle(input.references);
    return scene;
  } catch (error: unknown) {
    scene.free();
    throw error;
  }
}

/**
 * Download and validate a DAT with `backend`'s build, and resolve its idle.
 * Throws for an unusable DAT or a reference that fails its identity check.
 */
export async function loadHsdPreview(
  datUrl: string,
  policy: HsdEvaluationPolicy,
  backend: HsdBackend,
  signal: AbortSignal
): Promise<HsdPreviewInput> {
  const module = await loadHsdRenderModule(backend);
  // Previews show uploads, so nothing larger than an upload is fetched.
  const dat = await fetchBoundedBytes(
    datUrl,
    LIMITS.FILE_SIZE_DAT,
    "Preview DAT exceeds the upload size limit",
    signal
  );
  signal.throwIfAborted();
  const input: HsdPreviewInput = { backend, module, dat, policy };
  let scene: HsdScene | undefined;
  try {
    scene = new module.HsdScene(dat, policy);
    const assets = scene.idleReferenceAssets();
    if (assets) {
      const references = await fetchIdleReferences(assets, signal);
      signal.throwIfAborted();
      // `false`: the skeleton differs from the reference, so it stays in bind pose.
      if (references && scene.attachIdle(references)) input.references = references;
    }
    input.scene = scene;
    return input;
  } catch (error: unknown) {
    scene?.free();
    dropTrappedHsdModule(backend, error);
    throw error;
  }
}

/** Free the loaded scene if no viewer took it. */
export function releaseHsdPreview(input: HsdPreviewInput | undefined): void {
  input?.scene?.free();
  if (input) input.scene = undefined;
}
