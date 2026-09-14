import { createRemoteJWKSet, jwtVerify } from "jose";
import { firebaseApiKey, firebaseProjectId } from "./firebase-config";
import type { Role } from "./types";

export class FirebaseAuthError extends Error {
  code: string;

  constructor(code: string, message?: string) {
    super(message ?? friendlyAuthError(code));
    this.name = "FirebaseAuthError";
    this.code = code;
  }
}

const JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);

export type FirebaseTokens = {
  idToken: string;
  refreshToken: string;
  localId: string;
  email: string;
  expiresIn: number;
};

type IdentityResponse = {
  idToken?: string;
  refreshToken?: string;
  localId?: string;
  email?: string;
  expiresIn?: string;
  error?: { message?: string };
};

async function identity(
  path: string,
  body: Record<string, unknown>,
): Promise<IdentityResponse> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/${path}?key=${firebaseApiKey()}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  return (await res.json()) as IdentityResponse;
}

function asTokens(json: IdentityResponse, fallbackEmail?: string): FirebaseTokens {
  if (!json.idToken || !json.refreshToken || !json.localId) {
    throw new FirebaseAuthError(
      json.error?.message ?? "AUTH_FAILED",
      json.error?.message ? friendlyAuthError(json.error.message) : "Firebase Auth failed.",
    );
  }
  return {
    idToken: json.idToken,
    refreshToken: json.refreshToken,
    localId: json.localId,
    email: (json.email ?? fallbackEmail ?? "").toLowerCase(),
    expiresIn: Number(json.expiresIn ?? 3600),
  };
}

export async function signInWithPassword(email: string, password: string) {
  const json = await identity("accounts:signInWithPassword", {
    email,
    password,
    returnSecureToken: true,
  });
  if (json.error?.message) {
    throw new FirebaseAuthError(json.error.message);
  }
  return asTokens(json, email);
}

export async function signUpWithPassword(email: string, password: string) {
  const json = await identity("accounts:signUp", {
    email,
    password,
    returnSecureToken: true,
  });
  if (json.error?.message) {
    throw new FirebaseAuthError(json.error.message);
  }
  return asTokens(json, email);
}

export async function updateAccountPassword(idToken: string, password: string) {
  const json = await identity("accounts:update", {
    idToken,
    password,
    returnSecureToken: true,
  });
  if (json.error?.message) {
    throw new FirebaseAuthError(json.error.message);
  }
  return asTokens(json);
}

export async function passwordMatches(email: string, password: string) {
  try {
    await signInWithPassword(email, password);
    return true;
  } catch {
    return false;
  }
}

export async function refreshIdToken(refreshToken: string) {
  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${firebaseApiKey()}`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      cache: "no-store",
    },
  );
  const json = (await res.json()) as {
    id_token?: string;
    refresh_token?: string;
    user_id?: string;
    expires_in?: string;
    error?: { message?: string };
  };
  if (!json.id_token || !json.refresh_token) {
    throw new FirebaseAuthError(
      json.error?.message ?? "TOKEN_REFRESH_FAILED",
      "Firebase session expired. Sign in again.",
    );
  }
  return {
    idToken: json.id_token,
    refreshToken: json.refresh_token,
    localId: json.user_id ?? "",
    expiresIn: Number(json.expires_in ?? 3600),
  };
}

export async function verifyFirebaseIdToken(idToken: string) {
  const projectId = firebaseProjectId();
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });
  const uid = String(payload.user_id ?? payload.sub ?? "");
  const email = String(payload.email ?? "").toLowerCase();
  if (!uid || !email) throw new Error("Firebase token is missing email.");
  return { uid, email };
}

export function roleForEmail(email: string): Role | null {
  const value = email.toLowerCase();
  const platform = (process.env.PLATFORM_ADMIN_EMAIL ?? "").toLowerCase();
  const extraAdmins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const tracker = (process.env.TRACKER_EMAIL ?? "tracker@ronin.local").toLowerCase();
  const extraTrackers = (process.env.TRACKER_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (platform && value === platform) return "admin";
  if (extraAdmins.includes(value)) return "admin";
  if (value === tracker || extraTrackers.includes(value)) return "tracker";
  return null;
}

export function seedPasswordFor(email: string) {
  const value = email.toLowerCase();
  const platform = (process.env.PLATFORM_ADMIN_EMAIL ?? "").toLowerCase();
  const tracker = (process.env.TRACKER_EMAIL ?? "tracker@ronin.local").toLowerCase();
  if (platform && value === platform) return process.env.PLATFORM_ADMIN_PASSWORD ?? "";
  if (value === tracker) return process.env.TRACKER_PASSWORD ?? "change-me-tracker";
  return null;
}

export function friendlyAuthError(code: string) {
  switch (code) {
    case "EMAIL_NOT_FOUND":
    case "INVALID_PASSWORD":
    case "INVALID_LOGIN_CREDENTIALS":
    case "USER_NOT_FOUND":
      return "Those credentials do not match an account.";
    case "OPERATION_NOT_ALLOWED":
      return "Enable Email/Password in the Firebase console (Authentication → Sign-in method).";
    case "USER_DISABLED":
      return "This Firebase account is disabled.";
    case "EMAIL_EXISTS":
      return "Those credentials do not match an account.";
    case "WEAK_PASSWORD":
      return "Choose a longer password.";
    case "CREDENTIAL_TOO_OLD_LOGIN_AGAIN":
      return "Sign in again, then set your password.";
    default:
      return code.replace(/_/g, " ").toLowerCase();
  }
}

export function isMissingUserCode(code: string) {
  return (
    code === "EMAIL_NOT_FOUND" ||
    code === "INVALID_LOGIN_CREDENTIALS" ||
    code === "USER_NOT_FOUND"
  );
}
