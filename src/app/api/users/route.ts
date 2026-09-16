import { NextResponse } from "next/server";
import { FirebaseAuthError, signUpWithPassword } from "@/lib/firebase-auth";
import { requireRole } from "@/lib/session";
import { credentialsPdf, generatePassword } from "@/lib/credentials-pdf";
import { parseEmailList } from "@/lib/emails";
import { publicAppUrl, sendInviteEmail, sendInviteSms } from "@/lib/notify";
import { normalizePhone, phoneProblem } from "@/lib/phones";
import {
  getCompanyById,
  listUsers,
  roleNeedsCompany,
  writeUserDoc,
} from "@/lib/store";
import { isRole } from "@/lib/access";
import type { Role } from "@/lib/types";

export async function GET() {
  try {
    const { idToken } = await requireRole(["admin"]);
    return NextResponse.json({ users: await listUsers(idToken) });
  } catch {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }
}

export async function POST(request: Request) {
  try {
    const { user: admin, idToken } = await requireRole(["admin"]);
    const body = (await request.json().catch(() => null)) as {
      email?: string;
      name?: string;
      role?: Role;
      companyId?: string | null;
      cc?: string | string[];
      phone?: string | null;
      sendEmail?: boolean;
    } | null;
    const email = body?.email?.trim().toLowerCase() ?? "";
    const name = body?.name?.trim() ?? "";
    const role = body?.role;
    if (!body || !email || !isRole(role)) {
      return NextResponse.json(
        { error: "Email and a valid role are required." },
        { status: 400 },
      );
    }
    if (roleNeedsCompany(role) && !body?.companyId) {
      return NextResponse.json(
        { error: "Tracker and client accounts must be assigned to a company." },
        { status: 400 },
      );
    }
    const phoneRaw = body.phone ?? "";
    if (phoneRaw.trim() && phoneProblem(phoneRaw)) {
      return NextResponse.json({ error: phoneProblem(phoneRaw) }, { status: 400 });
    }
    const phone = normalizePhone(phoneRaw);

    let companyName = "All companies";
    let companySlug: string | null = null;
    let companyId: string | null = null;
    if (roleNeedsCompany(role)) {
      const company = await getCompanyById(body.companyId ?? "", idToken);
      if (!company) {
        return NextResponse.json({ error: "Company not found." }, { status: 400 });
      }
      companyName = company.name;
      companySlug = company.slug;
      companyId = company.id;
    }

    const password = generatePassword();
    let created;
    try {
      created = await signUpWithPassword(email, password);
    } catch (error) {
      if (error instanceof FirebaseAuthError && error.code === "EMAIL_EXISTS") {
        return NextResponse.json(
          { error: "That email already has an account." },
          { status: 409 },
        );
      }
      throw error;
    }

    await writeUserDoc(
      created.localId,
      {
        email,
        name,
        role,
        companyId,
        companySlug,
        phone,
        disabled: false,
        createdAt: new Date().toISOString(),
        invitedBy: admin.id,
        mustChangePassword: true,
      },
      idToken,
    );

    const signInUrl = `${publicAppUrl(new URL(request.url).origin)}/login`;
    const pdf = await credentialsPdf({
      name: name || email,
      email,
      password,
      role,
      companyName,
      signInUrl,
    });
    const pdfBase64 = Buffer.from(pdf).toString("base64");
    const cc = parseEmailList(body.cc).filter((item) => item !== email);
    let emailed = false;
    let emailError: string | undefined;
    let smsSent = false;
    let smsError: string | undefined;
    if (body.sendEmail !== false) {
      try {
        await sendInviteEmail({
          to: email,
          cc,
          name: name || email,
          email,
          password,
          role,
          companyName,
          signInUrl,
          pdf,
        });
        emailed = true;
      } catch (error) {
        emailError = error instanceof Error ? error.message : "Could not send invite email.";
      }
    }
    if (role === "client" && phone) {
      try {
        await sendInviteSms({
          phone,
          name: name || email,
          companyName,
          signInUrl,
        });
        smsSent = true;
      } catch (error) {
        smsError = error instanceof Error ? error.message : "Could not send invite SMS.";
      }
    }

    return NextResponse.json({
      user: {
        id: created.localId,
        email,
        name,
        role,
        companyId,
        companySlug,
        phone,
        disabled: false,
        mustChangePassword: true,
      },
      pdfBase64,
      password,
      companyName,
      signInUrl,
      emailed,
      emailError,
      smsSent,
      smsError,
      cc,
    });
  } catch (error) {
    const status = error instanceof Error && error.name === "UnauthorizedError" ? 403 : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not invite user." },
      { status },
    );
  }
}
