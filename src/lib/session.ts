import { cookies } from "next/headers";
import type { Role, SessionUser } from "./types";
import { verifyFirebaseIdToken, refreshIdToken, type FirebaseTokens } from "./firebase-auth";
import { fetchUserProfile } from "./access";
import {
  LEGACY_ID_COOKIE,
  LEGACY_RT_COOKIE,
  SESSION_COOKIE,
  packSessionCookie,
  sessionCookieOptions,
  sessionFromCookieJar,
} from "./session-cookies";

export type SessionContext = {
  user: SessionUser;
  idToken: string;
};

function writeSession(jar: Awaited<ReturnType<typeof cookies>>, idToken: string, refreshToken: string) {
  const opts = sessionCookieOptions();
  jar.set(SESSION_COOKIE, packSessionCookie(idToken, refreshToken), opts);
  jar.delete(LEGACY_ID_COOKIE);
  jar.delete(LEGACY_RT_COOKIE);
}

export async function createSession(tokens: FirebaseTokens) {
  const jar = await cookies();
  writeSession(jar, tokens.idToken, tokens.refreshToken);
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(LEGACY_ID_COOKIE);
  jar.delete(LEGACY_RT_COOKIE);
}

async function contextFromIdToken(idToken: string): Promise<SessionContext | null> {
  const { uid } = await verifyFirebaseIdToken(idToken);
  const user = await fetchUserProfile(uid, idToken);
  if (!user) return null;
  return { user, idToken };
}

export async function readSessionContext(): Promise<SessionContext | null> {
  const jar = await cookies();
  const packed = sessionFromCookieJar((name) => jar.get(name)?.value);
  const idToken = packed?.id;
  const refreshToken = packed?.rt;

  if (idToken) {
    try {
      return await contextFromIdToken(idToken);
    } catch {
      // Expired or rotated — try the refresh token below.
    }
  }
  if (!refreshToken) return null;

  try {
    const rotated = await refreshIdToken(refreshToken);
    const context = await contextFromIdToken(rotated.idToken);
    if (!context) return null;
    try {
      writeSession(jar, rotated.idToken, rotated.refreshToken);
    } catch {
      // Cookie writes are not allowed from some Server Components.
    }
    return { ...context, idToken: rotated.idToken };
  } catch {
    return null;
  }
}

export async function readSession(): Promise<SessionUser | null> {
  const context = await readSessionContext();
  return context?.user ?? null;
}

export async function requireRole(roles: Role[]) {
  const context = await readSessionContext();
  if (!context || !roles.includes(context.user.role)) {
    const error = new Error("Unauthorized");
    error.name = "UnauthorizedError";
    throw error;
  }
  if (context.user.mustChangePassword) {
    const error = new Error("Set a new password before continuing.");
    error.name = "PasswordChangeRequired";
    throw error;
  }
  return context;
}
