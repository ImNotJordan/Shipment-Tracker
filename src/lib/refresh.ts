import "server-only";
import { fedexConfigured, trackNumbers } from "./fedex";
import { listShipments, updateShipment } from "./store";
import { notifyTrackingUpdate } from "./notify";
import type { SessionUser } from "./types";

export async function refreshShipments(
  companyId: string,
  ids: string[],
  token: string,
  actor?: SessionUser,
) {
  const all = await listShipments(companyId, token);
  const selected = all.filter((item) => ids.includes(item.id));
  if (!selected.length) return [];

  if (!fedexConfigured()) {
    const message =
      "FedEx credentials are not configured. Add FEDEX_CLIENT_ID and FEDEX_CLIENT_SECRET.";
    const updated = [];
    for (const shipment of selected) {
      updated.push(
        await updateShipment(
          companyId,
          shipment.id,
          {
            lastFetchedAt: new Date().toISOString(),
            lastError: message,
          },
          token,
          actor,
        ),
      );
    }
    return updated;
  }

  try {
    const tracked = await trackNumbers(selected.map((item) => item.trackingNumber));
    const updated = [];
    for (const shipment of selected) {
      const result =
        tracked.get(shipment.trackingNumber) ??
        tracked.get(shipment.trackingNumber.replace(/\s+/g, ""));
      const previous = shipment.snapshot;
      const nextSnapshot = result?.snapshot ?? shipment.snapshot;
      updated.push(
        await updateShipment(
          companyId,
          shipment.id,
          {
            lastFetchedAt: new Date().toISOString(),
            lastError: result?.error ?? null,
            snapshot: nextSnapshot,
          },
          token,
          actor,
        ),
      );
      if (result?.snapshot) {
        try {
          await notifyTrackingUpdate({
            companyId,
            shipment: {
              ...shipment,
              lastError: result.error ?? null,
              snapshot: result.snapshot,
            },
            previous,
            token,
          });
        } catch {
          // Tracking refresh still succeeds if mail fails.
        }
      }
    }
    return updated;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "FedEx tracking request failed.";
    const updated = [];
    for (const shipment of selected) {
      updated.push(
        await updateShipment(
          companyId,
          shipment.id,
          {
            lastFetchedAt: new Date().toISOString(),
            lastError: message,
          },
          token,
          actor,
        ),
      );
    }
    return updated;
  }
}
