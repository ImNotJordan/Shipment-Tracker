"use client";

import { useEffect } from "react";
import { APIProvider, Map as GoogleMap, useMap } from "@vis.gl/react-google-maps";
import type { PublicShipment, ScanEvent } from "@/lib/types";

const DARK_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1a2224" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9aa0a3" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#10181a" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#2e333a" }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#3a4248" }] },
  { featureType: "administrative.province", elementType: "geometry.stroke", stylers: [{ color: "#2e333a" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#151c1e" }] },
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

function pinIcon(fill: string, scale: number): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale,
    fillColor: fill,
    fillOpacity: 1,
    strokeColor: "#10181a",
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
  focusEventId,
  onMapReady,
}: {
  shipment: PublicShipment | null;
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
            strokeColor: "#E3B341",
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
        const marker = new google.maps.Marker({
          map: liveMap,
          position: display[index],
          title: pin.title,
          zIndex: focused ? 8 : pin.kind === "scan" ? 6 : 4,
          label: {
            text: pin.label,
            color: "#10181a",
            fontFamily: "Iosevka, ui-monospace, monospace",
            fontWeight: "700",
            fontSize: "11px",
          },
          icon: pinIcon(
            pin.kind === "origin" ? "#eff0f0" : "#E3B341",
            focused ? 12 : pin.kind === "scan" ? 9 : 11,
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
  }, [map, shipment, focusEventId]);

  return null;
}

export function RouteMap({
  shipment,
  apiKey,
  focusEventId,
  onMapReady,
}: {
  shipment: PublicShipment | null;
  apiKey?: string;
  focusEventId?: string | null;
  onMapReady?: (map: google.maps.Map | null) => void;
}) {
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
        styles={DARK_STYLES}
        backgroundColor="#10181a"
        style={{ width: "100%", height: "100%" }}
        keyboardShortcuts={false}
        clickableIcons={false}
        streetViewControl={false}
        fullscreenControl={false}
      >
        <RouteLayer shipment={shipment} focusEventId={focusEventId} onMapReady={onMapReady} />
      </GoogleMap>
    </APIProvider>
  );
}
