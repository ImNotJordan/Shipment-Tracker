import type { Role, SessionUser } from "./types";

export function homePath(user: Pick<SessionUser, "role" | "companySlug">) {
  if (user.role === "admin") return "/admin";
  if (user.role === "tracker") return "/tracker";
  if (user.role === "client" && user.companySlug) return `/track/${user.companySlug}`;
  return "/login";
}

export function toSessionUser(input: {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyId: string | null;
  companySlug: string | null;
  mustChangePassword?: boolean;
}): SessionUser {
  return {
    id: input.id,
    email: input.email,
    name: input.name,
    role: input.role,
    companyId: input.companyId,
    companySlug: input.companySlug,
    mustChangePassword: Boolean(input.mustChangePassword),
  };
}

export function isRole(value: unknown): value is Role {
  return value === "admin" || value === "tracker" || value === "client";
}

export class ForbiddenError extends Error {
  constructor(message = "You cannot access another company's data.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function scopedCompanyId(user: SessionUser, requested?: string | null) {
  if (user.role === "admin") {
    const id = requested?.trim() ?? "";
    if (!id) throw new ForbiddenError("Company is required.");
    return id;
  }
  if (!user.companyId) {
    throw new ForbiddenError("This account is not assigned to a company.");
  }
  if (requested && requested !== user.companyId) {
    throw new ForbiddenError();
  }
  return user.companyId;
}

export function assertCompanyAccess(user: SessionUser, companyId: string) {
  if (user.role === "admin") return;
  if (!user.companyId || user.companyId !== companyId) {
    throw new ForbiddenError();
  }
}

export function decodeFirestoreFields(
  fields?: Record<string, { stringValue?: string; booleanValue?: boolean; nullValue?: null }>,
) {
  const data: Record<string, string | boolean | null> = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    if ("stringValue" in value) data[key] = value.stringValue ?? "";
    else if ("booleanValue" in value) data[key] = Boolean(value.booleanValue);
    else data[key] = null;
  }
  return data;
}

export async function fetchUserProfile(
  uid: string,
  token: string,
): Promise<SessionUser | null> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) return null;
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as {
    fields?: Record<string, { stringValue?: string; booleanValue?: boolean; nullValue?: null }>;
  };
  const data = decodeFirestoreFields(json.fields);
  if (data.disabled === true) return null;
  if (!isRole(data.role)) return null;
  return toSessionUser({
    id: uid,
    email: String(data.email ?? "").toLowerCase(),
    name: String(data.name ?? ""),
    role: data.role,
    companyId: data.companyId ? String(data.companyId) : null,
    companySlug: data.companySlug ? String(data.companySlug) : null,
    mustChangePassword: data.mustChangePassword === true,
  });
}
