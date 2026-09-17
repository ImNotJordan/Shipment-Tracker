/* node --experimental-strip-types scripts/palette-check.ts
   Fails if the logo palette stops tracking the artwork's real colors. */
import assert from "node:assert/strict";
import {
  FALLBACK,
  matchingAccents,
  matchingBackgrounds,
  paletteFromPixels,
} from "../src/lib/logo-palette.ts";

function pixels(colors: [number, number, number, number][]) {
  return Uint8ClampedArray.from(colors.flat());
}

const OPAQUE = 255;
const amber: [number, number, number, number] = [227, 179, 65, OPAQUE];
const teal: [number, number, number, number] = [40, 160, 170, OPAQUE];

// A grey-only mark has no brand hue to read, so the defaults stand.
assert.deepEqual(
  paletteFromPixels(pixels([[20, 20, 20, OPAQUE], [200, 200, 200, OPAQUE]])),
  FALLBACK,
  "greyscale artwork should fall back",
);

// Fully transparent pixels are not artwork.
assert.deepEqual(paletteFromPixels(pixels([[227, 179, 65, 0]])), FALLBACK);

// The lead accent tracks the dominant hue (amber ~43deg), not the minority one.
const mixed = paletteFromPixels(pixels([amber, amber, amber, teal]));
assert.equal(mixed.accents.length, 3, "always offers three accents");
assert.equal(mixed.backgrounds.length, 3, "always offers three grounds");
assert.match(mixed.accents[0], /^#[0-9a-f]{6}$/, "accents are hex");
const [r, g, b] = [1, 3, 5].map((i) => parseInt(mixed.accents[0].slice(i, i + 2), 16));
assert.ok(r > b && g > b, `lead accent should read amber, got ${mixed.accents[0]}`);

// Grounds stay night-dark whatever the logo does.
for (const ground of mixed.backgrounds) {
  const max = Math.max(...[1, 3, 5].map((i) => parseInt(ground.slice(i, i + 2), 16)));
  assert.ok(max < 60, `ground ${ground} is too bright for the console`);
}

// A single-color logo still yields three distinct accents.
assert.equal(new Set(paletteFromPixels(pixels([amber])).accents).size, 3);

const channels = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// The no-logo default is black, white and yellow, sane option first.
assert.equal(FALLBACK.accents.length, 3);
assert.equal(FALLBACK.backgrounds[0], "#0a0c0f", "black leads the grounds");
assert.equal(FALLBACK.accents[0], "#e3b341", "yellow leads the accents");

// Three partners per pick, never more, always hex.
for (const set of [matchingBackgrounds("#e35e17"), matchingAccents("#4c1b0b")]) {
  assert.equal(set.length, 3, "exactly three suggestions per pick");
  assert.equal(new Set(set).size, 3, "suggestions are distinct");
  for (const hex of set) assert.match(hex, /^#[0-9a-f]{6}$/);
}

// A suggested ground stays a night ground whatever accent asked for it.
for (const accent of ["#e35e17", "#00ff88", "#6d3bdd", "#ffffff", "#000000"]) {
  for (const ground of matchingBackgrounds(accent)) {
    assert.ok(
      Math.max(...channels(ground)) < 74,
      `ground ${ground} suggested for ${accent} is too bright for the console`,
    );
  }
}

// A suggested accent has to be visible against the ground that asked for it.
for (const ground of ["#4c1b0b", "#0a0c0f", "#7c0303", "#101820"]) {
  for (const accent of matchingAccents(ground)) {
    assert.ok(
      Math.max(...channels(accent)) > 96,
      `accent ${accent} suggested for ${ground} is too dark to read`,
    );
  }
}

// Greys carry no hue, so a fixed trio stands in rather than accidental reds.
assert.deepEqual(matchingAccents("#202020"), matchingAccents("#808080"));
assert.deepEqual(matchingBackgrounds("#cccccc"), matchingBackgrounds("#333333"));

console.log("logo palette ok");
