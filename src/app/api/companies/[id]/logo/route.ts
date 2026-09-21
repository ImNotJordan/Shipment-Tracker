import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { updateCompany } from "@/lib/store";
import { uploadCompanyLogo } from "@/lib/storage";
import { LOGO_HINT, LOGO_MAX_BYTES, LOGO_TYPES } from "@/lib/types";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { idToken } = await requireRole(["admin"]);
    const { id } = await context.params;
    const form = await request.formData();
    const file = form.get("logo");
    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: "Choose a logo file." }, { status: 400 });
    }
    if (file.size > LOGO_MAX_BYTES) {
      return NextResponse.json(
        { error: `Logo is too large. ${LOGO_HINT}.` },
        { status: 400 },
      );
    }
    const ext = LOGO_TYPES[file.type];
    if (!ext) {
      return NextResponse.json({ error: `Unsupported file. ${LOGO_HINT}.` }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    let logoUrl: string;
    try {
      logoUrl = await uploadCompanyLogo(
        id,
        { bytes, contentType: file.type, ext },
        idToken,
      );
    } catch {
      /* No Storage bucket: the file is kept inside the company document as a
         data URI instead. Base64 costs a third more, and a Firestore document
         is capped at 1 MiB whatever else is in it — which is the real limit
         here, and the one that cannot simply be raised. */
      if (file.size > 600_000) {
        return NextResponse.json(
          {
            error:
              "Enable Firebase Storage for logos over 600 KB — without it the file has to fit inside the company record.",
          },
          { status: 400 },
        );
      }
      logoUrl = `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`;
    }
    const company = await updateCompany(id, { logoUrl }, idToken);
    return NextResponse.json({ company });
  } catch (error) {
    const status = error instanceof Error && error.name === "UnauthorizedError" ? 403 : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not upload logo." },
      { status },
    );
  }
}
