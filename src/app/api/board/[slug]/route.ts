import { NextResponse } from "next/server";
import { companyForSlug, listShipments } from "@/lib/store";
import { refreshShipments } from "@/lib/refresh";
import { requireRole } from "@/lib/session";
import type { PublicBoard } from "@/lib/types";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { user, idToken } = await requireRole(["admin", "tracker", "client"]);
    const { slug } = await context.params;
    const company = await companyForSlug(user, slug, idToken);
    if (!company) {
      return NextResponse.json({ error: "Company board not found." }, { status: 404 });
    }

    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    let shipments = await listShipments(company.id, idToken);
    const stale = shipments.filter((item) => {
      if (!item.lastFetchedAt) return true;
      return Date.now() - new Date(item.lastFetchedAt).getTime() > 2 * 60 * 1000;
    });
    if (refresh || stale.length) {
      await refreshShipments(
        company.id,
        stale.map((item) => item.id),
        idToken,
        user.role === "client" ? undefined : user,
      );
      shipments = await listShipments(company.id, idToken);
    }

    const board: PublicBoard = {
      company: {
        name: company.name,
        slug: company.slug,
        accent: company.accent,
        background: company.background,
        ground: company.ground,
        logoUrl: company.logoUrl,
      },
      shipments: shipments.map((item) => ({
        id: item.id,
        trackingNumber: item.trackingNumber,
        lastFetchedAt: item.lastFetchedAt,
        lastError: item.lastError,
        snapshot: item.snapshot,
      })),
    };
    return NextResponse.json(board);
  } catch {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
}
