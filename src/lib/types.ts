import type { BoardGround } from "./logo-palette";

/** The board every install is seeded with. It cannot be deleted, so it is
 *  the one slug the app may refer to by name. */
export const SEED_SLUG = "ronin";

/** What a board logo may be, and the extension each type is stored under.
 *
 *  One list, read by the file picker, by the line that tells an admin what
 *  is allowed, and by the route that refuses everything else — so the three
 *  cannot drift into disagreeing about it. */
export const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "image/gif": "gif",
};

export const LOGO_ACCEPT = Object.keys(LOGO_TYPES).join(",");

/** Storage would take more; this is about what every client downloads on
 *  every board load, for a mark drawn at 56px. */
export const LOGO_MAX_BYTES = 5_000_000;

export const LOGO_HINT = "PNG, JPG, SVG, AVIF or GIF · up to 5 MB";

export type Role = "admin" | "tracker" | "client";

export type UserRecord = {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyId: string | null;
  companySlug: string | null;
  phone: string | null;
  disabled: boolean;
  createdAt: string;
  invitedBy: string | null;
  mustChangePassword: boolean;
};

export type CompanyRecord = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  accent: string;
  background: string;
  /** Ground measured from the logo: where its real colours actually sit.
   *  Null keeps the board the flat `background` colour. */
  ground: BoardGround | null;
  logoUrl: string | null;
  notifyEnabled: boolean;
  notifyCc: string[];
  notifyCcPhones: string[];
};

export type ScanEvent = {
  id: string;
  at: string;
  description: string;
  exception: boolean;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
};

export type ShipmentFacts = {
  trackingNumber: string;
  status: string;
  statusCode: string | null;
  service: string | null;
  weight: string | null;
  dimensions: string | null;
  pieces: string | null;
  shipDate: string | null;
  estDelivery: string | null;
    origin: string | null;
    originLat: number | null;
    originLng: number | null;
    destination: string | null;
    destinationLat: number | null;
    destinationLng: number | null;
    consignee: string | null;
  specialInstructions: string | null;
};

export type TrackSnapshot = {
  fetchedAt: string;
  facts: ShipmentFacts;
  events: ScanEvent[];
  current: { lat: number; lng: number; label: string } | null;
};

export type ShipmentRecord = {
  id: string;
  companyId: string;
  trackingNumber: string;
  createdAt: string;
  lastFetchedAt: string | null;
  lastError: string | null;
  snapshot: TrackSnapshot | null;
  lastNotifiedFingerprint: string | null;
};

export type AuditRecord = {
  id: string;
  at: string;
  actorId: string;
  actorEmail: string;
  action: "create" | "update" | "delete" | "refresh";
  companyId: string;
  shipmentId: string | null;
  trackingNumber: string | null;
  detail: string;
};

export type PublicShipment = {
  id: string;
  trackingNumber: string;
  lastFetchedAt: string | null;
  lastError: string | null;
  snapshot: TrackSnapshot | null;
};

export type PublicBoard = {
  company: {
    name: string;
    slug: string;
    accent: string;
    background: string;
    ground: BoardGround | null;
    logoUrl: string | null;
  };
  shipments: PublicShipment[];
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyId: string | null;
  companySlug: string | null;
  mustChangePassword: boolean;
};

export const DEFAULT_ACCENT = "#e3b341";
export const DEFAULT_BACKGROUND = "#10181a";
