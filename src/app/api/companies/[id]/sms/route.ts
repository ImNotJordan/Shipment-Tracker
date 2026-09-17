import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { sendTestClientSms } from "@/lib/notify";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { idToken } = await requireRole(["admin"]);
    const { id } = await context.params;
    const result = await sendTestClientSms(id, idToken);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const status = error instanceof Error && error.name === "UnauthorizedError" ? 403 : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not send SMS." },
      { status },
    );
  }
}
