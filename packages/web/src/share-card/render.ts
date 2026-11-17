import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import satori, { init as initSatori } from "satori/standalone";
import yogaWasm from "satori/yoga.wasm";
import { Card, CARD_HEIGHT, CARD_WIDTH, type CardInput } from "./card";

// Draws a share card in the Worker: satori lays it out as SVG and resvg
// rasterizes it to PNG. Both WebAssembly modules start once per isolate.

let ready: Promise<void> | null = null;

function start(): Promise<void> {
  ready ??= Promise.all([initSatori(yogaWasm), initWasm(resvgWasm)]).then(() => undefined);
  // A failed start is retried on the next card rather than kept.
  ready.catch(() => {
    ready = null;
  });
  return ready;
}

/** The site's typeface, served from public/fonts. */
export type CardFonts = { regular: ArrayBuffer; bold: ArrayBuffer };

export const CARD_FONT_FILES = {
  regular: "/fonts/SchibstedGrotesk-500.ttf",
  bold: "/fonts/SchibstedGrotesk-800.ttf",
};

export async function renderCard(card: CardInput, fonts: CardFonts): Promise<Uint8Array> {
  await start();
  const family = "Schibsted Grotesk";
  const svg = await satori(Card({ card }), {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: [
      { name: family, data: fonts.regular, weight: 500, style: "normal" },
      { name: family, data: fonts.bold, weight: 700, style: "normal" },
      { name: family, data: fonts.bold, weight: 800, style: "normal" },
    ],
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: CARD_WIDTH } }).render().asPng();
}

/** A PNG's bytes as a data: URL, which is how satori takes an image. */
export function pngDataUrl(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}
