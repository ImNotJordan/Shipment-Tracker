"use client";

import { useEffect } from "react";
import { APIProvider, Map as GoogleMap, useMap } from "@vis.gl/react-google-maps";
import { MAP_LAND, type MapPalette } from "@/lib/logo-palette";
import { useTheme } from "./ThemeToggle";
import type { PublicShipment, ScanEvent } from "@/lib/types";

/* The base geometry, the landscape over it and the map div behind both are ONE
   colour on purpose. Google serves this map as raster tiles, and the fills on a
   tile stop a hair short of its edge; anywhere those three disagree, the layer
   underneath shows through the join as a grid of pale lines across the map.
   It is also what every overlay's contrast is measured against, so it is
   defined beside that maths rather than here. */
const NIGHT_LAND = MAP_LAND.night;

const NIGHT_TILES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: NIGHT_LAND }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9aa0a3" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#10181a" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#2e333a" }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#3a4248" }] },
  { featureType: "administrative.province", elementType: "geometry.stroke", stylers: [{ color: "#2e333a" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: NIGHT_LAND }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#222b2e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#2c3538" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2a3438" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#1e2629" }] },
  { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#1a2224" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0c1214" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3a4248" }] },
];

/* The same list in daylight, entry for entry, so the two stay comparable when
   either is tuned. */
const DAY_LAND = MAP_LAND.day;

const DAY_TILES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: DAY_LAND }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#586160" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#c3caca" }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#a9b2b2" }] },
  { featureType: "administrative.province", elementType: "geometry.stroke", stylers: [{ color: "#c3caca" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: DAY_LAND }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#dfe3e3" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#fbfcfc" }] },
  { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#d4e2e8" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#7d919a" }] },
];

/** The map itself. What is drawn ON it comes from the board's own colours, via
 *  MapPalette — which is why it is a separate thing: the tiles belong to the
 *  theme, the journey belongs to the company. */
type MapSkin = {
  tiles: google.maps.MapTypeStyle[];
  land: string;
};

const NIGHT: MapSkin = { tiles: NIGHT_TILES, land: NIGHT_LAND };
const DAY: MapSkin = { tiles: DAY_TILES, land: DAY_LAND };

type LatLng = { lat: number; lng: number };
type MapPin = {
  id: string;
  position: LatLng;
  kind: "origin" | "scan" | "destination";
  label: string;
  title: string;
  body: string;
};
type RoutedPath = { line: LatLng[]; snapped: LatLng[] };

const geoCache = new globalThis.Map<string, LatLng | null>();
const routeCache = new globalThis.Map<string, RoutedPath>();
const MAX_ROUTE_POINTS = 25;

function samePoint(a: LatLng, b: LatLng) {
  return Math.abs(a.lat - b.lat) < 0.0008 && Math.abs(a.lng - b.lng) < 0.0008;
}

function pathKey(points: LatLng[]) {
  return points.map((point) => `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`).join("|");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (ch) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[ch] ?? ch;
  });
}

async function geocodeAddress(address: string): Promise<LatLng | null> {
  const key = address.trim().toLowerCase();
  if (!key) return null;
  if (geoCache.has(key)) return geoCache.get(key) ?? null;
  try {
    const geocoder = new google.maps.Geocoder();
    const { results } = await geocoder.geocode({ address });
    const loc = results[0]?.geometry?.location;
    const value = loc ? { lat: loc.lat(), lng: loc.lng() } : null;
    geoCache.set(key, value);
    return value;
  } catch {
    geoCache.set(key, null);
    return null;
  }
}

function storedPoint(lat?: number | null, lng?: number | null): LatLng | null {
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

function scanQuery(event: ScanEvent) {
  return [event.city, event.state, event.postalCode, event.country].filter(Boolean).join(", ");
}

function offsetOverlaps(pins: MapPin[]): LatLng[] {
  return pins.map((pin, index) => {
    const stacked = pins
      .slice(0, index)
      .filter((other) => samePoint(other.position, pin.position)).length;
    if (!stacked) return pin.position;
    const angle = stacked * ((2 * Math.PI) / 6);
    const meters = 70 * stacked;
    const lat = pin.position.lat + (meters / 111_320) * Math.cos(angle);
    const lng =
      pin.position.lng +
      (meters / (111_320 * Math.cos((pin.position.lat * Math.PI) / 180))) * Math.sin(angle);
    return { lat, lng };
  });
}

function pinIcon(fill: string, scale: number, stroke: string): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale,
    fillColor: fill,
    fillOpacity: 1,
    strokeColor: stroke,
    strokeWeight: 2,
  };
}

function latLngOf(value: google.maps.LatLng | google.maps.LatLngLiteral): LatLng {
  if (typeof (value as google.maps.LatLng).lat === "function") {
    const point = value as google.maps.LatLng;
    return { lat: point.lat(), lng: point.lng() };
  }
  const literal = value as google.maps.LatLngLiteral;
  return { lat: literal.lat, lng: literal.lng };
}

async function routeChunk(points: LatLng[]) {
  const service = new google.maps.DirectionsService();
  const origin = points[0];
  const destination = points[points.length - 1];
  const waypoints = points.slice(1, -1).map((location) => ({
    location,
    stopover: true as const,
  }));
  const result = await service.route({
    origin,
    destination,
    waypoints,
    travelMode: google.maps.TravelMode.DRIVING,
    optimizeWaypoints: false,
  });
  return result.routes[0] ?? null;
}

async function routeAlongRoads(points: LatLng[]): Promise<RoutedPath> {
  if (points.length < 2) return { line: points, snapped: points };
  const cached = routeCache.get(pathKey(points));
  if (cached) return cached;
  if (google.maps.importLibrary) {
    await google.maps.importLibrary("routes").catch(async () => {
      await google.maps.importLibrary("maps");
    });
  }

  const line: LatLng[] = [];
  const snapped: LatLng[] = [points[0]];
  let index = 0;

  while (index < points.length - 1) {
    const take = Math.min(MAX_ROUTE_POINTS, points.length - index);
    const chunk = points.slice(index, index + take);
    try {
      const route = await routeChunk(chunk);
      if (!route?.legs.length) throw new Error("No driving route");
      if (index === 0) snapped[0] = latLngOf(route.legs[0].start_location);
      for (const leg of route.legs) {
        for (const step of leg.steps) {
          for (const point of step.path) line.push(latLngOf(point));
        }
        snapped.push(latLngOf(leg.end_location));
      }
    } catch {
      for (let step = 1; step < chunk.length; step += 1) {
        line.push(chunk[step - 1], chunk[step]);
        if (snapped.length < index + step + 1) snapped.push(chunk[step]);
      }
    }
    index += take - 1;
  }

  const routed = { line, snapped };
  routeCache.set(pathKey(points), routed);
  return routed;
}

function RouteLayer({
  shipment,
  pins: ink,
  focusEventId,
  onMapReady,
}: {
  shipment: PublicShipment | null;
  pins: MapPalette;
  focusEventId?: string | null;
  onMapReady?: (map: google.maps.Map | null) => void;
}) {
  const map = useMap();

  useEffect(() => {
    onMapReady?.(map);
  }, [map, onMapReady]);

  useEffect(() => {
    if (!map) return;
    const liveMap = map;
    let cancelled = false;
    const overlays: Array<google.maps.Polyline | google.maps.Marker> = [];
    const info = new google.maps.InfoWindow();
    const listeners: google.maps.MapsEventListener[] = [];

    async function resolvePins(): Promise<MapPin[]> {
      const facts = shipment?.snapshot?.facts;
      const events = shipment?.snapshot?.events ?? [];
      const pins: MapPin[] = [];

      const origin =
        storedPoint(facts?.originLat, facts?.originLng) ??
        (facts?.origin ? await geocodeAddress(facts.origin) : null);
      if (origin) {
        pins.push({
          id: "origin",
          position: origin,
          kind: "origin",
          label: "O",
          title: `Origin · ${facts?.origin ?? "Unknown"}`,
          body: facts?.origin ?? "Origin",
        });
      }

      let lastKnown = origin;
      for (const [index, event] of events.entries()) {
        const position =
          storedPoint(event.lat, event.lng) ??
          (scanQuery(event) ? await geocodeAddress(scanQuery(event)) : null) ??
          lastKnown;
        if (position) lastKnown = position;
        if (!position) continue;
        const place = [event.city, event.state].filter(Boolean).join(", ") || "Location pending";
        pins.push({
          id: event.id,
          position,
          kind: "scan",
          label: index < 9 ? String(index + 1) : "•",
          title: event.description,
          body: `${event.description}\n${place}`,
        });
      }

      const destination =
        storedPoint(facts?.destinationLat, facts?.destinationLng) ??
        (facts?.destination ? await geocodeAddress(facts.destination) : null);
      if (destination) {
        pins.push({
          id: "destination",
          position: destination,
          kind: "destination",
          label: "D",
          title: `Destination · ${facts?.destination ?? "Unknown"}`,
          body: facts?.destination ?? "Destination",
        });
      }

      return pins;
    }

    async function draw() {
      const pins = await resolvePins();
      if (cancelled) return;

      const stops: LatLng[] = [];
      const pinStop: number[] = [];
      for (const pin of pins) {
        const last = stops[stops.length - 1];
        if (!last || !samePoint(last, pin.position)) stops.push(pin.position);
        pinStop.push(stops.length - 1);
      }

      const routed = stops.length > 1 ? await routeAlongRoads(stops) : { line: stops, snapped: stops };
      if (cancelled) return;

      if (routed.line.length) {
        overlays.push(
          new google.maps.Polyline({
            map: liveMap,
            path: routed.line,
            strokeColor: ink.route,
            strokeOpacity: 1,
            strokeWeight: 4,
            geodesic: false,
            zIndex: 1,
          }),
        );
      }

      const placed = pins.map((pin, index) => ({
        ...pin,
        position: routed.snapped[pinStop[index]] ?? pin.position,
      }));
      const display = offsetOverlaps(placed);

      for (const [index, pin] of pins.entries()) {
        const focused = Boolean(focusEventId && pin.id === focusEventId);
        const stop =
          pin.kind === "origin" ? ink.origin : pin.kind === "destination" ? ink.dest : ink.history;
        const marker = new google.maps.Marker({
          map: liveMap,
          position: display[index],
          title: pin.title,
          zIndex: focused ? 8 : pin.kind === "scan" ? 6 : 4,
          label: {
            text: pin.label,
            color: stop.ink,
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontWeight: "700",
            fontSize: "11px",
          },
          icon: pinIcon(
            stop.fill,
            focused ? 12 : pin.kind === "scan" ? 9 : 11,
            stop.ink,
          ),
        });
        listeners.push(
          marker.addListener("click", () => {
            info.setContent(
              `<div class="map-bubble"><strong>${escapeHtml(pin.title)}</strong><span>${escapeHtml(pin.body)}</span></div>`,
            );
            info.open({ map: liveMap, anchor: marker });
          }),
        );
        overlays.push(marker);
        if (focused) {
          info.setContent(
            `<div class="map-bubble"><strong>${escapeHtml(pin.title)}</strong><span>${escapeHtml(pin.body)}</span></div>`,
          );
          info.open({ map: liveMap, anchor: marker });
          const position = marker.getPosition();
          if (position) liveMap.panTo(position);
        }
      }

      if (focusEventId) return;

      const fit = routed.line.length ? routed.line : stops;
      if (fit.length === 1) {
        liveMap.setCenter(fit[0]);
        liveMap.setZoom(6);
      } else if (fit.length) {
        const bounds = new google.maps.LatLngBounds();
        fit.forEach((point) => bounds.extend(point));
        liveMap.fitBounds(bounds, 64);
      } else {
        liveMap.setCenter({ lat: 39.8, lng: -98.5 });
        liveMap.setZoom(4);
      }
    }

    void draw();

    return () => {
      cancelled = true;
      info.close();
      listeners.forEach((item) => item.remove());
      overlays.forEach((item) => item.setMap(null));
    };
  }, [map, shipment, ink, focusEventId]);

  return null;
}

export function RouteMap({
  shipment,
  pins,
  apiKey,
  focusEventId,
  onMapReady,
}: {
  shipment: PublicShipment | null;
  /** The board's colours, rebuilt for the map. */
  pins: MapPalette;
  apiKey?: string;
  focusEventId?: string | null;
  onMapReady?: (map: google.maps.Map | null) => void;
}) {
  const skin = useTheme() === "light" ? DAY : NIGHT;

  if (!apiKey) {
    return (
      <div className="map-missing">
        Google Maps key missing. Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey} libraries={["routes"]}>
      <GoogleMap
        defaultCenter={{ lat: 39.8, lng: -98.5 }}
        defaultZoom={4}
        gestureHandling="greedy"
        disableDefaultUI
        styles={skin.tiles}
        // ponytail: backgroundColor is a create-only Maps option, so toggling
        // mid-session leaves this one stale until the map remounts. It shows
        // only in the moment before tiles paint. Upgrade path is keying the
        // map on the theme, which costs the viewer their pan and zoom.
        backgroundColor={skin.land}
        style={{ width: "100%", height: "100%" }}
        keyboardShortcuts={false}
        clickableIcons={false}
        streetViewControl={false}
        fullscreenControl={false}
      >
        <RouteLayer
          shipment={shipment}
          pins={pins}
          focusEventId={focusEventId}
          onMapReady={onMapReady}
        />
      </GoogleMap>
    </APIProvider>
  );
}
