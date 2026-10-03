import { useCallback, useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { CloseIcon, ExpandIcon } from "@/ui/icons";
import { Button, FullscreenDialog, IconButton } from "@/ui/primitives";
import { color, radius, space, text } from "@/ui/tokens.stylex";
import {
  createHsdScene,
  dropTrappedHsdModule,
  type HsdBackend,
  type HsdEvaluationPolicy,
  type HsdPreviewInput,
  type HsdViewer,
  hsdErrorCode,
  loadHsdPreview,
  preferredHsdBackend,
  releaseHsdPreview,
} from "@/lib/hsd-preview";

function ViewerCanvas({
  input,
  playing,
  onError,
  onBackendUnavailable,
}: {
  input?: HsdPreviewInput;
  playing: boolean;
  onError: () => void;
  /** WebGPU could not start on this canvas; the caller retries with WebGL2. */
  onBackendUnavailable: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRenderRef = useRef<(() => void) | undefined>(undefined);
  const playingRef = useRef(playing);
  const resetClockRef = useRef(true);
  const orbitRef = useRef({ yaw: 0, pitch: 0, zoom: 1 });
  // Pointers down on the canvas: one rotates, two pinch to zoom.
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    playingRef.current = playing;
    resetClockRef.current = true;
    requestRenderRef.current?.();
  }, [playing]);

  const applyOrbit = useCallback((yaw: number, pitch: number, zoom: number) => {
    orbitRef.current = { yaw, pitch, zoom };
    requestRenderRef.current?.();
  }, []);

  // React registers wheel listeners as passive, where preventDefault does
  // nothing, so the page would scroll while zooming. This one is not passive.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const zoom = (event: WheelEvent) => {
      event.preventDefault();
      const orbit = orbitRef.current;
      applyOrbit(orbit.yaw, orbit.pitch, orbit.zoom * Math.exp(event.deltaY * 0.001));
    };
    canvas.addEventListener("wheel", zoom, { passive: false });
    return () => canvas.removeEventListener("wheel", zoom);
  }, [applyOrbit]);

  const pinchDistance = () => {
    const [a, b] = [...pointersRef.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : undefined;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !input) return;
    const hasIdle = input.references !== undefined;
    let disposed = false;
    let renderer: HsdViewer | undefined;
    let frame = 0;
    let rendering = false;
    let redraw = true;
    let previous: number | undefined;
    let accumulated = 0;
    let size: { width: number; height: number } | undefined;
    const interval = 1000 / 60;

    const fail = (error: unknown) => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      canvas.hidden = true;
      if (!renderer && input.backend === "webgpu" && hsdErrorCode(error) === "gpu-unavailable") {
        console.info("WebGPU preview unavailable; retrying with WebGL2", error);
        onBackendUnavailable();
        return;
      }
      dropTrappedHsdModule(input.backend, error);
      console.error("HSD preview failed", error);
      onError();
    };
    const schedule = () => {
      if (!disposed && !frame && !rendering) {
        frame = requestAnimationFrame((now) => void render(now));
      }
    };
    const requestRender = () => {
      redraw = true;
      schedule();
    };
    const render = (now: number) => {
      frame = 0;
      if (disposed || !renderer) return;
      rendering = true;
      try {
        const animate = hasIdle && playingRef.current && !document.hidden;
        if (resetClockRef.current || !animate) {
          previous = undefined;
          accumulated = 0;
          resetClockRef.current = false;
        }
        let ticks = 0;
        if (animate) {
          if (previous !== undefined)
            accumulated = Math.min(accumulated + now - previous, interval * 4);
          previous = now;
          // Nearest fixed tick avoids 0/2 alternation from rounded RAF timestamps.
          // Keep the signed remainder so rounding cannot accumulate clock drift.
          while (accumulated >= interval / 2 && ticks < 4) {
            accumulated -= interval;
            ticks++;
          }
          if (ticks) renderer.advance(ticks);
        }
        if (redraw || ticks) {
          if (size) {
            renderer.resize(size.width, size.height);
            size = undefined;
          }
          if (redraw) {
            const orbit = orbitRef.current;
            renderer.setOrbit(orbit.yaw, orbit.pitch, orbit.zoom);
          }
          redraw = false;
          renderer.render();
        }
      } catch (error: unknown) {
        fail(error);
      } finally {
        rendering = false;
        if (redraw || (hasIdle && playingRef.current && !document.hidden)) schedule();
      }
    };
    const visibilityChanged = () => {
      resetClockRef.current = true;
      requestRender();
    };
    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry || disposed) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      size = {
        width: Math.max(1, Math.round(entry.contentRect.width * ratio)),
        height: Math.max(1, Math.round(entry.contentRect.height * ratio)),
      };
      requestRender();
    });
    const start = async () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      // Each mount builds its own scene: the viewer takes ownership of it.
      const created = await input.module.HsdViewer.create(
        canvas,
        createHsdScene(input),
        Math.max(1, Math.round(rect.width * ratio)),
        Math.max(1, Math.round(rect.height * ratio))
      );
      if (disposed) {
        created.free();
        return;
      }
      renderer = created;
      requestRenderRef.current = requestRender;
      resizeObserver.observe(canvas);
      document.addEventListener("visibilitychange", visibilityChanged);
      requestRender();
    };
    void start().catch(fail);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", visibilityChanged);
      if (requestRenderRef.current === requestRender) requestRenderRef.current = undefined;
      renderer?.free();
      renderer = undefined;
    };
  }, [input, onBackendUnavailable, onError]);

  return (
    <canvas
      ref={canvasRef}
      {...stylex.props(styles.canvas)}
      aria-label="3D model. Drag or use the arrow keys to rotate; scroll, pinch, or press plus and minus to zoom."
      tabIndex={0}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        pinchRef.current = pinchDistance();
      }}
      onPointerMove={(event) => {
        const previous = pointersRef.current.get(event.pointerId);
        if (!previous) return;
        pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const orbit = orbitRef.current;
        const distance = pinchDistance();
        if (distance !== undefined && pinchRef.current) {
          // Fingers apart zoom in, together zoom out.
          applyOrbit(orbit.yaw, orbit.pitch, (orbit.zoom * pinchRef.current) / distance);
          pinchRef.current = distance;
        } else if (pointersRef.current.size === 1) {
          const deltaX = event.clientX - previous.x;
          const deltaY = event.clientY - previous.y;
          applyOrbit(orbit.yaw - deltaX * 0.01, orbit.pitch + deltaY * 0.01, orbit.zoom);
        }
      }}
      onPointerUp={(event) => {
        pointersRef.current.delete(event.pointerId);
        pinchRef.current = pinchDistance();
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={(event) => {
        pointersRef.current.delete(event.pointerId);
        pinchRef.current = pinchDistance();
      }}
      onKeyDown={(event) => {
        const orbit = orbitRef.current;
        const rotationStep = Math.PI / 24;
        if (event.key === "ArrowLeft")
          applyOrbit(orbit.yaw - rotationStep, orbit.pitch, orbit.zoom);
        else if (event.key === "ArrowRight")
          applyOrbit(orbit.yaw + rotationStep, orbit.pitch, orbit.zoom);
        else if (event.key === "ArrowUp")
          applyOrbit(orbit.yaw, orbit.pitch - rotationStep, orbit.zoom);
        else if (event.key === "ArrowDown")
          applyOrbit(orbit.yaw, orbit.pitch + rotationStep, orbit.zoom);
        else if (event.key === "+" || event.key === "=")
          applyOrbit(orbit.yaw, orbit.pitch, orbit.zoom * 0.9);
        else if (event.key === "-") applyOrbit(orbit.yaw, orbit.pitch, orbit.zoom * 1.1);
        else return;
        event.preventDefault();
      }}
    />
  );
}

/**
 * Inline 3D model viewer — designed to fill its parent container.
 * No outer chrome; the parent (e.g. carousel slide) handles framing.
 */
export function ModelViewer({
  datUrl,
  nativeEvaluationPolicy = "genericHsd",
  variantLabel,
}: {
  datUrl: string;
  nativeEvaluationPolicy?: HsdEvaluationPolicy;
  variantLabel?: string;
}) {
  const [error, setError] = useState(false);
  const [paused, setPaused] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const [preview, setPreview] = useState<{
    datUrl: string;
    policy: HsdEvaluationPolicy;
    input: HsdPreviewInput;
  }>();
  // Set only after WebGPU failed to start; otherwise the browser's preference.
  const [forcedBackend, setForcedBackend] = useState<HsdBackend>();
  const [expanded, setExpanded] = useState(false);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => {
      if (preference.matches) setPaused(true);
    };
    preference.addEventListener("change", changed);
    return () => preference.removeEventListener("change", changed);
  }, []);

  const closeExpanded = useCallback(() => setExpanded(false), []);

  const handleError = useCallback(() => {
    setError(true);
    setExpanded(false);
  }, []);

  const handleBackendUnavailable = useCallback(() => {
    setPreview(undefined);
    setForcedBackend("webgl");
  }, []);

  useEffect(() => {
    setError(false);
    setPreview(undefined);
  }, [datUrl, nativeEvaluationPolicy]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const backend = forcedBackend ?? (await preferredHsdBackend());
      const input = await loadHsdPreview(
        datUrl,
        nativeEvaluationPolicy,
        backend,
        controller.signal
      );
      if (controller.signal.aborted) releaseHsdPreview(input);
      else setPreview({ datUrl, policy: nativeEvaluationPolicy, input });
    })().catch((error: unknown) => {
      if (controller.signal.aborted) return;
      console.error("HSD preview failed", error);
      handleError();
    });
    return () => controller.abort();
  }, [datUrl, forcedBackend, handleError, nativeEvaluationPolicy]);

  const input =
    preview?.datUrl === datUrl && preview.policy === nativeEvaluationPolicy
      ? preview.input
      : undefined;
  // A preview replaced or unmounted before a viewer took its scene frees it.
  useEffect(() => () => releaseHsdPreview(preview?.input), [preview]);

  if (error) {
    return (
      <div {...stylex.props(styles.fill, styles.center)}>
        <p {...stylex.props(styles.message)}>3D preview unavailable</p>
      </div>
    );
  }

  const viewer = (
    <>
      <ViewerCanvas
        // A canvas keeps its first context type; a backend switch needs a new one.
        key={input?.backend}
        input={input}
        playing={!paused}
        onError={handleError}
        onBackendUnavailable={handleBackendUnavailable}
      />
      {!input && (
        <div {...stylex.props(styles.overlay, styles.center)}>
          <p {...stylex.props(styles.message)}>Loading model…</p>
        </div>
      )}
      <span {...stylex.props(styles.chip, styles.topLeft, expanded && styles.topLeftSafe)}>
        {variantLabel ? `3D · ${variantLabel}` : "3D preview"}
      </span>
      {input?.references && (
        <span {...stylex.props(styles.corner, styles.bottomLeft)}>
          <Button
            variant="secondary"
            aria-pressed={!paused}
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? "Play idle" : "Pause idle"}
          </Button>
        </span>
      )}
    </>
  );

  return (
    <div {...stylex.props(styles.fill)}>
      {expanded ? null : viewer}

      <span {...stylex.props(styles.corner, styles.topRight)}>
        <IconButton
          ref={expandButtonRef}
          label="Expand 3D preview"
          variant="secondary"
          icon={<ExpandIcon />}
          onClick={() => setExpanded(true)}
        />
      </span>

      <FullscreenDialog
        open={expanded}
        onOpenChange={setExpanded}
        title="Expanded 3D preview"
        initialFocus={closeButtonRef}
        finalFocus={expandButtonRef}
      >
        {viewer}
        <span {...stylex.props(styles.corner, styles.topRightSafe)}>
          <IconButton
            ref={closeButtonRef}
            label="Close expanded 3D preview"
            variant="secondary"
            icon={<CloseIcon />}
            onClick={closeExpanded}
          />
        </span>
        <span {...stylex.props(styles.chip, styles.hint)}>
          Drag to rotate · Pinch or scroll to zoom
        </span>
      </FullscreenDialog>
    </div>
  );
}

const styles = stylex.create({
  fill: { position: "relative", width: "100%", height: "100%" },
  center: { display: "flex", alignItems: "center", justifyContent: "center" },
  overlay: { position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" },
  message: { margin: 0, fontSize: text.sm, color: color.muted },
  canvas: {
    display: "block",
    width: "100%",
    height: "100%",
    touchAction: "none",
    cursor: { default: "grab", ":active": "grabbing" },
    outline: { default: "none", ":focus-visible": `2px solid ${color.accentText}` },
    outlineOffset: "-2px",
  },
  chip: {
    position: "absolute",
    zIndex: 1,
    paddingInline: space.xs,
    paddingBlock: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: color.scrim,
    fontSize: text.xs,
    fontWeight: 600,
    color: color.text,
    whiteSpace: "nowrap",
    pointerEvents: "none",
  },
  corner: { position: "absolute", zIndex: 2 },
  topLeft: { top: space.sm, left: space.sm },
  topLeftSafe: {
    top: `max(${space.sm}, env(safe-area-inset-top))`,
    left: `max(${space.sm}, env(safe-area-inset-left))`,
  },
  topRight: { top: space.sm, right: space.sm },
  topRightSafe: {
    top: `max(${space.sm}, env(safe-area-inset-top))`,
    right: `max(${space.sm}, env(safe-area-inset-right))`,
  },
  bottomLeft: { bottom: space.sm, left: space.sm },
  hint: {
    left: "50%",
    bottom: `max(${space.sm}, env(safe-area-inset-bottom))`,
    transform: "translateX(-50%)",
    color: color.muted,
  },
});
