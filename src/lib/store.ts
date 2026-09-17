import "server-only";
import { randomUUID } from "node:crypto";
import { bootstrapCredentials, getBootstrapTokens, retiredSeedEmails } from "./firebase-bootstrap";
import { deleteAuthUser } from "./firebase-admin-auth";
import {
  deleteDocument,
  getDocument,
  listDocuments,
  patchDocument,
  putDocument,
  queryByField,
} from "./firestore";
import {
  DEFAULT_ACCENT,
  DEFAULT_BACKGROUND,
  type AuditRecord,
  type CompanyRecord,
  type Role,
  type SessionUser,
  type ShipmentRecord,
  type TrackSnapshot,
  type UserRecord,
} from "./types";
import { isRole } from "./access";
import { parseEmailList } from "./emails";
import { parsePhoneList } from "./phones";

let seedDone = false;
let seedLock: Promise<void> | null = null;

function slugify(name: string) {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "company";
}

function asCompany(id: string, data: Record<string, unknown>): CompanyRecord {
  return {
    id: String(data.id ?? id),
    name: String(data.name ?? ""),
    slug: String(data.slug ?? ""),
    createdAt: String(data.createdAt ?? ""),
    accent: String(data.accent ?? DEFAULT_ACCENT),
    background: String(data.background ?? DEFAULT_BACKGROUND),
    logoUrl: (data.logoUrl as string | null) ?? null,
    notifyEnabled: data.notifyEnabled !== false,
    notifyCc: parseEmailList(data.notifyCc),
    notifyCcPhones: parsePhoneList(data.notifyCcPhones).phones,
  };
}

function asShipment(id: string, data: Record<string, unknown>): ShipmentRecord {
  return {
    id: String(data.id ?? id),
    companyId: String(data.companyId ?? ""),
    trackingNumber: String(data.trackingNumber ?? ""),
    createdAt: String(data.createdAt ?? ""),
    lastFetchedAt: (data.lastFetchedAt as string | null) ?? null,
    lastError: (data.lastError as string | null) ?? null,
    snapshot: (data.snapshot as TrackSnapshot | null) ?? null,
    lastNotifiedFingerprint: (data.lastNotifiedFingerprint as string | null) ?? null,
  };
}

function asUser(id: string, data: Record<string, unknown>): UserRecord | null {
  if (!isRole(data.role)) return null;
  return {
    id,
    email: String(data.email ?? "").toLowerCase(),
    name: String(data.name ?? ""),
    role: data.role,
    companyId: data.companyId ? String(data.companyId) : null,
    companySlug: data.companySlug ? String(data.companySlug) : null,
    phone: data.phone ? String(data.phone) : null,
    disabled: Boolean(data.disabled),
    createdAt: String(data.createdAt ?? ""),
    invitedBy: data.invitedBy ? String(data.invitedBy) : null,
    mustChangePassword: Boolean(data.mustChangePassword),
  };
}

function asAudit(id: string, data: Record<string, unknown>): AuditRecord {
  const action = data.action;
  return {
    id,
    at: String(data.at ?? ""),
    actorId: String(data.actorId ?? ""),
    actorEmail: String(data.actorEmail ?? ""),
    action:
      action === "create" || action === "update" || action === "delete" || action === "refresh"
        ? action
        : "update",
    companyId: String(data.companyId ?? ""),
    shipmentId: data.shipmentId ? String(data.shipmentId) : null,
    trackingNumber: data.trackingNumber ? String(data.trackingNumber) : null,
    detail: String(data.detail ?? ""),
  };
}

function shipmentsCol(companyId: string) {
  return `companies/${companyId}/shipments`;
}

function auditsCol(companyId: string) {
  return `companies/${companyId}/audits`;
}

export async function bootstrapToken() {
  return (await getBootstrapTokens()).idToken;
}

export async function writeUserDoc(
  uid: string,
  data: Record<string, unknown>,
  token: string,
) {
  await putDocument("users", uid, data, token);
}

export async function ensureSeeded() {
  if (seedDone) return;
  if (!seedLock) {
    seedLock = seedNow()
      .then(() => {
        seedDone = true;
      })
      .finally(() => {
        seedLock = null;
      });
  }
  await seedLock;
}

async function retireSeedAccounts(token: string) {
  const bootstrap = bootstrapCredentials().email;
  const retired = new Set(retiredSeedEmails(bootstrap));
  const rows = await listDocuments("users", token);
  for (const row of rows) {
    const email = String(row.data.email ?? "").toLowerCase();
    if (!retired.has(email)) continue;
    try {
      await deleteAuthUser(row.id);
    } catch {
      // Auth may already be gone.
    }
    await deleteDocument("users", row.id, token);
  }
}

async function collapseDuplicateEmails(token: string) {
  const rows = await listDocuments("users", token);
  const byEmail = new Map<string, typeof rows>();
  for (const row of rows) {
    const email = String(row.data.email ?? "").toLowerCase();
    if (!email) continue;
    const group = byEmail.get(email) ?? [];
    group.push(row);
    byEmail.set(email, group);
  }
  for (const group of byEmail.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) =>
      String(b.data.createdAt ?? "").localeCompare(String(a.data.createdAt ?? "")),
    );
    for (const extra of group.slice(1)) {
      try {
        await deleteAuthUser(extra.id);
      } catch {
        // Orphan profile only.
      }
      await deleteDocument("users", extra.id, token);
    }
  }
}

async function seedNow() {
  const admin = await getBootstrapTokens();
  const token = admin.idToken;
  const kind = bootstrapCredentials().kind;
  await writeUserDoc(
    admin.localId,
    {
      email: admin.email,
      name: kind === "platform" ? "Guilmar Quimba" : "Platform Admin",
      role: "admin",
      companyId: null,
      companySlug: null,
      disabled: false,
      createdAt: new Date().toISOString(),
      invitedBy: null,
      mustChangePassword: false,
      phone: null,
    },
    token,
  );

  await retireSeedAccounts(token);

  let ronin = (await queryByField("companies", "slug", "ronin", token))[0];
  if (!ronin) {
    const id = randomUUID();
    const company = {
      id,
      name: "Ronin",
      slug: "ronin",
      createdAt: new Date().toISOString(),
      accent: DEFAULT_ACCENT,
      background: DEFAULT_BACKGROUND,
      logoUrl: null,
      notifyEnabled: true,
      notifyCc: [],
      notifyCcPhones: [],
    };
    await putDocument("companies", id, company, token);
    ronin = { id, data: company };
  }

  const legacy = await listDocuments("shipments", token);
  for (const row of legacy) {
    const companyId = String(row.data.companyId ?? ronin.id);
    await putDocument(shipmentsCol(companyId), row.id, { ...row.data, id: row.id, companyId }, token);
    await deleteDocument("shipments", row.id, token);
  }
}

async function quietSeed() {
  try {
    await ensureSeeded();
  } catch {
    // Tenant reads still work once profiles and rules are in place.
  }
}

export async function getUserRecord(uid: string, token: string) {
  const doc = await getDocument("users", uid, token);
  if (!doc) return null;
  return asUser(doc.id, doc.data);
}

export async function listUsers(token: string) {
  await quietSeed();
  try {
    await retireSeedAccounts(token);
    await collapseDuplicateEmails(token);
  } catch {
    // Directory still loads if Auth cleanup fails this pass.
  }
  const rows = await listDocuments("users", token);
  return rows
    .map((row) => asUser(row.id, row.data))
    .filter((row): row is UserRecord => Boolean(row))
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function updateUserRecord(
  uid: string,
  patch: Partial<Omit<UserRecord, "id" | "email" | "createdAt">>,
  token: string,
) {
  const current = await getUserRecord(uid, token);
  if (!current) throw new Error("User not found.");
  const next: UserRecord = { ...current, id: uid, email: current.email };
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.role !== undefined) next.role = patch.role;
  if (patch.companyId !== undefined) next.companyId = patch.companyId;
  if (patch.companySlug !== undefined) next.companySlug = patch.companySlug;
  if (patch.disabled !== undefined) next.disabled = patch.disabled;
  if (patch.invitedBy !== undefined) next.invitedBy = patch.invitedBy;
  if (patch.phone !== undefined) next.phone = patch.phone;
  if (patch.mustChangePassword !== undefined) {
    next.mustChangePassword = patch.mustChangePassword;
  }
  await patchDocument(
    "users",
    uid,
    {
      name: next.name,
      role: next.role,
      companyId: next.companyId,
      companySlug: next.companySlug,
      phone: next.phone,
      disabled: next.disabled,
      invitedBy: next.invitedBy,
      mustChangePassword: next.mustChangePassword,
    },
    token,
  );
  return next;
}

export async function deleteUserRecord(uid: string, token: string) {
  const current = await getUserRecord(uid, token);
  if (!current) return null;
  await deleteDocument("users", uid, token);
  return current;
}

export async function listCompanies(token: string) {
  await quietSeed();
  const rows = await listDocuments("companies", token);
  return rows
    .map((row) => asCompany(row.id, row.data))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCompanyById(id: string, token: string) {
  const doc = await getDocument("companies", id, token);
  return doc ? asCompany(doc.id, doc.data) : null;
}

export async function getCompanyBySlug(slug: string, token: string) {
  await quietSeed();
  const rows = await queryByField("companies", "slug", slug, token);
  const row = rows[0];
  return row ? asCompany(row.id, row.data) : null;
}

export async function visibleCompanies(user: SessionUser, token: string) {
  if (user.role === "admin") return listCompanies(token);
  if (!user.companyId) return [];
  const company = await getCompanyById(user.companyId, token);
  return company ? [company] : [];
}

export async function companyForSlug(user: SessionUser, slug: string, token: string) {
  if (user.role === "admin") return getCompanyBySlug(slug, token);
  if (!user.companyId) return null;
  const company = await getCompanyById(user.companyId, token);
  if (!company || company.slug !== slug) return null;
  return company;
}

export async function createCompany(name: string, token: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Company name is required.");
  await ensureSeeded();
  const companies = await listCompanies(token);
  let slug = slugify(trimmed);
  const taken = new Set(companies.map((company) => company.slug));
  if (taken.has(slug)) {
    let i = 2;
    while (taken.has(`${slug}-${i}`)) i += 1;
    slug = `${slug}-${i}`;
  }
  const company: CompanyRecord = {
    id: randomUUID(),
    name: trimmed,
    slug,
    createdAt: new Date().toISOString(),
    accent: DEFAULT_ACCENT,
    background: DEFAULT_BACKGROUND,
    logoUrl: null,
    notifyEnabled: true,
    notifyCc: [],
    notifyCcPhones: [],
  };
  await putDocument("companies", company.id, { ...company }, token);
  return company;
}

export async function updateCompany(
  id: string,
  patch: Partial<
    Pick<
      CompanyRecord,
      "name" | "accent" | "background" | "logoUrl" | "notifyEnabled" | "notifyCc" | "notifyCcPhones"
    >
  >,
  token: string,
) {
  const current = await getCompanyById(id, token);
  if (!current) throw new Error("Company not found.");
  const next = { ...current };
  if (patch.name !== undefined) {
    next.name = patch.name.trim();
    if (!next.name) throw new Error("Company name is required.");
  }
  if (patch.accent !== undefined) next.accent = patch.accent;
  if (patch.background !== undefined) next.background = patch.background;
  if (patch.logoUrl !== undefined) next.logoUrl = patch.logoUrl;
  if (patch.notifyEnabled !== undefined) next.notifyEnabled = patch.notifyEnabled;
  if (patch.notifyCc !== undefined) next.notifyCc = parseEmailList(patch.notifyCc);
  if (patch.notifyCcPhones !== undefined) {
    const parsed = parsePhoneList(patch.notifyCcPhones);
    if (parsed.invalid.length) {
      throw new Error(
        `Invalid CC phone: ${parsed.invalid[0]}. Use a full number with country code, like +12095551212.`,
      );
    }
    next.notifyCcPhones = parsed.phones;
  }
  const fields: Record<string, unknown> = {};
  if (patch.name !== undefined) fields.name = next.name;
  if (patch.accent !== undefined) fields.accent = next.accent;
  if (patch.background !== undefined) fields.background = next.background;
  if (patch.logoUrl !== undefined) fields.logoUrl = next.logoUrl;
  if (patch.notifyEnabled !== undefined) fields.notifyEnabled = next.notifyEnabled;
  if (patch.notifyCc !== undefined) fields.notifyCc = next.notifyCc;
  if (patch.notifyCcPhones !== undefined) fields.notifyCcPhones = next.notifyCcPhones;
  if (Object.keys(fields).length) await patchDocument("companies", id, fields, token);
  return next;
}

export async function deleteCompany(id: string, token: string) {
  await ensureSeeded();
  const company = await getCompanyById(id, token);
  if (!company) throw new Error("Company not found.");
  if (company.slug === "ronin") {
    throw new Error("Ronin is the seed company and cannot be deleted.");
  }
  const [shipments, audits, users] = await Promise.all([
    listDocuments(shipmentsCol(id), token),
    listDocuments(auditsCol(id), token),
    listUsers(token),
  ]);
  for (const shipment of shipments) await deleteDocument(shipmentsCol(id), shipment.id, token);
  for (const audit of audits) await deleteDocument(auditsCol(id), audit.id, token);
  for (const user of users) {
    if (user.companyId === id) {
      await updateUserRecord(user.id, { disabled: true, companyId: null, companySlug: null }, token);
    }
  }
  await deleteDocument("companies", id, token);
  return company;
}

export async function listShipments(companyId: string, token: string) {
  await quietSeed();
  const rows = await listDocuments(shipmentsCol(companyId), token);
  return rows
    .map((row) => asShipment(row.id, { ...row.data, companyId }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getShipment(companyId: string, id: string, token: string) {
  const doc = await getDocument(shipmentsCol(companyId), id, token);
  return doc ? asShipment(doc.id, { ...doc.data, companyId }) : null;
}

export async function addShipments(
  companyId: string,
  trackingNumbers: string[],
  token: string,
  actor: SessionUser,
) {
  await ensureSeeded();
  const company = await getCompanyById(companyId, token);
  if (!company) throw new Error("Company not found.");

  const existingRows = await listShipments(companyId, token);
  const existing = new Set(existingRows.map((item) => item.trackingNumber));
  const created: ShipmentRecord[] = [];
  for (const raw of trackingNumbers) {
    const trackingNumber = raw.replace(/\s+/g, "").toUpperCase();
    if (!trackingNumber || existing.has(trackingNumber)) continue;
    existing.add(trackingNumber);
    const shipment: ShipmentRecord = {
      id: randomUUID(),
      companyId,
      trackingNumber,
      createdAt: new Date().toISOString(),
      lastFetchedAt: null,
      lastError: null,
      snapshot: null,
      lastNotifiedFingerprint: null,
    };
    await putDocument(shipmentsCol(companyId), shipment.id, { ...shipment }, token);
    created.push(shipment);
    await writeAudit(
      {
        action: "create",
        companyId,
        shipmentId: shipment.id,
        trackingNumber,
        detail: `Added ${trackingNumber}`,
      },
      actor,
      token,
    );
  }
  return created;
}

export async function deleteShipment(
  companyId: string,
  id: string,
  token: string,
  actor: SessionUser,
) {
  const shipment = await getShipment(companyId, id, token);
  if (!shipment) throw new Error("Shipment not found.");
  await deleteDocument(shipmentsCol(companyId), id, token);
  await writeAudit(
    {
      action: "delete",
      companyId,
      shipmentId: id,
      trackingNumber: shipment.trackingNumber,
      detail: `Removed ${shipment.trackingNumber}`,
    },
    actor,
    token,
  );
  return shipment;
}

export async function updateShipment(
  companyId: string,
  id: string,
  patch: Partial<
    Pick<
      ShipmentRecord,
      "trackingNumber" | "lastFetchedAt" | "lastError" | "snapshot" | "lastNotifiedFingerprint"
    >
  >,
  token: string,
  actor?: SessionUser,
) {
  const shipment = await getShipment(companyId, id, token);
  if (!shipment) throw new Error("Shipment not found.");
  const nextPatch = { ...patch };
  if (patch.trackingNumber) {
    nextPatch.trackingNumber = patch.trackingNumber.replace(/\s+/g, "").toUpperCase();
    if (nextPatch.trackingNumber !== shipment.trackingNumber) {
      nextPatch.lastNotifiedFingerprint = null;
    }
  }
  await patchDocument(shipmentsCol(companyId), id, { ...nextPatch }, token);
  if (actor && nextPatch.trackingNumber && nextPatch.trackingNumber !== shipment.trackingNumber) {
    await writeAudit(
      {
        action: "update",
        companyId,
        shipmentId: id,
        trackingNumber: nextPatch.trackingNumber,
        detail: `Changed ${shipment.trackingNumber} → ${nextPatch.trackingNumber}`,
      },
      actor,
      token,
    );
  }
  return asShipment(id, { ...shipment, ...nextPatch });
}

export async function listAudits(companyId: string, token: string) {
  const rows = await listDocuments(auditsCol(companyId), token);
  return rows
    .map((row) => asAudit(row.id, row.data))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 100);
}

export async function writeAudit(
  entry: Omit<AuditRecord, "id" | "at" | "actorId" | "actorEmail">,
  actor: SessionUser,
  token: string,
) {
  const audit: AuditRecord = {
    id: randomUUID(),
    at: new Date().toISOString(),
    actorId: actor.id,
    actorEmail: actor.email,
    ...entry,
  };
  await putDocument(auditsCol(entry.companyId), audit.id, { ...audit }, token);
  return audit;
}

export function roleNeedsCompany(role: Role) {
  return role === "tracker" || role === "client";
}
