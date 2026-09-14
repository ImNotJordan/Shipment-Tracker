import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { refreshIdToken, verifyFirebaseIdToken } from "@/lib/firebase-auth";
import { fetchUserProfile, homePath } from "@/lib/access";
import {
  LEGACY_ID_COOKIE,
  LEGACY_RT_COOKIE,
  SESSION_COOKIE,
  packSessionCookie,
  sessionCookieOptions,
  sessionFromCookieJar,
} from "@/lib/session-cookies";

function applySessionCookies(
  response: NextResponse,
  idToken: string,
  refreshToken: string,
) {
  const opts = sessionCookieOptions();
  response.cookies.set(SESSION_COOKIE, packSessionCookie(idToken, refreshToken), opts);
  response.cookies.delete(LEGACY_ID_COOKIE);
  response.cookies.delete(LEGACY_RT_COOKIE);
}

async function staffFromRequest(request: NextRequest, response: NextResponse) {
  const packed = sessionFromCookieJar((name) => request.cookies.get(name)?.value);
  const idToken = packed?.id;
  const refreshToken = packed?.rt;
  if (!idToken && !refreshToken) return null;

  const fromToken = async (token: string) => {
    const { uid } = await verifyFirebaseIdToken(token);
    return fetchUserProfile(uid, token);
  };

  if (idToken) {
    try {
      return await fromToken(idToken);
    } catch {
      // fall through to refresh
    }
  }

  if (!refreshToken) return null;
  try {
    const rotated = await refreshIdToken(refreshToken);
    applySessionCookies(response, rotated.idToken, rotated.refreshToken);
    return await fromToken(rotated.idToken);
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;
  const user = await staffFromRequest(request, response);

  if (pathname.startsWith("/api/auth/")) return response;

  if (pathname.startsWith("/api/")) {
    if (user?.mustChangePassword) {
      return NextResponse.json(
        { error: "Set a new password before continuing." },
        { status: 403 },
      );
    }
    return response;
  }

  const gated =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/tracker") ||
    pathname.startsWith("/track/");

  if (!gated) return response;

  if (!user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  if (user.mustChangePassword) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname.startsWith("/admin") && user.role !== "admin") {
    return NextResponse.redirect(new URL(homePath(user), request.url));
  }

  if (pathname.startsWith("/tracker") && user.role === "client") {
    return NextResponse.redirect(new URL(homePath(user), request.url));
  }

  if (pathname.startsWith("/track/") && user.role === "tracker") {
    const slug = pathname.split("/")[2] ?? "";
    if (user.companySlug && slug && slug !== user.companySlug) {
      return NextResponse.redirect(new URL(`/track/${user.companySlug}`, request.url));
    }
  }

  if (pathname.startsWith("/track/") && user.role === "client") {
    const slug = pathname.split("/")[2] ?? "";
    if (user.companySlug && slug !== user.companySlug) {
      return NextResponse.redirect(new URL(`/track/${user.companySlug}`, request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/tracker/:path*",
    "/track/:path*",
    "/login",
    "/api/:path*",
  ],
};
