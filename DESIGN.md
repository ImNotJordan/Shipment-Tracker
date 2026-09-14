---
name: Live Board
description: Night Console — a tiled graphite tracking board, not a hero-and-cards dashboard.
colors:
  ink: "#10181a"
  ink-2: "#0a0c0f"
  seam: "#373e3d"
  ivory: "#eff0f0"
  ivory-dim: "#c0c1c1"
  amber: "#e3b341"
  live: "#3ddc84"
  danger: "#d35a4a"
  row-hover: "#141c1e"
  row-active: "#161f22"
typography:
  display:
    fontFamily: "Iosevka, ui-monospace, monospace"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.04em"
  headline:
    fontFamily: "Iosevka, ui-monospace, monospace"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.18em"
  title:
    fontFamily: "Iosevka, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.22em"
  body:
    fontFamily: "Iosevka, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.02em"
  label:
    fontFamily: "Iosevka, ui-monospace, monospace"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.16em"
rounded:
  none: "0px"
  pip: "50%"
spacing:
  xs: "8px"
  sm: "10px"
  md: "16px"
  lg: "18px"
  xl: "28px"
  ident: "64px"
components:
  button-primary:
    backgroundColor: "{colors.ivory}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "10px 16px"
    typography: "{typography.title}"
  button-primary-hover:
    backgroundColor: "{colors.ivory}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "10px 16px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    rounded: "{rounded.none}"
    padding: "8px 12px"
  button-map-key:
    backgroundColor: "transparent"
    textColor: "{colors.ivory}"
    rounded: "{rounded.none}"
    height: "22px"
    padding: "0 8px"
  input-console:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.ivory}"
    rounded: "{rounded.none}"
    padding: "10px 12px"
  card-ops:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ivory}"
    rounded: "{rounded.none}"
    padding: "18px"
  gate-card:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ivory}"
    rounded: "{rounded.none}"
    padding: "28px"
    width: "min(420px, 100%)"
  ship-row:
    backgroundColor: "transparent"
    textColor: "{colors.ivory}"
    rounded: "{rounded.none}"
    padding: "10px 16px 10px 22px"
  ship-row-hover:
    backgroundColor: "{colors.row-hover}"
    textColor: "{colors.ivory}"
    rounded: "{rounded.none}"
    padding: "10px 16px 10px 22px"
  ship-row-active:
    backgroundColor: "{colors.row-active}"
    textColor: "{colors.ivory}"
    rounded: "{rounded.none}"
    padding: "10px 16px 10px 22px"
  ident-bar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ivory}"
    rounded: "{rounded.none}"
    height: "64px"
    padding: "0 18px"
  flash:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ivory}"
    rounded: "{rounded.none}"
    padding: "10px 12px"
---

# Design System: Live Board

## Overview

**Creative North Star: "The Night Console"**

Live Board is a dark-first operator console for company-scoped FedEx tracking. The public page is a tiled night instrument: ident, shipment list, map, facts, and history occupy one viewport. Selecting a tracking number swaps panel contents in place. It does not restyle the grid, and it does not introduce a marketing hero.

The shipped ground is cooler and darker than the original challenger brief. Graphite night fills the frame; ivory type and 1px oxide seams do the structure; syntax amber is reserved for live state. One face, Iosevka, carries wordmark, data, and labels. Admin, Tracker, and login inherit the same night, with ivory filled primaries for irreversible ops.

**Key Characteristics:**
- Full-viewport tiled console (list / map / facts / history), not stacked cards
- Graphite ground, ivory type, 1px seams, square corners
- Amber only for live/in-transit/selected/focus
- Iosevka throughout; uppercase tracking labels with wide letter-spacing
- Honest empty and error copy — never a fabricated delivery

## Colors

A near-black teal graphite field, cool ivory type, and a single syntax accent used as a live instrument, not as decoration.

### Primary
- **Syntax Amber**: Live and in-transit only. Selected-row pip, current history node, map course and markers, IN TRANSIT legend, caret, text selection, and `:focus-visible` outline. If the shipment is not moving, amber stays off.

### Secondary
- **Signal Green**: Terminal-good. Delivered / OK status (`tone-ok`), the last-fetch live pip, and successful ops flash copy.

### Tertiary
- **Fault Red**: Exceptions, delays, failed fetches, destructive ops (Delete / Remove), and error flash copy. Destructive controls stay ghosted until hover reveals a red seam.

### Neutral
- **Graphite Night**: Page, board, and panel ground. The console is this color, not a card sitting on it.
- **Void Well**: Input, textarea, and select wells — a half-step darker than the ground so fields read as cutouts.
- **Seam Oxide**: Every persistent 1px partition (ident, columns, row rules, form frames, table rows).
- **Console Ivory**: Primary type, wordmark, filled ops primaries, active nav.
- **Dim Ivory**: Panel titles, meta labels, idle nav, empty-state copy, history places.
- **Row Hover / Row Active**: Shipment-row state fills. Hover is a faint lift in the graphite; active is a slightly cooler well, not an amber wash.

### Named Rules
**The Live Amber Rule.** Amber marks live state only: in-transit status, the selected pip, the current history node, the map course, caret, selection, and focus. It is not a brand fill, not a primary button, and not a decorative highlight.

**The Honest Empty Rule.** Missing credentials, queued numbers, and empty history say so in dim ivory. Never paint a delivered package, a fake route, or invented FedEx copy.

## Typography

**Display Font:** Iosevka (with ui-monospace, monospace)
**Body Font:** Iosevka (same)
**Label/Mono Font:** Iosevka (same)

**Character:** One monospaced instrument face. Weight and tracking do the hierarchy; a second family never enters.

### Hierarchy
- **Display** (700, 18px, line-height 1, 0.04em): Ident wordmark. Company name or `LIVE BOARD`, always uppercase.
- **Headline** (700, 16px, 0.18em): Ops and gate section titles (`Create company`, `Admin / Tracker`, `Board not found`).
- **Title** (700, 11px, 0.22em, uppercase): Ident meta (`LIVE BOARD`, `LAST FETCH`), panel titles (`SHIPMENTS`, `LIVE ROUTE TRACKING`, `SHIPMENT FACTS`, `TRAVEL HISTORY`), ops field labels, map footer.
- **Body** (400, 13px, 1.5, 0.02em): Page default, empty-state paragraphs, gate supporting copy.
- **Label** (400, 10px, 0.16em, uppercase): Fact terms, shipment lane/status, compact meta. Fact values sit at 11px / 700, right-aligned. Tracking numbers sit at 14px / 700 / 0.12em.

### Named Rules
**The One Face Rule.** Iosevka is the only type family. Do not pair it with a humanist sans, a serif display, or system UI for chrome.

**The Tracking Label Rule.** Console chrome and field labels are uppercase with wide tracking (0.16em–0.22em). Sentence-case is for honest empty/error paragraphs only.

## Layout

The client board is a two-row, three-column instrument that fills `100dvh`. Row one is the 64px ident. Row two is `minmax(240px, 22%)` shipments | fluid map | `minmax(280px, 24%)` detail. Detail splits 1fr / 1fr into facts over history. Selection changes data inside those tiles; it does not change the grid.

Horizontal rhythm is 16px inside panels, 18px in the ident, 10px on dense rows and tools. Admin and Tracker are the same night instrument as the client board: 64px ident, then a persistent three-tile grid (command dock | list | detail). Login/index/not-found still center a 1px-seamed card (`min(420px, 100%)`) in the remaining viewport.

Below 980px the board stacks: ident, shipment list (max 42vh), map at 55vh, then facts/history. Column seams become a top seam. Ops keep the same padded stack.

### Named Rules
**The Tile Persistence Rule.** List, map, facts, and history persist. Selection swaps contents in place; it never restacks the console into a hero, a single card, or a wizard.

## Elevation & Depth

Surfaces are flat. Depth is a 1px oxide seam and a half-step tonal well (void inputs, active rows). There is no drop-shadow vocabulary, no blur, and no lifted card.

Focus is a 1px amber outline with 2px offset. The last-fetch pip is a 7px signal-green disc; the selected shipment is a 6px amber disc inset on the row. History nodes are 11px circles with a 1px dim ring, filling amber only for the current event. The map course is a 3px amber geodesic with graphite-stroked circular markers.

### Named Rules
**The Seam Rule.** Partition with 1px `{colors.seam}`. Do not lift panels with shadows, glass, or gradients.

## Shapes

Everything structural is square (`0px` radius): board, ident, forms, inputs, tables, buttons, flashes, map keys. Roundness is reserved for status geometry — pips, history nodes, and map course markers. The IN TRANSIT legend is an 18×2px amber bar, not a pill.

## Components

Square, seamed, and quiet at rest. Color is status, not chrome.

### Buttons
- **Shape:** Square (0px). No fill on the board except the ivory ops primary.
- **Primary:** Ivory fill on graphite night, 1px ivory edge, 10px 16px, 700, 0.08em tracking. Used to sign in, create a board, and add tracking numbers. Hover brightens (`filter: brightness(1.05)`). Disabled drops to 50% opacity.
- **Danger:** Ghost. Fault-red type, transparent fill and seam. Hover/focus draws a 1px fault-red edge. Isolated from the primary; never adjacent as a matching filled pair.
- **Map key:** Transparent fill, 1px seam, ivory type, 22px tall. Hover/focus turns the seam ivory. Used for − / + / RESET only.
- **Text tools:** SORT, FILTER, ops nav, Sign out — no border, dim ivory idle, ivory on hover.
- **Focus:** 1px amber outline, 2px offset, on every operate control.

### Cards / Containers
- **Corner Style:** Square.
- **Background:** Graphite night. Cards are frames, not lifted sheets.
- **Shadow Strategy:** None. Seams only.
- **Border:** 1px seam on ops forms, ops lists, gate cards, and flashes.
- **Internal Padding:** 18px on ops frames; 28px on the gate card; 14px 16px 10px on facts/history.

### Inputs / Fields
- **Style:** Void-well fill, ivory type, 1px seam, square, 10px 12px padding. Caret is amber. Labels sit above as 11px uppercase dim ivory.
- **Filter well:** On the board, the filter is an underline only (bottom seam), 96px wide — not a boxed field.
- **Focus:** Amber 1px outline, 2px offset.
- **Error:** Flash row above the form in fault red, seamed, not an inner glow.

### Navigation
- **Ident:** 64px, 1px bottom seam, space-between. Wordmark + pipe + `LIVE BOARD` (or `ADMIN` / `TRACKER` on ops) on the left; last-fetch (or UTC clock) plus green pip on the right. Ops nav is dim ivory text; the current station is ivory.
- **Default / hover:** Dim ivory links; ivory on hover. No filled nav chips.
- **Mobile:** Ident stays 64px; last-fetch may wrap to 11px / 42vw.

### Shipment row
Full-width list button. Top seam, 10px 16px 10px 22px. Tracking number, origin→destination lane (or `Awaiting FedEx scan data`), and status. Live status is amber; delivered is signal green; exception is fault red; queued/empty is dim. Active row wells to row-active and shows a 6px amber pip at left. Hover wells to row-hover.

### History node
12px gutter + copy. A 1px seam runs as a timeline. Past nodes are hollow dim rings on graphite; the current node fills amber. Copy is 11px; place names are dim. Empty: `Travel history appears after FedEx returns scan events.` (or the real `lastError`).

### Map course
Google Map, night-styled, default UI off, background graphite. Course polyline and markers are syntax amber. Missing key: centered dim copy `Google Maps key missing. Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.` No invented route.

## Do's and Don'ts

### Do:
- **Do** keep the four tiles (list, map, facts, history) on the public board and change contents on selection.
- **Do** use syntax amber only for live/in-transit/selected/focus/caret/selection.
- **Do** set ops and gate primaries in console ivory on graphite night.
- **Do** partition with 1px seam oxide; keep corners at 0px.
- **Do** write empty, queued, missing-key, and error states in dim ivory as facts (`AWAITING FEDEX`, `QUEUED`, `Board not found`).
- **Do** set `:focus-visible` to a 1px amber outline with 2px offset.

### Don't:
- **Don't** introduce a marketing hero, testimonial, or carrier-branded banner on any surface.
- **Don't** invent FedEx statuses, ETAs, routes, or delivered packages when the API has not returned them.
- **Don't** fill primary actions in amber or green — those colors are status, not buttons.
- **Don't** add drop shadows, large radius, or a second type family.
- **Don't** restyle Admin / Tracker / login into a light dashboard; they inherit the Night Console.
