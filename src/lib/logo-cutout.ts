/* Knocking the card out from behind a logo.

   A logo is usually supplied as artwork sitting on a solid card, and on a
   client's board that card reads as a coloured tile behind the mark. This takes
   it off, and the pixel work is pure so it runs in the browser and under
   `node --experimental-strip-types scripts/cutout-check.ts`. */

/** How far a pixel can sit from the card's colour and still be the card rather
 *  than artwork. Wide enough to take the shades a JPEG lays along an edge. */
const SAME = 60;

/** Where the fade from card to artwork is finished. Pixels between SAME and
 *  this keep part of their alpha, so the cut edge is not a staircase. */
const EDGE = 96;

const dist = (
  data: Uint8ClampedArray,
  i: number,
  card: [number, number, number],
) => Math.hypot(data[i] - card[0], data[i + 1] - card[1], data[i + 2] - card[2]);

/** The colour filling the image's border, or null if the border is not one
 *  colour — in which case the artwork reaches the edge and there is no card to
 *  take off. */
function cardColor(data: Uint8ClampedArray, width: number, height: number) {
  const edge: number[] = [];
  for (let x = 0; x < width; x++) {
    edge.push((0 * width + x) * 4, ((height - 1) * width + x) * 4);
  }
  for (let y = 1; y < height - 1; y++) {
    edge.push((y * width) * 4, (y * width + width - 1) * 4);
  }
  if (!edge.length) return null;

  // The border's most common colour, at 5 bits a channel so one ink's shades
  // count together.
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (const i of edge) {
    if (data[i + 3] < 128) continue;
    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bin.n += 1;
    bin.r += data[i];
    bin.g += data[i + 1];
    bin.b += data[i + 2];
    bins.set(key, bin);
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const bin of bins.values()) if (!best || bin.n > best.n) best = bin;
  if (!best) return null;

  const card: [number, number, number] = [best.r / best.n, best.g / best.n, best.b / best.n];
  // A card fills its border. Artwork that merely touches one edge does not, and
  // must keep its colour.
  const held = edge.filter((i) => data[i + 3] >= 128 && dist(data, i, card) < SAME).length;
  return held / edge.length >= 0.7 ? card : null;
}

/** Clears the card from behind the artwork, in place. Returns false when there
 *  was no card to clear.
 *
 *  The card is flooded FROM THE BORDER inwards rather than matched across the
 *  whole image, and that is the whole difference between this and erasing part
 *  of the logo: a white eye inside a mark on a white card is the same colour as
 *  the card and must survive, and it does, because nothing connects it to the
 *  edge. A threshold applied everywhere cannot tell those apart. */
export function cutCard(data: Uint8ClampedArray, width: number, height: number) {
  const card = cardColor(data, width, height);
  if (!card) return false;

  const cut = new Uint8Array(width * height);
  const stack: number[] = [];
  const consider = (px: number) => {
    if (cut[px]) return;
    const i = px * 4;
    if (data[i + 3] < 128 || dist(data, i, card) >= SAME) return;
    cut[px] = 1;
    stack.push(px);
  };

  for (let x = 0; x < width; x++) {
    consider(x);
    consider((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    consider(y * width);
    consider(y * width + width - 1);
  }

  while (stack.length) {
    const px = stack.pop() as number;
    const x = px % width;
    const y = (px - x) / width;
    if (x > 0) consider(px - 1);
    if (x < width - 1) consider(px + 1);
    if (y > 0) consider(px - width);
    if (y < height - 1) consider(px + width);
  }

  for (let px = 0; px < cut.length; px++) {
    const i = px * 4;
    if (cut[px]) {
      data[i + 3] = 0;
      continue;
    }
    // A pixel the flood stopped against is part card, part artwork. Fading it
    // by how far it has travelled from the card is what keeps the cut from
    // leaving a hard rim of the old background around the mark.
    const x = px % width;
    const y = (px - x) / width;
    const touches =
      (x > 0 && cut[px - 1]) ||
      (x < width - 1 && cut[px + 1]) ||
      (y > 0 && cut[px - width]) ||
      (y < height - 1 && cut[px + width]);
    if (!touches) continue;
    const d = dist(data, i, card);
    if (d >= EDGE) continue;
    data[i + 3] = Math.round(data[i + 3] * ((d - SAME) / (EDGE - SAME)));
  }
  return true;
}

/** The same logo with its card taken off, as a data URL, or null to keep using
 *  the original — no card found, or a cross-origin image the canvas will not
 *  let us read, which throws and is the signal to leave it alone. */
export async function cutoutFromUrl(url: string): Promise<string | null> {
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = url;
    await image.decode();
    // Enough to stay sharp at the sizes a board draws a logo, without walking a
    // full-resolution export.
    const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height);
    if (!cutCard(pixels.data, width, height)) return null;
    ctx.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
