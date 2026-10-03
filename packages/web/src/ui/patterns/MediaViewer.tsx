import * as stylex from "@stylexjs/stylex";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { HsdEvaluationPolicy } from "@/lib/hsd-preview";
import { ChevronLeftIcon, ChevronRightIcon, CubeIcon } from "../icons";
import { IconButton, Select, ToggleGroup } from "../primitives";
import { shared } from "../primitives/shared";
import { color, font, radius, space, text } from "../tokens.stylex";

// The viewer pulls in the WebGPU/WebGL renderers, so it loads only when the 3D slide opens.
const ModelViewer = lazy(() =>
  import("@/components/model-viewer").then((module) => ({ default: module.ModelViewer }))
);

/** A screenshot, already resolved to URLs: stored images on a pack, object URLs while uploading. */
export type MediaImage = { id: string; src: string; thumbSrc?: string };

export type ModelPreview = {
  id: string;
  label: string;
  datUrl: string;
  nativeEvaluationPolicy: HsdEvaluationPolicy;
};

const MAX_TOGGLES = 6;

type Slide = { type: "image"; image: MediaImage; number: number } | { type: "model" };

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: space.sm, minWidth: 0 },
  frame: {
    position: "relative",
    overflow: "hidden",
    aspectRatio: "16 / 9",
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  image: { display: "block", width: "100%", height: "100%", objectFit: "cover" },
  empty: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    fontSize: text.md,
    color: color.muted,
  },
  nav: {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: 2,
  },
  prev: { left: space.sm },
  next: { right: space.sm },
  counter: {
    position: "absolute",
    right: space.sm,
    bottom: space.sm,
    zIndex: 2,
    paddingInline: space.xs,
    paddingBlock: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: color.scrim,
    fontFamily: font.mono,
    fontSize: text.xs,
    color: color.text,
  },
  strip: {
    display: "flex",
    gap: space.xs,
    overflowX: "auto",
    paddingBlock: space.xxs,
    paddingInline: space.xxs,
    scrollbarWidth: "thin",
  },
  thumb: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xxs,
    width: "88px",
    aspectRatio: "16 / 10",
    padding: 0,
    overflow: "hidden",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "transparent",
    borderRadius: radius.sm,
    backgroundColor: color.surface,
    color: color.text,
    fontFamily: font.sans,
    fontSize: text.sm,
    fontWeight: 700,
    cursor: "pointer",
    opacity: { default: 0.6, ":hover": 1 },
  },
  thumbCurrent: { borderColor: color.accentText, opacity: { default: 1, ":hover": 1 } },
  thumbImage: { display: "block", width: "100%", height: "100%", objectFit: "cover" },
  loading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    fontSize: text.sm,
    color: color.muted,
  },
});

/**
 * A pack's screenshots and, when it has renderable files, a 3D preview slide
 * placed second so the cover image still leads.
 */
export function MediaViewer({
  images,
  alt,
  modelPreviews = [],
}: {
  /** In display order; the first is the cover. */
  images: readonly MediaImage[];
  alt: string;
  modelPreviews?: readonly ModelPreview[];
}) {
  const imageSlides: Slide[] = images.map((image, index) => ({
    type: "image",
    image,
    number: index + 1,
  }));
  const slides: Slide[] = [
    ...imageSlides.slice(0, 1),
    ...(modelPreviews.length > 0 ? [{ type: "model" } as const] : []),
    ...imageSlides.slice(1),
  ];

  const [index, setIndex] = useState(0);
  const [modelId, setModelId] = useState(modelPreviews[0]?.id);
  const model = modelPreviews.find((preview) => preview.id === modelId) ?? modelPreviews[0];
  const current = slides[Math.min(index, slides.length - 1)];
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const thumb = stripRef.current?.querySelector<HTMLElement>('[aria-current="true"]');
    thumb?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [index]);

  const costumeOptions = modelPreviews.map((preview) => ({
    value: preview.id,
    label: preview.label,
  }));
  const go = (step: number) => setIndex((i) => (i + step + slides.length) % slides.length);
  const many = slides.length > 1;

  return (
    <div {...stylex.props(styles.root)}>
      <div
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the ARIA carousel pattern is a named group; no grouping tag describes one.
        role="group"
        aria-roledescription="carousel"
        aria-label={`${alt} media`}
        {...stylex.props(styles.frame)}
      >
        {!current ? (
          <p {...stylex.props(styles.empty)}>No preview available</p>
        ) : current.type === "model" && model ? (
          <Suspense fallback={<p {...stylex.props(styles.loading)}>Loading 3D viewer…</p>}>
            <ModelViewer
              key={`${model.id}|${model.datUrl}`}
              datUrl={model.datUrl}
              nativeEvaluationPolicy={model.nativeEvaluationPolicy}
              variantLabel={model.label}
            />
          </Suspense>
        ) : current.type === "image" ? (
          <img
            src={current.image.src}
            alt={many ? `${alt}, image ${current.number}` : alt}
            {...stylex.props(styles.image)}
          />
        ) : null}

        {many && (
          <>
            <span {...stylex.props(styles.nav, styles.prev)}>
              <IconButton
                label="Previous"
                variant="secondary"
                icon={<ChevronLeftIcon />}
                onClick={() => go(-1)}
              />
            </span>
            <span {...stylex.props(styles.nav, styles.next)}>
              <IconButton
                label="Next"
                variant="secondary"
                icon={<ChevronRightIcon />}
                onClick={() => go(1)}
              />
            </span>
            <span aria-live="polite" {...stylex.props(styles.counter)}>
              {index + 1} / {slides.length}
            </span>
          </>
        )}
      </div>

      {current?.type === "model" &&
        modelPreviews.length > 1 &&
        model &&
        // A few costumes fit as pills; beyond that a dropdown stays one row.
        (modelPreviews.length <= MAX_TOGGLES ? (
          <ToggleGroup
            label="Costume shown in 3D"
            value={model.id}
            options={costumeOptions}
            onValueChange={setModelId}
          />
        ) : (
          <Select
            label="Costume"
            value={model.id}
            options={costumeOptions}
            onValueChange={setModelId}
          />
        ))}

      {many && (
        <div ref={stripRef} {...stylex.props(styles.strip)}>
          {slides.map((slide, slideIndex) => {
            const selected = slideIndex === index;
            return (
              <button
                key={slide.type === "model" ? "model" : slide.image.id}
                type="button"
                aria-label={slide.type === "model" ? "3D preview" : `Image ${slide.number}`}
                aria-current={selected ? "true" : undefined}
                onClick={() => setIndex(slideIndex)}
                {...stylex.props(styles.thumb, shared.focusRing, selected && styles.thumbCurrent)}
              >
                {slide.type === "model" ? (
                  <>
                    <CubeIcon size={16} />
                    3D
                  </>
                ) : (
                  <img
                    src={slide.image.thumbSrc ?? slide.image.src}
                    alt=""
                    loading="lazy"
                    {...stylex.props(styles.thumbImage)}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
