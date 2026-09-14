import { NextResponse } from "next/server";
import { deleteCompany, updateCompany } from "@/lib/store";
import { requireRole } from "@/lib/session";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { idToken } = await requireRole(["admin"]);
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      name?: string;
      accent?: string;
      background?: string;
      notifyEnabled?: boolean;
      notifyCc?: string | string[];
    } | null;
    const company = await updateCompany(
      id,
      {
        name: body?.name,
        accent: body?.accent,
        background: body?.background,
        notifyEnabled: body?.notifyEnabled,
        notifyCc: body?.notifyCc !== undefined
          ? Array.isArray(body.notifyCc)
            ? body.notifyCc
            : String(body.notifyCc).split(/[\n,;]+/)
          : undefined,
      },
      idToken,
    );
    return NextResponse.json({ company });
  } catch (error) {
    const status = error instanceof Error && error.name === "UnauthorizedError" ? 403 : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update company." },
      { status },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { idToken } = await requireRole(["admin"]);
    const { id } = await context.params;
    await deleteCompany(id, idToken);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof Error && error.name === "UnauthorizedError" ? 403 : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete company." },
      { status },
    );
  }
}
