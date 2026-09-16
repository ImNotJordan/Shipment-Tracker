/* Board colors suggested from an uploaded logo.
   The pixel math is pure so it runs in the browser and under
   `node --experimental-strip-types scripts/palette-check.ts`. */

export type Palette = { accents: string[]; backgrounds: string[] };

/** What a board with no logo is offered: black, white and yellow. The sane
 *  option leads each list, so accepting the first of each still gives a
 *  readable night console. */
export const FALLBACK: Palette = {
  accents: ["#e3b341", "#eff0f0", "#0a0c0f"],
  backgrounds: ["#0a0c0f", "#eff0f0", "#e3b341"],
};

function hex(r: number, g: number, b: number) {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
}

function toHsl(r: number, g: number, b: number) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === rn
      ? ((gn - bn) / d + (gn < bn ? 6 : 0))
      : max === gn
        ? (bn - rn) / d + 2
        : (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

function fromHsl(h: number, s: number, l: number) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const t: [number, number, number] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x];
  return hex((t[0] + m) * 255, (t[1] + m) * 255, (t[2] + m) * 255);
}

/** Dominant chromatic hues in the artwork, most-used first.
    Greys, near-black and near-white are ground, not brand, so they drop out. */
function dominantHues(data: Uint8ClampedArray) {
  const bins = new Map<number, { count: number; h: number; s: number; l: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const { h, s, l } = toHsl(data[i], data[i + 1], data[i + 2]);
    if (s < 0.15 || l < 0.1 || l > 0.93) continue;
    const key = Math.round(h / 24) % 15;
    const bin = bins.get(key) ?? { count: 0, h: 0, s: 0, l: 0 };
    bins.set(key, { count: bin.count + 1, h: bin.h + h, s: bin.s + s, l: bin.l + l });
  }
  return [...bins.values()]
    .sort((a, b) => b.count - a.count)
    .map((bin) => ({ h: bin.h / bin.count, s: bin.s / bin.count, l: bin.l / bin.count }));
}

export function paletteFromPixels(data: Uint8ClampedArray): Palette {
  const hues = dominantHues(data);
  if (!hues.length) return FALLBACK;
  const lead = hues[0];
  // Three accents: the other real hues first, then tonal steps of the lead so
  // a single-color logo still offers a choice.
  const accents = [
    fromHsl(lead.h, Math.max(lead.s, 0.45), Math.min(Math.max(lead.l, 0.42), 0.62)),
    ...hues.slice(1, 3).map((c) => fromHsl(c.h, Math.max(c.s, 0.4), Math.min(Math.max(c.l, 0.4), 0.64))),
    fromHsl(lead.h, Math.max(lead.s, 0.45) * 0.82, 0.38),
    fromHsl(lead.h, Math.min(Math.max(lead.s, 0.45) * 1.1, 1), 0.68),
  ];
  return {
    accents: [...new Set(accents)].slice(0, 3),
    // Grounds stay near-black: the console is a night instrument, the logo
    // only decides which way the black leans.
    backgrounds: [0.07, 0.1, 0.14].map((l) => fromHsl(lead.h, 0.12, l)),
  };
}

function hexToHsl(hex: string) {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean.padEnd(6, "0").slice(0, 6);
  const n = parseInt(full, 16);
  return toHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

/* Colour partners. A ground carries the accent's hue at low saturation so the
   two read as one scheme; an accent is lifted to a lightness that survives on
   a night ground. An achromatic pick has no hue to work from, so a fixed trio
   stands in rather than a set of accidental reds. */
const NEUTRAL_GROUNDS = ["#0a0c0f", "#10181a", "#161f22"];
const NEUTRAL_ACCENTS = ["#e3b341", "#3ddc84", "#6da8ff"];

export function matchingBackgrounds(accent: string): string[] {
  const { h, s } = hexToHsl(accent);
  if (s < 0.08) return NEUTRAL_GROUNDS;
  return [
    fromHsl(h, 0.34, 0.08),
    fromHsl((h + 186) % 360, 0.22, 0.1),
    fromHsl(h, 0.1, 0.14),
  ];
}

export function matchingAccents(background: string): string[] {
  const { h, s } = hexToHsl(background);
  if (s < 0.08) return NEUTRAL_ACCENTS;
  return [
    fromHsl(h, 0.72, 0.56),
    fromHsl((h + 150) % 360, 0.62, 0.58),
    fromHsl((h + 42) % 360, 0.78, 0.6),
  ];
}

/** Re-read the palette from a logo already on the board. A stored logo may be
 *  a data URI or a Storage URL; a cross-origin URL taints the canvas, and that
 *  throw is the signal to fall back rather than guess. */
export async function paletteFromUrl(url: string): Promise<Palette> {
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = url;
    await image.decode();
    const size = 48;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return FALLBACK;
    ctx.drawImage(image, 0, 0, size, size);
    return paletteFromPixels(ctx.getImageData(0, 0, size, size).data);
  } catch {
    return FALLBACK;
  }
}

export async function paletteFromFile(file: File): Promise<Palette> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = 48;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return FALLBACK;
    ctx.drawImage(bitmap, 0, 0, size, size);
    bitmap.close();
    return paletteFromPixels(ctx.getImageData(0, 0, size, size).data);
  } catch {
    // SVGs without intrinsic size, and anything the decoder rejects.
    return FALLBACK;
  }
}
