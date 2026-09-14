---
version: 1
slug: "app-track-slug-page-tsx"
primary_target: "app/track/[slug]/page.tsx"
related_targets: ["app/admin/page.tsx","app/tracker/page.tsx","app/login/page.tsx"]
---

# Surface: Client tracking board

<!-- impeccable:surface-brief -->

## Scope
Public one-pager `/track/[companySlug]` (first company: Ronin). Admin and Tracker inherit this world.

## Mode
Operate

## Audience
Company clients checking live FedEx status; Admin creating companies; Tracker Team attaching numbers.

## Direction contract

THESIS: A company board is a tiled night console, not a hero-and-cards dashboard. List, map, facts, and history persist; selection changes contents, not layout.

OWN-WORLD: Graphite ground `#1C1F24`, hairline seams `#2E333A`, ivory `#E8E6E1`, syntax amber `#E3B341` for live state only. Compact Fira Sans with Fira Code figures. 1px seams, no drop shadows. Destructive actions isolated.

STORY: A client opening Ronin’s URL knows which shipments exist, where the selected one is, its facts, and its history within one viewport.

FIRST VIEWPORT: Top ident `RONIN | LIVE BOARD | last fetch`. Left: tracking numbers. Center: Google Map with amber course. Right: facts over travel history. Selected row carries an amber pip. No marketing hero.

FORM: Dark-first developer console (challenger `digital-design-canon-dark-first-developer-console`), seed `9bae9be7`. Signature interaction: selecting a number swaps panel contents in place; map trace and facts lock together.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment
Amber course locking onto the map the instant a tracking number is selected.

## Approved comp
`.impeccable/mocks/comp-1-tiles.png` — tiled four-panel console.

## Unresolved
None for composition. Operator must supply FedEx, Google Maps, and login credentials in `.env.local`.
