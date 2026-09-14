type LatLng = { lat: number; lng: number };

const HUBS: Record<string, LatLng> = {
  "MEMPHIS,TN": { lat: 35.1495, lng: -90.049 },
  "NASHVILLE,TN": { lat: 36.1627, lng: -86.7816 },
  "ATLANTA,GA": { lat: 33.749, lng: -84.388 },
  "INDIANAPOLIS,IN": { lat: 39.7684, lng: -86.1581 },
  "CHICAGO,IL": { lat: 41.8781, lng: -87.6298 },
  "DALLAS,TX": { lat: 32.7767, lng: -96.797 },
  "HOUSTON,TX": { lat: 29.7604, lng: -95.3698 },
  "LOS ANGELES,CA": { lat: 34.0522, lng: -118.2437 },
  "OAKLAND,CA": { lat: 37.8044, lng: -122.2712 },
  "NEWARK,NJ": { lat: 40.7357, lng: -74.1724 },
  "NEW YORK,NY": { lat: 40.7128, lng: -74.006 },
  "PHILADELPHIA,PA": { lat: 39.9526, lng: -75.1652 },
  "MIAMI,FL": { lat: 25.7617, lng: -80.1918 },
  "PHOENIX,AZ": { lat: 33.4484, lng: -112.074 },
  "DENVER,CO": { lat: 39.7392, lng: -104.9903 },
  "SEATTLE,WA": { lat: 47.6062, lng: -122.3321 },
  "PORTLAND,OR": { lat: 45.5152, lng: -122.6784 },
  "CINCINNATI,OH": { lat: 39.1031, lng: -84.512 },
  "LOUISVILLE,KY": { lat: 38.2527, lng: -85.7585 },
  "KANSAS CITY,MO": { lat: 39.0997, lng: -94.5786 },
  "ST LOUIS,MO": { lat: 38.627, lng: -90.1994 },
  "DETROIT,MI": { lat: 42.3314, lng: -83.0458 },
  "MINNEAPOLIS,MN": { lat: 44.9778, lng: -93.265 },
  "CHARLOTTE,NC": { lat: 35.2271, lng: -80.8431 },
  "ORLANDO,FL": { lat: 28.5383, lng: -81.3792 },
  "BOSTON,MA": { lat: 42.3601, lng: -71.0589 },
  "WASHINGTON,DC": { lat: 38.9072, lng: -77.0369 },
  "BALTIMORE,MD": { lat: 39.2904, lng: -76.6122 },
  "LAS VEGAS,NV": { lat: 36.1699, lng: -115.1398 },
  "SALT LAKE CITY,UT": { lat: 40.7608, lng: -111.891 },
  "ALBUQUERQUE,NM": { lat: 35.0844, lng: -106.6504 },
};

const cache = new Map<string, LatLng | null>();

function keyFor(city?: string | null, state?: string | null) {
  return `${(city ?? "").trim().toUpperCase()},${(state ?? "").trim().toUpperCase()}`;
}

export function formatPlace(
  city?: string | null,
  state?: string | null,
  country?: string | null,
) {
  const parts = [city, state, country === "US" ? null : country].filter(Boolean);
  return parts.join(", ") || null;
}

export async function geocodeLocation(input: {
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
}): Promise<LatLng | null> {
  const hubKey = keyFor(input.city, input.state);
  if (HUBS[hubKey]) return HUBS[hubKey];

  const query = [input.city, input.state, input.postalCode, input.country]
    .filter(Boolean)
    .join(", ");
  if (!query) return null;
  if (cache.has(query)) return cache.get(query) ?? null;

  const apiKey =
    process.env.GOOGLE_MAPS_SERVER_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    cache.set(query, null);
    return null;
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", query);
    url.searchParams.set("key", apiKey);
    const res = await fetch(url, { cache: "no-store" });
    const json = (await res.json()) as {
      status: string;
      results?: { geometry?: { location?: LatLng } }[];
    };
    const loc = json.results?.[0]?.geometry?.location;
    const value = loc ? { lat: loc.lat, lng: loc.lng } : null;
    cache.set(query, value);
    return value;
  } catch {
    cache.set(query, null);
    return null;
  }
}
