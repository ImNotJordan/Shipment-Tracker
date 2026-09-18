import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { updateCompany } from "@/lib/store";
import { uploadCompanyLogo } from "@/lib/storage";

const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

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
    // Storage takes whatever it is given; this cap is about what every client
    // then downloads on every board load, for a mark rendered at 56px.
    if (file.size > 5_000_000) {
      return NextResponse.json({ error: "Logo must be under 5 MB." }, { status: 400 });
    }
    const ext = TYPES[file.type];
    if (!ext) {
      return NextResponse.json({ error: "Use PNG, JPG, WEBP, or SVG." }, { status: 400 });
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
