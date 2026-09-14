import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { parseEmailList } from "@/lib/emails";
import { publicAppUrl, sendInviteEmail } from "@/lib/notify";
import { isRole } from "@/lib/access";
import type { Role } from "@/lib/types";

export async function POST(request: Request) {
  try {
    await requireRole(["admin"]);
    const body = (await request.json().catch(() => null)) as {
      email?: string;
      name?: string;
      role?: Role;
      companyName?: string;
      password?: string;
      pdfBase64?: string;
      cc?: string | string[];
      signInUrl?: string;
    } | null;
    const email = body?.email?.trim().toLowerCase() ?? "";
    const password = body?.password ?? "";
    const pdfBase64 = body?.pdfBase64 ?? "";
    const role = body?.role;
    if (!body || !email || !password || !pdfBase64 || !isRole(role)) {
      return NextResponse.json(
        { error: "Invite email, role, password, and PDF are required." },
        { status: 400 },
      );
    }
    const pdf = Uint8Array.from(Buffer.from(pdfBase64, "base64"));
    await sendInviteEmail({
      to: email,
      cc: parseEmailList(body.cc),
      name: body.name?.trim() || email,
      email,
      password,
      role,
      companyName: body.companyName?.trim() || "Live Board",
      signInUrl: body.signInUrl || `${publicAppUrl(new URL(request.url).origin)}/login`,
      pdf,
    });
    return NextResponse.json({ emailed: true });
  } catch (error) {
    const status = error instanceof Error && error.name === "UnauthorizedError" ? 403 : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not send invite email." },
      { status },
    );
  }
}
