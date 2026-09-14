import { NextResponse } from "next/server";
import { deleteAuthUser } from "@/lib/firebase-admin-auth";
import { requireRole } from "@/lib/session";
import { deleteUserRecord, getCompanyById, roleNeedsCompany, updateUserRecord } from "@/lib/store";
import { isRole } from "@/lib/access";
import { normalizePhone, phoneProblem } from "@/lib/phones";
import type { Role } from "@/lib/types";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user: admin, idToken } = await requireRole(["admin"]);
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      name?: string;
      role?: Role;
      companyId?: string | null;
      disabled?: boolean;
      phone?: string | null;
    } | null;

    let companyId: string | null | undefined = body?.companyId ?? undefined;
    let companySlug: string | null | undefined;
    if (body?.disabled && id === admin.id) {
      return NextResponse.json({ error: "You cannot revoke your own access." }, { status: 400 });
    }
    if (body?.role && !isRole(body.role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }
    if (body?.role === "admin") {
      companyId = null;
      companySlug = null;
    } else if (body?.role && roleNeedsCompany(body.role)) {
      if (!body.companyId) {
        return NextResponse.json(
          { error: "Tracker and client accounts must be assigned to a company." },
          { status: 400 },
        );
      }
      const company = await getCompanyById(body.companyId, idToken);
      if (!company) return NextResponse.json({ error: "Company not found." }, { status: 400 });
      companyId = company.id;
      companySlug = company.slug;
    } else if (body?.companyId) {
      const company = await getCompanyById(body.companyId, idToken);
      if (!company) return NextResponse.json({ error: "Company not found." }, { status: 400 });
      companyId = company.id;
      companySlug = company.slug;
    }

    let phone: string | null | undefined;
    if (body && "phone" in body) {
      const raw = body.phone ?? "";
      if (String(raw).trim() && phoneProblem(String(raw))) {
        return NextResponse.json({ error: phoneProblem(String(raw)) }, { status: 400 });
      }
      phone = normalizePhone(String(raw));
    }

    const user = await updateUserRecord(
      id,
      {
        name: body?.name,
        role: body?.role,
        companyId,
        companySlug,
        disabled: body?.disabled,
        phone,
      },
      idToken,
    );
    return NextResponse.json({ user });
  } catch (error) {
    const status = error instanceof Error && error.name === "UnauthorizedError" ? 403 : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update user." },
      { status },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user: admin, idToken } = await requireRole(["admin"]);
    const { id } = await context.params;
    if (id === admin.id) {
      return NextResponse.json(
        { error: "You cannot delete the account you are signed in with. Sign in as another admin first." },
        { status: 400 },
      );
    }
    await deleteAuthUser(id);
    await deleteUserRecord(id, idToken);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/users failed", error);
    const status = error instanceof Error && error.name === "UnauthorizedError" ? 403 : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete user." },
      { status },
    );
  }
}
