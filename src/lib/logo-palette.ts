/* Board colors read off an uploaded logo.

   The colours are taken, not invented: each bin keeps the artwork's own
   averaged RGB, and the ground is laid out from where those colours actually
   sit in the image. The pixel math is pure so it runs in the browser and under
   `node --experimental-strip-types scripts/palette-check.ts`. */

/** One smear of the logo on the board: a colour the artwork uses, WHERE it sits
 *  in the artwork, and how far it spreads before it is gone. */
export type GroundStop = { color: string; x: number; y: number; at: number };

/** A ground read off a logo: the mark itself, blurred out across the board.
 *
 *  Every stop keeps its own place, so the arrangement survives — a red arc in
 *  the top left stays in the top left, pale petals falling to the bottom left
 *  stay there. Collapsing the mark into one concentric wash loses exactly the
 *  thing that makes it look like the logo. A single stop is a flat colour. */
export type BoardGround = { stops: GroundStop[] };

export type Palette = {
  /** The logo's own colours, the one that reads best on night first. */
  accents: string[];
  /** The logo laid out across the board. Not a choice: a board with artwork
   *  wears it, and the flat colour below only decides what it washes over. */
  ground: BoardGround | null;
  /** Flat board colours that sit UNDER that ground, in the logo's own hue. */
  backgrounds: string[];
};

/** What a board with no logo of its own is offered: the system's mark.
 *
 *  Taken from the real stops in GateMark — a silver bloom with a red arc
 *  sweeping round it, on near-black. A board with no artwork is treated the
 *  same way as one with artwork, using the product's own mark as the artwork,
 *  so it still looks like part of the product rather than a stock default. */
export const FALLBACK: Palette = {
  // Red leads, for the same reason a measured palette leads with its most-used
  // ink: it is what the mark reads as. These three are hand-written rather than
  // counted off pixels, so "dominant" is a judgement — and the ground below
  // leads with the red arc while the backgrounds are mixed from that same red.
  // An accent that led with the silver contradicted both.
  accents: ["#f0362c", "#eef1f4", "#8d949c"],
  // The mark as it is actually built: the red arc sweeping the top left to the
  // dot it ends on, the red petal at the left, and the pale bloom falling away
  // to the bottom left.
  ground: {
    stops: [
      { color: "#d81f22", x: 34, y: 26, at: 30 },
      { color: "#f0362c", x: 62, y: 20, at: 22 },
      { color: "#b81318", x: 38, y: 52, at: 26 },
      { color: "#c6cbd1", x: 54, y: 44, at: 30 },
      { color: "#98a0a8", x: 60, y: 62, at: 28 },
      { color: "#767d85", x: 44, y: 70, at: 26 },
    ],
  },
  // Taken from the mark's own red, so the flat colour under it belongs to it.
  backgrounds: matchingBackgrounds("#d81f22"),
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
  // d is chroma: how far the colour is from grey, before HSL divides it by a
  // lightness term that explodes near white and near black.
  if (!d) return { h: 0, s: 0, l, c: 0 };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === rn
      ? ((gn - bn) / d + (gn < bn ? 6 : 0))
      : max === gn
        ? (bn - rn) / d + 2
        : (rn - gn) / d + 4;
  return { h: h * 60, s, l, c: d };
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

/* WCAG relative luminance. Accents are ordered by how far they stand off the
   console ground, not by how loud they are. */
function luminance(r: number, g: number, b: number) {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

const NIGHT = luminance(10, 12, 15);

const ratio = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

export function contrastOnNight(r: number, g: number, b: number) {
  return ratio(luminance(r, g, b), NIGHT);
}

const rgbOf = (value: string) => {
  const n = parseInt(value.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};

/** WCAG contrast between two colours, either way round. */
export function contrastBetween(a: string, b: string) {
  return ratio(luminance(...rgbOf(a)), luminance(...rgbOf(b)));
}

type Cluster = {
  r: number;
  g: number;
  b: number;
  /** Centre of mass in the image, 0..1. */
  x: number;
  y: number;
  count: number;
  keys: number[];
};

/** Five bits per channel: shades of one ink collapse together, separate inks
 *  stay apart. */
const keyOf = (r: number, g: number, b: number) =>
  ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

/** How far apart two colours can be and still be one ink softened by
 *  antialiasing rather than two different inks. */
const ONE_INK = 48;

/** How many of a logo's colours are kept.
 *
 *  Four is the accent row's worth, and it was also all the ground had to lay
 *  out — which is why an eight-colour pinwheel came back as a board wearing two
 *  of them. The accents still take the leading three; the rest are here so the
 *  mark on the board looks like the mark. */
const INKS = 6;

/** Every colour the artwork actually uses, most-used first, with where it sits.
 *
 *  Unlike a hue histogram this keeps white, black and grey. A mark that is
 *  orange and white is two colours, and dropping the white for having no hue
 *  would throw away half the logo. */
function dominantColors(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  skip?: Uint8Array | null,
): Cluster[] {
  const bins = new Map<number, Cluster>();
  let opaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    if (skip?.[i / 4]) continue;
    opaque += 1;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = keyOf(r, g, b);
    const px = i / 4;
    const bin = bins.get(key) ?? { r: 0, g: 0, b: 0, x: 0, y: 0, count: 0, keys: [key] };
    bin.r += r;
    bin.g += g;
    bin.b += b;
    bin.x += (px % width) / width;
    bin.y += Math.floor(px / width) / Math.max(height, 1);
    bin.count += 1;
    bins.set(key, bin);
  }
  if (!opaque) return [];

  const counted = [...bins.values()]
    .map((bin) => ({
      r: bin.r / bin.count,
      g: bin.g / bin.count,
      b: bin.b / bin.count,
      x: bin.x / bin.count,
      y: bin.y / bin.count,
      count: bin.count,
      keys: bin.keys,
    }))
    .sort((a, b) => b.count - a.count);

  // Bins that are one ink softened by antialiasing are merged, so a single
  // edge does not read as three separate colours.
  //
  // Measured against each cluster's SEED colour, never its running average. A
  // JPEG lays a trail of intermediate shades along every edge, and an average
  // that drifts as it absorbs will walk straight down that trail and swallow
  // the next ink whole — which is how an orange fox disappears into its white
  // card and leaves only the card behind.
  const merged: (Cluster & { seed: [number, number, number] })[] = [];
  for (const bin of counted) {
    const near = merged.find(
      (o) => Math.hypot(o.seed[0] - bin.r, o.seed[1] - bin.g, o.seed[2] - bin.b) < ONE_INK,
    );
    if (!near) {
      merged.push({ ...bin, keys: [...bin.keys], seed: [bin.r, bin.g, bin.b] });
      continue;
    }
    const total = near.count + bin.count;
    near.r = (near.r * near.count + bin.r * bin.count) / total;
    near.g = (near.g * near.count + bin.g * bin.count) / total;
    near.b = (near.b * near.count + bin.b * bin.count) / total;
    near.x = (near.x * near.count + bin.x * bin.count) / total;
    near.y = (near.y * near.count + bin.y * bin.count) / total;
    near.count = total;
    near.keys.push(...bin.keys);
  }
  // Filtered AFTER merging, never before. A colour spread across many near
  // shades by a gradient or by JPEG noise is only significant once those
  // shades are back together; filtering first deletes it one crumb at a time
  // and a small mark on a big card vanishes entirely.
  const kept = merged.filter((cluster) => cluster.count / opaque >= 0.04);
  return (kept.length ? kept : merged).slice(0, INKS);
}

/** How finely the mark is sampled. Six across keeps an arc in the top left
 *  distinct from petals at the bottom without turning the board into a mosaic
 *  you can count. */
const GRID = 6;

/** How much of a cell the mark has to fill before it counts as part of how the
 *  mark is built, rather than somewhere it merely grazes.
 *
 *  Low, because it is no longer the thing keeping edges out — cardMask has
 *  already eaten them. What it rejects now is a cell the mark genuinely only
 *  clips, and a small logo still gets laid out instead of falling back flat. */
const COVERAGE = 0.08;

/** The mark, blurred out across the board.
 *
 *  A deliberate copy-and-blur rather than a measurement: the logo is sampled
 *  into a coarse grid, and every cell the mark covers becomes one soft smear at
 *  the place it sits. Laying those side by side keeps the artwork's
 *  arrangement, which is exactly what a single concentric gradient throws away.
 *
 *  Each cell takes the ink MOST of its pixels belong to, never the average of
 *  them. Averaging a cell that straddles two inks invents a colour the logo
 *  does not contain — a cell half red and half silver averages to pink — and a
 *  ground built out of those reads as a washed-out smudge instead of the mark.
 *  A majority vote gives back the logo's own colours, with the boundary between
 *  them where the artwork puts it. */
function groundFrom(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  clusters: Cluster[],
  skip?: Uint8Array | null,
): BoardGround | null {
  if (!clusters.length) return null;
  const owner = new Map<number, number>();
  clusters.forEach((cluster, index) => {
    for (const key of cluster.keys) owner.set(key, index);
  });

  const cells = Array.from({ length: GRID * GRID }, () => ({
    votes: new Array<number>(clusters.length).fill(0),
    n: 0,
    all: 0,
  }));
  for (let i = 0; i < data.length; i += 4) {
    const px = i / 4;
    const col = Math.min(GRID - 1, Math.floor(((px % width) / width) * GRID));
    const row = Math.min(
      GRID - 1,
      Math.floor((Math.floor(px / width) / Math.max(height, 1)) * GRID),
    );
    const cell = cells[row * GRID + col];
    cell.all += 1;
    if (data[i + 3] < 128) continue;
    if (skip?.[px]) continue;
    const key = keyOf(data[i], data[i + 1], data[i + 2]);
    // A pixel belonging to no kept ink is noise, and does not get a vote.
    const index = owner.get(key);
    if (index === undefined) continue;
    cell.votes[index] += 1;
    cell.n += 1;
  }

  const colors = clusters.map((cluster) => hex(cluster.r, cluster.g, cluster.b));
  const stops: GroundStop[] = [];
  cells.forEach((cell, index) => {
    if (!cell.all || !cell.n) return;
    const coverage = cell.n / cell.all;
    if (coverage < COVERAGE) return;
    let winner = 0;
    for (let i = 1; i < cell.votes.length; i++) {
      if (cell.votes[i] > cell.votes[winner]) winner = i;
    }
    const col = index % GRID;
    const row = (index - col) / GRID;
    stops.push({
      color: colors[winner],
      x: Math.round(((col + 0.5) / GRID) * 100),
      y: Math.round(((row + 0.5) / GRID) * 100),
      // A full cell reaches further than a thin one, so the solid parts of the
      // mark carry the board and its edges only tint it. Every smear overlaps
      // its neighbours, which is what blurs them into each other.
      at: Math.round((100 / GRID) * (1 + coverage)),
    });
  });
  if (stops.length < 2) return null;
  // A mark of one colour blurs to that colour. That is a flat board, not a
  // grid of identical smears stacked on top of it.
  const varied = new Set(stops.map((stop) => stop.color)).size > 1;
  return varied ? { stops } : null;
}

/** The same colour, lifted until it can be read on the night console.
 *
 *  Hue and saturation are kept, so a deep navy accent still reads as that
 *  navy — just one a label can be printed in. Nothing is touched when the
 *  colour already clears the floor, which is most of the time. */
function readableAccent(value: string) {
  if (contrastOnNight(...rgbOf(value)) >= 4.5) return value;
  const { h, s, l } = hexToHsl(value);
  for (let lift = l + 0.02; lift <= 0.94; lift += 0.02) {
    const next = fromHsl(h, s, lift);
    if (contrastOnNight(...rgbOf(next)) >= 4.5) return next;
  }
  return fromHsl(h, s, 0.94);
}

/** Which cluster is the card the logo was supplied ON, or -1 for none.
 *
 *  A mark exported as a JPEG carries its background, and that card is usually
 *  most of the image. Left alone it leads every suggestion and lays itself over
 *  the board, which is how a fox on a white card becomes a white board. A
 *  colour that fills the BORDER is the card; a mark that merely bleeds to one
 *  edge is not, and keeps its own colour. */
function cardIndex(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  clusters: Cluster[],
) {
  const owner = new Map<number, number>();
  clusters.forEach((cluster, index) => {
    for (const key of cluster.keys) owner.set(key, index);
  });
  const tally = clusters.map(() => 0);
  let border = 0;
  const visit = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 128) return;
    border += 1;
    const index = owner.get(keyOf(data[i], data[i + 1], data[i + 2]));
    if (index !== undefined) tally[index] += 1;
  };
  for (let x = 0; x < width; x++) {
    visit(x, 0);
    visit(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    visit(0, y);
    visit(width - 1, y);
  }
  if (!border) return -1;
  let best = 0;
  for (let i = 1; i < tally.length; i++) if (tally[i] > tally[best]) best = i;
  return tally[best] / border >= 0.7 ? best : -1;
}

/** Which pixels are NOT the artwork: the card it was supplied on, anything
 *  transparent, and — the point of this — everything within reach of either.
 *
 *  A logo is drawn at its own size and scaled down to be read, and every pixel
 *  that straddles an edge on the way down comes out a blend of the ink and the
 *  card. Those blends are not colours the logo contains, but there are a great
 *  many of them: around a small mark, or along the strokes of a wordmark, they
 *  outnumber the inks themselves and take every slot in the palette. An
 *  eight-colour pinwheel then reports three greys.
 *
 *  Growing the card by a pixel or two eats exactly that boundary and leaves the
 *  solid middles of the artwork, which are the colours it is actually made of.
 *  Type too thin to survive it had no solid middle to begin with. */
function cardMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  card: Cluster | null,
) {
  const keys = card ? new Set(card.keys) : null;
  const mask = new Uint8Array(width * height);
  for (let px = 0; px < mask.length; px++) {
    const i = px * 4;
    if (data[i + 3] < 128) mask[px] = 1;
    else if (keys?.has(keyOf(data[i], data[i + 1], data[i + 2]))) mask[px] = 1;
  }

  // Scaled to the image, so the same edge is eaten however finely it is read.
  const reach = Math.max(1, Math.round(width / 80));
  for (let pass = 0; pass < reach; pass++) {
    const grown = Uint8Array.from(mask);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (mask[y * width + x]) continue;
        const touches =
          (x > 0 && mask[y * width + x - 1]) ||
          (x < width - 1 && mask[y * width + x + 1]) ||
          (y > 0 && mask[(y - 1) * width + x]) ||
          (y < height - 1 && mask[(y + 1) * width + x]);
        if (touches) grown[y * width + x] = 1;
      }
    }
    mask.set(grown);
  }
  return mask;
}

export function paletteFromPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Palette {
  const found = dominantColors(data, width, height);
  if (!found.length) return FALLBACK;

  // The card a logo was supplied on is not one of the logo's colours. Once it
  // is known, everything is measured AGAIN with those pixels left out, so the
  // colours, the centre and the spread all describe the MARK and nothing else.
  // A mark that fills its own frame has no card, and nothing is dropped.
  const card = cardIndex(data, width, height, found);
  const skip = cardMask(data, width, height, card >= 0 ? found[card] : null);
  const mark = dominantColors(data, width, height, skip);
  const clusters = mark.length ? mark : found;

  const colors = clusters.map((c) => hex(c.r, c.g, c.b));
  /* The accent leads with the logo's MOST-USED ink, because that is the colour
     the mark reads as. dominantColors already returns them that way, and
     re-sorting by contrast is what put a white corner ahead of an orange fox:
     the more legible colour is not the same thing as the brand's colour. Only
     the console floor is enforced, and only on a colour that fails it. */
  const accents = colors.map(readableAccent);

  // The ground is the mark copied and blurred: every cell of the artwork keeps
  // its own place on the board, so the arrangement survives.
  // The mark copied and blurred: applied whenever the artwork has an
  // arrangement to read, rather than offered as one option among flat colours.
  const ground = groundFrom(data, width, height, clusters, skip);
  // What that mark washes over: night colours carrying the logo's own hue, so
  // the flat choice below the ground still belongs to the same logo.
  const backgrounds = matchingBackgrounds(colors[0]);

  return { accents: [...new Set(accents)].slice(0, 3), ground, backgrounds };
}

/** How much of the logo's real colour reaches the board.
 *
 *  Per LAYER, not in total: smears overlap, and where the mark is solid some
 *  eight of them stack, so 1 - (1 - 0.22)^8 of the ground is already the logo's
 *  colour there while the board's edges keep barely a tint. Feeding each layer
 *  the strength the finished wash should have is what turns a ground into an
 *  opaque slab. */
const STRENGTH = 22;
/** A swatch is a thumbnail, seen next to flat colours and at a glance, so it
 *  shows the arrangement at closer to full colour. */
const SWATCH_STRENGTH = 60;

/** Every smear laid side by side, one CSS layer each. `none` for no ground.
 *
 *  Sized in percentages of the board on BOTH axes, so the logo's own
 *  proportions are stretched across whatever shape the page is, and a smear
 *  near a corner covers as much as one in the middle. The default
 *  farthest-corner sizing does neither: it measures from each smear to the
 *  furthest corner of the page, so the same number means a different size for
 *  every stop and the arrangement distorts.
 *
 *  Every number and colour interpolated here was validated on the way into
 *  storage (see asGround in store.ts), so nothing unchecked reaches CSS. */
function smears(ground: BoardGround | null | undefined, strength: number) {
  if (!ground?.stops.length) return "none";
  // The restraint above is there for the overlap. A flat ground is one smear
  // with nothing to stack against, so it carries its colour whole.
  const mix = ground.stops.length > 1 ? strength : 100;
  return ground.stops
    .map(
      (stop) =>
        `radial-gradient(ellipse ${stop.at}% ${stop.at}% at ${stop.x}% ${stop.y}%, ` +
        `color-mix(in srgb, ${stop.color} ${mix}%, transparent) 0%, ` +
        `transparent 100%)`,
    )
    .join(", ");
}

export function groundImage(ground?: BoardGround | null) {
  return smears(ground, STRENGTH);
}

/** A ground at full strength, for showing the option itself rather than how it
 *  will wash over the console. */
export function groundSwatch(ground: BoardGround) {
  return smears(ground, SWATCH_STRENGTH);
}

function hexToHsl(value: string) {
  const clean = value.replace("#", "");
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean.padEnd(6, "0").slice(0, 6);
  const n = parseInt(full, 16);
  return toHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

/* Colour partners for a board with no logo to read. A ground carries the
   accent's hue at low saturation so the two read as one scheme; an accent is
   lifted to a lightness that survives on a night ground. An achromatic pick
   has no hue to work from, so a fixed trio stands in. */
const NEUTRAL_GROUNDS = ["#0a0c0f", "#10181a", "#161f22"];
const NEUTRAL_ACCENTS = ["#e3b341", "#3ddc84", "#6da8ff"];

export function matchingBackgrounds(accent: string): string[] {
  const { h, s } = hexToHsl(accent);
  if (s < 0.08) return NEUTRAL_GROUNDS;
  return [fromHsl(h, 0.34, 0.08), fromHsl((h + 186) % 360, 0.22, 0.1), fromHsl(h, 0.1, 0.14)];
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

/** The land the map is drawn on, which is what every overlay has to read
 *  against. Lives here rather than beside the tile styles so the contrast the
 *  palette below promises is measured against the real ground. */
export const MAP_LAND = { night: "#151c1e", day: "#f2f4f4" } as const;

/** One role on the map: the colour it is drawn in, and the colour of the number
 *  printed on it. The ink is chosen per stop rather than once for the map, so a
 *  ramp can run from dark to light without the label falling off it halfway. */
export type MapStop = { fill: string; ink: string };

/** What the map draws a journey with, built from the board's own two colours. */
export type MapPalette = {
  route: string;
  origin: MapStop;
  history: MapStop;
  dest: MapStop;
};

/** How far from grey a colour has to be before its hue means anything.
 *
 *  Measured as chroma, never as HSL saturation, which is chroma divided by a
 *  lightness term that explodes near white and near black: #eef1f4 reports a
 *  HIGHER saturation than #c6cbd1 while carrying half its chroma. Gate on
 *  saturation and a silver reads as a strong blue. */
const BRAND_CHROMA = 0.12;

/** The board's own colours, rebuilt as a map legend.
 *
 *  Nothing here is invented. The darker of the board's two colours anchors the
 *  journey and marks its origin; the destination is that same colour lightened;
 *  the scans in between take the colour that sits between the two, so the whole
 *  route reads as one ramp of the board's palette rather than a handful of
 *  unrelated hues. Rotating to a complementary gives three colours that are
 *  easy to tell apart and look nothing like the board they sit on.
 *
 *  What the board does NOT get to decide is lightness. A dark brand on a night
 *  map is invisible however faithful it is, so the ramp's three steps are set
 *  by the map and only the hues come from the board. */
export function mapPalette(accent: string, background: string, night: boolean): MapPalette {
  const brand = hexToHsl(accent);
  const ground = hexToHsl(background);

  /* Which of the board's two colours carries the hue. A silver or near-white
     accent still has a faint cast — #c6cbd1 is technically 213 degrees, blue —
     and amplifying that to a legible saturation paints a red board's map bright
     blue while its actual red goes unused. So a hue is only taken from a colour
     with real chroma: the accent if it has any, otherwise the background, and
     only a board with no colour at all falls back to the house amber. */
  const source =
    brand.c >= BRAND_CHROMA
      ? brand
      : ground.c >= BRAND_CHROMA
        ? ground
        : { h: 43, s: 0.6, c: 1, l: 0.5 };

  // The anchor is the DARKER of the two, which is what origin and destination
  // are both cut from — destination being the same colour, lightened.
  const anchor =
    luminance(...rgbOf(accent)) <= luminance(...rgbOf(background)) ? brand : ground;
  const anchorHue = anchor.c >= BRAND_CHROMA ? anchor.h : source.h;
  const anchorSat = Math.max(anchor.c >= BRAND_CHROMA ? anchor.s : source.s, 0.45);

  // The scans sit between the board's two colours, so their colour is the one
  // nearest to both: the midpoint of the pair.
  const mid = rgbOf(accent).map((v, i) => (v + rgbOf(background)[i]) / 2) as unknown as number[];
  const blend = hexToHsl(hex(mid[0], mid[1], mid[2]));
  const blendHue = blend.c >= 0.04 ? blend.h : anchorHue;
  const blendSat = Math.max(blend.s, 0.3);

  const land = night ? MAP_LAND.night : MAP_LAND.day;
  const inkHue = ground.c >= BRAND_CHROMA ? ground.h : source.h;
  const inkSat = Math.min(ground.s, 0.2);
  const inks = [fromHsl(inkHue, inkSat, 0.07), fromHsl(inkHue, inkSat, 0.97)];
  const inkFor = (fill: string) =>
    contrastBetween(inks[0], fill) >= contrastBetween(inks[1], fill) ? inks[0] : inks[1];

  /* A stop has to clear two bars: 3:1 against the map it sits on, and 4.5:1
     under the 11px number printed on it — and a mid-tone can fail the second
     against black AND white at once. HSL lightness cannot promise either,
     because it is not perceptual: a cyan and a brown at the same lightness are
     nowhere near the same brightness. So the lightness is walked away from the
     map's own ground until both bars are measured as cleared, which is also the
     direction that leaves the mid-tone dead zone. */
  const place = (h: number, sat: number, from: number): MapStop & { l: number } => {
    const step = night ? 0.02 : -0.02;
    for (let l = from; l > 0.05 && l < 0.95; l += step) {
      const fill = fromHsl(h, sat, l);
      const ink = inkFor(fill);
      if (contrastBetween(fill, land) >= 3 && contrastBetween(ink, fill) >= 4.5) {
        return { fill, ink, l };
      }
    }
    const fill = fromHsl(h, sat, from);
    return { fill, ink: inkFor(fill), l: from };
  };

  /* Where a journey starts and where it ends are the same kind of thing, so
     they are neighbours: the destination is the origin's colour a shade along,
     no more. The scans in between are the ones that have to stand out from
     both, so the blend takes the far end of the ramp rather than the middle.
     Measured from where the origin LANDS, not from where it was aimed: the walk
     above moves it, and a fixed pair of numbers would leave the two ends closer
     for one brand than the next. */
  const steps = night ? { origin: 0.5, history: 0.82 } : { origin: 0.16, history: 0.4 };
  const origin = place(anchorHue, anchorSat, steps.origin);
  const history = place(blendHue, blendSat, steps.history);
  return {
    // The line is the journey the scans string together, so it is the same ink.
    route: history.fill,
    origin,
    history,
    dest: place(anchorHue, anchorSat, origin.l + (night ? 0.12 : -0.08)),
  };
}

/** How finely a logo is sampled before its colours are counted.
 *
 *  Not a performance knob: at 64 a small mark in a large card is mostly EDGE,
 *  and the part-card tones along those edges outnumber any single ink in it —
 *  an eight-colour pinwheel came back as two greys because the blend between
 *  its petals was the most common colour in the image. Sampling finely enough
 *  that the inks outnumber their own edges is what fixes that, and 160 square
 *  is still only 25k pixels to walk. */
export const SAMPLE = 160;

function readCanvas(source: CanvasImageSource): Palette {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return FALLBACK;
  ctx.drawImage(source, 0, 0, SAMPLE, SAMPLE);
  return paletteFromPixels(ctx.getImageData(0, 0, SAMPLE, SAMPLE).data, SAMPLE, SAMPLE);
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
    return readCanvas(image);
  } catch {
    return FALLBACK;
  }
}

export async function paletteFromFile(file: File): Promise<Palette> {
  try {
    const bitmap = await createImageBitmap(file);
    const palette = readCanvas(bitmap);
    bitmap.close();
    return palette;
  } catch {
    // SVGs without intrinsic size, and anything the decoder rejects.
    return FALLBACK;
  }
}
