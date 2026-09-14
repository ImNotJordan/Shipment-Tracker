import { TrackingBoard } from "@/components/TrackingBoard";
import { companyForSlug, listShipments } from "@/lib/store";
import { refreshShipments } from "@/lib/refresh";
import { notFound, redirect } from "next/navigation";
import { readSessionContext } from "@/lib/session";
import type { PublicBoard } from "@/lib/types";

export default async function TrackPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const context = await readSessionContext();
  if (!context) redirect("/login");
  if (context.user.mustChangePassword) redirect("/login");
  const { slug } = await params;
  const company = await companyForSlug(context.user, slug, context.idToken);
  if (!company) notFound();

  let shipments = await listShipments(company.id, context.idToken);
  const stale = shipments.filter(
    (item) =>
      !item.lastFetchedAt ||
      Date.now() - new Date(item.lastFetchedAt).getTime() > 2 * 60 * 1000,
  );
  if (stale.length) {
    try {
      await refreshShipments(
        company.id,
        stale.map((item) => item.id),
        context.idToken,
        context.user.role === "client" ? undefined : context.user,
      );
      shipments = await listShipments(company.id, context.idToken);
    } catch {
      shipments = await listShipments(company.id, context.idToken);
    }
  }

  const board: PublicBoard = {
    company: {
      name: company.name,
      slug: company.slug,
      accent: company.accent,
      background: company.background,
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

  return (
    <TrackingBoard
      initial={board}
      mapsKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
      user={context.user}
    />
  );
}
