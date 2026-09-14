import { NextResponse } from "next/server";
import { deleteShipment, updateShipment } from "@/lib/store";
import { requireRole } from "@/lib/session";
import { refreshShipments } from "@/lib/refresh";
import { ForbiddenError, scopedCompanyId } from "@/lib/access";

async function actorContext(request: Request, id: string) {
  const { user, idToken } = await requireRole(["admin", "tracker"]);
  const companyId = scopedCompanyId(
    user,
    new URL(request.url).searchParams.get("companyId"),
  );
  return { user, idToken, companyId, id };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { user, idToken, companyId } = await actorContext(request, id);
    const body = (await request.json().catch(() => null)) as { trackingNumber?: string } | null;
    if (!body?.trackingNumber?.trim()) {
      return NextResponse.json({ error: "Tracking number is required." }, { status: 400 });
    }
    const shipment = await updateShipment(
      companyId,
      id,
      { trackingNumber: body.trackingNumber },
      idToken,
      user,
    );
    return NextResponse.json({ shipment });
  } catch (error) {
    const status = error instanceof ForbiddenError ? 403 : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update tracking number." },
      { status },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { user, idToken, companyId } = await actorContext(request, id);
    const action = new URL(request.url).searchParams.get("action");
    if (action === "refresh") {
      const [shipment] = await refreshShipments(companyId, [id], idToken, user);
      return NextResponse.json({ shipment });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    const status = error instanceof ForbiddenError ? 403 : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not refresh shipment." },
      { status },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { user, idToken, companyId } = await actorContext(request, id);
    await deleteShipment(companyId, id, idToken, user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof ForbiddenError ? 403 : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not remove shipment." },
      { status },
    );
  }
}
