import { NextResponse } from "next/server";
import { addShipments, listAudits, listShipments, visibleCompanies } from "@/lib/store";
import { requireRole } from "@/lib/session";
import { refreshShipments } from "@/lib/refresh";
import { ForbiddenError, scopedCompanyId } from "@/lib/access";

export async function GET(request: Request) {
  try {
    const { user, idToken } = await requireRole(["admin", "tracker"]);
    const requested = new URL(request.url).searchParams.get("companyId");
    const companyId = scopedCompanyId(user, requested);
    const [shipments, companies, audits] = await Promise.all([
      listShipments(companyId, idToken),
      visibleCompanies(user, idToken),
      listAudits(companyId, idToken),
    ]);
    return NextResponse.json({ shipments, companies, audits, companyId });
  } catch (error) {
    const status = error instanceof ForbiddenError ? 403 : 401;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sign in required." },
      { status },
    );
  }
}

export async function POST(request: Request) {
  try {
    const { user, idToken } = await requireRole(["admin", "tracker"]);
    const body = (await request.json().catch(() => null)) as {
      companyId?: string;
      trackingNumbers?: string[] | string;
    } | null;
    const companyId = scopedCompanyId(user, body?.companyId);
    const raw = body?.trackingNumbers;
    const numbers = Array.isArray(raw)
      ? raw
      : String(raw ?? "")
          .split(/[\n,;]+/)
          .map((item) => item.trim());
    const created = await addShipments(companyId, numbers, idToken, user);
    const refreshed = await refreshShipments(
      companyId,
      created.map((item) => item.id),
      idToken,
      user,
    );
    return NextResponse.json({ created: refreshed });
  } catch (error) {
    const status = error instanceof ForbiddenError ? 403 : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not add tracking numbers." },
      { status },
    );
  }
}
