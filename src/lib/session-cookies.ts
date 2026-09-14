export const SESSION_COOKIE = "__session";
export const LEGACY_ID_COOKIE = "st_id";
export const LEGACY_RT_COOKIE = "st_rt";

type PackedSession = {
  id: string;
  rt: string;
};

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  };
}

export function packSessionCookie(idToken: string, refreshToken: string) {
  return JSON.stringify({ id: idToken, rt: refreshToken } satisfies PackedSession);
}

export function unpackSessionCookie(raw?: string | null): PackedSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PackedSession;
    if (typeof parsed?.id === "string" && typeof parsed?.rt === "string") {
      return parsed;
    }
  } catch {
    // Ignore malformed cookies.
  }
  return null;
}

export function sessionFromCookieJar(get: (name: string) => string | undefined) {
  const packed = unpackSessionCookie(get(SESSION_COOKIE));
  if (packed) return packed;
  const id = get(LEGACY_ID_COOKIE);
  const rt = get(LEGACY_RT_COOKIE);
  if (!id && !rt) return null;
  return { id: id ?? "", rt: rt ?? "" };
}
