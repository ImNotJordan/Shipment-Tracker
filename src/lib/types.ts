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
  logoUrl: string | null;
  notifyEnabled: boolean;
  notifyCc: string[];
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
