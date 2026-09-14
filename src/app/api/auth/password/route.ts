import { NextResponse } from "next/server";
import { homePath } from "@/lib/access";
import {
  FirebaseAuthError,
  passwordMatches,
  updateAccountPassword,
} from "@/lib/firebase-auth";
import { passwordProblem } from "@/lib/passwords";
import { createSession, readSessionContext } from "@/lib/session";
import { bootstrapToken, updateUserRecord } from "@/lib/store";

export async function POST(request: Request) {
  const context = await readSessionContext();
  if (!context) {
    return NextResponse.json({ error: "Sign in again, then set your password." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { password?: string; confirm?: string }
    | null;
  const password = body?.password ?? "";
  const confirm = body?.confirm ?? "";
  const problem = passwordProblem({
    next: password,
    confirm,
    email: context.user.email,
  });
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  try {
    if (await passwordMatches(context.user.email, password)) {
      return NextResponse.json(
        { error: "Choose a password that is not the temporary one." },
        { status: 400 },
      );
    }

    const tokens = await updateAccountPassword(context.idToken, password);
    await createSession(tokens);
    try {
      await updateUserRecord(
        context.user.id,
        { mustChangePassword: false },
        await bootstrapToken(),
      );
    } catch {
      await updateUserRecord(
        context.user.id,
        { mustChangePassword: false },
        tokens.idToken,
      );
    }

    const user = { ...context.user, mustChangePassword: false };
    return NextResponse.json({ user, next: homePath(user) });
  } catch (error) {
    const message =
      error instanceof FirebaseAuthError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not set password.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
