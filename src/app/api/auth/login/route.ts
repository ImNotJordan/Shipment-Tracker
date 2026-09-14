import { NextResponse } from "next/server";
import { FirebaseAuthError, signInWithPassword } from "@/lib/firebase-auth";
import { createSession } from "@/lib/session";
import { ensureSeeded, getUserRecord, roleNeedsCompany } from "@/lib/store";
import { homePath, toSessionUser } from "@/lib/access";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { email?: string; password?: string }
    | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";
  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  try {
    try {
      await ensureSeeded();
    } catch {
      // Profile lookup still proceeds if Auth is up.
    }
    const tokens = await signInWithPassword(email, password);
    const profile = await getUserRecord(tokens.localId, tokens.idToken);
    if (!profile || profile.disabled) {
      return NextResponse.json(
        { error: "Those credentials do not match an account." },
        { status: 401 },
      );
    }
    if (roleNeedsCompany(profile.role) && !profile.companyId) {
      return NextResponse.json(
        { error: "This account is not assigned to a company. Ask an admin to invite you again." },
        { status: 403 },
      );
    }
    await createSession(tokens);
    const user = toSessionUser(profile);
    return NextResponse.json({
      user,
      mustChangePassword: user.mustChangePassword,
      next: user.mustChangePassword ? "/login" : homePath(user),
    });
  } catch (error) {
    const message =
      error instanceof FirebaseAuthError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Sign in failed.";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
