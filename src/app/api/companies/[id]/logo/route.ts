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
    if (file.size > 1_500_000) {
      return NextResponse.json({ error: "Logo must be under 1.5 MB." }, { status: 400 });
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
      if (file.size > 350_000) {
        return NextResponse.json(
          {
            error:
              "Enable Firebase Storage for larger logos, or upload a file under 350 KB.",
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
