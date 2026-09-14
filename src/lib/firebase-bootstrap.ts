import "server-only";
import {
  FirebaseAuthError,
  signInWithPassword,
  signUpWithPassword,
  type FirebaseTokens,
} from "./firebase-auth";

type CachedService = { tokens: FirebaseTokens; expiresAt: number };
let serviceCache: CachedService | null = null;

export function bootstrapCredentials() {
  const platformEmail = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const platformPassword = process.env.PLATFORM_ADMIN_PASSWORD ?? "";
  if (platformEmail && platformPassword) {
    return { email: platformEmail, password: platformPassword, kind: "platform" as const };
  }
  return {
    email: (process.env.ADMIN_EMAIL ?? "admin@ronin.local").toLowerCase(),
    password: process.env.ADMIN_PASSWORD ?? "change-me-admin",
    kind: "seed" as const,
  };
}

export function retiredSeedEmails(bootstrapEmail: string) {
  const retired = new Set(["admin@ronin.local", "tracker@ronin.local"]);
  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const tracker = process.env.TRACKER_EMAIL?.trim().toLowerCase();
  if (admin) retired.add(admin);
  if (tracker) retired.add(tracker);
  retired.delete(bootstrapEmail.trim().toLowerCase());
  return [...retired];
}

export async function getBootstrapTokens() {
  const { email, password, kind } = bootstrapCredentials();
  if (serviceCache && Date.now() < serviceCache.expiresAt - 60_000) {
    return serviceCache.tokens;
  }

  try {
    const tokens = await signInWithPassword(email, password);
    cache(tokens);
    return tokens;
  } catch (error) {
    if (!(error instanceof FirebaseAuthError) || !isProvisionable(error.code)) {
      throw error;
    }
    try {
      const tokens = await signUpWithPassword(email, password);
      cache(tokens);
      return tokens;
    } catch (created) {
      if (created instanceof FirebaseAuthError && created.code === "EMAIL_EXISTS") {
        throw new Error(
          kind === "platform"
            ? "PLATFORM_ADMIN_PASSWORD does not match the existing Firebase admin user."
            : "ADMIN_PASSWORD does not match the existing Firebase admin user.",
        );
      }
      throw created;
    }
  }
}

function isProvisionable(code: string) {
  return (
    code === "EMAIL_NOT_FOUND" ||
    code === "INVALID_LOGIN_CREDENTIALS" ||
    code === "USER_NOT_FOUND"
  );
}

function cache(tokens: FirebaseTokens) {
  serviceCache = {
    tokens,
    expiresAt: Date.now() + tokens.expiresIn * 1000,
  };
}
