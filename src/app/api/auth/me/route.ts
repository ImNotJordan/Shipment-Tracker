import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";

export async function GET() {
  const user = await readSession();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user });
}
