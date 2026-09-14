import "server-only";
import { randomUUID } from "node:crypto";
import { formatPlace, geocodeLocation } from "./geocode";
import type { ScanEvent, ShipmentFacts, TrackSnapshot } from "./types";

type TokenCache = { accessToken: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

function fedexBase() {
  return (
    process.env.FEDEX_API_BASE ??
    (process.env.FEDEX_USE_SANDBOX === "false"
      ? "https://apis.fedex.com"
      : "https://apis-sandbox.fedex.com")
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export function fedexConfigured() {
  return Boolean(process.env.FEDEX_CLIENT_ID && process.env.FEDEX_CLIENT_SECRET);
}

async function getAccessToken() {
  if (!fedexConfigured()) {
    throw new Error(
      "FedEx credentials are missing. Set FEDEX_CLIENT_ID and FEDEX_CLIENT_SECRET.",
    );
  }
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.FEDEX_CLIENT_ID!,
    client_secret: process.env.FEDEX_CLIENT_SECRET!,
  });

  const res = await fetch(`${fedexBase()}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok || !asString(json.access_token)) {
    throw new Error(
      asString(json.message) ??
        asString(json.error_description) ??
        `FedEx OAuth failed (${res.status}).`,
    );
  }
  tokenCache = {
    accessToken: String(json.access_token),
    expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000,
  };
  return tokenCache.accessToken;
}

function locationOf(node: Record<string, unknown> | null) {
  const loc =
    asRecord(node?.scanLocation) ??
    asRecord(node?.location) ??
    asRecord(node?.address) ??
    node;
  return {
    city: asString(loc?.city),
    state: asString(loc?.stateOrProvinceCode) ?? asString(loc?.state),
    country: asString(loc?.countryCode) ?? asString(loc?.country),
    postalCode: asString(loc?.postalCode),
  };
}

function formatWeight(pkg: Record<string, unknown> | null) {
  const weight =
    asRecord(asRecord(pkg?.weightAndDimensions)?.weight) ??
    asRecord(pkg?.weight);
  if (!weight) return null;
  const value = weight.value ?? weight.valueNumber;
  const unit = asString(weight.units) ?? asString(weight.unit) ?? "LB";
  return value != null ? `${value} ${unit}` : null;
}

function formatDimensions(pkg: Record<string, unknown> | null) {
  const dims =
    asRecord(asArray(asRecord(pkg?.weightAndDimensions)?.dimensions)[0]) ??
    asRecord(pkg?.dimensions);
  if (!dims) return null;
  const l = dims.length;
  const w = dims.width;
  const h = dims.height;
  if (l == null || w == null || h == null) return null;
  const unit = asString(dims.units) ?? "IN";
  return `${l} x ${w} x ${h} ${unit}`;
}

async function mapTrackResult(
  trackingNumber: string,
  result: Record<string, unknown>,
): Promise<TrackSnapshot> {
  const latest = asRecord(result.latestStatusDetail);
  const loc = locationOf(latest);
  const pkg = asRecord(asArray(result.packageDetails)[0]) ?? asRecord(result.packageDetails);
  const shipper = asRecord(result.shipperInformation);
  const recipient = asRecord(result.recipientInformation);
  const shipperAddress = asRecord(shipper?.address);
  const recipientAddress = asRecord(recipient?.address);
  const originPlace = {
    city: asString(shipperAddress?.city),
    state: asString(shipperAddress?.stateOrProvinceCode),
    country: asString(shipperAddress?.countryCode),
    postalCode: asString(shipperAddress?.postalCode),
  };
  const destinationPlace = {
    city: asString(recipientAddress?.city),
    state: asString(recipientAddress?.stateOrProvinceCode),
    country: asString(recipientAddress?.countryCode),
    postalCode: asString(recipientAddress?.postalCode),
  };
  const originCoords = await geocodeLocation(originPlace);
  const destinationCoords = await geocodeLocation(destinationPlace);
  const service = asRecord(result.serviceDetail);
  const dates = asArray(result.dateAndTimes).map(asRecord);
  const shipDate = dates.find((item) => asString(item?.type) === "SHIP");
  const est = dates.find((item) => asString(item?.type)?.includes("ESTIMATED"));
  const window = asRecord(result.estimatedDeliveryTimeWindow);
  const windowDesc =
    asString(asRecord(window?.window)?.ends) ??
    asString(window?.description);

  const facts: ShipmentFacts = {
    trackingNumber,
    status:
      asString(latest?.description) ??
      asString(latest?.statusByLocale) ??
      asString(latest?.code) ??
      "Unknown",
    statusCode: asString(latest?.code),
    service: asString(service?.description) ?? asString(service?.type),
    weight: formatWeight(pkg),
    dimensions: formatDimensions(pkg),
    pieces:
      pkg?.count != null
        ? String(pkg.count)
        : pkg?.packageCount != null
          ? String(pkg.packageCount)
          : "1",
    shipDate: asString(shipDate?.dateTime) ?? asString(shipDate?.date),
    estDelivery:
      windowDesc ?? asString(est?.dateTime) ?? asString(est?.date),
    origin: formatPlace(originPlace.city, originPlace.state, originPlace.country),
    originLat: originCoords?.lat ?? null,
    originLng: originCoords?.lng ?? null,
    destination: formatPlace(
      destinationPlace.city,
      destinationPlace.state,
      destinationPlace.country,
    ),
    destinationLat: destinationCoords?.lat ?? null,
    destinationLng: destinationCoords?.lng ?? null,
    consignee:
      asString(asRecord(recipient?.contact)?.companyName) ??
      asString(asRecord(recipient?.contact)?.personName),
    specialInstructions: asString(
      asRecord(asArray(result.specialHandlings)[0])?.description,
    ),
  };

  const events: ScanEvent[] = [];
  for (const raw of asArray(result.scanEvents)) {
    const event = asRecord(raw);
    if (!event) continue;
    const place = locationOf(event);
    const coords = await geocodeLocation(place);
    events.push({
      id: randomUUID(),
      at: asString(event.date) ?? asString(event.derivedStatusCode) ?? "",
      description: asString(event.eventDescription) ?? asString(event.eventType) ?? "Scan",
      exception: Boolean(event.exceptionDescription),
      city: place.city,
      state: place.state,
      country: place.country,
      postalCode: place.postalCode,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    });
  }

  events.sort((a, b) => a.at.localeCompare(b.at));

  let current = null;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.lat != null && event.lng != null) {
      current = {
        lat: event.lat,
        lng: event.lng,
        label: formatPlace(event.city, event.state, event.country) ?? facts.status,
      };
      break;
    }
  }

  if (!current && loc.city) {
    const coords = await geocodeLocation(loc);
    if (coords) {
      current = {
        lat: coords.lat,
        lng: coords.lng,
        label: formatPlace(loc.city, loc.state, loc.country) ?? facts.status,
      };
    }
  }

  return {
    fetchedAt: new Date().toISOString(),
    facts,
    events,
    current,
  };
}

export async function trackNumbers(trackingNumbers: string[]) {
  const unique = [...new Set(trackingNumbers.map((n) => n.replace(/\s+/g, "")))].filter(
    Boolean,
  );
  const results = new Map<string, { snapshot?: TrackSnapshot; error?: string }>();
  if (!unique.length) return results;

  const token = await getAccessToken();
  const res = await fetch(`${fedexBase()}/track/v1/trackingnumbers`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-locale": "en_US",
    },
    body: JSON.stringify({
      includeDetailedScans: true,
      trackingInfo: unique.map((trackingNumber) => ({
        trackingNumberInfo: { trackingNumber },
      })),
    }),
    cache: "no-store",
  });

  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      asString(asRecord(asArray(json.errors)[0])?.message) ??
      asString(json.message) ??
      `FedEx Track failed (${res.status}).`;
    for (const number of unique) results.set(number, { error: message });
    return results;
  }

  const complete = asArray(asRecord(json.output)?.completeTrackResults);
  for (const groupRaw of complete) {
    const group = asRecord(groupRaw);
    const number =
      asString(group?.trackingNumber) ??
      asString(asRecord(group)?.trackingNumber);
    const trackResults = asArray(group?.trackResults);
    const first = asRecord(trackResults[0]);
    if (!first) {
      if (number) results.set(number, { error: "FedEx returned no track result." });
      continue;
    }
    const error = asRecord(asArray(first.errors)[0]);
    const tracking =
      asString(asRecord(first.trackingNumberInfo)?.trackingNumber) ?? number ?? "";
    if (error) {
      results.set(tracking, {
        error: asString(error.message) ?? "FedEx could not track this number.",
      });
      continue;
    }
    results.set(tracking, { snapshot: await mapTrackResult(tracking, first) });
  }

  for (const number of unique) {
    if (!results.has(number)) {
      results.set(number, { error: "No FedEx result for this tracking number." });
    }
  }
  return results;
}
