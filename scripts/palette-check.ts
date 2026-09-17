/* node --experimental-strip-types scripts/palette-check.ts
   Fails if the board palette stops taking the artwork's own colours, or stops
   laying the ground out the way those colours actually sit in the logo. */
import assert from "node:assert/strict";
import {
  FALLBACK,
  contrastOnNight,
  groundImage,
  matchingAccents,
  matchingBackgrounds,
  paletteFromPixels,
} from "../src/lib/logo-palette.ts";

type RGBA = [number, number, number, number];

const SIZE = 32;
const CLEAR: RGBA = [0, 0, 0, 0];
const ORANGE: RGBA = [242, 101, 34, 255];
const WHITE: RGBA = [255, 255, 255, 255];
const TEAL: RGBA = [40, 160, 170, 255];

function image(paint: (x: number, y: number) => RGBA) {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      [data[i], data[i + 1], data[i + 2], data[i + 3]] = paint(x, y);
    }
  }
  return data;
}

const read = (data: Uint8ClampedArray) => paletteFromPixels(data, SIZE, SIZE);
const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const near = (hex: string, [r, g, b]: RGBA, tolerance = 24) => {
  const [hr, hg, hb] = channels(hex);
  return Math.hypot(hr - r, hg - g, hb - b) < tolerance;
};

/* ---- the colours are taken, not invented ---------------------------------- */

// A flat orange mark yields THAT orange. This is the whole point: a palette
// that only borrows the hue and rebuilds saturation would fail here.
const solidOrange = read(image(() => ORANGE));
assert.ok(
  solidOrange.accents.some((hex) => near(hex, ORANGE)),
  `the logo's own orange should survive, got ${solidOrange.accents.join(" ")}`,
);

// White is a colour a logo is made of, not "ground". A hue histogram drops it
// for having no saturation, and half of a two-tone mark goes with it.
const orangeAndWhite = read(image((x) => (x < SIZE / 2 ? ORANGE : WHITE)));
assert.ok(
  orangeAndWhite.accents.some((hex) => near(hex, WHITE)),
  `white is part of the artwork, got ${orangeAndWhite.accents.join(" ")}`,
);
assert.ok(
  orangeAndWhite.accents.some((hex) => near(hex, ORANGE)),
  "the orange half should survive too",
);

/* ---- the ground keeps the artwork's ARRANGEMENT --------------------------- */

// A mark with its colours in known PLACES: white filling the middle, orange
// only down the left. A ground that collapses the artwork into one concentric
// wash loses exactly this, which is the thing that makes it look like the logo.
const placed = read(
  image((x, y) => {
    const inside = x > SIZE * 0.15 && x < SIZE * 0.85 && y > SIZE * 0.15 && y < SIZE * 0.85;
    if (!inside) return CLEAR;
    return x < SIZE * 0.35 ? ORANGE : WHITE;
  }),
);

const measured = placed.grounds.find((option) => option.stops.length > 1);
assert.ok(measured, "a two-colour mark should produce a ground");
for (const stop of measured.stops) {
  assert.match(stop.color, /^#[0-9a-f]{6}$/, "ground stops are hex");
  assert.ok(stop.x >= 0 && stop.x <= 100, `stop x ${stop.x} out of range`);
  assert.ok(stop.y >= 0 && stop.y <= 100, `stop y ${stop.y} out of range`);
  assert.ok(stop.at > 0, "a smear that spreads nowhere is not a smear");
}

// The orange lived on the left, so its smears must be on the left, and the
// white's on the right. This is the assertion the concentric version failed.
// A cell straddling the two inks must pick one, not average them into pink.
// This is the difference between a ground that looks like the mark and one
// that looks like a smudge of it.
for (const stop of measured.stops) {
  assert.ok(
    near(stop.color, ORANGE, 12) || near(stop.color, WHITE, 12),
    `every smear is one of the logo's own inks, got ${stop.color}`,
  );
}

const orangeSmears = measured.stops.filter((stop) => near(stop.color, ORANGE, 70));
const whiteSmears = measured.stops.filter((stop) => near(stop.color, WHITE, 70));
assert.ok(orangeSmears.length, `orange must survive, got ${measured.stops.map((s) => s.color).join(" ")}`);
assert.ok(whiteSmears.length, "white must survive");
const avg = (list: typeof measured.stops) => list.reduce((sum, s) => sum + s.x, 0) / list.length;
assert.ok(
  avg(orangeSmears) < avg(whiteSmears),
  `orange sat on the left of the mark and must stay there: orange at ${avg(orangeSmears)}%, white at ${avg(whiteSmears)}%`,
);

// One colour blurs to itself, so it stays a flat board rather than becoming a
// stack of identical smears.
for (const option of solidOrange.grounds) {
  assert.equal(option.stops.length, 1, "a one-colour mark has nothing to lay out");
}
/* ---- the card a logo was supplied on is not the logo --------------------- */

// An orange mark on a white card, with the trail of intermediate shades that
// JPEG lays along every edge. Both bugs this guards against are real: the card
// dominated the palette, and a merge that drifted as it absorbed walked down
// that trail from white into orange and swallowed the mark entirely.
const onCard = read(
  image((x, y) => {
    const dx = x - SIZE / 2 + 0.5;
    const dy = y - SIZE / 2 + 0.5;
    const d = Math.hypot(dx, dy);
    if (d > SIZE * 0.3) return WHITE;
    if (d > SIZE * 0.26) {
      const t = (d - SIZE * 0.26) / (SIZE * 0.04);
      return [
        Math.round(242 + (255 - 242) * t),
        Math.round(101 + (255 - 101) * t),
        Math.round(34 + (255 - 34) * t),
        255,
      ];
    }
    return ORANGE;
  }),
);
assert.ok(
  onCard.accents.some((hex) => near(hex, ORANGE, 40)),
  `the mark must survive its card, got ${onCard.accents.join(" ")}`,
);
assert.ok(
  !onCard.accents.some((hex) => near(hex, WHITE, 12)),
  `the card is not one of the logo's colours, got ${onCard.accents.join(" ")}`,
);


/* ---- counts, so a row never grows extra choices --------------------------- */

for (const palette of [solidOrange, orangeAndWhite, placed, FALLBACK]) {
  assert.ok(palette.grounds.length <= 3, "at most three grounds are offered");
  assert.ok(palette.accents.length <= 3, "at most three accents are offered");
  assert.equal(new Set(palette.accents).size, palette.accents.length, "accents are distinct");
}

/* ---- the accent is chosen for contrast, not for loudness ------------------ */

// Ordered best-first, so accepting the first suggestion takes the most legible
// colour the logo actually contains.
const lifts = placed.accents.map((hex) => {
  const [r, g, b] = channels(hex);
  return contrastOnNight(r, g, b);
});
for (let i = 1; i < lifts.length; i++) {
  assert.ok(
    lifts[i - 1] >= lifts[i] - 0.001,
    `accents must lead with the most readable, got ${placed.accents.join(" ")}`,
  );
}
// White beats orange on a night ground, so it leads for this mark.
assert.ok(near(placed.accents[0], WHITE), `expected white to lead, got ${placed.accents[0]}`);

/* ---- nothing to read --------------------------------------------------- */

// Fully transparent pixels are not artwork.
assert.deepEqual(read(image(() => CLEAR)), FALLBACK, "empty artwork falls back");

// A board with no logo is offered the system mark: silver leads the accents
// because it reads best on night, and the ground is the mark laid out.
assert.equal(FALLBACK.accents[0], "#eef1f4", "silver leads the system accents");
assert.ok(FALLBACK.grounds[0].stops.length > 2, "the system ground is the mark, laid out");
assert.ok(
  new Set(FALLBACK.grounds[0].stops.map((stop) => `${stop.x},${stop.y}`)).size > 2,
  "the system mark's smears sit in different places, not stacked on one spot",
);

/* ---- partners for a board with no logo ---------------------------------- */

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

// TEAL is unused above; keep the import honest by proving a third ink is kept.
const three = read(image((x) => (x < SIZE / 3 ? ORANGE : x < (SIZE * 2) / 3 ? WHITE : TEAL)));
assert.ok(three.accents.length === 3, "three inks yield three accents");

/* ---- every smear sits where it is, and fades where it ends --------------- */

const ground = FALLBACK.grounds[0];
const css = groundImage(ground);

// One CSS layer per smear: the mark copied across the board, not collapsed.
assert.equal(
  css.split("radial-gradient(").length - 1,
  ground.stops.length,
  "one layer per smear, so the arrangement survives into the CSS",
);

// Each layer is placed at its own spot and falls to nothing at its own edge,
// which is what makes the colour lessen as it spreads.
for (const stop of ground.stops) {
  // Sized on both axes, so one number means the same size wherever the smear
  // sits. Default farthest-corner sizing measures to the furthest page corner
  // instead, which makes a corner smear far bigger than a central one.
  assert.ok(
    css.includes(`ellipse ${stop.at}% ${stop.at}% at ${stop.x}% ${stop.y}%`),
    `smear ${stop.color} must be painted ${stop.at}% wide at ${stop.x}%,${stop.y}%`,
  );
}
assert.equal(
  css.split("transparent 100%)").length - 1,
  ground.stops.length,
  "every smear falls to nothing at its own edge, so the colour lessens as it spreads",
);
assert.ok(!css.includes("NaN"), "no unresolved numbers reach CSS");
assert.equal(groundImage(null), "none", "a flat board paints no ground");

// A stack of smears is held back so it does not composite into a solid slab.
// A single smear has nothing to stack with, so holding it back only makes the
// flat colour it stands for look like a different, paler one.
assert.match(css, /#d81f22 22%/, "a stacked smear is held back");
assert.match(
  groundImage(FALLBACK.grounds[1]),
  /#0b1116 100%/,
  "a flat ground carries its colour whole",
);

console.log("logo palette ok");
console.log("system ground CSS:", css);
