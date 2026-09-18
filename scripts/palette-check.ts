/* node --experimental-strip-types scripts/palette-check.ts
   Fails if the board palette stops taking the artwork's own colours, or stops
   laying the ground out the way those colours actually sit in the logo. */
import assert from "node:assert/strict";
import {
  FALLBACK,
  MAP_LAND,
  SAMPLE,
  contrastBetween,
  contrastOnNight,
  groundImage,
  mapPalette,
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
const WHITE_HEX = "#ffffff";
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

const measured = placed.ground;
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

// One colour blurs to itself, so there is no arrangement to wear — the board
// stays the flat colour rather than carrying a grid of identical smears.
assert.equal(solidOrange.ground, null, "a one-colour mark has nothing to lay out");
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


/* A SMALL multi-coloured mark in a BIG white card, feathered into it the way
   every export is — built at the resolution the browser actually samples at,
   so SAMPLE itself is what this holds in place. Sampled too coarsely, a mark
   like this is mostly EDGE: the part-card tones between its petals outnumber
   any single petal, and an eight-colour pinwheel comes back as two greys. */
const PETALS: [number, number, number][] = [
  [232, 30, 45],
  [244, 130, 32],
  [250, 200, 40],
  [140, 198, 63],
  [0, 166, 156],
  [0, 120, 200],
  [90, 60, 160],
  [200, 40, 130],
];

/* The logo as it is actually supplied — a 480px export — then box-averaged
   down to SAMPLE, which is exactly what drawImage does on the way in. The
   averaging is the whole point: every output pixel that straddles a petal edge
   becomes a part-card tone, and at too coarse a sample those tones outnumber
   the petals themselves. */
const SOURCE = 256;
const art = new Float64Array(SOURCE * SOURCE * 3).fill(255);
for (let y = 0; y < SOURCE; y++) {
  for (let x = 0; x < SOURCE; x++) {
    const dx = x - SOURCE / 2;
    const dy = y - SOURCE / 2 - 14;
    const d = Math.hypot(dx, dy);
    const turn = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
    const i = (y * SOURCE + x) * 3;
    if (d >= SOURCE * 0.05 && d <= SOURCE * 0.22 && (turn * 8) % 1 < 0.72) {
      const petal = PETALS[Math.min(7, Math.floor(turn * 8))];
      [art[i], art[i + 1], art[i + 2]] = petal;
    }
    // The wordmark under the mark: thin grey type, which is the part that
    // dissolves into a pale mass when the sample is too coarse.
    if (y > SOURCE * 0.78 && y < SOURCE * 0.84 && x > SOURCE * 0.3 && x < SOURCE * 0.7) {
      if (x % 5 < 3) [art[i], art[i + 1], art[i + 2]] = [110, 110, 115];
    }
  }
}

const card = new Uint8ClampedArray(SAMPLE * SAMPLE * 4);
const box = SOURCE / SAMPLE;
for (let y = 0; y < SAMPLE; y++) {
  for (let x = 0; x < SAMPLE; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let sy = Math.floor(y * box); sy < (y + 1) * box; sy++) {
      for (let sx = Math.floor(x * box); sx < (x + 1) * box; sx++) {
        const i = (sy * SOURCE + sx) * 3;
        r += art[i];
        g += art[i + 1];
        b += art[i + 2];
        n += 1;
      }
    }
    const o = (y * SAMPLE + x) * 4;
    card[o] = r / n;
    card[o + 1] = g / n;
    card[o + 2] = b / n;
    card[o + 3] = 255;
  }
}

const onWhiteCard = paletteFromPixels(card, SAMPLE, SAMPLE);
const spread = (hex: string) => Math.max(...channels(hex)) - Math.min(...channels(hex));
assert.ok(
  spread(onWhiteCard.accents[0]) > 80,
  `a multi-coloured mark must lead with one of its colours, got ${onWhiteCard.accents.join(" ")}`,
);

// ...and the board wears more than a couple of them. The ground could only ever
// show as many colours as the palette keeps, so a logo of eight came back as a
// board of two however well the extraction worked.
assert.ok(onWhiteCard.ground, "a multi-coloured mark lays out");
assert.ok(
  new Set(onWhiteCard.ground.stops.map((stop) => stop.color)).size >= 4,
  `a mark of many colours should wear many, got ${[
    ...new Set(onWhiteCard.ground.stops.map((stop) => stop.color)),
  ].join(" ")}`,
);
// Every one of them a real ink, not a blend of two petals or of petal and card.
for (const stop of onWhiteCard.ground.stops) {
  assert.ok(
    spread(stop.color) > 40,
    `the board wears the logo's inks, not the blends between them: ${stop.color}`,
  );
}
assert.ok(
  !onWhiteCard.accents.some((hex) => spread(hex) < 24),
  `a blend between the petals is not one of the logo's colours, got ${onWhiteCard.accents.join(" ")}`,
);
// The colour under the mark is mixed from that same ink, so it carries the
// logo's hue. A board that falls back to the neutral trio here is a board whose
// dominant "ink" came out grey, which is the same failure said twice.
assert.ok(
  spread(onWhiteCard.backgrounds[0]) > 8,
  `the ground under a colourful mark should carry its hue, got ${onWhiteCard.backgrounds.join(" ")}`,
);

/* ---- counts, so a row never grows extra choices --------------------------- */

for (const palette of [solidOrange, orangeAndWhite, placed, FALLBACK]) {
  assert.ok(palette.backgrounds.length <= 3, "at most three backgrounds are offered");
  assert.ok(palette.accents.length <= 3, "at most three accents are offered");
  assert.equal(new Set(palette.accents).size, palette.accents.length, "accents are distinct");
  // The ground is worn, not chosen, so it never appears among the flat picks.
  for (const hex of palette.backgrounds) assert.match(hex, /^#[0-9a-f]{6}$/);
}

// A board with artwork wears it over a flat colour, and the two are separate
// decisions: picking a background must never be the thing that takes the logo
// off the board.
assert.ok(placed.ground, "a mark with an arrangement is applied, not offered");
assert.ok(
  placed.backgrounds.every((hex) => Math.max(...channels(hex)) < 74),
  `the colour under the mark stays a night ground, got ${placed.backgrounds.join(" ")}`,
);

/* ---- the accent is the logo's dominant ink -------------------------------- */

// White fills most of this mark, so white leads.
assert.ok(near(placed.accents[0], WHITE), `expected white to lead, got ${placed.accents[0]}`);

// The other way round: a mark that is mostly ORANGE with a white corner. White
// reads better on a night console, so ordering by contrast leads with it — and
// the board ends up wearing a colour the logo barely uses. The accent is what
// the mark reads as, which is its most-used ink.
const mostlyOrange = read(
  image((x, y) => {
    const inside = x > SIZE * 0.2 && x < SIZE * 0.8 && y > SIZE * 0.2 && y < SIZE * 0.8;
    if (!inside) return CLEAR;
    return x > SIZE * 0.66 ? WHITE : ORANGE;
  }),
);
assert.ok(
  near(mostlyOrange.accents[0], ORANGE, 40),
  `the mark is mostly orange, so the accent is orange, got ${mostlyOrange.accents.join(" ")}`,
);
assert.ok(
  contrastOnNight(...(channels(WHITE_HEX) as [number, number, number])) >
    contrastOnNight(...(channels(mostlyOrange.accents[0]) as [number, number, number])),
  "this only proves anything while white is the more legible of the two",
);

// Dominant does not mean unreadable: an accent labels a control, so whatever
// the logo leads with is lifted until it can be printed on the console.
for (const palette of [placed, mostlyOrange, orangeAndWhite, FALLBACK]) {
  for (const hex of palette.accents) {
    const [r, g, b] = channels(hex);
    assert.ok(
      contrastOnNight(r, g, b) >= 4.5,
      `accent ${hex} cannot be read on the console (${contrastOnNight(r, g, b).toFixed(2)}:1)`,
    );
  }
}

/* ---- nothing to read --------------------------------------------------- */

// Fully transparent pixels are not artwork.
assert.deepEqual(read(image(() => CLEAR)), FALLBACK, "empty artwork falls back");

// A board with no logo is offered the system mark: silver leads the accents
// because it reads best on night, and the ground is the mark laid out.
// The system mark reads as its red arc, and its ground and its backgrounds are
// both built from that red. An accent leading with anything else makes SUGGEST
// hand a logo-less board three colours that disagree with each other.
assert.equal(FALLBACK.accents[0], "#f0362c", "the system mark leads with its red");
assert.ok(
  FALLBACK.ground?.stops[0].color.startsWith("#d") &&
    channels(FALLBACK.ground.stops[0].color)[0] > 150,
  "and the ground it comes with leads with the same red",
);
assert.ok(FALLBACK.ground, "a board with no logo still wears the system mark");
assert.ok(FALLBACK.ground.stops.length > 2, "the system ground is the mark, laid out");
assert.ok(
  new Set(FALLBACK.ground.stops.map((stop) => `${stop.x},${stop.y}`)).size > 2,
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

const ground = FALLBACK.ground;
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
  groundImage({ stops: [{ color: "#0b1116", x: 50, y: 50, at: 140 }] }),
  /#0b1116 100%/,
  "a flat ground carries its colour whole",
);

/* ---- the map wears the board's colours, legibly ------------------------- */

// Brands worth breaking it: a mid accent, a very dark one, a very light one,
// and an achromatic one that has no hue to build from at all.
for (const [accent, background] of [
  ["#e3b341", "#10181a"],
  ["#2a1a02", "#0a0c0f"],
  ["#f6f7f8", "#eff0f0"],
  ["#808080", "#202020"],
  ["#c6cbd1", "#d81f22"],
] as const) {
  for (const night of [true, false]) {
    const map = mapPalette(accent, background, night);
    const land = night ? MAP_LAND.night : MAP_LAND.day;
    const pins = { origin: map.origin, history: map.history, dest: map.dest };

    for (const [role, stop] of Object.entries(pins)) {
      assert.match(stop.fill, /^#[0-9a-f]{6}$/, `${role} is a plain colour`);
      // A mark on a map is a graphical object: WCAG 1.4.11 wants 3:1.
      assert.ok(
        contrastBetween(stop.fill, land) >= 3,
        `${role} ${stop.fill} for ${accent} is invisible on the ${night ? "night" : "day"} map (${contrastBetween(stop.fill, land).toFixed(2)}:1)`,
      );
      // The number sits ON the stop, so it is text on that fill. Chosen per
      // stop, because one ink cannot serve both ends of a dark-to-light ramp.
      assert.ok(
        contrastBetween(stop.ink, stop.fill) >= 4.5,
        `the number ${stop.ink} cannot be read on ${role} ${stop.fill}`,
      );
    }

    /* Three roles a viewer can tell apart. The two ENDS of a journey are
       deliberately close, a shade of one colour, so they only have to be
       distinguishable; the scans between them are many and have to separate
       from both properly. */
    const roles = Object.entries(pins);
    for (let i = 0; i < roles.length; i++) {
      for (let j = i + 1; j < roles.length; j++) {
        const [an, a] = roles[i];
        const [bn, b] = roles[j];
        const [ar, ag, ab] = channels(a.fill);
        const [br, bg, bb] = channels(b.fill);
        const ends = an !== "history" && bn !== "history";
        const floor = ends ? 30 : 60;
        assert.ok(
          Math.hypot(ar - br, ag - bg, ab - bb) > floor,
          `${an} ${a.fill} and ${bn} ${b.fill} are the same pin to a viewer`,
        );
      }
    }

    /* The two ends of a journey are one colour a shade apart. Distance is
       already floored above; here it is CAPPED, and the dominant channel has to
       match, so the destination cannot quietly wander off to another colour. */
    const lead = (hex: string) => {
      const ch = channels(hex);
      return ch.indexOf(Math.max(...ch));
    };
    assert.equal(
      lead(map.dest.fill),
      lead(map.origin.fill),
      `destination ${map.dest.fill} should be origin ${map.origin.fill} a shade along, not another colour`,
    );
    const [or, og, ob] = channels(map.origin.fill);
    const [dr, dg, db] = channels(map.dest.fill);
    assert.ok(
      Math.hypot(or - dr, og - dg, ob - db) < 130,
      `destination ${map.dest.fill} is a long way from origin ${map.origin.fill}, not a shade along`,
    );

    // The line is the journey the scans string together.
    assert.equal(map.route, map.history.fill, "the route line matches the scans it joins");
  }
}

// A grey brand has no hue, and hue 0 is red. Standing in the house amber is
// what stops an achromatic board getting a map full of accidental red pins.
const grey = mapPalette("#808080", "#202020", true);
assert.ok(
  channels(grey.history.fill)[0] > channels(grey.history.fill)[2],
  `an achromatic brand should borrow the house amber, got ${grey.history.fill}`,
);

// The board that caught this: a silver accent on a red board. #c6cbd1 is
// technically 213 degrees, blue, and lifting that invisible cast to a legible
// saturation painted a red board's map bright blue while its red went unused.
// The hue has to come from whichever of the two colours has real chroma.
// #eef1f4 is the sharp end of it: its HSL saturation is 0.214, HIGHER than
// #c6cbd1's 0.107, while carrying half the chroma. Gate on saturation and the
// palest silver of the three is the one that turns the map blue.
for (const silver of ["#c6cbd1", "#eef1f4", "#8d949c"]) {
  const onRed = mapPalette(silver, "#d81f22", true);
  const [r, g, b] = channels(onRed.history.fill);
  assert.ok(
    r > g + 12 && r > b + 12,
    `${silver} has no hue of its own, so a red board's map must read red, got ${onRed.history.fill}`,
  );
}

// The DARKER of the board's two colours anchors the ramp. Amber on red: red is
// the darker, so it takes the origin and the destination cut from it...
const amber = mapPalette("#e3b341", "#d81f22", true);
const [ar, ag, ab] = channels(amber.origin.fill);
assert.ok(
  ar > ag + 60 && ar > ab + 60,
  `the darker of the board's colours should anchor the ramp, got ${amber.origin.fill}`,
);
// ...and the scans take the colour nearest to both, so they land between the
// pair rather than on either one of them.
assert.ok(
  channels(amber.history.fill)[1] > ag + 40,
  `the scans sit between the board's two colours, got ${amber.history.fill}`,
);

console.log("logo palette ok");
console.log("system ground CSS:", css);
