/* node --experimental-strip-types scripts/cutout-check.ts
   Fails if taking a logo's card off starts taking part of the logo with it. */
import assert from "node:assert/strict";
import { cutCard } from "../src/lib/logo-cutout.ts";

const N = 64;
type RGB = [number, number, number];
const WHITE: RGB = [255, 255, 255];
const NAVY: RGB = [22, 44, 92];

function image(paint: (x: number, y: number) => RGB) {
  const data = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      [data[i], data[i + 1], data[i + 2]] = paint(x, y);
      data[i + 3] = 255;
    }
  }
  return data;
}

const alphaAt = (data: Uint8ClampedArray, x: number, y: number) => data[(y * N + x) * 4 + 3];

/* ---- the case that killed the previous attempt ---------------------------- */

/* A navy mark on a white card, with a WHITE HOLE inside the mark — an eye, a
   counter, a knocked-out letter. The hole is exactly the card's colour, so any
   rule that matches on colour alone erases it and punches through the artwork.
   Flooding in from the border cannot reach it, because the mark is in the way. */
const withHole = image((x, y) => {
  const dx = x - N / 2;
  const dy = y - N / 2;
  const d = Math.hypot(dx, dy);
  if (d > N * 0.34) return WHITE;
  if (d < N * 0.12) return WHITE;
  return NAVY;
});

assert.equal(cutCard(withHole, N, N), true, "a mark on a card has a card to cut");
assert.equal(alphaAt(withHole, 1, 1), 0, "the card around the mark is gone");
assert.equal(alphaAt(withHole, N / 2, N / 2), 255, "the hole INSIDE the mark survives");
assert.equal(alphaAt(withHole, N / 2, Math.round(N * 0.5 - N * 0.22)), 255, "the mark survives");

/* ---- artwork that reaches the edge is not a card -------------------------- */

// Half navy, half white, both touching the border. Neither fills it, so there
// is no card here and nothing may be removed.
const split = image((x) => (x < N / 2 ? NAVY : WHITE));
assert.equal(cutCard(split, N, N), false, "artwork bleeding to the edge is not a card");
assert.equal(alphaAt(split, 1, 1), 255, "and so nothing is cleared");

/* ---- a coloured card comes off too ---------------------------------------- */

// The card is not always white: a mark supplied on a navy tile is the same
// problem wearing a different colour.
const onNavy = image((x, y) => {
  const inside = x > N * 0.25 && x < N * 0.75 && y > N * 0.25 && y < N * 0.75;
  return inside ? WHITE : NAVY;
});
assert.equal(cutCard(onNavy, N, N), true, "a coloured card is still a card");
assert.equal(alphaAt(onNavy, 1, 1), 0, "the navy tile is gone");
assert.equal(alphaAt(onNavy, N / 2, N / 2), 255, "the white mark on it is not");

/* ---- a transparent logo is left alone ------------------------------------- */

const already = new Uint8ClampedArray(N * N * 4);
for (let px = 0; px < N * N; px++) {
  const i = px * 4;
  const x = px % N;
  const y = (px - x) / N;
  const inside = Math.hypot(x - N / 2, y - N / 2) < N * 0.3;
  [already[i], already[i + 1], already[i + 2]] = NAVY;
  already[i + 3] = inside ? 255 : 0;
}
assert.equal(cutCard(already, N, N), false, "a logo with no card needs no cutting");
assert.equal(alphaAt(already, N / 2, N / 2), 255, "and keeps every pixel it had");

/* ---- the cut edge fades ---------------------------------------------------- */

// A mark feathered into its card the way an export leaves it. The pixels the
// flood stopped against must come out part-transparent, or the mark keeps a
// hard rim of the colour that was meant to be removed.
const feathered = image((x, y) => {
  const d = Math.hypot(x - N / 2, y - N / 2);
  const t = Math.min(1, Math.max(0, (d - N * 0.2) / (N * 0.08)));
  return [
    Math.round(NAVY[0] + (255 - NAVY[0]) * t),
    Math.round(NAVY[1] + (255 - NAVY[1]) * t),
    Math.round(NAVY[2] + (255 - NAVY[2]) * t),
  ];
});
assert.equal(cutCard(feathered, N, N), true, "a feathered mark still sits on a card");
const ring: number[] = [];
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const a = alphaAt(feathered, x, y);
    if (a > 0 && a < 255) ring.push(a);
  }
}
assert.ok(ring.length > 0, "the boundary is faded, not cut square");

console.log("logo cutout ok");
