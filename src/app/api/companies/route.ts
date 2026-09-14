import { NextResponse } from "next/server";
import { createCompany, visibleCompanies } from "@/lib/store";
import { requireRole } from "@/lib/session";
import { openPhoneConfigured, resendConfigured } from "@/lib/notify";

export async function GET() {
  try {
    const { user, idToken } = await requireRole(["admin", "tracker", "client"]);
    return NextResponse.json({
      companies: await visibleCompanies(user, idToken),
      emailConfigured: resendConfigured(),
      smsConfigured: openPhoneConfigured(),
    });
  } catch {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { idToken } = await requireRole(["admin"]);
    const body = (await request.json().catch(() => null)) as { name?: string } | null;
    const company = await createCompany(body?.name ?? "", idToken);
    return NextResponse.json({ company });
  } catch (error) {
    const status = error instanceof Error && error.name === "UnauthorizedError" ? 403 : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create company." },
      { status },
    );
  }
}
